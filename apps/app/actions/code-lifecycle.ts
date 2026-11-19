"use server";

import { database as db, qrCode } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  codeIdSchema,
  destinationUrlSchema,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { codeEvents, linkControlChanges } from "@/ee/audit-log/code-events";
import { recordAuditEvent } from "@/ee/audit-log/record";
import {
  CODE_ACTION_MESSAGES,
  CODE_PASSWORD_LENGTH,
  ownMessage,
} from "@/lib/code-actions/messages";
import { codeActionText } from "@/lib/code-actions/messages-server";
import { snapshotCodeVersion } from "@/lib/code-versions";
import { HttpError } from "@/lib/error-response";
import { assertCan } from "@/lib/permissions-server";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { type EndedReason, lifecycleState } from "@/lib/redirect/lifecycle";
import { enforceRateLimits } from "@/lib/request-guards";
import { screenUrlChange } from "@/lib/safety/destinations";
import { heldForReviewIds } from "@/lib/safety/holds";
import { writeHoldReports } from "@/lib/safety/velocity";
import { type ActiveScope, getActiveScope, isInScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError, ValidationError } from "@/types/errors";

/**
 * Lifecycle controls of a dynamic code (lib/redirect/lifecycle.ts). Pausing
 * works on every plan; password, schedule, scan limit and fallback URL need
 * Pro to set or change, but can always be removed, and existing settings keep
 * working after a downgrade.
 */

export type CodeLifecycleStatus = "live" | EndedReason;

export interface CodeLifecycleView {
  id: string;
  status: CodeLifecycleStatus;
  hasPassword: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  scanLimit: number | null;
  scanCount: number;
  pausedAt: string | null;
  fallbackUrl: string | null;
  /** Switched off: by an admin, or pending review of a flagged URL */
  disabled: boolean;
  /** Switched off by the automated safety check until an admin reviews it */
  heldForReview: boolean;
  /** The plan allows setting password, schedule, scan limit and fallback */
  canUseControls: boolean;
}

export type LifecycleErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "PLAN_REQUIRED"
  | "RATE_LIMITED"
  | "UNSAFE_DESTINATION"
  | "UNKNOWN_ERROR";

export type LifecycleActionResult =
  | { success: true; data: CodeLifecycleView }
  | { success: false; error: { code: LifecycleErrorCode; message: string } };

const KNOWN_CODES = new Set<string>([
  "NOT_FOUND",
  "PLAN_REQUIRED",
  "RATE_LIMITED",
  "UNSAFE_DESTINATION",
]);

const ENGLISH = CODE_ACTION_MESSAGES.lifecycle;
const MAX_SCAN_LIMIT = 100_000_000;
const BCRYPT_COST = 10;
const EARLIEST = Date.UTC(2000, 0, 1);
const LATEST = Date.UTC(2100, 0, 1);

const updateLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

const dateSchema = z.iso
  .datetime({ offset: true, error: ENGLISH.invalidDate })
  .transform((value) => new Date(value))
  .refine(
    (date) => date.getTime() >= EARLIEST && date.getTime() < LATEST,
    ENGLISH.dateRange,
  );

const passwordSchema = z
  .string()
  .min(CODE_PASSWORD_LENGTH.min, ENGLISH.passwordTooShort)
  .max(CODE_PASSWORD_LENGTH.max, ENGLISH.passwordTooLong)
  // bcrypt only reads the first 72 bytes.
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    ENGLISH.passwordTooManyBytes,
  );

/** undefined = leave as is, null = remove. */
const updateSchema = z.object({
  id: codeIdSchema,
  password: passwordSchema.nullable().optional(),
  startsAt: dateSchema.nullable().optional(),
  expiresAt: dateSchema.nullable().optional(),
  scanLimit: z
    .number()
    .int(ENGLISH.scanLimitWhole)
    .min(1, ENGLISH.scanLimitMin)
    .max(MAX_SCAN_LIMIT, ENGLISH.scanLimitMax)
    .nullable()
    .optional(),
  fallbackUrl: destinationUrlSchema.nullable().optional(),
});

const pauseSchema = z.object({ id: codeIdSchema, paused: z.boolean() });

type CodeRow = typeof qrCode.$inferSelect;

/** The answer for a thrown `error`, in the person's language (codeActionText). */
async function failure(
  error: unknown,
  context: Record<string, unknown>,
  who: { pageLocale?: string; userId?: string },
): Promise<LifecycleActionResult> {
  const text = (await codeActionText(who)).lifecycle;
  const say = (message: string) => ownMessage(ENGLISH, text, message);
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: text.signIn },
    };
  }
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: say(error.message) },
    };
  }
  if (error instanceof HttpError) {
    return {
      success: false,
      error: {
        code: KNOWN_CODES.has(error.code)
          ? (error.code as LifecycleErrorCode)
          : "UNKNOWN_ERROR",
        message: say(error.message),
      },
    };
  }
  logError(error as Error, context);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: text.failed },
  };
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues[0]?.message ?? "Invalid input",
    );
  }
  return result.data;
}

async function findRow(scope: ActiveScope, id: string): Promise<CodeRow> {
  const [row] = await db
    .select()
    .from(qrCode)
    .where(eq(qrCode.id, id))
    .limit(1);
  // Codes outside the scope look exactly like missing ones.
  if (!(row && isInScope(scope, row) && !row.deletedAt)) {
    throw new HttpError(404, "NOT_FOUND", ENGLISH.notFound);
  }
  return row;
}

async function isHeldForReview(codeId: string): Promise<boolean> {
  return (await heldForReviewIds([codeId])).has(codeId);
}

async function toView(
  scope: ActiveScope,
  row: CodeRow,
): Promise<CodeLifecycleView> {
  const [plan, heldForReview] = await Promise.all([
    getPlanForScope(scope),
    row.isActive ? false : isHeldForReview(row.id),
  ]);
  const state = lifecycleState(row, { unlocked: true });
  return {
    id: row.id,
    status: state.action === "ended" ? state.reason : "live",
    hasPassword: Boolean(row.passwordHash),
    startsAt: row.startsAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    scanLimit: row.scanLimit,
    scanCount: row.scanCount,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    fallbackUrl: row.fallbackUrl,
    disabled: !row.isActive,
    heldForReview,
    canUseControls: getPlanLimits(plan).linkControls,
  };
}

/** Changes need a role that may write (lib/permissions.ts); reads say so. */
async function run(
  action: string,
  fn: (scope: ActiveScope) => Promise<CodeLifecycleView>,
  {
    revalidate = false,
    access = "write",
    pageLocale,
  }: {
    revalidate?: boolean;
    access?: "read" | "write";
    /** The calling page's useLocale(): the language its messages are in */
    pageLocale?: string;
  } = {},
): Promise<LifecycleActionResult> {
  let userId: string | undefined;
  try {
    const scope = await getActiveScope();
    userId = scope.userId;
    if (access === "write") assertCan(scope, "content.write");
    const data = await fn(scope);
    if (revalidate) revalidatePath("/dashboard", "layout");
    return { success: true, data };
  } catch (error) {
    return failure(error, { action }, { pageLocale, userId });
  }
}

const sameTime = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

export async function getCodeLifecycle(
  id: string,
  pageLocale?: string,
): Promise<LifecycleActionResult> {
  return run(
    "getCodeLifecycle",
    async (scope) =>
      toView(scope, await findRow(scope, parse(codeIdSchema, id))),
    { access: "read", pageLocale },
  );
}

export async function updateCodeLifecycle(
  input: z.input<typeof updateSchema>,
  pageLocale?: string,
): Promise<LifecycleActionResult> {
  return run(
    "updateCodeLifecycle",
    async (scope) => {
      const { id, password, startsAt, expiresAt, scanLimit, fallbackUrl } =
        parse(updateSchema, input);
      await enforceRateLimits([
        { limiter: updateLimiter, key: `code-lifecycle:user:${scope.userId}` },
      ]);
      const row = await findRow(scope, id);

      const values: Partial<typeof qrCode.$inferInsert> = {};
      if (password !== undefined) {
        values.passwordHash = password
          ? await hash(password, BCRYPT_COST)
          : null;
      }
      if (startsAt !== undefined && !sameTime(startsAt, row.startsAt)) {
        values.startsAt = startsAt;
      }
      if (expiresAt !== undefined && !sameTime(expiresAt, row.expiresAt)) {
        values.expiresAt = expiresAt;
      }
      if (scanLimit !== undefined && scanLimit !== row.scanLimit) {
        values.scanLimit = scanLimit;
      }
      if (fallbackUrl !== undefined && fallbackUrl !== row.fallbackUrl) {
        values.fallbackUrl = fallbackUrl;
      }
      if (Object.keys(values).length === 0) return toView(scope, row);

      // Setting or changing a control needs Pro; removing one never does.
      const setsControl = Object.values(values).some((value) => value !== null);
      if (
        setsControl &&
        !getPlanLimits(await getPlanForScope(scope)).linkControls
      ) {
        throw new HttpError(402, "PLAN_REQUIRED", ENGLISH.planRequired);
      }

      const nextStart =
        values.startsAt !== undefined ? values.startsAt : row.startsAt;
      const nextEnd =
        values.expiresAt !== undefined ? values.expiresAt : row.expiresAt;
      if (nextStart && nextEnd && nextEnd <= nextStart) {
        throw new ValidationError(ENGLISH.endBeforeStart);
      }

      const hold = values.fallbackUrl
        ? await screenUrlChange(scope, row, {
            previous: row.fallbackUrl,
            next: values.fallbackUrl,
            field: "fallback URL",
          })
        : null;
      if (hold) values.isActive = false;

      await snapshotCodeVersion(id, scope.userId);
      const [updated] = await db
        .update(qrCode)
        .set(values)
        .where(eq(qrCode.id, id))
        .returning();
      if (!updated) throw new HttpError(404, "NOT_FOUND", ENGLISH.notFound);
      if (hold) await writeHoldReports([hold]);
      recordAuditEvent(
        scope,
        codeEvents("code.link_controls_changed", [updated], {
          ...linkControlChanges(row, values),
        }),
      );
      return toView(scope, updated);
    },
    { revalidate: true, pageLocale },
  );
}

/** Pausing works on every plan: scans go to the fallback URL or a neutral page. */
export async function setCodePaused(
  input: z.input<typeof pauseSchema>,
  pageLocale?: string,
): Promise<LifecycleActionResult> {
  return run(
    "setCodePaused",
    async (scope) => {
      const { id, paused } = parse(pauseSchema, input);
      await enforceRateLimits([
        { limiter: updateLimiter, key: `code-lifecycle:user:${scope.userId}` },
      ]);
      const row = await findRow(scope, id);
      if (Boolean(row.pausedAt) === paused) return toView(scope, row);

      await snapshotCodeVersion(id, scope.userId);
      const [updated] = await db
        .update(qrCode)
        .set({ pausedAt: paused ? new Date() : null })
        .where(eq(qrCode.id, id))
        .returning();
      if (!updated) throw new HttpError(404, "NOT_FOUND", ENGLISH.notFound);
      recordAuditEvent(
        scope,
        codeEvents(paused ? "code.paused" : "code.resumed", [updated]),
      );
      return toView(scope, updated);
    },
    { revalidate: true, pageLocale },
  );
}

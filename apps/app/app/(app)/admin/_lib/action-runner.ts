import "server-only";

import {
  createRateLimiter,
  type RateLimiter,
  slidingWindow,
} from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { HttpError } from "@/lib/http-error";
import { errorSummary } from "@/lib/log-error";
import { enforceRateLimits } from "@/lib/request-guards";
import { writeAuditLog } from "./audit";

// The steps every admin server action runs, with the admin check passed in:
// this app binds its session guard (./action.ts), and the back-office
// console binds its own, so both apply the same limits and audit log. No
// session or env reads here.

export type AdminActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** What a successful action writes to the audit log. */
export interface AdminAuditRecord {
  /** Overrides the action name, e.g. "qr_code.enable" vs "qr_code.disable" */
  action?: string;
  targetType: string;
  targetId: string | null;
  /** The user the action affected, so their 360 page lists it */
  subjectUserId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AdminActionOutcome<T> {
  audit: AdminAuditRecord;
  data?: T;
}

/** The admin an action runs as: the audit log's actor. */
export interface AdminActor {
  id: string;
  email: string;
}

export interface AdminActionOptions<S extends z.ZodType> {
  /** Audit action name, e.g. "user.ban" */
  action: string;
  schema: S;
  limit?: AdminLimitTier;
  /** Defaults to the whole admin panel */
  revalidate?: string[];
}

export type AdminLimitTier = "standard" | "sensitive";

/**
 * Per admin and action: 30 a minute, or 5 an hour for the heavy ones. The
 * back-office console's signed endpoints apply the same tiers
 * (lib/console-internal/limits.ts).
 */
export const ADMIN_LIMITS = {
  standard: { tokens: 30, window: "60 s" },
  sensitive: { tokens: 5, window: "1 h" },
} as const satisfies Record<AdminLimitTier, unknown>;

const limiters: Record<AdminLimitTier, RateLimiter> = {
  standard: createRateLimiter({
    limiter: slidingWindow(
      ADMIN_LIMITS.standard.tokens,
      ADMIN_LIMITS.standard.window,
    ),
    prefix: "qrdx:admin",
  }),
  sensitive: createRateLimiter({
    limiter: slidingWindow(
      ADMIN_LIMITS.sensitive.tokens,
      ADMIN_LIMITS.sensitive.window,
    ),
    prefix: "qrdx:admin-sensitive",
  }),
};

/** Thrown inside an action for a problem the admin should read. */
export const adminError = (message: string, status = 400) =>
  new HttpError(status, "ADMIN_ACTION", message);

/**
 * The runner for one app's admin actions. `assertAdmin` resolves the
 * signed-in admin, or throws "Not found" for anyone else. Each action then
 * runs, in this order:
 * 1. that admin check (before any input is read or any query runs);
 * 2. rate limit per admin and action;
 * 3. validate the input;
 * 4. run the action, then write its audit entry (with the reason);
 * 5. revalidate the panel.
 */
export function createAdminActionRunner<A extends AdminActor>({
  assertAdmin,
}: {
  assertAdmin: () => Promise<A>;
}) {
  return async function runAdminAction<S extends z.ZodType, T = undefined>(
    options: AdminActionOptions<S>,
    input: unknown,
    body: (
      admin: A,
      input: z.output<S>,
    ) => Promise<AdminActionOutcome<T> | null>,
  ): Promise<AdminActionResult<T>> {
    const admin = await assertAdmin();

    try {
      await enforceRateLimits([
        {
          limiter: limiters[options.limit ?? "standard"],
          key: `${options.action}:${admin.id}`,
        },
      ]);
    } catch (error) {
      return failure(error, options.action);
    }

    const parsed = options.schema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    let outcome: AdminActionOutcome<T> | null;
    try {
      outcome = await body(admin, parsed.data);
      // null: nothing to change (already in the requested state), no entry.
      if (outcome) {
        const reason =
          typeof (parsed.data as { reason?: unknown })?.reason === "string"
            ? (parsed.data as { reason: string }).reason
            : null;
        await writeAuditLog({
          actor: admin,
          action: outcome.audit.action ?? options.action,
          targetType: outcome.audit.targetType,
          targetId: outcome.audit.targetId,
          metadata: {
            ...outcome.audit.metadata,
            reason,
            ...(outcome.audit.subjectUserId
              ? { subjectUserId: outcome.audit.subjectUserId }
              : {}),
          },
        });
      }
    } catch (error) {
      return failure(error, options.action);
    }

    for (const path of options.revalidate ?? ["/admin"]) {
      revalidatePath(path, "layout");
    }
    return outcome?.data === undefined
      ? { ok: true }
      : { ok: true, data: outcome.data };
  };
}

function failure(error: unknown, action: string): AdminActionResult<never> {
  if (error instanceof HttpError) return { ok: false, error: error.message };
  // Better Auth APIError messages are safe to show ("You cannot ban yourself").
  if (error instanceof Error && "statusCode" in error && error.message) {
    return { ok: false, error: error.message };
  }
  // The error's kind and code only: a database error's message lists the
  // query's values (a new address, a session id).
  console.error(
    JSON.stringify({
      event: "admin.action_failed",
      action,
      error: errorSummary(error),
    }),
  );
  return { ok: false, error: "Action failed" };
}

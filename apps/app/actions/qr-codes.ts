"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type CodeListStatus,
  type CodeUsage,
  checkSlugAvailability,
  codeIdSchema,
  createCodeSchema,
  createCodes,
  deleteCode,
  enforceCreateRateLimit,
  enforceSlugCheckRateLimit,
  getCode,
  getCodeUsage,
  hasAnyField,
  listCodes,
  type QrCodeView,
  type SlugAvailability,
  setCodeArchived,
  updateCode,
  updateCodeFields,
  type updateCodeSchema,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { CODE_ACTION_MESSAGES, ownMessage } from "@/lib/code-actions/messages";
import { codeActionText } from "@/lib/code-actions/messages-server";
import { HttpError } from "@/lib/error-response";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import type {
  QrCodeActionResult,
  QrCodeErrorCode,
} from "@/types/action-results";
import { UnauthorizedError, ValidationError } from "@/types/errors";

const KNOWN_CODES = new Set<string>([
  "NOT_FOUND",
  "FORBIDDEN",
  "LIMIT_REACHED",
  "PLAN_REQUIRED",
  "RATE_LIMITED",
  "DOMAIN_NOT_VERIFIED",
  "UNSAFE_DESTINATION",
  "INVALID_SLUG",
  "SLUG_TAKEN",
]);

const ENGLISH = CODE_ACTION_MESSAGES.qrCodes;

/** The answer for a thrown `error`, in the person's language (codeActionText). */
async function failure(
  error: unknown,
  context: Record<string, unknown>,
  who: { pageLocale?: string; userId?: string },
): Promise<QrCodeActionResult<never>> {
  const text = (await codeActionText(who)).qrCodes;
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: text.signIn },
    };
  }
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: ownMessage(ENGLISH, text, error.message),
      },
    };
  }
  if (error instanceof HttpError) {
    return {
      success: false,
      error: {
        code: KNOWN_CODES.has(error.code)
          ? (error.code as QrCodeErrorCode)
          : "UNKNOWN_ERROR",
        message: error.message,
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

/** Every action resolves the caller's scope itself; nothing scope-related comes from the client. */
async function run<T>(
  action: string,
  fn: (scope: ActiveScope) => Promise<T>,
  {
    revalidate = false,
    pageLocale,
  }: { revalidate?: boolean; pageLocale?: string } = {},
): Promise<QrCodeActionResult<T>> {
  let userId: string | undefined;
  try {
    const scope = await getActiveScope();
    userId = scope.userId;
    const data = await fn(scope);
    if (revalidate) revalidatePath("/dashboard", "layout");
    return { success: true, data };
  } catch (error) {
    return failure(error, { action }, { pageLocale, userId });
  }
}

const listSchema = z
  .object({
    status: z.enum(["active", "archived", "all"]).optional(),
    q: z.string().max(200).optional(),
  })
  .optional();

const updateSchema = updateCodeFields
  .extend({ id: codeIdSchema })
  .transform(({ id, ...patch }) => ({ id, patch }))
  .refine(({ patch }) => hasAnyField(patch), {
    message: ENGLISH.nothingToUpdate,
  });

const archiveSchema = z.object({ id: codeIdSchema, archived: z.boolean() });
const idOnlySchema = z.object({ id: codeIdSchema });

/** Where the signed-in app makes a code from (qr_code.created_via). */
const createdFromSchema = z
  .object({ via: z.enum(["dashboard", "playground"]).optional() })
  .optional()
  .catch(undefined);

/**
 * Creates a code. `from.via` says which surface asked (the playground's
 * Dynamic toggle and builder say "playground"); anything else counts as the
 * dashboard. `pageLocale` (here and below): the calling page's useLocale(),
 * the language its messages are in (lib/code-actions/messages-server.ts).
 */
export async function createQrCode(
  input: z.input<typeof createCodeSchema>,
  from?: { via?: "dashboard" | "playground" },
  pageLocale?: string,
): Promise<QrCodeActionResult<QrCodeView>> {
  return run(
    "createQrCode",
    async (scope) => {
      const data = parse(createCodeSchema, input);
      const via = createdFromSchema.parse(from)?.via ?? "dashboard";
      await enforceCreateRateLimit(scope.userId);
      const [code] = await createCodes(scope, [data], { via });
      return code;
    },
    { revalidate: true, pageLocale },
  );
}

export async function updateQrCode(
  input: { id: string } & z.input<typeof updateCodeSchema>,
  pageLocale?: string,
): Promise<QrCodeActionResult<QrCodeView>> {
  return run(
    "updateQrCode",
    (scope) => {
      const { id, patch } = parse(updateSchema, input);
      return updateCode(scope, id, patch);
    },
    { revalidate: true, pageLocale },
  );
}

export async function setQrCodeArchived(
  input: z.input<typeof archiveSchema>,
): Promise<QrCodeActionResult<QrCodeView>> {
  return run(
    "setQrCodeArchived",
    (scope) => {
      const { id, archived } = parse(archiveSchema, input);
      return setCodeArchived(scope, id, archived);
    },
    { revalidate: true },
  );
}

export async function deleteQrCode(
  input: z.input<typeof idOnlySchema>,
): Promise<QrCodeActionResult<{ id: string }>> {
  return run(
    "deleteQrCode",
    (scope) => deleteCode(scope, parse(idOnlySchema, input).id),
    { revalidate: true },
  );
}

export async function listQrCodes(
  input?: {
    status?: CodeListStatus;
    q?: string;
  },
  pageLocale?: string,
): Promise<QrCodeActionResult<{ codes: QrCodeView[]; total: number }>> {
  return run(
    "listQrCodes",
    (scope) => listCodes(scope, { ...parse(listSchema, input), limit: 100 }),
    { pageLocale },
  );
}

export async function getQrCode(
  id: string,
  pageLocale?: string,
): Promise<QrCodeActionResult<QrCodeView>> {
  return run("getQrCode", (scope) => getCode(scope, parse(codeIdSchema, id)), {
    pageLocale,
  });
}

export async function getQrCodeUsage(): Promise<QrCodeActionResult<CodeUsage>> {
  return run("getQrCodeUsage", getCodeUsage);
}

const slugCheckSchema = z.object({
  slug: z.string().trim().max(100),
  /** The domain the code would be on; null = the default short link */
  domainId: z.string().trim().min(1).max(64).nullable(),
  /** The code being edited (its own back-half counts as free) */
  codeId: codeIdSchema.optional(),
});

/** Live availability of a back-half for the code dialog (rate-limited per user). */
export async function checkQrCodeSlug(
  input: z.input<typeof slugCheckSchema>,
  pageLocale?: string,
): Promise<QrCodeActionResult<SlugAvailability>> {
  return run(
    "checkQrCodeSlug",
    async (scope) => {
      const data = parse(slugCheckSchema, input);
      await enforceSlugCheckRateLimit(scope.userId);
      return checkSlugAvailability(scope, data);
    },
    { pageLocale },
  );
}

"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type FolderOption,
  folderOptions,
} from "@/app/(app)/dashboard/barcodes/_lib/filters";
import { listFolders } from "@/app/(app)/dashboard/codes/_lib/organize";
import {
  barcodeIdSchema,
  createBarcodeSchema,
  MAX_BARCODE_BULK,
  updateBarcodeSchema,
} from "@/lib/barcodes/schema";
import {
  type BarcodeView,
  createBarcode,
  duplicateBarcode,
  emptyBarcodeTrash,
  moveBarcodes,
  purgeBarcodes,
  restoreBarcodes,
  trashBarcodes,
  updateBarcode,
} from "@/lib/barcodes/service";
import { codeActionText } from "@/lib/code-actions/messages-server";
import { HttpError } from "@/lib/error-response";
import { assertCan } from "@/lib/permissions-server";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveWorkspace, getActiveWorkspace } from "@/lib/scope";
import { logError } from "@/lib/shared";
import type {
  BarcodeActionResult,
  BarcodeErrorCode,
  SavedBarcodeRef,
} from "@/types/action-results";
import { UnauthorizedError, ValidationError } from "@/types/errors";

// Saved barcodes from the dashboard and from /barcode-generator's "Save to
// dashboard". Every action resolves the caller's workspace itself (the one
// in the URL, else their default); nothing scope-related comes from the
// client.

const KNOWN = new Set<string>([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN",
  "LIMIT_REACHED",
  "RATE_LIMITED",
]);

const writeLimiter = createRateLimiter({ limiter: slidingWindow(60, "60 s") });

/** The answer for a thrown `error`, in the person's language (codeActionText). */
async function failure(
  error: unknown,
  action: string,
): Promise<BarcodeActionResult<never>> {
  const text = (await codeActionText()).barcodes;
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: text.signIn },
    };
  }
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: error.message },
    };
  }
  if (error instanceof HttpError) {
    return {
      success: false,
      error: {
        code: KNOWN.has(error.code)
          ? (error.code as BarcodeErrorCode)
          : "UNKNOWN_ERROR",
        message: error.message,
      },
    };
  }
  logError(error as Error, { action });
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

async function run<T>(
  action: string,
  fn: (active: ActiveWorkspace) => Promise<T>,
): Promise<BarcodeActionResult<T>> {
  try {
    const active = await getActiveWorkspace();
    assertCan(active.scope, "content.write");
    await enforceRateLimits([
      {
        limiter: writeLimiter,
        key: `barcodes:write:user:${active.scope.userId}`,
      },
    ]);
    const data = await fn(active);
    revalidatePath("/dashboard", "layout");
    return { success: true, data };
  } catch (error) {
    return failure(error, action);
  }
}

const ref = (view: BarcodeView, active: ActiveWorkspace): SavedBarcodeRef => ({
  id: view.id,
  title: view.title,
  workspace: { slug: active.workspace.slug, name: active.workspace.name },
});

export async function saveBarcode(
  input: z.input<typeof createBarcodeSchema>,
): Promise<BarcodeActionResult<SavedBarcodeRef>> {
  return run("saveBarcode", async (active) =>
    ref(
      await createBarcode(active.scope, parse(createBarcodeSchema, input)),
      active,
    ),
  );
}

/** The workspace's folders, for the new-barcode modal's picker. Read-only. */
export async function listBarcodeFolders(): Promise<
  BarcodeActionResult<FolderOption[]>
> {
  try {
    const { scope } = await getActiveWorkspace();
    return { success: true, data: folderOptions(await listFolders(scope)) };
  } catch (error) {
    return failure(error, "listBarcodeFolders");
  }
}

const updateInput = z.object({
  id: barcodeIdSchema,
  patch: updateBarcodeSchema,
});

export async function updateSavedBarcode(
  input: z.input<typeof updateInput>,
): Promise<BarcodeActionResult<SavedBarcodeRef>> {
  return run("updateSavedBarcode", async (active) => {
    const { id, patch } = parse(updateInput, input);
    return ref(await updateBarcode(active.scope, id, patch), active);
  });
}

const idInput = z.object({ id: barcodeIdSchema });
const idsInput = z.object({
  ids: z.array(barcodeIdSchema).min(1).max(MAX_BARCODE_BULK),
});

export async function duplicateSavedBarcode(
  input: z.input<typeof idInput>,
): Promise<BarcodeActionResult<SavedBarcodeRef>> {
  return run("duplicateSavedBarcode", async (active) =>
    ref(await duplicateBarcode(active.scope, parse(idInput, input).id), active),
  );
}

export async function trashSavedBarcodes(
  input: z.input<typeof idsInput>,
): Promise<BarcodeActionResult<{ updated: number; skipped: number }>> {
  return run("trashSavedBarcodes", (active) =>
    trashBarcodes(active.scope, parse(idsInput, input).ids),
  );
}

export async function restoreSavedBarcodes(
  input: z.input<typeof idsInput>,
): Promise<BarcodeActionResult<{ updated: number; skipped: number }>> {
  return run("restoreSavedBarcodes", (active) =>
    restoreBarcodes(active.scope, parse(idsInput, input).ids),
  );
}

export async function purgeSavedBarcodes(
  input: z.input<typeof idsInput>,
): Promise<BarcodeActionResult<{ updated: number; skipped: number }>> {
  return run("purgeSavedBarcodes", (active) =>
    purgeBarcodes(active.scope, parse(idsInput, input).ids),
  );
}

export async function emptySavedBarcodeTrash(): Promise<
  BarcodeActionResult<{ updated: number }>
> {
  return run("emptySavedBarcodeTrash", (active) =>
    emptyBarcodeTrash(active.scope),
  );
}

const moveInput = idsInput.extend({
  folderId: barcodeIdSchema.nullable(),
});

export async function moveSavedBarcodes(
  input: z.input<typeof moveInput>,
): Promise<BarcodeActionResult<{ updated: number }>> {
  return run("moveSavedBarcodes", (active) => {
    const { ids, folderId } = parse(moveInput, input);
    return moveBarcodes(active.scope, ids, folderId);
  });
}

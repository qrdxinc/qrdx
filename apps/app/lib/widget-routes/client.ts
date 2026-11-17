// The browser side of the same-origin JSON routes the public generator
// widgets call (lib/widget-routes/server.ts). Plain fetch and no server
// actions, so any zone served on this origin can render the widgets. Each
// route answers with its server action's own result.

import type { z } from "zod";
import type { createBarcodeSchema } from "@/lib/barcodes/schema";
import type {
  BarcodeActionResult,
  QrCodeActionResult,
  SavedBarcodeRef,
} from "@/types/action-results";
import type { ThemeStyles } from "@/types/theme";

export const WIDGET_ROUTES = {
  /** POST: a dynamic code from the Dynamic toggle (createQrCode, via "playground") */
  dynamicCodes: "/api/playground/codes",
  /** PATCH: the linked code's destination or design (updateQrCode) */
  dynamicCode: (id: string) =>
    `/api/playground/codes/${encodeURIComponent(id)}`,
  /** POST: /barcode-generator's "Save to dashboard" (saveBarcode) */
  barcodes: "/api/barcodes",
} as const;

/** What the Dynamic toggle reads of a saved code (QrCodeView has more). */
export interface DynamicCodeRef {
  id: string;
  shortLink: string;
  destinationUrl: string;
}

function isResult(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const result = value as { success?: unknown; error?: unknown };
  if (result.success === true) return true;
  if (result.success !== false) return false;
  const error = result.error as { code?: unknown; message?: unknown } | null;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  );
}

/**
 * Sends `body` as JSON and returns the result the route answers with. A
 * network failure, or an answer that isn't a result (a proxy's error page),
 * rejects, as a server action call does.
 */
async function call<R>(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<R> {
  const response = await fetch(path, {
    method,
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  let result: unknown = null;
  try {
    result = await response.json();
  } catch {
    // Not JSON: rejected below.
  }
  if (!isResult(result)) {
    throw new Error(`Unexpected answer from ${path} (${response.status}).`);
  }
  return result as R;
}

export function createDynamicCode(input: {
  destinationUrl: string;
  style: ThemeStyles;
}): Promise<QrCodeActionResult<DynamicCodeRef>> {
  return call(WIDGET_ROUTES.dynamicCodes, "POST", input);
}

export function updateDynamicCode({
  id,
  ...patch
}: {
  id: string;
  destinationUrl?: string;
  style?: ThemeStyles;
}): Promise<QrCodeActionResult<DynamicCodeRef>> {
  return call(WIDGET_ROUTES.dynamicCode(id), "PATCH", patch);
}

export function saveGeneratorBarcode(
  input: z.input<typeof createBarcodeSchema>,
): Promise<BarcodeActionResult<SavedBarcodeRef>> {
  return call(WIDGET_ROUTES.barcodes, "POST", input);
}

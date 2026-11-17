// What the QR code and barcode server actions (actions/qr-codes.ts,
// actions/barcodes.ts) answer, and the same-origin routes in front of them
// (lib/widget-routes) with them. Declared here, in no server module, so
// client code that reads these results imports no server action.

export type QrCodeErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "LIMIT_REACHED"
  | "PLAN_REQUIRED"
  | "RATE_LIMITED"
  | "DOMAIN_NOT_VERIFIED"
  | "UNSAFE_DESTINATION"
  | "INVALID_SLUG"
  | "SLUG_TAKEN"
  | "UNKNOWN_ERROR";

export type QrCodeActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: QrCodeErrorCode; message: string } };

export type BarcodeErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "LIMIT_REACHED"
  | "RATE_LIMITED"
  | "UNKNOWN_ERROR";

export type BarcodeActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: BarcodeErrorCode; message: string } };

export interface SavedBarcodeRef {
  id: string;
  title: string | null;
  /** The workspace it was saved to, for links */
  workspace: { slug: string; name: string };
}

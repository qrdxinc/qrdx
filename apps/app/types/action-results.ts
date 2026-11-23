// What the server actions behind the public widgets answer (QR codes,
// barcodes, checkout, invoice and non-profit requests, the enterprise
// form), and the same-origin routes in front of them (lib/widget-routes)
// with them. Declared here, in no server module, so client code that reads
// these results imports no server action.

import type { EnterpriseRequestField } from "@/lib/enterprise";

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
  | {
      success: false;
      error: {
        code: QrCodeErrorCode;
        message: string;
        /**
         * LIMIT_REACHED in the person's own workspace while inviting a
         * friend would still earn them more codes (lib/invites): the limit
         * gate adds its invite line.
         */
        invite?: true;
      };
    };

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

/** actions/checkout.ts createCheckout (POST /api/subscription/checkout). */
export type CheckoutResult =
  | { url: string }
  | {
      error: string;
      /**
       * sign_in: no session; subscribed: change plans in the billing portal;
       * unavailable: no product or billing here; invalid: not a plan and
       * period; rate_limited: too many attempts; failed: Polar or this app
       * failed.
       */
      reason?:
        | "sign_in"
        | "subscribed"
        | "unavailable"
        | "invalid"
        | "rate_limited"
        | "failed";
    };

/**
 * The pay-by-invoice and non-profit discount requests on /pricing
 * (actions/invoice-requests.ts, actions/nonprofit-requests.ts).
 * FORBIDDEN only comes from their routes (another origin).
 */
export type PricingRequestResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "UNAUTHORIZED"
        | "FORBIDDEN"
        | "VALIDATION_ERROR"
        | "UNAVAILABLE"
        | "NOT_SENT"
        | "RATE_LIMITED"
        | "UNKNOWN_ERROR";
      error: string;
    };

/** The enterprise contact form's fields (lib/enterprise.ts, which the schema matches). */
export type { EnterpriseRequestField };

/** actions/enterprise-requests.ts submitEnterpriseRequest. */
export type EnterpriseFormState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | {
      status: "error";
      code:
        | "invalid"
        | "rateLimited"
        | "check"
        | "notSent"
        | "unavailable"
        | "unknown";
      field?: EnterpriseRequestField;
    };

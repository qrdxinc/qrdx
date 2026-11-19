// The browser side of the same-origin JSON routes the public widgets call
// (lib/widget-routes/server.ts). Plain fetch and no server actions, so any
// zone served on this origin can render the widgets. Each route answers
// with its server action's own result.

import type { z } from "zod";
import type { SavedTheme } from "@/app/(app)/dashboard/themes/_lib/theme";
import type { createBarcodeSchema } from "@/lib/barcodes/schema";
import type { BillingInterval, PaidPlan } from "@/lib/pricing";
import type {
  BarcodeActionResult,
  CheckoutResult,
  EnterpriseFormState,
  PricingRequestResult,
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
  /** POST: /pricing's paid plan buttons (createCheckout) */
  checkout: "/api/subscription/checkout",
  /** POST: /pricing's "Pay by invoice" (requestInvoiceAction) */
  invoiceRequests: "/api/invoice-requests",
  /** POST: /pricing's non-profit discount (requestNonprofitDiscountAction) */
  nonprofitRequests: "/api/nonprofit-requests",
  /** POST: the /enterprise contact form (submitEnterpriseRequest) */
  enterpriseRequests: "/api/enterprise-requests",
  /** GET: the signed-in visitor's saved themes, for the bulk tool (getThemes) */
  themes: "/api/themes",
} as const;

/** What the Dynamic toggle reads of a saved code (QrCodeView has more). */
export interface DynamicCodeRef {
  id: string;
  shortLink: string;
  destinationUrl: string;
  /**
   * The route answers with the whole code view: "disabled" when a new
   * account's address waits for a safety check (lib/safety/destinations.ts),
   * so the code is saved but switched off.
   */
  status?: "active" | "archived" | "disabled";
  /** Paused by its owner: status stays "active", scans don't reach the address. */
  paused?: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `{ success: true, … }` or `{ success: false, error: { code, message } }`. */
function isActionResult(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (value.success === true) return true;
  if (value.success !== false) return false;
  const error = value.error;
  return (
    isObject(error) &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  );
}

/** `{ url }` or `{ error, reason? }`. */
const isCheckoutResult = (value: unknown): boolean =>
  isObject(value) &&
  (typeof value.url === "string" || typeof value.error === "string");

/** `{ ok: true }` or `{ ok: false, code, error }`. */
const isPricingRequestResult = (value: unknown): boolean =>
  isObject(value) &&
  (value.ok === true ||
    (value.ok === false &&
      typeof value.code === "string" &&
      typeof value.error === "string"));

/** `{ status: "sent" | "error" | "idle", … }`. */
const isEnterpriseFormState = (value: unknown): boolean =>
  isObject(value) &&
  (value.status === "sent" ||
    value.status === "error" ||
    value.status === "idle");

/**
 * Sends `body` as JSON and returns the result the route answers with. A
 * network failure, or an answer that isn't a result (a proxy's error page),
 * rejects, as a server action call does.
 */
async function call<R>(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
  isResult: (value: unknown) => boolean = isActionResult,
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

/**
 * `path` with the calling page's language (its useLocale()), which the code
 * and barcode routes pass to their action so its messages come in it.
 */
const inLocale = (path: string, locale: string | undefined) =>
  locale ? `${path}?locale=${encodeURIComponent(locale)}` : path;

export function createDynamicCode(
  input: {
    destinationUrl: string;
    style: ThemeStyles;
  },
  locale?: string,
): Promise<QrCodeActionResult<DynamicCodeRef>> {
  return call(inLocale(WIDGET_ROUTES.dynamicCodes, locale), "POST", input);
}

export function updateDynamicCode(
  {
    id,
    ...patch
  }: {
    id: string;
    destinationUrl?: string;
    style?: ThemeStyles;
  },
  locale?: string,
): Promise<QrCodeActionResult<DynamicCodeRef>> {
  return call(inLocale(WIDGET_ROUTES.dynamicCode(id), locale), "PATCH", patch);
}

export function saveGeneratorBarcode(
  input: z.input<typeof createBarcodeSchema>,
  locale?: string,
): Promise<BarcodeActionResult<SavedBarcodeRef>> {
  return call(inLocale(WIDGET_ROUTES.barcodes, locale), "POST", input);
}

/** A Polar checkout for `plan`, or why not (sign_in, subscribed, …). */
export function startCheckout(input: {
  plan: PaidPlan;
  interval: BillingInterval;
}): Promise<CheckoutResult> {
  return call(WIDGET_ROUTES.checkout, "POST", input, isCheckoutResult);
}

/** The invoice dialog's fields (lib/invoice-requests.tsx validates them). */
export interface InvoiceRequestFields {
  company: string;
  billingEmail: string;
  country: string;
  taxId: string;
  address: string;
  notes: string;
}

export function requestInvoice(
  fields: InvoiceRequestFields,
): Promise<PricingRequestResult> {
  return call(
    WIDGET_ROUTES.invoiceRequests,
    "POST",
    fields,
    isPricingRequestResult,
  );
}

/** The non-profit dialog's fields (lib/nonprofit-requests.tsx validates them). */
export interface NonprofitRequestFields {
  organization: string;
  country: string;
  registration: string;
  contactEmail: string;
  plan: PaidPlan;
}

export function requestNonprofitDiscount(
  fields: NonprofitRequestFields,
): Promise<PricingRequestResult> {
  return call(
    WIDGET_ROUTES.nonprofitRequests,
    "POST",
    fields,
    isPricingRequestResult,
  );
}

/**
 * The enterprise form's fields as the form holds them (FormData: name,
 * email, company, teamSize, need, locale, the honeypot and Turnstile's
 * token), sent as a JSON object of strings. Its signature fits
 * useActionState.
 */
export function sendEnterpriseRequest(
  _previous: EnterpriseFormState,
  data: FormData,
): Promise<EnterpriseFormState> {
  const fields: Record<string, string> = {};
  for (const [name, value] of data.entries()) {
    if (typeof value === "string") fields[name] = value;
  }
  return call(
    WIDGET_ROUTES.enterpriseRequests,
    "POST",
    fields,
    isEnterpriseFormState,
  );
}

/** A saved theme as GET /api/themes sends it: the dates are ISO strings. */
export type SavedThemeJson = Omit<SavedTheme, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

/**
 * The signed-in visitor's saved themes ([] when signed out). Rejects on a
 * failure, as getThemes did.
 */
export async function fetchSavedThemes(): Promise<SavedThemeJson[]> {
  const response = await fetch(WIDGET_ROUTES.themes, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  let themes: unknown = null;
  try {
    themes = await response.json();
  } catch {
    // Not JSON: rejected below.
  }
  if (!(response.ok && Array.isArray(themes))) {
    throw new Error(
      `Unexpected answer from ${WIDGET_ROUTES.themes} (${response.status}).`,
    );
  }
  return themes as SavedThemeJson[];
}

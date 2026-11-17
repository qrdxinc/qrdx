import "server-only";

import { HttpError } from "@/lib/http-error";
import { baseUrl } from "@/lib/metadata";
import { readJsonBody } from "@/lib/request-guards";
import { ValidationError } from "@/types/errors";

// Same-origin JSON routes in front of the server actions the public widgets
// use: the generators (app/api/playground/codes, app/api/barcodes), the
// pricing page (app/api/subscription/checkout, app/api/invoice-requests,
// app/api/nonprofit-requests), the enterprise form
// (app/api/enterprise-requests) and the bulk tool's saved themes
// (app/api/themes). Another zone on this origin (the marketing site on
// qrdx.dev) renders those widgets and can't call this app's server actions,
// so the widgets fetch these instead (lib/widget-routes/client.ts).
//
// Each route runs the action itself, so input validation, rate limits, plan
// limits, audit records and the result stay in one implementation. This adds
// what a cookie-authenticated route needs on top: only this origin may call
// it, JSON bodies only, a body cap, and no CORS headers.

/** next.config.ts serverActions.bodySizeLimit ("2mb"): what the actions took. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** The forms' routes (checkout, invoice, non-profit, enterprise): a few fields. */
export const FORM_BODY_BYTES = 64 * 1024;

const NO_STORE = { "Cache-Control": "no-store" };

/** The HTTP status for each error code the actions answer with. */
const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  VALIDATION_ERROR: 400,
  INVALID_SLUG: 400,
  DOMAIN_NOT_VERIFIED: 400,
  LIMIT_REACHED: 402,
  PLAN_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SLUG_TAKEN: 409,
  UNSAFE_DESTINATION: 422,
  RATE_LIMITED: 429,
  UNKNOWN_ERROR: 500,
};

type ActionResult =
  | { success: true; data: unknown }
  | { success: false; error: { code: string; message: string } };

/**
 * Whether the request comes from one of this app's own pages. A browser
 * always sends Origin on a POST or PATCH, and Sec-Fetch-Site where it
 * supports it; anything cross-site, same-site (another subdomain), or
 * without an Origin is refused.
 */
export function isSameOriginRequest(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return false;

  const origin = req.headers.get("origin");
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    // "null" (sandboxed frames, opaque redirects) and anything malformed.
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const own = [
    req.headers.get("host"),
    req.headers.get("x-forwarded-host"),
    baseUrl.host,
  ];
  return own.includes(url.host);
}

/**
 * Whether a GET comes from one of this app's own pages. A browser's
 * same-origin fetch sends Sec-Fetch-Site but no Origin on a GET, so:
 * Sec-Fetch-Site, when sent, must be `same-origin`, and Origin, when sent,
 * must be this app's. Another site can't read the answer anyway (no CORS
 * headers); this also keeps the URL from being loaded from another site's
 * page with the visitor's cookies.
 */
export function isSameOriginRead(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return false;
  if (req.headers.get("origin") === null) return true;
  return isSameOriginRequest(req);
}

/** `application/json`, with or without parameters (charset). */
function isJson(req: Request): boolean {
  const type = req.headers.get("content-type") ?? "";
  return type.split(";")[0]?.trim().toLowerCase() === "application/json";
}

/** A JSON answer no cache keeps. */
export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Why a request was turned away before its action ran. */
export interface Refusal {
  status: number;
  code: "FORBIDDEN" | "VALIDATION_ERROR";
  message: string;
}

const CROSS_ORIGIN: Refusal = {
  status: 403,
  code: "FORBIDDEN",
  message: "Cross-origin request rejected.",
};

const invalid = (status: number, message: string): { refusal: Refusal } => ({
  refusal: { status, code: "VALIDATION_ERROR", message },
});

/**
 * The JSON object a same-origin request sent, or why it's refused: another
 * origin (403), not JSON (415), over `maxBytes` (413), unreadable or not an
 * object (400).
 */
export async function readSameOriginJson(
  req: Request,
  { maxBytes = MAX_BODY_BYTES }: { maxBytes?: number } = {},
): Promise<{ body: Record<string, unknown> } | { refusal: Refusal }> {
  if (!isSameOriginRequest(req)) return { refusal: CROSS_ORIGIN };
  if (!isJson(req)) {
    return invalid(
      415,
      "Send a JSON body with Content-Type: application/json.",
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(req, maxBytes);
  } catch (error) {
    if (error instanceof HttpError) return invalid(error.status, error.message);
    if (error instanceof ValidationError) return invalid(400, error.message);
    throw error;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return invalid(400, "Send a JSON object.");
  }
  return { body: body as Record<string, unknown> };
}

/**
 * Checks the request, reads its JSON object body and answers with what
 * `run` (the server action) returns, with the status `statusOf` gives it.
 * Refusals are answered in the action's own result shape (`refuse`), so a
 * widget reads every answer alike.
 */
export async function resultRoute<R>(
  req: Request,
  run: (body: Record<string, unknown>) => Promise<R>,
  {
    statusOf,
    refuse,
    maxBytes,
  }: {
    statusOf: (result: R) => number;
    refuse: (refusal: Refusal) => R;
    maxBytes?: number;
  },
): Promise<Response> {
  const read = await readSameOriginJson(req, { maxBytes });
  if ("refusal" in read) {
    return jsonResponse(refuse(read.refusal), read.refusal.status);
  }
  const result = await run(read.body);
  return jsonResponse(result, statusOf(result));
}

/**
 * resultRoute for the actions that answer `{ success, data | error }` (the
 * generators'): a success is 200 (201 with `created`), an error the status
 * its code maps to.
 */
export function actionRoute(
  req: Request,
  run: (body: Record<string, unknown>) => Promise<ActionResult>,
  { created = false }: { created?: boolean } = {},
): Promise<Response> {
  return resultRoute<ActionResult>(req, run, {
    statusOf: (result) => {
      if (!result.success) return STATUS[result.error.code] ?? 500;
      return created ? 201 : 200;
    },
    refuse: ({ code, message }) => ({
      success: false,
      error: { code, message },
    }),
  });
}

/** The answer to a GET from another site's page: 403, as the POSTs answer. */
export function crossOriginRead(): Response {
  return jsonResponse(
    {
      success: false,
      error: { code: CROSS_ORIGIN.code, message: CROSS_ORIGIN.message },
    },
    CROSS_ORIGIN.status,
  );
}

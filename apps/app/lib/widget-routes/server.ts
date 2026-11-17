import "server-only";

import { HttpError } from "@/lib/http-error";
import { baseUrl } from "@/lib/metadata";
import { readJsonBody } from "@/lib/request-guards";
import { ValidationError } from "@/types/errors";

// Same-origin JSON routes in front of the server actions the public generator
// widgets use (app/api/playground/codes, app/api/barcodes). Another zone on
// this origin (the marketing site on qrdx.dev) renders those widgets and
// can't call this app's server actions, so the widgets fetch these instead
// (lib/widget-routes/client.ts).
//
// Each route runs the action itself, so input validation, rate limits, plan
// limits, audit records and the result stay in one implementation. This adds
// what a cookie-authenticated route needs on top: only this origin may call
// it, JSON bodies only, the actions' body cap, and no CORS headers.

/** next.config.ts serverActions.bodySizeLimit ("2mb"): what the actions took. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

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

/** `application/json`, with or without parameters (charset). */
function isJson(req: Request): boolean {
  const type = req.headers.get("content-type") ?? "";
  return type.split(";")[0]?.trim().toLowerCase() === "application/json";
}

function refuse(status: number, code: string, message: string): Response {
  return Response.json(
    { success: false, error: { code, message } },
    { status, headers: NO_STORE },
  );
}

/**
 * Checks the request, reads its JSON object body and answers with what
 * `run` (the server action) returns, with a status that matches it. Refusals
 * use the actions' result shape too, so the widgets read every answer alike.
 */
export async function actionRoute(
  req: Request,
  run: (body: Record<string, unknown>) => Promise<ActionResult>,
  { created = false }: { created?: boolean } = {},
): Promise<Response> {
  if (!isSameOriginRequest(req)) {
    return refuse(403, "FORBIDDEN", "Cross-origin request rejected.");
  }
  if (!isJson(req)) {
    return refuse(
      415,
      "VALIDATION_ERROR",
      "Send a JSON body with Content-Type: application/json.",
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof HttpError) {
      return refuse(error.status, "VALIDATION_ERROR", error.message);
    }
    if (error instanceof ValidationError) {
      return refuse(400, "VALIDATION_ERROR", error.message);
    }
    throw error;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return refuse(400, "VALIDATION_ERROR", "Send a JSON object.");
  }

  const result = await run(body as Record<string, unknown>);
  const status = result.success
    ? created
      ? 201
      : 200
    : (STATUS[result.error.code] ?? 500);
  return Response.json(result, { status, headers: NO_STORE });
}

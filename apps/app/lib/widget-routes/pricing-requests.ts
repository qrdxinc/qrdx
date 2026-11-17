import "server-only";

import type { PricingRequestResult } from "@/types/action-results";
import { FORM_BODY_BYTES, resultRoute } from "./server";

// The pricing page's two signed-in requests, pay by invoice and the
// non-profit discount (app/api/invoice-requests, app/api/nonprofit-requests),
// answer alike: { ok: true } or { ok: false, code, error }.

const STATUS: Record<
  Extract<PricingRequestResult, { ok: false }>["code"],
  number
> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  UNAVAILABLE: 503,
  NOT_SENT: 502,
  RATE_LIMITED: 429,
  UNKNOWN_ERROR: 500,
};

/** POST handler for one of them: runs `action` with the JSON body. */
export function pricingRequestRoute(
  req: Request,
  action: (input: never) => Promise<PricingRequestResult>,
): Promise<Response> {
  return resultRoute<PricingRequestResult>(
    req,
    (body) => action(body as never),
    {
      maxBytes: FORM_BODY_BYTES,
      statusOf: (result) => (result.ok ? 200 : (STATUS[result.code] ?? 500)),
      refuse: ({ code, message }) => ({ ok: false, code, error: message }),
    },
  );
}

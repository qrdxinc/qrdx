import { createCheckout } from "@/actions/checkout";
import { FORM_BODY_BYTES, resultRoute } from "@/lib/widget-routes/server";
import type { CheckoutResult } from "@/types/action-results";

/** The status for each answer: the reason's, or 200 with the checkout URL. */
const STATUS: Record<
  NonNullable<Extract<CheckoutResult, { error: string }>["reason"]>,
  number
> = {
  sign_in: 401,
  subscribed: 409,
  unavailable: 503,
  invalid: 400,
  rate_limited: 429,
  failed: 500,
};

/**
 * The pricing page's paid plan buttons (components/sections/pricing-section.tsx)
 * for pages that can't call this app's server actions. Runs createCheckout:
 * the session, its rate limit, the one-subscription rule, the visitor's IP
 * and the currency of their country (this request's own geo headers) are
 * the action's. The body is { plan, interval, surface }: `surface` (the
 * button or page, lib/checkout-surface.ts) is checked against the list and
 * stored as "unknown" when it isn't on it. Answers { url } (Polar's
 * checkout) or { error, reason }.
 */
export function POST(req: Request) {
  return resultRoute<CheckoutResult>(
    req,
    (body) => createCheckout(body as Parameters<typeof createCheckout>[0]),
    {
      maxBytes: FORM_BODY_BYTES,
      statusOf: (result) =>
        "url" in result ? 200 : (STATUS[result.reason ?? "failed"] ?? 500),
      refuse: ({ message }) => ({ error: message }),
    },
  );
}

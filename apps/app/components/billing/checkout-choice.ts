// What an in-app upgrade button can do for this person (checkout-buttons.tsx).
// Pure and client-safe, so the tests cover every case.

import {
  BILLING_INTERVALS,
  type BillingInterval,
  formatPrice,
  type PaidPlan,
  type Plan,
  PRICING,
  type PricingCurrency,
} from "@/lib/pricing";

export interface CheckoutOption {
  interval: BillingInterval;
  /** "$5", "₹199", "€5"; null until the currency is known */
  price: string | null;
}

export type CheckoutChoice =
  /** Start a Polar checkout for one of these billing periods. */
  | { kind: "checkout"; options: CheckoutOption[] }
  /** Already paying: plan changes happen in the billing portal. */
  | { kind: "portal" }
  /** Nothing to offer here: the caller's own link (or nothing) stays. */
  | { kind: "none" };

export function checkoutChoice({
  plan,
  billing,
  signedIn,
  currentPlan,
  currency,
  locale,
}: {
  /** The plan the button sells */
  plan: PaidPlan;
  /** Polar is set up on this deployment (the "billing" feature) */
  billing: boolean;
  signedIn: boolean;
  /** Their own plan (GET /api/subscription); null while unknown */
  currentPlan: Plan | null;
  /** The currency checkout would charge them; null while unknown */
  currency: PricingCurrency | null;
  locale?: string;
}): CheckoutChoice {
  if (!(billing && signedIn)) return { kind: "none" };
  if (currentPlan === plan || currentPlan === "business") {
    return { kind: "none" };
  }
  if (currentPlan === "pro") return { kind: "portal" };
  // Free, or not known yet (checkout itself refuses a second subscription).
  const options = BILLING_INTERVALS.filter((interval) =>
    Boolean(PRICING[plan][interval].productId),
  ).map((interval) => ({
    interval,
    price: currency
      ? formatPrice(PRICING[plan][interval].amounts[currency], currency, locale)
      : null,
  }));
  return options.length > 0 ? { kind: "checkout", options } : { kind: "none" };
}

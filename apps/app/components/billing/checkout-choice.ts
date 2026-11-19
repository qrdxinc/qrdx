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

/**
 * Whether this person's purchase lifts the plan behind a gate: "yes",
 * "no" (a member of someone else's workspace: its plan is its owners' and
 * billing members'), or "unknown" while nobody has answered. A gate on the
 * person's own plan is always theirs. For a workspace's, the gate's own
 * answer comes first, then the app shell's, then the server's.
 */
export function payerCanUpgrade({
  payer,
  gate,
  shell,
  server,
}: {
  payer: "workspace" | "self";
  gate: boolean | null | undefined;
  shell: boolean | null | undefined;
  server: boolean | null | undefined;
}): "yes" | "no" | "unknown" {
  if (payer === "self") return "yes";
  const answer = gate ?? shell ?? server;
  if (answer === true) return "yes";
  return answer === false ? "no" : "unknown";
}

/** The words for a checkout the server refused (nav.checkoutButtons). */
export function checkoutErrorKey(
  reason: string | undefined,
): "subscribed" | "unavailable" | "rateLimited" | "failed" {
  switch (reason) {
    case "subscribed":
      return "subscribed";
    case "unavailable":
      return "unavailable";
    case "rate_limited":
      return "rateLimited";
    default:
      return "failed";
  }
}

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

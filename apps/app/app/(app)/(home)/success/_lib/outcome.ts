// What /success says when Polar sends a buyer back with ?checkout_id=: the
// plan is "active" only once the subscription row the webhook writes says
// so; "pending" while Polar has the payment and the webhook hasn't arrived;
// and a plain answer for a checkout that wasn't finished, failed, or isn't
// this account's. No server-only imports, so every outcome is unit tested
// directly (the Polar client and the rows are passed in).

import type { PaidPlan } from "@/lib/pricing";

export type CheckoutOutcome =
  | { kind: "active"; plan: PaidPlan }
  | { kind: "pending" }
  | { kind: "incomplete" }
  | { kind: "failed" }
  /** Polar couldn't be asked just now */
  | { kind: "unverified" }
  /** No checkout of this account to speak of */
  | { kind: "unknown" }
  | { kind: "signed-out" };

/** The slice of the Polar SDK this page uses. */
export interface CheckoutClient {
  checkouts: {
    get(id: string): Promise<{
      status: string;
      customer_id: string | null;
      external_customer_id: string | null;
    }>;
  };
  customers: {
    getExternal(externalId: string): Promise<{ id: string }>;
  };
}

/** A `subscription` row of the signed-in person, as the webhook wrote it. */
export interface SubscriptionView {
  checkoutId: string;
  customerId: string;
  productId: string;
  status: string;
}

/** Statuses that grant the plan, as lib/subscription.ts counts them. */
const ENTITLED = new Set(["active", "trialing"]);

const entitled = (row: SubscriptionView) => ENTITLED.has(row.status);

/** Polar checkout ids are UUIDs; anything else is ignored. */
const CHECKOUT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function checkoutIdFrom(value: unknown): string | null {
  const id = Array.isArray(value) ? value[0] : value;
  return typeof id === "string" && CHECKOUT_ID.test(id) ? id : null;
}

const statusOf = (error: unknown): number | undefined => {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : undefined;
};

const nameOf = (error: unknown): string =>
  error instanceof Error ? error.name : typeof error;

const isNotFound = (error: unknown) =>
  statusOf(error) === 404 || nameOf(error) === "ResourceNotFound";

export interface ResolveOutcomeOptions {
  checkoutId: string | null;
  /** Null when signed out */
  userId: string | null;
  /** Null when this deployment has no Polar access token */
  client: CheckoutClient | null;
  /** The person's subscription rows, newest first */
  subscriptions: SubscriptionView[];
  /** The plan a product sells (lib/pricing.ts planForProductId) */
  planOf: (productId: string) => PaidPlan | null;
  /** Polar errors carry the request: only their name and status are passed. */
  onFailure?: (failure: { error: string; status?: number }) => void;
}

/** Never throws. */
export async function resolveCheckoutOutcome({
  checkoutId,
  userId,
  client,
  subscriptions,
  planOf,
  onFailure,
}: ResolveOutcomeOptions): Promise<CheckoutOutcome> {
  if (!userId) return { kind: "signed-out" };
  // A product this deployment doesn't list counts as Pro (lib/plans.ts).
  const active = (row: SubscriptionView): CheckoutOutcome => ({
    kind: "active",
    plan: planOf(row.productId) ?? "pro",
  });
  const current = subscriptions.find(entitled) ?? null;

  if (checkoutId) {
    const row = subscriptions.find((item) => item.checkoutId === checkoutId);
    if (row && entitled(row)) return active(row);
  }
  // Whatever the link says, a plan that's on is on.
  const otherwise = (outcome: CheckoutOutcome) =>
    current ? active(current) : outcome;
  if (!(checkoutId && client)) return otherwise({ kind: "unknown" });

  let checkout: Awaited<ReturnType<CheckoutClient["checkouts"]["get"]>>;
  try {
    checkout = await client.checkouts.get(checkoutId);
  } catch (error) {
    if (isNotFound(error)) return otherwise({ kind: "unknown" });
    onFailure?.({ error: nameOf(error), status: statusOf(error) });
    return otherwise({ kind: "unverified" });
  }

  const owner = await ownedBy(checkout, userId, subscriptions, client);
  if (owner === "unknown") {
    onFailure?.({ error: "customer lookup failed" });
    return otherwise({ kind: "unverified" });
  }
  if (!owner) return otherwise({ kind: "unknown" });
  switch (checkout.status) {
    case "succeeded":
    case "confirmed":
      return otherwise({ kind: "pending" });
    case "failed":
      return otherwise({ kind: "failed" });
    case "open":
    case "expired":
      return otherwise({ kind: "incomplete" });
    default:
      return otherwise({ kind: "unverified" });
  }
}

/**
 * Whether the checkout is the signed-in person's: by the external id on it,
 * else by its Polar customer (createCheckout passes the customer, whose
 * external id is the user id: actions/customer.ts). "unknown" when Polar
 * couldn't be asked.
 */
async function ownedBy(
  checkout: { customer_id: string | null; external_customer_id: string | null },
  userId: string,
  subscriptions: SubscriptionView[],
  client: CheckoutClient,
): Promise<boolean | "unknown"> {
  if (checkout.external_customer_id === userId) return true;
  const customerId = checkout.customer_id;
  if (!customerId) return false;
  if (subscriptions.some((row) => row.customerId === customerId)) return true;
  try {
    return (await client.customers.getExternal(userId)).id === customerId;
  } catch (error) {
    // No Polar customer for this person: the checkout can't be theirs.
    return isNotFound(error) ? false : "unknown";
  }
}

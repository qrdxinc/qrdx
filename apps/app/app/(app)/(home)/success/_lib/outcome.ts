// What /success says when Polar sends a buyer back with ?checkout_id=: the
// plan is "active" only once the subscription row the webhook writes says
// so; "processing" while it hasn't (Polar's checkout says the buyer paid or
// pressed Pay, or Polar can't be asked); and a plain answer for a checkout
// that wasn't finished, failed, ended or isn't this account's. No server-only
// imports, so every outcome is unit tested directly (the Polar client, the
// rows and the rate limit are passed in).

import type { PaidPlan } from "@/lib/pricing";

export type CheckoutOutcome =
  | { kind: "active"; plan: PaidPlan }
  /** Not active yet: the webhook's row will switch the plan on */
  | { kind: "processing" }
  /** This checkout's subscription exists but no longer grants the plan */
  | { kind: "ended" }
  | { kind: "incomplete" }
  | { kind: "failed" }
  /** No checkout of this account to speak of */
  | { kind: "unknown" }
  | { kind: "signed-out" }
  /** This app couldn't read the person's plan (its database, not Polar) */
  | { kind: "error" };

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

/**
 * A subscription Polar created while the first payment is still going
 * through: not ended, just not active yet.
 */
const STARTING = new Set(["incomplete"]);

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
  /**
   * Whether this visit may ask Polar (the per-person rate limit); false
   * leaves it to the webhook's row. Default: always.
   */
  allowLookup?: () => Promise<boolean>;
  /** Polar errors carry the request: only their name and status are passed. */
  onFailure?: (failure: { error: string; status?: number }) => void;
}

/** Never throws, except when `allowLookup` does. */
export async function resolveCheckoutOutcome({
  checkoutId,
  userId,
  client,
  subscriptions,
  planOf,
  allowLookup = async () => true,
  onFailure,
}: ResolveOutcomeOptions): Promise<CheckoutOutcome> {
  if (!userId) return { kind: "signed-out" };
  // A product this deployment doesn't list counts as Pro (lib/plans.ts).
  const active = (row: SubscriptionView): CheckoutOutcome => ({
    kind: "active",
    plan: planOf(row.productId) ?? "pro",
  });
  const current = subscriptions.find(entitled) ?? null;
  // Whatever the link says, a plan that's on is on.
  const otherwise = (outcome: CheckoutOutcome) =>
    current ? active(current) : outcome;

  if (checkoutId) {
    // The webhook has written this checkout's subscription: it's the answer.
    const row = subscriptions.find((item) => item.checkoutId === checkoutId);
    if (row) {
      if (entitled(row)) return active(row);
      return otherwise(
        STARTING.has(row.status) ? { kind: "processing" } : { kind: "ended" },
      );
    }
  }
  if (!(checkoutId && client)) return otherwise({ kind: "unknown" });
  if (!(await allowLookup())) return otherwise({ kind: "processing" });

  let checkout: Awaited<ReturnType<CheckoutClient["checkouts"]["get"]>>;
  try {
    checkout = await client.checkouts.get(checkoutId);
  } catch (error) {
    if (isNotFound(error)) return otherwise({ kind: "unknown" });
    // Any other answer (a token without checkouts:read, Polar down): the
    // webhook's row still switches the plan on, so say only that.
    onFailure?.({ error: nameOf(error), status: statusOf(error) });
    return otherwise({ kind: "processing" });
  }

  const owner = await ownedBy(checkout, userId, subscriptions, client);
  if (owner === "unknown") return otherwise({ kind: "processing" });
  if (!owner) return otherwise({ kind: "unknown" });
  switch (checkout.status) {
    // "succeeded": paid. "confirmed": the buyer pressed Pay; the payment
    // may still fail. Neither means the plan is on until the row says so.
    case "succeeded":
    case "confirmed":
      return otherwise({ kind: "processing" });
    case "failed":
      return otherwise({ kind: "failed" });
    case "open":
    case "expired":
      return otherwise({ kind: "incomplete" });
    default:
      return otherwise({ kind: "processing" });
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

/**
 * resolveCheckoutOutcome after reading the person's rows with `load`: a
 * failed read is this app's error ("error"), never put down to Polar.
 * Never throws.
 */
export async function resolveVisitOutcome({
  load,
  onLoadError,
  ...options
}: Omit<ResolveOutcomeOptions, "subscriptions"> & {
  load: (userId: string) => Promise<SubscriptionView[]>;
  onLoadError?: (error: unknown) => void;
}): Promise<CheckoutOutcome> {
  if (!options.userId) return { kind: "signed-out" };
  let subscriptions: SubscriptionView[];
  try {
    subscriptions = await load(options.userId);
  } catch (error) {
    onLoadError?.(error);
    return { kind: "error" };
  }
  try {
    return await resolveCheckoutOutcome({ ...options, subscriptions });
  } catch {
    // Only allowLookup can throw: without it, wait for the webhook's row.
    return resolveCheckoutOutcome({
      ...options,
      subscriptions,
      allowLookup: async () => false,
    });
  }
}

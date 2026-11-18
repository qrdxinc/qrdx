// What /success says after checkout (app/(app)/(home)/success/_lib/outcome.ts).
// The Polar client is a fake: nothing here reaches Polar or a database.
import { describe, expect, it, vi } from "vitest";
import {
  type CheckoutClient,
  checkoutIdFrom,
  resolveCheckoutOutcome,
  type SubscriptionView,
} from "@/app/(app)/(home)/success/_lib/outcome";
import type { PaidPlan } from "@/lib/pricing";

const USER = "user_1";
const CHECKOUT = "0b6c2f6e-6a3f-4d6e-9f3a-2c1b5e8d7a90";
const CUSTOMER = "cus_1";
const PRO_PRODUCT = "prod_pro";
const BUSINESS_PRODUCT = "prod_business";

const planOf = (productId: string): PaidPlan | null =>
  productId === PRO_PRODUCT
    ? "pro"
    : productId === BUSINESS_PRODUCT
      ? "business"
      : null;

/** An error shaped like the Polar SDK's. */
function polarError(name: string, statusCode: number) {
  return Object.assign(new Error(`${name}: Status ${statusCode}`), {
    name,
    statusCode,
  });
}

function client({
  status = "succeeded",
  customerId = CUSTOMER,
  externalId = null as string | null,
  get,
  getExternal,
}: {
  status?: string;
  customerId?: string | null;
  externalId?: string | null;
  get?: CheckoutClient["checkouts"]["get"];
  getExternal?: CheckoutClient["customers"]["getExternal"];
} = {}): CheckoutClient {
  return {
    checkouts: {
      get:
        get ??
        vi.fn(async () => ({
          status,
          customer_id: customerId,
          external_customer_id: externalId,
        })),
    },
    customers: {
      getExternal: getExternal ?? vi.fn(async () => ({ id: CUSTOMER })),
    },
  };
}

const row = (change: Partial<SubscriptionView> = {}): SubscriptionView => ({
  checkoutId: CHECKOUT,
  customerId: CUSTOMER,
  productId: PRO_PRODUCT,
  status: "active",
  ...change,
});

const resolve = (
  options: Partial<Parameters<typeof resolveCheckoutOutcome>[0]> = {},
) =>
  resolveCheckoutOutcome({
    checkoutId: CHECKOUT,
    userId: USER,
    client: client(),
    subscriptions: [],
    planOf,
    ...options,
  });

describe("checkoutIdFrom", () => {
  it("takes a Polar checkout id (a UUID) and nothing else", () => {
    expect(checkoutIdFrom(CHECKOUT)).toBe(CHECKOUT);
    expect(checkoutIdFrom([CHECKOUT, "x"])).toBe(CHECKOUT);
    expect(checkoutIdFrom("{CHECKOUT_ID}")).toBeNull();
    expect(checkoutIdFrom("../settings")).toBeNull();
    expect(checkoutIdFrom(undefined)).toBeNull();
  });
});

describe("resolveCheckoutOutcome", () => {
  it("asks a signed-out visitor to sign in", async () => {
    expect(await resolve({ userId: null })).toEqual({ kind: "signed-out" });
  });

  it("says active once the webhook's row for this checkout grants the plan", async () => {
    const polar = client();
    expect(await resolve({ client: polar, subscriptions: [row()] })).toEqual({
      kind: "active",
      plan: "pro",
    });
    expect(polar.checkouts.get).not.toHaveBeenCalled();
    expect(
      await resolve({
        subscriptions: [row({ productId: BUSINESS_PRODUCT })],
      }),
    ).toEqual({ kind: "active", plan: "business" });
  });

  it("counts a product this deployment doesn't list as Pro", async () => {
    expect(
      await resolve({ subscriptions: [row({ productId: "prod_old" })] }),
    ).toEqual({ kind: "active", plan: "pro" });
  });

  it("says pending while Polar has the payment and the row isn't in", async () => {
    expect(await resolve()).toEqual({ kind: "pending" });
    expect(await resolve({ client: client({ status: "confirmed" }) })).toEqual({
      kind: "pending",
    });
    // A row that doesn't grant the plan yet is still pending.
    expect(
      await resolve({ subscriptions: [row({ status: "incomplete" })] }),
    ).toEqual({ kind: "pending" });
  });

  it("never says active for a checkout that wasn't finished or failed", async () => {
    expect(await resolve({ client: client({ status: "open" }) })).toEqual({
      kind: "incomplete",
    });
    expect(await resolve({ client: client({ status: "expired" }) })).toEqual({
      kind: "incomplete",
    });
    expect(await resolve({ client: client({ status: "failed" }) })).toEqual({
      kind: "failed",
    });
  });

  it("doesn't speak about someone else's checkout", async () => {
    const polar = client({
      customerId: "cus_other",
      getExternal: vi.fn(async () => ({ id: CUSTOMER })),
    });
    expect(await resolve({ client: polar })).toEqual({ kind: "unknown" });
    // No Polar customer for this person at all.
    expect(
      await resolve({
        client: client({
          getExternal: vi.fn(async () => {
            throw polarError("ResourceNotFound", 404);
          }),
        }),
      }),
    ).toEqual({ kind: "unknown" });
  });

  it("recognises the person by external id or a customer they already have", async () => {
    const byExternal = client({
      customerId: null,
      externalId: USER,
      getExternal: vi.fn(async () => {
        throw new Error("not asked");
      }),
    });
    expect(await resolve({ client: byExternal })).toEqual({ kind: "pending" });

    const getExternal = vi.fn(async () => ({ id: "unused" }));
    expect(
      await resolve({
        client: client({ getExternal }),
        subscriptions: [row({ checkoutId: "older", status: "canceled" })],
      }),
    ).toEqual({ kind: "pending" });
    expect(getExternal).not.toHaveBeenCalled();
  });

  it("says unknown for a checkout Polar doesn't have, or no checkout id", async () => {
    const missing = client({
      get: vi.fn(async () => {
        throw polarError("ResourceNotFound", 404);
      }),
    });
    expect(await resolve({ client: missing })).toEqual({ kind: "unknown" });
    expect(await resolve({ checkoutId: null })).toEqual({ kind: "unknown" });
    expect(await resolve({ client: null })).toEqual({ kind: "unknown" });
  });

  it("says it couldn't check when Polar fails, and reports only name and status", async () => {
    const onFailure = vi.fn();
    const down = client({
      get: vi.fn(async () => {
        throw polarError("HTTPClientError", 503);
      }),
    });
    expect(await resolve({ client: down, onFailure })).toEqual({
      kind: "unverified",
    });
    expect(onFailure).toHaveBeenCalledWith({
      error: "HTTPClientError",
      status: 503,
    });

    const lookupDown = client({
      getExternal: vi.fn(async () => {
        throw polarError("HTTPClientError", 502);
      }),
    });
    expect(await resolve({ client: lookupDown })).toEqual({
      kind: "unverified",
    });
  });

  it("keeps saying active for a plan that's on, whatever the link", async () => {
    const current = row({ checkoutId: "another" });
    expect(
      await resolve({
        client: client({ status: "failed" }),
        subscriptions: [current],
      }),
    ).toEqual({ kind: "active", plan: "pro" });
    expect(
      await resolve({ checkoutId: null, subscriptions: [current] }),
    ).toEqual({ kind: "active", plan: "pro" });
  });
});

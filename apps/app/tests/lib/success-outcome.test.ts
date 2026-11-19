// What /success says after checkout (app/(app)/(home)/success/_lib/outcome.ts).
// The Polar client is a fake: nothing here reaches Polar or a database.
import { describe, expect, it, vi } from "vitest";
import {
  type CheckoutClient,
  checkoutIdFrom,
  resolveCheckoutOutcome,
  resolveVisitOutcome,
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

  it('says processing, never "received", until the row grants the plan', async () => {
    // "succeeded": paid; "confirmed": the buyer pressed Pay, the payment may
    // still fail. Both wait for the webhook's row.
    expect(await resolve()).toEqual({ kind: "processing" });
    expect(await resolve({ client: client({ status: "confirmed" }) })).toEqual({
      kind: "processing",
    });
    // A subscription whose first payment is still going through.
    expect(
      await resolve({ subscriptions: [row({ status: "incomplete" })] }),
    ).toEqual({ kind: "processing" });
  });

  it("says the plan ended when this checkout's row no longer grants it", async () => {
    const polar = client();
    for (const status of [
      "canceled",
      "unpaid",
      "past_due",
      "incomplete_expired",
    ]) {
      expect(
        await resolve({ client: polar, subscriptions: [row({ status })] }),
      ).toEqual({ kind: "ended" });
    }
    // The row is the answer: Polar isn't asked.
    expect(polar.checkouts.get).not.toHaveBeenCalled();
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
    expect(await resolve({ client: byExternal })).toEqual({
      kind: "processing",
    });

    const getExternal = vi.fn(async () => ({ id: "unused" }));
    expect(
      await resolve({
        client: client({ getExternal }),
        subscriptions: [row({ checkoutId: "older", status: "canceled" })],
      }),
    ).toEqual({ kind: "processing" });
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

  it.each([
    [
      "a token without checkouts:read (403)",
      polarError("HTTPClientError", 403),
    ],
    ["an expired token (401)", polarError("HTTPClientError", 401)],
    ["Polar down (503)", polarError("HTTPClientError", 503)],
    ["a network error", new TypeError("fetch failed")],
  ])('says processing, not "couldn\'t check", for %s', async (_, error) => {
    const onFailure = vi.fn();
    const failing = client({
      get: vi.fn(async () => {
        throw error;
      }),
    });
    expect(await resolve({ client: failing, onFailure })).toEqual({
      kind: "processing",
    });
    // Its name and status code only, never the request.
    expect(onFailure).toHaveBeenCalledWith({
      error: error.name,
      status: (error as { statusCode?: number }).statusCode,
    });
  });

  it("says processing when the customer lookup fails", async () => {
    const lookupDown = client({
      getExternal: vi.fn(async () => {
        throw polarError("HTTPClientError", 502);
      }),
    });
    expect(await resolve({ client: lookupDown })).toEqual({
      kind: "processing",
    });
  });

  it("doesn't ask Polar past the rate limit, and waits for the row", async () => {
    const polar = client();
    const allowLookup = vi.fn(async () => false);
    expect(await resolve({ client: polar, allowLookup })).toEqual({
      kind: "processing",
    });
    expect(polar.checkouts.get).not.toHaveBeenCalled();
    // The row still answers without a lookup.
    expect(
      await resolve({ client: polar, allowLookup, subscriptions: [row()] }),
    ).toEqual({ kind: "active", plan: "pro" });
    expect(allowLookup).toHaveBeenCalledTimes(1);
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

describe("resolveVisitOutcome", () => {
  const base = {
    checkoutId: CHECKOUT,
    userId: USER,
    client: client(),
    planOf,
  };

  it("puts a failed read of this app's rows down to this app, not Polar", async () => {
    const onLoadError = vi.fn();
    const polar = client();
    expect(
      await resolveVisitOutcome({
        ...base,
        client: polar,
        load: vi.fn(async () => {
          throw new Error("connection refused");
        }),
        onLoadError,
      }),
    ).toEqual({ kind: "error" });
    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(polar.checkouts.get).not.toHaveBeenCalled();
  });

  it("reads the rows, then decides as resolveCheckoutOutcome does", async () => {
    const load = vi.fn(async () => [row()]);
    expect(await resolveVisitOutcome({ ...base, load })).toEqual({
      kind: "active",
      plan: "pro",
    });
    expect(load).toHaveBeenCalledWith(USER);
  });

  it("asks a signed-out visitor to sign in without reading anything", async () => {
    const load = vi.fn(async () => []);
    expect(await resolveVisitOutcome({ ...base, userId: null, load })).toEqual({
      kind: "signed-out",
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("waits for the row when the rate limiter itself fails", async () => {
    const polar = client();
    expect(
      await resolveVisitOutcome({
        ...base,
        client: polar,
        load: async () => [],
        allowLookup: async () => {
          throw new Error("limiter down");
        },
      }),
    ).toEqual({ kind: "processing" });
    expect(polar.checkouts.get).not.toHaveBeenCalled();
  });
});

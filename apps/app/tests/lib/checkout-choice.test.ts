// In-app upgrade buttons (components/billing/checkout-buttons.tsx): what they
// offer to whom, priced in the currency checkout charges, and the
// `/pricing?interval=` links they and others use. Pure: no network, no Polar.
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID = "prod_pro_month";
  process.env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID = "prod_pro_year";
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID = "prod_biz_month";
  // Business yearly has no product here: its button is left out.
});

const { checkoutChoice } = await import("@/components/billing/checkout-choice");
const { parseBillingInterval } = await import("@/lib/pricing");

const base = {
  plan: "pro" as const,
  billing: true,
  signedIn: true,
  currentPlan: "free" as const,
  currency: "USD" as const,
};

describe("checkoutChoice", () => {
  it("offers a free account monthly and yearly checkout, in its currency", () => {
    expect(checkoutChoice(base)).toEqual({
      kind: "checkout",
      options: [
        { interval: "month", price: "$5" },
        { interval: "year", price: "$48" },
      ],
    });
    expect(checkoutChoice({ ...base, currency: "INR" })).toMatchObject({
      options: [
        { interval: "month", price: "₹199" },
        { interval: "year", price: "₹1,499" },
      ],
    });
    expect(checkoutChoice({ ...base, currency: "EUR" })).toMatchObject({
      options: [
        { interval: "month", price: "€5" },
        { interval: "year", price: "€48" },
      ],
    });
  });

  it("shows the buttons without prices while the plan and currency load", () => {
    expect(
      checkoutChoice({ ...base, currentPlan: null, currency: null }),
    ).toEqual({
      kind: "checkout",
      options: [
        { interval: "month", price: null },
        { interval: "year", price: null },
      ],
    });
  });

  it("leaves out a billing period checkout can't sell", () => {
    expect(checkoutChoice({ ...base, plan: "business" })).toEqual({
      kind: "checkout",
      options: [{ interval: "month", price: "$15" }],
    });
  });

  it("offers nothing without billing or a session: the caller's link stays", () => {
    expect(checkoutChoice({ ...base, billing: false })).toEqual({
      kind: "none",
    });
    expect(checkoutChoice({ ...base, signedIn: false })).toEqual({
      kind: "none",
    });
  });

  it("sends someone already paying to the billing portal, and nothing to the plan they have", () => {
    expect(
      checkoutChoice({ ...base, plan: "business", currentPlan: "pro" }),
    ).toEqual({ kind: "portal" });
    expect(checkoutChoice({ ...base, currentPlan: "pro" })).toEqual({
      kind: "none",
    });
    expect(checkoutChoice({ ...base, currentPlan: "business" })).toEqual({
      kind: "none",
    });
  });
});

describe("parseBillingInterval (/pricing?interval=)", () => {
  it("reads month and year, and their -ly forms", () => {
    expect(parseBillingInterval("month")).toBe("month");
    expect(parseBillingInterval("Monthly")).toBe("month");
    expect(parseBillingInterval("year")).toBe("year");
    expect(parseBillingInterval(["yearly", "month"])).toBe("year");
  });

  it("is null for anything else, so the page keeps yearly", () => {
    expect(parseBillingInterval(undefined)).toBeNull();
    expect(parseBillingInterval(null)).toBeNull();
    expect(parseBillingInterval("weekly")).toBeNull();
    expect(parseBillingInterval("")).toBeNull();
  });
});

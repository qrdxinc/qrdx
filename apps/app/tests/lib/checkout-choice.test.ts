// In-app upgrade buttons (components/billing/checkout-buttons.tsx): what they
// offer to whom, priced in the currency checkout charges, who may buy from a
// gate (the upgrade dialog's store and payerCanUpgrade), the words for a
// refused checkout, and the `/pricing?interval=` links. Pure: no network, no
// Polar.
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID = "prod_pro_month";
  process.env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID = "prod_pro_year";
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID = "prod_biz_month";
  // Business yearly has no product here: its button is left out.
});

const { checkoutChoice, checkoutErrorKey, payerCanUpgrade } = await import(
  "@/components/billing/checkout-choice"
);
const { useGetProDialogStore } = await import("@/store/get-pro-dialog-store");
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

describe("payerCanUpgrade (who may buy from a gate)", () => {
  const none = { gate: null, shell: null, server: null };

  it("a gate on the person's own plan (more workspaces, AI chat) is always theirs", () => {
    expect(payerCanUpgrade({ ...none, payer: "self" })).toBe("yes");
    expect(
      payerCanUpgrade({
        payer: "self",
        gate: false,
        shell: false,
        server: false,
      }),
    ).toBe("yes");
  });

  it("a workspace's gate: the gate's answer, then the app shell's, then the server's", () => {
    const workspace = { ...none, payer: "workspace" as const };
    expect(payerCanUpgrade({ ...workspace, gate: true, shell: false })).toBe(
      "yes",
    );
    expect(payerCanUpgrade({ ...workspace, gate: false, shell: true })).toBe(
      "no",
    );
    expect(payerCanUpgrade({ ...workspace, shell: true, server: false })).toBe(
      "yes",
    );
    // A member of a Free team: their own Pro wouldn't lift the team's plan.
    expect(payerCanUpgrade({ ...workspace, shell: false, server: true })).toBe(
      "no",
    );
    expect(payerCanUpgrade({ ...workspace, server: true })).toBe("yes");
    expect(payerCanUpgrade({ ...workspace, server: false })).toBe("no");
    // Nobody has answered: no checkout, the pricing page instead.
    expect(payerCanUpgrade(workspace)).toBe("unknown");
    expect(payerCanUpgrade({ ...workspace, server: undefined })).toBe(
      "unknown",
    );
  });
});

describe("the upgrade dialog's store", () => {
  it("openGetProDialog, passed straight to onClick, is a workspace gate with no answer of its own", () => {
    const store = useGetProDialogStore.getState();
    store.openUpgradeDialog("business", { payer: "self", canUpgrade: true });
    (store.openGetProDialog as (event: unknown) => void)({ type: "click" });
    expect(useGetProDialogStore.getState()).toMatchObject({
      isOpen: true,
      plan: "pro",
      payer: "workspace",
      canUpgrade: null,
    });
  });

  it("keeps a gate's payer and answer, and the shell's answer apart", () => {
    const store = useGetProDialogStore.getState();
    store.setShellCanUpgrade(false);
    store.openUpgradeDialog("pro", { payer: "self" });
    expect(useGetProDialogStore.getState()).toMatchObject({
      payer: "self",
      canUpgrade: null,
      shellCanUpgrade: false,
    });
    store.openUpgradeDialog("pro", { canUpgrade: true });
    expect(useGetProDialogStore.getState()).toMatchObject({
      payer: "workspace",
      canUpgrade: true,
    });
    store.setShellCanUpgrade(null);
    store.closeGetProDialog();
    expect(useGetProDialogStore.getState().isOpen).toBe(false);
  });
});

describe("checkoutErrorKey (the page's words for a refused checkout)", () => {
  it("maps the server's reasons, anything else to the generic one", () => {
    expect(checkoutErrorKey("subscribed")).toBe("subscribed");
    expect(checkoutErrorKey("unavailable")).toBe("unavailable");
    expect(checkoutErrorKey("rate_limited")).toBe("rateLimited");
    expect(checkoutErrorKey("failed")).toBe("failed");
    expect(checkoutErrorKey("invalid")).toBe("failed");
    expect(checkoutErrorKey(undefined)).toBe("failed");
  });
});

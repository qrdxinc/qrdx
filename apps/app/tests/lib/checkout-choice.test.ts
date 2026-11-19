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

const {
  checkoutChoice,
  checkoutErrorKey,
  freshUpgradeAnswer,
  payerCanUpgrade,
} = await import("@/components/billing/checkout-choice");
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
  it("a gate on the person's own plan (more workspaces, AI chat) is always theirs", () => {
    expect(
      payerCanUpgrade({ payer: "self", shell: null, server: "unknown" }),
    ).toBe("yes");
    expect(payerCanUpgrade({ payer: "self", shell: false, server: "no" })).toBe(
      "yes",
    );
  });

  it("a workspace's gate: the app shell's answer, else the server's fresh one", () => {
    const workspace = { payer: "workspace" as const };
    expect(payerCanUpgrade({ ...workspace, shell: true, server: "no" })).toBe(
      "yes",
    );
    // A member of a Free team: their own Pro wouldn't lift the team's plan.
    expect(payerCanUpgrade({ ...workspace, shell: false, server: "yes" })).toBe(
      "no",
    );
    for (const server of ["yes", "no", "waiting", "unknown"] as const) {
      expect(payerCanUpgrade({ ...workspace, shell: null, server })).toBe(
        server,
      );
    }
  });
});

describe("freshUpgradeAnswer (only an answer read since the gate opened counts)", () => {
  const OPENED = 1_000;
  const read = {
    since: OPENED,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    fetching: false,
    answer: true,
  };

  it("a cached yes from before the gate opened waits for the new read", () => {
    expect(freshUpgradeAnswer({ ...read, dataUpdatedAt: OPENED - 1 })).toBe(
      "waiting",
    );
    expect(
      freshUpgradeAnswer({
        ...read,
        dataUpdatedAt: OPENED + 5,
        fetching: true,
      }),
    ).toBe("waiting");
  });

  it("then says what the new read said", () => {
    expect(freshUpgradeAnswer({ ...read, dataUpdatedAt: OPENED + 5 })).toBe(
      "yes",
    );
    expect(
      freshUpgradeAnswer({ ...read, dataUpdatedAt: OPENED + 5, answer: false }),
    ).toBe("no");
    expect(
      freshUpgradeAnswer({ ...read, dataUpdatedAt: OPENED + 5, answer: null }),
    ).toBe("unknown");
  });

  it("is unknown when the new read failed, or nothing was asked", () => {
    expect(freshUpgradeAnswer({ ...read, errorUpdatedAt: OPENED + 5 })).toBe(
      "unknown",
    );
    expect(freshUpgradeAnswer({ ...read, since: null })).toBe("unknown");
  });
});

describe("the upgrade dialog's store", () => {
  it("openGetProDialog, passed straight to onClick, is a workspace gate", () => {
    const store = useGetProDialogStore.getState();
    store.openUpgradeDialog("business", { payer: "self" });
    (store.openGetProDialog as (event: unknown) => void)({ type: "click" });
    expect(useGetProDialogStore.getState()).toMatchObject({
      isOpen: true,
      plan: "pro",
      payer: "workspace",
    });
  });

  it("keeps the gate's payer and the shell's answer apart", () => {
    const store = useGetProDialogStore.getState();
    store.setShellCanUpgrade(false);
    store.openUpgradeDialog("pro", { payer: "self" });
    expect(useGetProDialogStore.getState()).toMatchObject({
      payer: "self",
      shellCanUpgrade: false,
    });
    store.openUpgradeDialog("pro");
    expect(useGetProDialogStore.getState().payer).toBe("workspace");
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

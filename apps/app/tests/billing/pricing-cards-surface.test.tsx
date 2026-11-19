// @vitest-environment jsdom
// The pricing cards record which button or page led to a checkout
// (lib/checkout-surface.ts): their own surface ("pricing_page", or what the
// page passes, such as the marketing site's "site_pricing"), or the one a
// link brought the visitor with (/pricing?from=limit_email), checked
// against the list. A signed-out visitor keeps it through sign-in.
// Checkout is faked; nothing is created.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID = "prod_pro_month";
  process.env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID = "prod_pro_year";
  return {
    session: null as null | { user: { id: string; email: string } },
    checkouts: [] as Record<string, unknown>[],
  };
});

vi.mock("@repo/auth/client", () => ({
  authClient: {
    useSession: () => ({ data: state.session, isPending: false }),
  },
}));
vi.mock("@/lib/widget-routes/client", () => ({
  startCheckout: async (input: Record<string, unknown>) => {
    state.checkouts.push(input);
    // Not a URL: the cards stay on the page (jsdom can't navigate).
    return { error: "Failed to create checkout", reason: "failed" };
  },
}));

const { PricingSection } = await import(
  "@/components/sections/pricing-section"
);
const { useAuthStore } = await import("@/store/auth-store");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  state.session = null;
  state.checkouts = [];
  useAuthStore.getState().closeAuthDialog();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState(null, "", "/");
});

/** The cards on `address`, then a click on "Upgrade to Pro". */
async function upgradeFrom(
  address: string,
  {
    surface,
    signedIn = true,
  }: { surface?: "site_pricing"; signedIn?: boolean } = {},
) {
  window.history.replaceState(null, "", address);
  if (signedIn)
    state.session = { user: { id: "u_ana", email: "ana@example.com" } };
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={en}>
          <PricingSection
            currency="USD"
            currentPlan={signedIn ? "free" : null}
            description="Plans"
            highlights={{ free: ["a"], pro: ["b"], business: ["c"] }}
            surface={surface}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Upgrade to Pro",
  );
  expect(button, "the Pro card's button").toBeDefined();
  await act(async () => {
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("the pricing cards' checkout surface", () => {
  it("their own: pricing_page, or the page's (the marketing site's site_pricing)", async () => {
    await upgradeFrom("/pricing");
    await upgradeFrom("/pricing", { surface: "site_pricing" });
    expect(state.checkouts.map((c) => c.surface)).toEqual([
      "pricing_page",
      "site_pricing",
    ]);
  });

  it("the link's, from ?from=, next to ?interval=", async () => {
    await upgradeFrom("/pricing?interval=month&from=limit_email");
    expect(state.checkouts).toEqual([
      { plan: "pro", interval: "month", surface: "limit_email" },
    ]);
  });

  it("a ?from= off the list is ignored: the page's own surface", async () => {
    await upgradeFrom("/pricing?from=%3Cscript%3E", {
      surface: "site_pricing",
    });
    expect(state.checkouts.map((c) => c.surface)).toEqual(["site_pricing"]);
  });

  it("signed out: sign-in first, keeping the surface for the checkout after it", async () => {
    await upgradeFrom("/pricing?from=home_card", { signedIn: false });
    expect(state.checkouts).toEqual([]);
    expect(useAuthStore.getState().postLoginAction).toMatchObject({
      type: "CHECKOUT",
      data: { plan: "pro", interval: "year", surface: "home_card" },
    });
  });
});

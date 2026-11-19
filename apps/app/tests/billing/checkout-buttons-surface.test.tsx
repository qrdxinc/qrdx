// @vitest-environment jsdom
// Each checkout button sends its own surface (lib/checkout-surface.ts):
// CheckoutButtons passes the one it's given to checkout and to the
// upgrade_clicked and checkout_started events, and keeps it when checkout
// sends a signed-out visitor to the pricing page first. Then a spot check
// that the main buttons and links name their own surface. Checkout is faked;
// nothing is created.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID = "prod_pro_month";
  process.env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID = "prod_pro_year";
  return {
    checkouts: [] as Record<string, unknown>[],
    answer: { url: "https://checkout.example/session" } as Record<
      string,
      unknown
    >,
    events: [] as [string, Record<string, unknown>][],
    visited: [] as string[],
  };
});

vi.mock("@repo/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "u_ana", email: "ana@example.com" } },
      isPending: false,
    }),
  },
}));
vi.mock("@/lib/hooks/use-subscription", () => ({
  useSubscription: () => ({
    subscriptionStatus: { plan: "free", currency: "USD" },
    isError: false,
  }),
}));
vi.mock("@/components/availability-provider", () => ({
  useAvailability: () => ({ has: () => true }),
}));
vi.mock("@/lib/widget-routes/client", () => ({
  startCheckout: async (input: Record<string, unknown>) => {
    state.checkouts.push(input);
    return state.answer;
  },
}));
vi.mock("@repo/analytics", () => ({
  track: (event: string, props: Record<string, unknown>) => {
    state.events.push([event, props]);
  },
}));
vi.mock("@repo/design-system", () => ({ toast: { error: () => {} } }));

const { CheckoutButtons } = await import(
  "@/components/billing/checkout-buttons"
);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const realLocation = window.location;

beforeEach(() => {
  state.checkouts = [];
  state.events = [];
  state.visited = [];
  state.answer = { url: "https://checkout.example/session" };
  // jsdom can't navigate: note where the buttons send the browser.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...realLocation,
      assign: (url: string) => {
        state.visited.push(url);
      },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
});

/** Renders the buttons and clicks the one for `interval`. */
async function clickButton(
  surface: "get_pro_dialog" | "limit_dialog",
  interval: "month" | "year",
) {
  act(() =>
    root.render(
      <NextIntlClientProvider locale="en" messages={en}>
        <CheckoutButtons source="test" surface={surface} />
      </NextIntlClientProvider>,
    ),
  );
  const label = interval === "month" ? /month/i : /year/i;
  const button = [...container.querySelectorAll("button")].find((b) =>
    label.test(b.textContent ?? ""),
  );
  expect(button, `the ${interval} button`).toBeDefined();
  await act(async () => {
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("CheckoutButtons", () => {
  it("sends its own surface to checkout and to both events", async () => {
    await clickButton("get_pro_dialog", "year");
    expect(state.checkouts).toEqual([
      { plan: "pro", interval: "year", surface: "get_pro_dialog" },
    ]);
    expect(state.events).toEqual([
      [
        "upgrade_clicked",
        { source: "test", plan: "pro", surface: "get_pro_dialog" },
      ],
      [
        "checkout_started",
        { plan: "pro", interval: "year", surface: "get_pro_dialog" },
      ],
    ]);
    expect(state.visited).toEqual(["https://checkout.example/session"]);
  });

  it("signed out at checkout: the pricing page, still from this button and on this period", async () => {
    state.answer = { error: "Sign in to upgrade.", reason: "sign_in" };
    await clickButton("limit_dialog", "month");
    expect(state.checkouts).toEqual([
      { plan: "pro", interval: "month", surface: "limit_dialog" },
    ]);
    expect(state.visited).toEqual([
      "/pricing?interval=month&from=limit_dialog",
    ]);
  });
});

describe("the main buttons and links name their own surface", () => {
  const APP = join(import.meta.dirname, "..", "..");
  const read = (file: string) => readFileSync(join(APP, file), "utf8");

  it.each([
    ["components/get-pro-dialog.tsx", 'surface="get_pro_dialog"'],
    ["components/get-pro-dialog.tsx", 'pricingHref("get_pro_dialog")'],
    ["components/limits/limit-dialog.tsx", 'surface="limit_dialog"'],
    ["components/limits/inline-limit.tsx", 'surface="inline_limit"'],
    [
      "app/(app)/settings/usage/_components/usage-meters.tsx",
      'surface="plan_usage"',
    ],
    [
      "app/(app)/dashboard/codes/_components/usage.tsx",
      'surface="codes_meter"',
    ],
    [
      "app/(app)/dashboard/pages/_components/page-list-controls.tsx",
      'surface="pages_meter"',
    ],
    ["components/sections/ai-art/ai-art-studio.tsx", 'surface="ai_art_studio"'],
    ["components/editor/art/ai-art-panel.tsx", 'surface="art_tab"'],
    ["components/get-pro-cta.tsx", 'pricingHref("header_get_pro")'],
    ["components/app-shell/upgrade-row.tsx", 'pricingHref("sidebar_upgrade")'],
    [
      "app/(app)/dashboard/_components/home/code-live-card.tsx",
      'pricingHref("home_card")',
    ],
    ["lib/limit-notices/notify.tsx", 'pricingHref("limit_email", "month")'],
    ["lib/email/first-scan.tsx", 'pricingHref("first_scan_email", "month")'],
    ["app/(app)/(home)/success/page.tsx", 'pricingHref("success_page")'],
  ])("%s: %s", (file, needle) => {
    expect(read(file)).toContain(needle);
  });

  it("the pricing cards default to pricing_page and pass ?from= on", () => {
    const cards = read("components/sections/pricing-section.tsx");
    expect(cards).toContain('surface: pageSurface = "pricing_page"');
    expect(cards).toContain("SURFACE_PARAM");
  });
});

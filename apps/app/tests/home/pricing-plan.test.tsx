// /pricing's plan cards and the visitor's own plan. This app's page reads
// the plan on the server and passes it in, so it shows at once and the
// browser asks for nothing (as before the marketing site existed). A page
// that can't read the session on the server (the marketing site's copy)
// leaves it out, and the cards read it in the browser: the session, then
// GET /api/subscription.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderIntl } from "../support/intl";

const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID = "prod_pro_month";
  process.env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID = "prod_pro_year";
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID = "prod_biz_month";
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID = "prod_biz_year";
  return {
    session: null as null | { user: { id: string; email: string } },
    /** What the cards passed useSubscription as `enabled`, per render */
    enabled: [] as boolean[],
  };
});

vi.mock("@repo/auth/client", () => ({
  authClient: {
    useSession: () => ({ data: state.session, isPending: false }),
  },
}));
vi.mock("@/lib/hooks/use-subscription", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/hooks/use-subscription")>();
  return {
    ...actual,
    useSubscription: (options?: { enabled?: boolean }) => {
      state.enabled.push(options?.enabled ?? true);
      return actual.useSubscription(options);
    },
  };
});

const { PricingSection } = await import(
  "@/components/sections/pricing-section"
);
const { SUBSCRIPTION_STATUS_QUERY_KEY } = await import(
  "@/lib/hooks/use-subscription"
);

beforeEach(() => {
  state.session = null;
  state.enabled = [];
});

const HIGHLIGHTS = { free: ["a"], pro: ["b"], business: ["c"] };

/** The cards' markup, with the browser's plan answer already in the cache (or not). */
function render(
  currentPlan: "free" | "pro" | "business" | null | undefined,
  fetchedPlan?: "free" | "pro" | "business",
) {
  const client = new QueryClient();
  if (fetchedPlan) {
    client.setQueryData([SUBSCRIPTION_STATUS_QUERY_KEY], {
      isSubscribed: fetchedPlan !== "free",
      requestsUsed: 0,
      requestsRemaining: 10,
      plan: fetchedPlan,
    });
  }
  return renderIntl(
    <QueryClientProvider client={client}>
      <PricingSection
        currency="USD"
        currentPlan={currentPlan}
        description="Plans"
        highlights={HIGHLIGHTS}
      />
    </QueryClientProvider>,
  );
}

const signIn = () => {
  state.session = { user: { id: "u_ana", email: "ana@example.com" } };
};

describe("the plan cards", () => {
  it("signed out, with or without a server plan: sign-up and upgrade buttons", () => {
    for (const html of [render(null), render(undefined)]) {
      expect(html).toContain("Start free");
      expect(html).toContain("Upgrade to Pro");
      expect(html).toContain("Upgrade to Business");
      expect(html).not.toContain("Manage subscription");
      expect(html).not.toContain("This is your current plan.");
    }
  });

  it("this app's page: the server's plan shows at once, and the browser asks for nothing", () => {
    signIn();
    const html = render("pro");
    expect(html).toContain("Manage subscription");
    expect(html).toContain("This is your current plan.");
    expect(html).toContain("Switch to Business");
    expect(html).toContain("Go to dashboard");
    expect(state.enabled).toEqual([false]);
  });

  it("a page without the server's plan: the browser's answer from /api/subscription", () => {
    signIn();
    const html = render(undefined, "business");
    expect(html).toContain("Manage subscription");
    expect(html).toContain("Switch to Pro");
    expect(html).not.toContain("Upgrade to Pro");
    expect(state.enabled).toEqual([true]);
  });

  it("with the server's plan, an answer already in the cache changes nothing", () => {
    signIn();
    const html = render("free", "pro");
    expect(html).toContain("This is your current plan.");
    expect(html).toContain("Upgrade to Pro");
    expect(html).not.toContain("Manage subscription");
  });

  it("signed in on Free: Free is marked current, the paid plans are upgrades", () => {
    signIn();
    for (const html of [render("free"), render(undefined, "free")]) {
      expect(html).toContain("This is your current plan.");
      expect(html).toContain("Upgrade to Pro");
      expect(html).toContain("Upgrade to Business");
    }
  });
});

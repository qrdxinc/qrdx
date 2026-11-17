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
    /** The session hasn't answered yet (Better Auth's isPending) */
    sessionPending: false,
    /** What the cards passed useSubscription as `enabled`, per render */
    enabled: [] as boolean[],
  };
});

vi.mock("@repo/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: state.session,
      isPending: state.sessionPending,
    }),
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
  state.sessionPending = false;
  state.enabled = [];
});

const HIGHLIGHTS = { free: ["a"], pro: ["b"], business: ["c"] };

/**
 * The cards' markup, with the browser's plan answer already in the cache,
 * or "failed": GET /api/subscription failed (after its retries).
 */
function render(
  currentPlan: "free" | "pro" | "business" | null | undefined,
  fetchedPlan?: "free" | "pro" | "business" | "failed",
) {
  // A failed query isn't fetched again on mount here, so the render shows
  // the state after the failure (React Query would retry it on a remount).
  const client = new QueryClient({
    defaultOptions: { queries: { retryOnMount: false } },
  });
  if (fetchedPlan === "failed") {
    client
      .getQueryCache()
      .build(client, { queryKey: [SUBSCRIPTION_STATUS_QUERY_KEY] })
      .setState({
        status: "error",
        error: new Error("Failed to fetch subscription status"),
        fetchStatus: "idle",
      });
  } else if (fetchedPlan) {
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

/** The button or link whose whole text is `text`: its opening tag, or null. */
function control(html: string, text: string) {
  const match = html.match(new RegExp(`<(button|a)\\b([^>]*)>${text}</\\1>`));
  if (!match) return null;
  const [, tag, attributes = ""] = match;
  return {
    link: tag === "a",
    href: attributes.match(/\shref="([^"]*)"/)?.[1] ?? null,
    disabled: /\sdisabled=""/.test(attributes),
  };
}

describe("the plan cards", () => {
  it("signed out, with or without a server plan: sign-up and upgrade buttons", () => {
    for (const html of [render(null), render(undefined)]) {
      expect(control(html, "Start free")).toMatchObject({
        link: true,
        href: expect.stringContaining("/sign-in?next="),
      });
      expect(control(html, "Upgrade to Pro")?.disabled).toBe(false);
      expect(control(html, "Upgrade to Business")?.disabled).toBe(false);
      expect(html).not.toContain("Manage subscription");
      expect(html).not.toContain("This is your current plan.");
    }
  });

  it("without the server's plan, while the session hasn't answered: every card waits", () => {
    state.sessionPending = true;
    const html = render(undefined);
    expect(control(html, "Upgrade to Pro")?.disabled).toBe(true);
    expect(control(html, "Upgrade to Business")?.disabled).toBe(true);
    // Neither a sign-up link nor the dashboard yet.
    expect(control(html, "Start free")).toEqual({
      link: false,
      href: null,
      disabled: true,
    });
    expect(html).not.toContain("/sign-in?next=");
    expect(html).not.toContain("Go to dashboard");
  });

  it("without the server's plan, signed in, until the plan's first answer: the buttons wait", () => {
    signIn();
    const html = render(undefined);
    expect(control(html, "Upgrade to Pro")?.disabled).toBe(true);
    expect(control(html, "Upgrade to Business")?.disabled).toBe(true);
    expect(control(html, "Start free")?.disabled).toBe(true);
  });

  it("without the server's plan, a failed plan request: signed in, no plan, buttons on", () => {
    signIn();
    const html = render(undefined, "failed");
    expect(control(html, "Upgrade to Pro")?.disabled).toBe(false);
    expect(control(html, "Upgrade to Business")?.disabled).toBe(false);
    expect(control(html, "Go to dashboard")).toMatchObject({
      link: true,
      href: "/dashboard",
    });
    expect(html).not.toContain("This is your current plan.");
    expect(html).not.toContain("Manage subscription");
  });

  it("this app's page isn't held up by a pending session (as before)", () => {
    state.sessionPending = true;
    const html = render(null);
    expect(control(html, "Upgrade to Pro")?.disabled).toBe(false);
    expect(control(html, "Start free")?.link).toBe(true);
    expect(state.enabled).toEqual([false]);
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

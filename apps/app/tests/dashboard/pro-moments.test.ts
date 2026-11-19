// Home's plan moments (app/(app)/dashboard/_components/home/pro-moments-rules.ts),
// the sidebar's Upgrade row and the page editor's Free/Pro line: when each
// shows, and that their numbers come from the plan limits. Pure; no
// database, no Polar.
import { describe, expect, it } from "vitest";
import { codeLiveCard } from "@/app/(app)/dashboard/_components/home/pro-moments-rules";
import { showsSidebarUpgrade } from "@/components/app-shell/upgrade-row";
import { pagePlanLine } from "@/lib/landing/plan-line";
import { PLAN_LIMITS, type PlanLimits } from "@/lib/plans";
import en from "@/messages/en.json";

const free = PLAN_LIMITS.free;
const pro = PLAN_LIMITS.pro;

describe("Your code is live", () => {
  const base = {
    plan: "free" as const,
    codesUsed: 1,
    canUpgrade: true,
    checkoutOpen: true,
    free,
    pro,
    available: { customDomains: true, email: true },
  };

  it("lists what Pro adds over Free, from the plan limits", () => {
    expect(codeLiveCard(base)).toEqual({
      features: [
        "customDomain",
        "customSlug",
        "scanEmails",
        "linkControls",
        "fullHistory",
      ],
      freeHistoryYears: Math.round(free.analyticsRetentionDays / 365),
    });
  });

  it.each([
    ["no code exists yet", { codesUsed: 0 }],
    ["the workspace is on Pro", { plan: "pro" as const }],
    ["the workspace is on Business", { plan: "business" as const }],
    ["the viewer can't change the plan", { canUpgrade: false }],
    ["checkout can't sell Pro", { checkoutOpen: false }],
  ])("is not shown when %s", (_, change) => {
    expect(codeLiveCard({ ...base, ...change })).toBeNull();
  });

  it("leaves out features this deployment can't offer", () => {
    const card = codeLiveCard({
      ...base,
      available: { customDomains: false, email: false },
    });
    expect(card?.features).toEqual([
      "customSlug",
      "linkControls",
      "fullHistory",
    ]);
  });

  it("describes Pro's scan emails: the first scan, three milestones, a weekly summary", () => {
    const card = en.app.dashboard.home.codeLiveCard.scanEmails;
    for (const argument of [
      "{first, number}",
      "{second, number}",
      "{third, number}",
    ]) {
      expect(card).toContain(argument);
    }
    expect(card).toMatch(/first scan/);
    expect(card).toMatch(/weekly summary/);
  });

  it("says Free's history limit is on viewing, not keeping, scans", () => {
    expect(en.app.dashboard.home.codeLiveCard.fullHistory).toMatch(
      /^Look back over every scan/,
    );
  });

  it("names only what Pro really adds (a server that gives Free the same)", () => {
    const generousFree: PlanLimits = {
      ...free,
      customDomains: pro.customDomains,
      customSlugs: true,
      emailAlerts: true,
      linkControls: true,
      analyticsRetentionDays: pro.analyticsRetentionDays,
    };
    expect(codeLiveCard({ ...base, free: generousFree })).toBeNull();
  });
});

describe("sidebar Upgrade row", () => {
  const open = { pro: true, business: true };

  it("shows on Free for people who can change the plan", () => {
    expect(
      showsSidebarUpgrade({
        plan: "free",
        canUpgrade: true,
        checkoutOpen: open,
      }),
    ).toBe(true);
  });

  it.each([
    ["on Pro", { plan: "pro" as const }],
    ["on Business", { plan: "business" as const }],
    ["for members who can't change the plan", { canUpgrade: false }],
    [
      "while checkout can't sell Pro",
      { checkoutOpen: { pro: false, business: true } },
    ],
  ])("is hidden %s", (_, change) => {
    expect(
      showsSidebarUpgrade({
        plan: "free",
        canUpgrade: true,
        checkoutOpen: open,
        ...change,
      }),
    ).toBe(false);
  });
});

describe("page editor Free/Pro line", () => {
  const canBuy = { canBuyPro: true };

  it("takes every number from the plan limits", () => {
    expect(pagePlanLine("free", { free, pro }, canBuy)).toEqual({
      freePages: free.landingPages,
      freeFileBytes: free.maxFileBytes,
      proFileBytes: pro.maxFileBytes,
    });
  });

  it("matches what the line says on this deployment", () => {
    // The sentence: Free shows the footer and caps pages; Pro removes both
    // and takes bigger files.
    expect(free.landingPageBadge).toBe(true);
    expect(pro.landingPageBadge).toBe(false);
    expect(Number.isFinite(free.landingPages)).toBe(true);
    expect(Number.isFinite(pro.landingPages)).toBe(false);
    expect(pro.maxFileBytes).toBeGreaterThan(free.maxFileBytes);
  });

  it("isn't shown on paid plans", () => {
    expect(pagePlanLine("pro", { free, pro }, canBuy)).toBeNull();
    expect(pagePlanLine("business", { free, pro }, canBuy)).toBeNull();
  });

  it("isn't shown to someone who can't buy Pro here", () => {
    // Checkout closed, or a member without billing.manage.
    expect(
      pagePlanLine("free", { free, pro }, { canBuyPro: false }),
    ).toBeNull();
  });

  it("isn't shown where Pro doesn't do what it says", () => {
    expect(
      pagePlanLine(
        "free",
        { free: { ...free, landingPageBadge: false }, pro },
        canBuy,
      ),
    ).toBeNull();
    expect(
      pagePlanLine("free", { free, pro: { ...pro, landingPages: 20 } }, canBuy),
    ).toBeNull();
    expect(
      pagePlanLine(
        "free",
        { free, pro: { ...pro, maxFileBytes: free.maxFileBytes } },
        canBuy,
      ),
    ).toBeNull();
  });
});

// What people see of invite rewards: the limit gate's invite line (only when
// the server says inviting would still earn codes, under the upgrade, never
// instead of it), the note for a visitor who came through an invite link
// (never naming who invited them), the inviter's email, the limit email's
// invite line, and limit copy that says which codes came from invites.
import { render } from "@react-email/render";
import { InviteRewardEmail } from "@repo/email/templates/invite-reward";
import { LimitNoticeEmail } from "@repo/email/templates/limit-notice";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderIntl } from "../support/intl";

// The editor's stores persist to window.localStorage, which Node doesn't have.
vi.hoisted(() => {
  const items = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      removeItem: (key: string) => items.delete(key),
      setItem: (key: string, value: string) => items.set(key, String(value)),
    },
  });
});
vi.mock("@/actions/qr-codes", () => ({
  createQrCode: vi.fn(),
  updateQrCode: vi.fn(),
}));
const routes = vi.hoisted(() => ({
  createDynamicCode: vi.fn(),
  updateDynamicCode: vi.fn(),
}));
vi.mock("@/lib/widget-routes/client", () => routes);
vi.mock("@/actions/qr-themes", () => ({ getThemes: vi.fn() }));

const { makeDynamic, DynamicLimitCard } = await import(
  "@/components/editor/dynamic-link-toggle"
);
const { InviteNoteLine } = await import("@/components/invites/invite-note");
const { LimitCard } = await import("@/components/limits/limit-card");
const { PlanLimitsProvider } = await import(
  "@/components/limits/plan-limits-provider"
);
const { limitCopy } = await import(
  "@/app/(app)/settings/usage/_lib/limit-copy"
);
const { withCodeBonus } = await import(
  "@/app/(app)/settings/usage/_lib/meters"
);
const { noticeCopy } = await import("@/lib/limit-notices/copy");
const { ENGLISH_EMAIL } = await import("@/lib/i18n/email");
const { PRODUCT_FACTS } = await import("@/lib/product-facts");
const { INVITE_BONUS_CODES, INVITE_MAX_REWARDED_FRIENDS } = await import(
  "@/lib/invites/terms"
);

const LIMIT_MESSAGE = "Your plan includes 10 active dynamic QR codes.";

describe("the limit gate in the editor", () => {
  it("passes the server's invite offer on with the limit", async () => {
    routes.createDynamicCode.mockResolvedValue({
      success: false,
      error: { code: "LIMIT_REACHED", message: LIMIT_MESSAGE, invite: true },
    });
    expect(
      await makeDynamic({
        destination: "https://example.com/menu",
        styles: {},
        userId: "u_alice",
        locale: "en",
      }),
    ).toEqual({ kind: "limit", message: LIMIT_MESSAGE, invite: true });
  });

  it("adds the invite line under the upgrade when offered", () => {
    const html = renderIntl(
      createElement(DynamicLimitCard, {
        message: LIMIT_MESSAGE,
        onUpgrade: () => {},
        invite: true,
      }),
    );
    expect(html).toContain("Upgrade to Pro");
    expect(html).toContain("invite a friend");
    expect(html).toContain('href="/settings/invite"');
    expect(html).toContain(`you both get ${INVITE_BONUS_CODES} more`);
    expect(html.indexOf("Upgrade to Pro")).toBeLessThan(
      html.indexOf("invite a friend"),
    );
  });

  it("has no invite line when the server didn't offer one", () => {
    const html = renderIntl(
      createElement(DynamicLimitCard, {
        message: LIMIT_MESSAGE,
        onUpgrade: () => {},
      }),
    );
    expect(html).toContain("Upgrade to Pro");
    expect(html).not.toContain("invite a friend");
  });
});

describe("the app's dynamic-code limit card", () => {
  const meter = {
    id: "dynamicCodes" as const,
    label: "Dynamic QR codes",
    used: 10,
    limit: 10,
    unit: "count" as const,
  };
  const copy = {
    level: "full" as const,
    value: "10 of 10",
    status: "Limit reached",
    reason: "Free includes 10 active dynamic codes.",
    upgrade: {
      label: "Upgrade to Pro",
      href: "/pricing",
      plan: "pro" as const,
    },
    blocked: true,
  };
  const card = (inviteOffer: boolean, id: "dynamicCodes" | "landingPages") =>
    renderIntl(
      <QueryClientProvider client={new QueryClient()}>
        <PlanLimitsProvider
          value={{
            plan: "free",
            canUpgrade: true,
            checkoutOpen: { pro: true, business: true },
            caps: {},
            isTeam: false,
            usageHref: "/dashboard/acme/settings/usage",
            inviteOffer,
          }}
        >
          <LimitCard
            copy={copy}
            meter={{ ...meter, id }}
            source="limit_dialog"
            surface="limit_dialog"
          />
        </PlanLimitsProvider>
      </QueryClientProvider>,
    );

  it("adds the invite line under the upgrade in the person's own workspace", () => {
    const html = card(true, "dynamicCodes");
    expect(html).toContain("Upgrade to Pro");
    expect(html).toContain('href="/settings/invite"');
    expect(html.indexOf("Upgrade to Pro")).toBeLessThan(
      html.indexOf("invite a friend"),
    );
  });

  it("leaves it out without the offer, and on other limits", () => {
    expect(card(false, "dynamicCodes")).not.toContain("invite a friend");
    expect(card(true, "landingPages")).not.toContain("invite a friend");
  });
});

describe("the note for a visitor who came through an invite link", () => {
  it("says what signing up gives, and never who invited them", () => {
    const html = renderIntl(
      createElement(InviteNoteLine, { onDismiss: () => {} }),
    );
    expect(html).toContain('role="note"');
    expect(html).toContain(`get ${INVITE_BONUS_CODES} extra dynamic codes`);
    expect(html).toContain("within 30 days");
    expect(html).toContain("Sign up");
    expect(html).toContain('aria-label="Dismiss"');
    expect(html).not.toMatch(/invited you|from [A-Z]/);
  });
});

describe("the inviter's email", () => {
  const props = {
    bonusCodes: INVITE_BONUS_CODES,
    maxFriends: INVITE_MAX_REWARDED_FRIENDS,
    inviteUrl: "https://qrdx.dev/settings/invite",
    unsubscribeUrl: "https://qrdx.dev/unsubscribe?token=t",
    intl: ENGLISH_EMAIL,
  };

  it("says both got more codes, how far along they are, and names nobody", async () => {
    const html = await render(
      createElement(InviteRewardEmail, { ...props, rewardedFriends: 3 }),
    );
    expect(html).toContain("You both got 5 more dynamic codes");
    expect(html).toContain("3 friends of the 10");
    expect(html).toContain("Invite more friends");
    expect(html).toContain('href="https://qrdx.dev/settings/invite"');
    expect(html).toContain("Unsubscribe");
  });

  it("says when it was the last friend the link can reward", async () => {
    const html = await render(
      createElement(InviteRewardEmail, { ...props, rewardedFriends: 10 }),
    );
    expect(html).toContain("the last of the 10 friends");
    expect(html).toContain("See your invites");
  });

  it("has a subject in the reader's words", () => {
    expect(
      ENGLISH_EMAIL.t("inviteReward.subject", { count: INVITE_BONUS_CODES }),
    ).toBe(
      "A friend you invited made their first code: you both got 5 more dynamic codes",
    );
  });
});

describe("the limit email's invite line", () => {
  const base = {
    intl: ENGLISH_EMAIL,
    level: "full" as const,
    limitLabel: "Dynamic QR codes",
    noun: "dynamic QR codes",
    planName: "Free",
    reason: "Free includes 10 active dynamic codes.",
    recipientReason: "You're an owner of Acme on QRdx.",
    upgrade: { planName: "Pro", url: "https://qrdx.dev/pricing" },
    usageUrl: "https://qrdx.dev/dashboard/acme/settings/usage",
    value: "10 of 10",
    workspaceName: "Acme",
  };

  it("sits beside the upgrade, never instead of it", async () => {
    const html = await render(
      createElement(LimitNoticeEmail, {
        ...base,
        invite: { url: "https://qrdx.dev/settings/invite", count: 5 },
      }),
    );
    expect(html).toContain("Upgrade to Pro");
    expect(html).toContain("invite a friend");
    expect(html).toContain('href="https://qrdx.dev/settings/invite"');
  });

  it("isn't there without the offer", async () => {
    const html = await render(createElement(LimitNoticeEmail, base));
    expect(html).not.toContain("invite a friend");
  });
});

describe("limit copy with codes from invites", () => {
  const cap = withCodeBonus(
    { dynamicCodes: { limit: 10, lift: { plan: "pro", limit: null } } },
    5,
  ).dynamicCodes;

  it("adds the bonus to a capped meter, and nothing to an unlimited one", () => {
    expect(cap).toEqual({
      limit: 15,
      bonus: 5,
      lift: { plan: "pro", limit: null },
    });
    const unlimited = { dynamicCodes: { limit: null, lift: null } };
    expect(withCodeBonus(unlimited, 5)).toBe(unlimited);
    const capped = { dynamicCodes: { limit: 10, lift: null } };
    expect(withCodeBonus(capped, 0)).toBe(capped);
  });

  it("says which codes came from invites, the same in the app and the email", () => {
    const context = {
      plan: "free" as const,
      canUpgrade: true,
      checkoutOpen: { pro: true, business: true },
      cap,
    };
    const app = limitCopy(
      {
        id: "dynamicCodes",
        label: "Dynamic QR codes",
        used: 15,
        limit: 15,
        unit: "count",
      },
      context,
    );
    const email = noticeCopy({
      limitId: "dynamicCodes",
      used: 15,
      limit: 15,
      ...context,
    });
    expect(app?.reason).toContain(
      "Free includes 10 active dynamic codes and invites added 5.",
    );
    expect(email.reason).toBe(app?.reason);
    expect(email.value).toBe("15 of 15");
  });
});

describe("product facts for the legal and help pages", () => {
  it("come from the invite terms", () => {
    expect(PRODUCT_FACTS).toMatchObject({
      inviteBonusCodes: 5,
      inviteMaxFriends: 10,
      inviteMaxCodes: 50,
      inviteQualifyDays: 30,
    });
  });
});

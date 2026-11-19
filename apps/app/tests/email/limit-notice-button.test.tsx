// The limit notice's button (lib/limit-notices/copy.ts, the template): owners
// who can buy the plan that lifts the cap get "Upgrade to <plan>" to
// /pricing?interval=month; a member who can't change the plan, or a cap
// nothing lifts, keeps "See plan and usage".
import { render } from "@react-email/render";
import { LimitNoticeEmail } from "@repo/email/templates/limit-notice";
import { describe, expect, it } from "vitest";
import { ENGLISH_EMAIL } from "@/lib/i18n/email";
import { noticeCopy } from "@/lib/limit-notices/copy";

const usage = (canUpgrade: boolean, lift: "pro" | null = "pro", used = 10) => ({
  limitId: "dynamicCodes" as const,
  used,
  limit: 10,
  plan: "free" as const,
  canUpgrade,
  checkoutOpen: { pro: true, business: true },
  cap: {
    limit: 10,
    lift: lift ? { plan: lift, limit: null, shared: false } : null,
  },
});

async function button(
  canUpgrade: boolean,
  lift: "pro" | null = "pro",
  used = 10,
) {
  const copy = noticeCopy(
    usage(canUpgrade, lift, used) as never,
    ENGLISH_EMAIL,
  );
  const html = await render(
    <LimitNoticeEmail
      intl={ENGLISH_EMAIL}
      level="full"
      limitLabel={copy.label}
      noun={copy.noun}
      planName={copy.planName}
      reason={copy.reason}
      recipientReason="You're an owner of Acme on QRdx."
      upgrade={
        copy.upgradePlan
          ? {
              planName: copy.upgradePlan,
              url: "https://qrdx.dev/pricing?interval=month",
            }
          : undefined
      }
      usageUrl="https://qrdx.dev/dashboard/acme/settings/usage"
      value={copy.value}
      workspaceName="Acme"
    />,
  );
  return { copy, html };
}

describe("the limit notice's button", () => {
  it("is Upgrade to Pro, to monthly pricing, for someone who can upgrade", async () => {
    const { copy, html } = await button(true);
    expect(copy.upgradePlan).toBe("Pro");
    expect(html).toContain("Upgrade to Pro");
    expect(html).toContain('href="https://qrdx.dev/pricing?interval=month"');
    expect(html).not.toContain("See plan and usage");
  });

  it("stays See plan and usage for a member who can't, when nothing lifts the cap, or before the cap", async () => {
    for (const [canUpgrade, lift, used] of [
      [false, "pro", 10],
      [true, null, 10],
      // Near the cap the words don't offer an upgrade, so neither does the button.
      [true, "pro", 8],
    ] as const) {
      const { copy, html } = await button(canUpgrade, lift, used);
      expect(copy.upgradePlan).toBeNull();
      expect(html).toContain("See plan and usage");
      expect(html).toContain("/settings/usage");
      expect(html).not.toContain("Upgrade to Pro</a>");
    }
  });
});

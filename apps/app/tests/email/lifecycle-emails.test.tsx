// The lifecycle emails (owner decisions, 25 Nov 2026): the note to accounts
// two days old with no dynamic code (lib/email/activation-nudge.tsx), Free's
// one 100-scan email (lib/email/free-scan-milestone.tsx), the failed-payment
// email (lib/email/payment-failed.tsx) and the note after a first payment
// (lib/email/new-customer.tsx); the invite line under the upgrade line
// (lib/email/invite-line.ts); and the first_real_scan event
// (lib/email/first-scan.tsx). Each goes from the personal sender with the
// team notes opt-out, once. Tables in memory, sendEmail and trackServer
// captured: nothing is sent or stored.
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  env: {
    EMAIL_FROM: "QRdx <hello@qrdx.dev>",
    EMAIL_FROM_PERSONAL: "Ritesh from QRdx <support@qrdx.dev>",
  } as Record<string, string | undefined>,
  features: {
    teamNotes: true,
    inviteRewards: true,
    customDomains: true,
  } as Record<string, boolean>,
  plan: "free" as "free" | "pro" | "business",
  serverEvents: true,
  tracked: [] as {
    event: string;
    props: Record<string, unknown>;
    options: Record<string, unknown>;
  }[],
  sendResult: { sent: true, id: "em_1" } as
    | { sent: true; id: string }
    | { sent: false; reason: "failed"; error: string; code?: string },
  sent: [] as {
    to: string;
    from?: string;
    replyTo?: string;
    subject: string;
    react: ReactElement;
    unsubscribeUrl?: string;
    idempotencyKey?: string;
    tags?: { name: string; value: string }[];
  }[],
}));

vi.mock("@/env", async (importOriginal) => {
  const { env } = await importOriginal<typeof import("@/env")>();
  return {
    env: new Proxy(env, {
      get: (target, key) =>
        typeof key === "string" && Object.hasOwn(state.env, key)
          ? state.env[key]
          : Reflect.get(target, key),
    }),
  };
});
vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/feature-availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/feature-availability")>()),
  isFeatureAvailable: (id: string) => state.features[id] === true,
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
  planForSubscriptionProduct: (id: string) =>
    id.includes("business") ? "business" : "pro",
}));
vi.mock("@/lib/workspaces", () => ({ workspaceSlug: async () => "acme" }));
vi.mock("@/lib/analytics/server", () => ({
  serverEventsEnabled: () => state.serverEvents,
  trackServer: (
    event: string,
    props: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => {
    state.tracked.push({ event, props, options });
  },
}));
vi.mock("@/lib/email/send", () => ({
  isEmailConfigured: true,
  sendEmail: vi.fn(async (options: (typeof state.sent)[number]) => {
    state.sent.push(options);
    return state.sendResult;
  }),
}));

const { baseUrl } = await import("@repo/email/origin");
const { FirstScanEmail } = await import("@repo/email/templates/first-scan");
const { ScanMilestoneEmail } = await import(
  "@repo/email/templates/scan-milestone"
);
const { sendActivationNudges } = await import("@/lib/email/activation-nudge");
const { sendFreeScanMilestoneEmail } = await import(
  "@/lib/email/free-scan-milestone"
);
const { sendPaymentFailedEmail } = await import("@/lib/email/payment-failed");
const { newCustomerSteps, sendNewCustomerEmail } = await import(
  "@/lib/email/new-customer"
);
const { freeInvite, paidInvite } = await import("@/lib/email/invite-line");
const { trackFirstRealScan } = await import("@/lib/email/first-scan");
const { sendWelcomeEmail } = await import("@/lib/email/welcome");
const { verifyTeamNotesToken } = await import("@/lib/events/unsubscribe");
const { ENGLISH_EMAIL } = await import("@/lib/i18n/email");

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-26T04:00:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);

const person = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: "Sam Lee",
  email: `${id}@mail.example.org.uk`,
  banned: false,
  banExpires: null,
  locale: null,
  teamNotes: true,
  createdAt: ago(50),
  ...extra,
});

async function rendered(index = 0) {
  const email = state.sent[index];
  if (!email) throw new Error("No email was sent");
  const [html, text] = await Promise.all([
    render(email.react),
    render(email.react, { plainText: true }),
  ]);
  return { email, html, text };
}

const hrefs = (html: string) =>
  [...html.matchAll(/href="([^"]*)"/g)].map((m) =>
    (m[1] ?? "").replaceAll("&amp;", "&"),
  );

const absolute = (path: string) => new URL(path, baseUrl).toString();

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("lifecycleEmail", "kind", "subject");
  state.sent.length = 0;
  state.tracked.length = 0;
  state.sendResult = { sent: true, id: "em_1" };
  state.env.EMAIL_FROM = "QRdx <hello@qrdx.dev>";
  state.env.EMAIL_FROM_PERSONAL = "Ritesh from QRdx <support@qrdx.dev>";
  state.features = { teamNotes: true, inviteRewards: true, customDomains: true };
  state.plan = "free";
  state.serverEvents = true;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  fakeDb.seed("portalClient", []);
  fakeDb.seed("invite", []);
});

describe("sendActivationNudges (48 hours, no dynamic code)", () => {
  beforeEach(() => {
    fakeDb.seed("user", [
      person("u_due"),
      person("u_young", { createdAt: ago(47) }),
      person("u_old", { createdAt: ago(73) }),
      person("u_coded"),
      person("u_team"),
      person("u_off", { teamNotes: false }),
      person("u_banned", { banned: true }),
      person("u_test", { email: "e2e@qrdx.test" }),
      person("u_portal"),
    ]);
    fakeDb.seed("member", [
      { id: "m_1", organizationId: "org_team", userId: "u_team" },
      { id: "m_2", organizationId: "org_team", userId: "u_owner" },
      { id: "m_3", organizationId: "org_coded", userId: "u_coded" },
    ]);
    fakeDb.seed("qrCode", [
      // Made by the person, in their own workspace
      { id: "c_1", userId: "u_coded", organizationId: "org_coded" },
      // In a workspace the person joined, made by someone else
      { id: "c_2", userId: "u_owner", organizationId: "org_team" },
    ]);
    fakeDb.seed("portalClient", [
      {
        id: "pc_1",
        organizationId: "org_agency",
        email: "u_portal@mail.example.org.uk",
      },
    ]);
  });

  it("emails an account 48 to 72 hours old with no code, once, from the personal sender", async () => {
    const summary = await sendActivationNudges({ now: NOW });
    expect(summary).toEqual({ sent: 1, skipped: 3, failed: 0, left: 0 });
    expect(state.sent).toHaveLength(1);
    const { email, html, text } = await rendered();
    expect(email).toMatchObject({
      to: "u_due@mail.example.org.uk",
      from: "Ritesh from QRdx <support@qrdx.dev>",
      replyTo: "support@qrdx.dev",
      subject: "Your first dynamic code",
      idempotencyKey: "activation-nudge:u_due",
      tags: [{ name: "kind", value: "activation-nudge" }],
    });
    const token = new URL(email.unsubscribeUrl ?? "").searchParams.get("token");
    expect(verifyTeamNotesToken(token ?? "")).toBe("u_due");
    for (const line of [
      "Hi Sam,",
      "A dynamic code is a QR code you can print now and point somewhere else later, without reprinting, and it counts its scans.",
      "Make a dynamic code",
      "If something got in the way, reply to this email. A person reads every reply.",
      "Ritesh from QRdx",
      "You're getting this because you made a QRdx account a couple of days ago and haven't made a dynamic code yet. QRdx sends this once.",
      "Unsubscribe",
    ]) {
      expect(text, line).toContain(line);
    }
    expect(hrefs(html)).toContain(absolute("/playground"));

    // A later run sends nothing more: each account is decided once.
    expect(
      await sendActivationNudges({ now: new Date(NOW.getTime() + 60_000) }),
    ).toMatchObject({ sent: 0, skipped: 0 });
    expect(state.sent).toHaveLength(1);
  });

  it("stops once the account has a code", async () => {
    fakeDb.seed("qrCode", [
      { id: "c_3", userId: "u_due", organizationId: "org_due" },
    ]);
    expect(await sendActivationNudges({ now: NOW })).toMatchObject({ sent: 0 });
    expect(state.sent).toHaveLength(0);
  });

  it("tries again on the next run when the send fails", async () => {
    state.sendResult = { sent: false, reason: "failed", error: "down" };
    expect(await sendActivationNudges({ now: NOW })).toMatchObject({
      sent: 0,
      failed: 1,
    });
    expect(fakeDb.find("lifecycleEmail", { subject: "u_due" })).toBeUndefined();
    state.sendResult = { sent: true, id: "em_2" };
    expect(await sendActivationNudges({ now: NOW })).toMatchObject({ sent: 1 });
  });

  it("leaves accounts for the next run when out of time", async () => {
    expect(
      await sendActivationNudges({ now: NOW, deadline: Date.now() - 1 }),
    ).toMatchObject({ sent: 0, left: 4 });
    expect(state.sent).toHaveLength(0);
  });

  it("sends nothing until the lifecycle_email table exists", async () => {
    fakeDb.missing("lifecycleEmail");
    expect(await sendActivationNudges({ now: NOW })).toMatchObject({
      off: "unavailable",
      sent: 0,
    });
    expect(state.sent).toHaveLength(0);
  });

  it("sends nothing where notes from the team don't exist, or without a personal sender", async () => {
    state.features.teamNotes = false;
    expect(await sendActivationNudges({ now: NOW })).toMatchObject({
      off: "off",
    });
    state.features.teamNotes = true;
    state.env.EMAIL_FROM_PERSONAL = undefined;
    expect(await sendActivationNudges({ now: NOW })).toMatchObject({
      off: "no_personal_sender",
    });
    expect(state.sent).toHaveLength(0);
  });
});

describe("sendFreeScanMilestoneEmail (Free, 100 scans, once per account)", () => {
  const code = (extra: Record<string, unknown> = {}) => ({
    id: "c_menu",
    userId: "u_maker",
    organizationId: "org_acme",
    slug: "aB3dE5f",
    title: "Spring menu",
    scanCount: 100,
    createdAt: new Date("2026-11-10T10:00:00Z"),
    ...extra,
  });
  const scan = {
    id: "s_100",
    scannedAt: NOW,
    country: "DE",
    region: null,
    city: "Berlin",
    deviceType: "mobile",
    os: "iOS",
    browser: "Safari",
    referer: null,
  };

  beforeEach(() => {
    fakeDb.seed("user", [person("u_maker")]);
  });

  it("emails the maker when a Free code reaches 100 scans, with one line on Pro and the invite", async () => {
    expect(await sendFreeScanMilestoneEmail(scan, code())).toBe("sent");
    const { email, html, text } = await rendered();
    expect(email).toMatchObject({
      to: "u_maker@mail.example.org.uk",
      from: "Ritesh from QRdx <support@qrdx.dev>",
      replyTo: "support@qrdx.dev",
      subject: "“Spring menu” reached 100 scans",
      idempotencyKey: "free-scan-milestone:u_maker",
      tags: [{ name: "kind", value: "free-scan-milestone" }],
    });
    for (const line of [
      "Your dynamic QR code just passed 100 scans.",
      "also emails you at 500 and 1,000 scans and beyond, and can send you a weekly summary.",
      "Know someone who prints QR codes? Invite them",
      ": when they make their first dynamic code, you both get 5 more.",
      "You're getting this because a code you made reached 100 scans. QRdx sends this once.",
    ]) {
      expect(text, line).toContain(line);
    }
    // The Pro line comes before the invite line, never after it.
    expect(text.indexOf("also emails you at")).toBeLessThan(
      text.indexOf("Know someone"),
    );
    const links = hrefs(html);
    expect(links).toContain(
      absolute("/pricing?interval=month&from=scan_milestone_email"),
    );
    expect(links).toContain(absolute("/settings/invite"));
    expect(links).toContain(absolute("/dashboard/acme/codes/c_menu"));
  });

  it("goes once per account: another code at 100 sends nothing", async () => {
    await sendFreeScanMilestoneEmail(scan, code());
    expect(
      await sendFreeScanMilestoneEmail(scan, code({ id: "c_other" })),
    ).toBe("already");
    expect(state.sent).toHaveLength(1);
  });

  it("only at exactly 100: a code already past it never asks", async () => {
    for (const scanCount of [1, 99, 101, 500]) {
      expect(
        await sendFreeScanMilestoneEmail(scan, code({ scanCount })),
      ).toBe("not_milestone");
    }
    expect(state.sent).toHaveLength(0);
  });

  it("never on a plan with email alerts, nor for imported codes or people who opted out", async () => {
    expect(
      await sendFreeScanMilestoneEmail(scan, code(), { emailAlerts: true }),
    ).toBe("paid_plan");
    state.plan = "pro";
    expect(await sendFreeScanMilestoneEmail(scan, code())).toBe("paid_plan");
    state.plan = "free";
    expect(
      await sendFreeScanMilestoneEmail(scan, code({ createdVia: "migrate" })),
    ).toBe("imported");
    Object.assign(fakeDb.find("user", { id: "u_maker" }) ?? {}, {
      teamNotes: false,
    });
    expect(await sendFreeScanMilestoneEmail(scan, code())).toBe("opted_out");
    expect(state.sent).toHaveLength(0);
  });

  it("gives the claim back when the send fails, for the next code", async () => {
    state.sendResult = { sent: false, reason: "failed", error: "down" };
    expect(await sendFreeScanMilestoneEmail(scan, code())).toBe("failed");
    state.sendResult = { sent: true, id: "em_2" };
    expect(
      await sendFreeScanMilestoneEmail(scan, code({ id: "c_next" })),
    ).toBe("sent");
  });
});

describe("sendPaymentFailedEmail", () => {
  const failed = {
    subscriptionId: "sub_1",
    userId: "u_payer",
    productId: "prod_pro_month",
    pastDueSince: new Date("2026-11-25T10:00:00Z"),
  };

  beforeEach(() => {
    fakeDb.seed("user", [person("u_payer"), person("u_off", { teamNotes: false })]);
  });

  it("says the codes keep working, until when the plan stays on, and links to the billing portal", async () => {
    expect(await sendPaymentFailedEmail(failed)).toBe("sent");
    const { email, html, text } = await rendered();
    expect(email).toMatchObject({
      to: "u_payer@mail.example.org.uk",
      from: "Ritesh from QRdx <support@qrdx.dev>",
      replyTo: "support@qrdx.dev",
      subject: "Your last QRdx payment didn't go through",
      idempotencyKey: `payment-failed:sub_1:${failed.pastDueSince.getTime()}`,
      tags: [{ name: "kind", value: "payment-failed" }],
    });
    for (const line of [
      "Your last payment for Pro didn't go through. Your codes keep working. Update your card to keep Pro.",
      "Pro features stay on until December 2, 2026.",
      "Your dynamic codes keep working either way.",
      "Update your card",
      "You're getting this because a payment for your QRdx Pro plan didn't go through.",
    ]) {
      expect(text, line).toContain(line);
    }
    expect(hrefs(html)).toContain(absolute("/settings/portal"));
  });

  it("names Business for a Business subscription", async () => {
    await sendPaymentFailedEmail({ ...failed, productId: "prod_business" });
    const { text } = await rendered();
    expect(text).toContain("Update your card to keep Business.");
  });

  it("skips people who turned notes off, and sends nothing where notes don't exist", async () => {
    expect(
      await sendPaymentFailedEmail({ ...failed, userId: "u_off" }),
    ).toBe("opted_out");
    state.features.teamNotes = false;
    expect(await sendPaymentFailedEmail(failed)).toBe("off");
    expect(state.sent).toHaveLength(0);
  });
});

describe("sendNewCustomerEmail", () => {
  const started = new Date(NOW.getTime() - HOUR);
  const first = {
    subscriptionId: "sub_new",
    userId: "u_buyer",
    productId: "prod_pro_year",
    startedAt: started,
    now: NOW,
  };

  beforeEach(() => {
    fakeDb.seed("user", [person("u_buyer")]);
    fakeDb.seed("subscription", [
      { id: "sub_new", userId: "u_buyer", status: "active" },
    ]);
  });

  it("thanks a new Pro customer with three things to set up, the money-back guarantee and a reply line", async () => {
    expect(await sendNewCustomerEmail(first)).toBe("sent");
    const { email, html, text } = await rendered();
    expect(email).toMatchObject({
      to: "u_buyer@mail.example.org.uk",
      from: "Ritesh from QRdx <support@qrdx.dev>",
      replyTo: "support@qrdx.dev",
      subject: "Welcome to QRdx Pro",
      idempotencyKey: "new-customer:sub_new",
      tags: [{ name: "kind", value: "new-customer" }],
    });
    for (const line of [
      "Thanks for choosing Pro. It's on now.",
      "A few things to set up first:",
      "Connect your own domain",
      "Your plan includes 5 custom domains.",
      "Give a code a back-half you choose",
      "Scan alerts are on",
      "If Pro isn't right for you, reply within 30 days of your payment and we'll refund it in full. You don't need to give a reason.",
      "A person reads every reply.",
      "You're getting this because you just started a QRdx Pro plan.",
    ]) {
      expect(text, line).toContain(line);
    }
    const links = hrefs(html);
    expect(links).toContain(absolute("/dashboard?to=settings/domains"));
    expect(links).toContain(absolute("/dashboard?to=codes"));
    expect(links).toContain(absolute("/settings/notifications"));
    // Once per subscription.
    expect(await sendNewCustomerEmail(first)).toBe("already");
    expect(state.sent).toHaveLength(1);
  });

  it("only for a subscription that just started and is the account's first", async () => {
    expect(
      await sendNewCustomerEmail({
        ...first,
        startedAt: new Date(NOW.getTime() - 4 * 24 * HOUR),
      }),
    ).toBe("not_new");
    fakeDb.seed("subscription", [
      { id: "sub_old", userId: "u_buyer", status: "canceled" },
    ]);
    expect(await sendNewCustomerEmail(first)).toBe("returning");
    expect(state.sent).toHaveLength(0);
  });

  it("lists only what the plan has and the deployment offers", () => {
    expect(newCustomerSteps("pro").map((step) => step.kind)).toEqual([
      "domain",
      "backHalf",
      "alerts",
    ]);
    expect(newCustomerSteps("business")).toMatchObject([
      { kind: "team", count: null },
      { kind: "domain", count: 25 },
      { kind: "alerts" },
    ]);
    state.features.customDomains = false;
    expect(newCustomerSteps("pro")).toMatchObject([
      { kind: "backHalf" },
      { kind: "alerts" },
      { kind: "team", count: 3 },
    ]);
    expect(newCustomerSteps("free")).toEqual([]);
  });
});

describe("the invite line", () => {
  it("offers both sides to a Free reader whose link can still earn, the friend's side otherwise", async () => {
    expect(await freeInvite("u_new")).toEqual({
      url: absolute("/settings/invite"),
      count: 5,
      both: true,
    });
    fakeDb.seed(
      "invite",
      Array.from({ length: 10 }, (_, index) => ({
        id: `inv_${index}`,
        inviterUserId: "u_full",
        inviterRewardSlot: index + 1,
      })),
    );
    expect(await freeInvite("u_full")).toMatchObject({ both: false });
    expect(paidInvite()).toMatchObject({ both: false, count: 5 });
    state.features.inviteRewards = false;
    expect(await freeInvite("u_new")).toBeUndefined();
    expect(paidInvite()).toBeUndefined();
  });

  it("sits under the welcome email's Pro line", async () => {
    fakeDb.seed("user", [person("u_new")]);
    await sendWelcomeEmail({ userId: "u_new", country: "US" });
    const { text } = await rendered();
    expect(text).toContain("Know someone who prints QR codes? Invite them");
    expect(text).toContain(
      ": when they make their first dynamic code, you both get 5 more.",
    );
    expect(text.indexOf("Pro is $5 a month")).toBeLessThan(
      text.indexOf("Know someone"),
    );
    // Above the reply line and the signature.
    expect(text.indexOf("Know someone")).toBeLessThan(
      text.indexOf("reply to this email"),
    );
  });

  it("is in the first-scan and paid milestone emails, under the upgrade line", async () => {
    const code = { title: "Spring menu", slug: "aB3dE5f" };
    const first = await render(
      <FirstScanEmail
        analyticsUrl="https://qrdx.dev/dashboard/acme/codes/c_1"
        code={code}
        free={{
          pricingUrl: "https://qrdx.dev/pricing",
          milestones: ["10", "100", "500"],
        }}
        intl={ENGLISH_EMAIL}
        invite={{ url: "https://qrdx.dev/settings/invite", count: 5, both: true }}
        scannedAt={NOW}
        unsubscribeUrl="https://qrdx.dev/unsubscribe"
        workspaceName=""
      />,
      { plainText: true },
    );
    expect(first.indexOf("also emails you at")).toBeLessThan(
      first.indexOf("you both get 5 more"),
    );
    const milestone = await render(
      <ScanMilestoneEmail
        analyticsUrl="https://qrdx.dev/dashboard/acme/codes/c_1"
        code={code}
        intl={ENGLISH_EMAIL}
        invite={paidInvite()}
        milestone={500}
        unsubscribeUrl="https://qrdx.dev/unsubscribe"
        workspaceName="Acme"
      />,
      { plainText: true },
    );
    expect(milestone).toContain(
      ": when they make their first dynamic code, they get 5 more.",
    );
  });
});

describe("first_real_scan", () => {
  const MADE = new Date("2026-11-25T10:00:00Z");
  const code = (extra: Record<string, unknown> = {}) => ({
    id: "c_menu",
    userId: "u_maker",
    organizationId: "org_acme",
    slug: "aB3dE5f",
    title: null,
    scanCount: 1,
    createdAt: MADE,
    ...extra,
  });
  const scanAt = (id: string, minutes: number) => ({
    id,
    scannedAt: new Date(MADE.getTime() + minutes * 60_000),
    country: null,
    region: null,
    city: null,
    deviceType: null,
    os: null,
    browser: null,
    referer: null,
  });
  /** Stores the scan, then asks, as recordScan does. */
  async function scanned(id: string, minutes: number, extra = {}) {
    const scan = scanAt(id, minutes);
    fakeDb.seed("qrScan", [
      { id, qrCodeId: "c_menu", scannedAt: scan.scannedAt },
    ]);
    await trackFirstRealScan(scan, code(extra), { plan: "pro" });
  }

  beforeEach(() => {
    fakeDb.seed("qrScan", []);
  });

  it("fires once per code on its first scan after the maker's test window, on any plan", async () => {
    await scanned("s_test", 1);
    expect(state.tracked).toHaveLength(0);
    await scanned("s_real", 60, { scanCount: 2 });
    expect(state.tracked).toEqual([
      {
        event: "first_real_scan",
        props: { plan: "pro" },
        options: {
          dedupeKey: "c_menu",
          timestamp: new Date(MADE.getTime() + 60 * 60_000),
        },
      },
    ]);
    await scanned("s_later", 90, { scanCount: 3 });
    expect(state.tracked).toHaveLength(1);
  });

  it("reads the plan when the caller hasn't, and skips imported codes", async () => {
    const scan = scanAt("s_1", 60);
    fakeDb.seed("qrScan", [
      { id: "s_1", qrCodeId: "c_menu", scannedAt: scan.scannedAt },
    ]);
    await trackFirstRealScan(scan, code({ createdVia: "import" }));
    expect(state.tracked).toHaveLength(0);
    await trackFirstRealScan(scan, code());
    expect(state.tracked[0]?.props).toEqual({ plan: "free" });
  });

  it("reads nothing where server events are off", async () => {
    state.serverEvents = false;
    await scanned("s_real", 60);
    expect(state.tracked).toHaveLength(0);
  });
});

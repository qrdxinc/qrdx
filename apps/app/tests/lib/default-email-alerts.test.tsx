// Scan alerts on by default (lib/events/types.ts DEFAULT_EMAIL_EVENTS): on a
// plan with email alerts, the code's maker, with no email row for the
// workspace, gets its first scan and its milestones, at most 25 a day, and
// never the digest; banned accounts get nothing; an email row, even one with
// no events, wins; the first-scan email waits for the first scan past the
// maker's test window, row or not, while chat still gets the very first
// scan; Free gets only its own first-scan email, and a code never gets both,
// even while its workspace changes plans; the unsubscribe link of a default
// email saves a row; the settings switches show the defaults on. Tables in
// memory, sendEmail and chat posts captured: nothing is sent or stored.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";
import { renderIntl } from "../support/intl";

const state = vi.hoisted(() => ({
  plan: "pro" as "free" | "pro" | "business",
  /** Per key, for the daily cap's limiter only */
  daily: new Map<string, number>(),
  chat: [] as string[],
  sent: [] as {
    to: string;
    from?: string;
    subject: string;
    unsubscribeUrl?: string;
    idempotencyKey?: string;
  }[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings/notifications",
}));
// Every limiter allows, except the default emails' daily cap, which counts.
vi.mock("@repo/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/rate-limit")>()),
  createRateLimiter: ({ prefix }: { prefix?: string }) => ({
    limit: async (key: string) => {
      if (prefix !== "qrdx:notify-default") return { success: true };
      const used = (state.daily.get(key) ?? 0) + 1;
      state.daily.set(key, used);
      return { success: used <= 25 };
    },
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/lib/feature-availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/feature-availability")>()),
  isFeatureAvailable: (id: string) => id === "teamNotes" || id === "email",
}));
vi.mock("@/lib/email/personal-sender", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/email/personal-sender")>();
  return {
    ...actual,
    personalSender: () =>
      actual.parseSender("Ritesh from QRdx <support@qrdx.dev>"),
  };
});
vi.mock("@/lib/workspaces", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspaces")>()),
  workspaceSlug: async () => "acme",
  assertNotShutOut: async () => {},
}));
vi.mock("@/lib/data-connections/sync", () => ({
  triggerIntegrationSyncs: async () => {},
}));
vi.mock("@/lib/email/send", () => ({
  isEmailConfigured: true,
  sendEmail: async (message: (typeof state.sent)[number]) => {
    state.sent.push(message);
    return { sent: true, id: `em_${state.sent.length}` };
  },
}));
vi.mock("@/components/confirm-identity/actions", () => ({
  ensureConfirmed: async () => ({ ok: true }),
  finishSignInConfirmation: async () => ({ ok: true }),
  getConfirmationOptions: async () => ({ ok: false, error: "unused" }),
}));

const { emitScanRecorded } = await import("@/lib/events/emit");
const { setTransportForTests } = await import("@/lib/events/http");
const { invalidateSubscribers, loadSubscribers } = await import(
  "@/lib/events/subscribers"
);
const settings = await import("@/lib/events/notification-settings");
const { runWeeklyDigest } = await import("@/lib/events/digest");
const { ownerScanEmailsOn } = await import(
  "@/app/(app)/dashboard/_components/home/pro-moments"
);
const { verifyUnsubscribeToken } = await import("@/lib/events/unsubscribe");
const { ConfirmIdentityProvider } = await import(
  "@/components/confirm-identity/provider"
);
const { WorkspaceNotifications } = await import(
  "@/app/(app)/settings/notifications/_components/workspace-notifications"
);

const ORG = "org_acme";
const scope = { userId: "u_maker", organizationId: ORG };
const MADE = new Date("2026-11-20T10:00:00Z");
const minutes = (count: number) => new Date(MADE.getTime() + count * 60_000);

const person = (id: string) => ({
  id,
  name: id,
  email: `${id}@mail.example.org.uk`,
  banned: false,
  banExpires: null,
  locale: null,
  teamNotes: true,
  twoFactorEnabled: true,
});

/** Stores the scan, then runs what recordScan runs after it. */
async function scan(id: string, at: Date, count: number) {
  fakeDb.seed("qrScan", [{ id, qrCodeId: "c_menu", scannedAt: at }]);
  await emitScanRecorded(
    {
      id,
      scannedAt: at,
      country: "DE",
      region: null,
      city: "Berlin",
      deviceType: "mobile",
      os: "iOS",
      browser: "Safari",
      referer: null,
    },
    {
      id: "c_menu",
      userId: "u_maker",
      organizationId: ORG,
      slug: "aB3dE5f",
      title: "Spring menu",
      scanCount: count,
      createdAt: MADE,
      createdVia: "dashboard",
    },
  );
}

const recipients = () => state.sent.map((email) => email.to).sort();
const address = (id: string) => `${id}@mail.example.org.uk`;

beforeEach(() => {
  fakeDb.resetAll();
  invalidateSubscribers(scope);
  state.plan = "pro";
  state.daily.clear();
  state.chat.length = 0;
  state.sent.length = 0;
  setTransportForTests(async (url) => {
    state.chat.push(url.toString());
    return { status: 200, body: "ok" };
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  fakeDb.seed("user", ["u_owner", "u_maker", "u_other"].map(person));
  fakeDb.seed("organization", [
    { id: ORG, name: "Acme", slug: "acme", createdAt: MADE },
  ]);
  fakeDb.seed("member", [
    { id: "m1", organizationId: ORG, userId: "u_owner", role: "owner" },
    { id: "m2", organizationId: ORG, userId: "u_maker", role: "member" },
    { id: "m3", organizationId: ORG, userId: "u_other", role: "admin" },
  ]);
  fakeDb.seed("notificationSetting", []);
  fakeDb.seed("qrScan", []);
  fakeDb.seed("portalClient", []);
  fakeDb.seed("webhookEndpoint", []);
});

describe("Pro and Business with no email row", () => {
  it("email the code's maker its first real scan and milestones, nobody else", async () => {
    for (const plan of ["pro", "business"] as const) {
      state.plan = plan;
      state.sent.length = 0;
      fakeDb.rows("qrScan").length = 0;
      invalidateSubscribers(scope);
      await scan(`s1_${plan}`, minutes(60), 1);
      expect(recipients(), plan).toEqual([address("u_maker")]);
      expect(state.sent[0]?.subject).toBe("“Spring menu” got its first scan");
    }
    state.sent.length = 0;
    await scan("s10", minutes(90), 10);
    expect(recipients()).toEqual([address("u_maker")]);
    await scan("s11", minutes(91), 11);
    expect(state.sent).toHaveLength(1);
  });

  it("wait past the maker's test window for the first-scan email", async () => {
    await scan("s1", minutes(1), 1);
    await scan("s2", minutes(2), 2);
    expect(state.sent).toHaveLength(0);
    await scan("s3", minutes(30), 3);
    expect(state.sent).toEqual([
      expect.objectContaining({
        to: address("u_maker"),
        subject: "“Spring menu” got its first scan",
      }),
    ]);
    await scan("s4", minutes(31), 4);
    expect(state.sent).toHaveLength(1);
  });

  it("never sends the digest, form responses or code changes by default", async () => {
    const subscribers = await loadSubscribers(scope);
    expect(subscribers.targets).toEqual([]);
    expect(subscribers.defaultEmail.map((p) => p.userId)).toEqual([
      "u_owner",
      "u_maker",
      "u_other",
    ]);
    for (const userId of ["u_owner", "u_maker"]) {
      const [workspace] = await settings.listNotificationWorkspaces(userId);
      expect(workspace?.email, userId).toBeNull();
      expect(workspace?.emailByDefault, userId).toBe(true);
    }
    // The digest goes only to rows that ask for it.
    expect((await runWeeklyDigest({ shard: "all" })).candidates).toBe(0);
    await settings.setEmailEvents("u_owner", ORG, ["digest.weekly"]);
    expect((await runWeeklyDigest({ shard: "all" })).candidates).toBe(1);
  });

  it("stop at 25 a day per person and workspace, and log each one skipped", async () => {
    // The first scan, then 30 milestone alerts in a day (each a 10th scan,
    // for the test's sake): 31 alert emails, 25 sent, 6 skipped.
    await scan("s1", minutes(30), 1);
    for (let index = 0; index < 30; index += 1) {
      await scan(`s10_${index}`, minutes(60 + index), 10);
    }
    expect(state.sent).toHaveLength(25);
    const logged = vi
      .mocked(console.info)
      .mock.calls.map(([line]) => String(line))
      .filter((line) => line.includes("notification.default_daily_cap"));
    expect(logged).toHaveLength(6);
    expect(JSON.parse(logged[0] ?? "{}")).toEqual({
      event: "notification.default_daily_cap",
      targetId: `default:u_maker:${ORG}`,
      cap: 25,
    });
  });

  it("never go to a banned maker; a ban that ended doesn't count", async () => {
    const maker = fakeDb.find("user", { id: "u_maker" }) as Record<
      string,
      unknown
    >;
    maker.banned = true;
    await scan("s1", minutes(60), 1);
    expect(state.sent).toHaveLength(0);
    maker.banExpires = new Date("2026-01-01T00:00:00Z");
    invalidateSubscribers(scope);
    await scan("s10", minutes(90), 10);
    expect(recipients()).toEqual([address("u_maker")]);
    maker.banExpires = new Date("2099-01-01T00:00:00Z");
    invalidateSubscribers(scope);
    state.sent.length = 0;
    await scan("s100", minutes(120), 100);
    expect(state.sent).toHaveLength(0);
  });

  it("send nothing to someone whose row turns alerts off, and only what a row asks for", async () => {
    await settings.setEmailEvents("u_owner", ORG, []);
    await settings.setEmailEvents("u_maker", ORG, ["form.submitted"]);
    expect(
      fakeDb.rows("notificationSetting").map((row) => [row.userId, row.events]),
    ).toEqual([
      ["u_owner", []],
      ["u_maker", ["form.submitted"]],
    ]);
    await scan("s1", minutes(60), 1);
    expect(state.sent).toHaveLength(0);
    const [workspace] = await settings.listNotificationWorkspaces("u_owner");
    expect(workspace?.email?.events).toEqual([]);
    expect(workspace?.emailByDefault).toBe(false);
  });

  it("send every code's milestones to an owner who turned them on, after the same test window", async () => {
    await settings.setEmailEvents("u_owner", ORG, ["scan.milestone"]);
    await scan("s1", minutes(1), 1);
    expect(state.sent).toHaveLength(0);
    await scan("s2", minutes(60), 2);
    expect(recipients()).toEqual([address("u_maker"), address("u_owner")]);
  });

  it("still post the very first scan to chat, test window or not", async () => {
    state.plan = "business";
    fakeDb.seed("notificationSetting", [
      {
        id: "n_slack",
        userId: "u_owner",
        organizationId: ORG,
        channel: "slack",
        target: "https://hooks.slack.com/services/T000/B000/XXXX",
        events: ["scan.milestone"],
        createdAt: MADE,
      },
    ]);
    invalidateSubscribers(scope);
    await scan("s1", minutes(1), 1);
    expect(state.chat).toEqual([
      "https://hooks.slack.com/services/T000/B000/XXXX",
    ]);
    expect(state.sent).toHaveLength(0);
    await scan("s2", minutes(60), 2);
    // The late first-scan email goes alone: no second chat message.
    expect(state.chat).toHaveLength(1);
    expect(recipients()).toEqual([address("u_maker")]);
  });

  it("have an unsubscribe link that saves the person's choice", async () => {
    await scan("s1", minutes(60), 1);
    const [email] = state.sent;
    const token = new URL(email?.unsubscribeUrl ?? "").searchParams.get(
      "token",
    );
    const parsed = verifyUnsubscribeToken(token ?? "");
    expect(parsed).toEqual({
      settingId: `default:u_maker:${ORG}`,
      event: "scan.milestone",
    });
    expect(email?.idempotencyKey).toMatch(/:default:u_maker:org_acme$/);
    await settings.applyUnsubscribe(
      parsed?.settingId ?? "",
      parsed?.event ?? "all",
    );
    expect(
      fakeDb
        .rows("notificationSetting")
        .map((row) => [row.userId, row.organizationId, row.events]),
    ).toEqual([["u_maker", ORG, []]]);
    state.sent.length = 0;
    await scan("s10", minutes(90), 10);
    expect(state.sent).toHaveLength(0);
  });
});

describe("Free", () => {
  it("gets only its own first-scan email, from the personal sender", async () => {
    state.plan = "free";
    await scan("s1", minutes(1), 1);
    expect(state.sent).toHaveLength(0);
    await scan("s2", minutes(60), 2);
    expect(state.sent).toEqual([
      expect.objectContaining({
        to: address("u_maker"),
        from: "Ritesh from QRdx <support@qrdx.dev>",
        idempotencyKey: "first-scan:c_menu",
      }),
    ]);
    await scan("s10", minutes(90), 10);
    expect(state.sent).toHaveLength(1);
  });
});

describe("one first-scan email per code across plan changes", () => {
  it("lets the alerts' read of the plan decide Free's email too", async () => {
    // The alerts still see Pro (subscribers are cached for 30 s) while the
    // plan has just become Free: Pro's alert goes, Free's doesn't.
    await loadSubscribers(scope, { cached: true });
    state.plan = "free";
    await scan("s1", minutes(60), 1);
    expect(state.sent).toEqual([
      expect.objectContaining({
        to: address("u_maker"),
        subject: "“Spring menu” got its first scan",
      }),
    ]);
    expect(state.sent[0]?.from).toBeUndefined();
  });

  it("sends no Free email after a downgrade once Pro's went", async () => {
    await scan("s1", minutes(60), 1);
    expect(state.sent).toHaveLength(1);
    state.plan = "free";
    invalidateSubscribers(scope);
    await scan("s2", minutes(61), 2);
    expect(state.sent).toHaveLength(1);
  });

  it("sends Free's email after a downgrade when Pro only saw test scans", async () => {
    await scan("s1", minutes(1), 1);
    expect(state.sent).toHaveLength(0);
    state.plan = "free";
    invalidateSubscribers(scope);
    await scan("s2", minutes(60), 2);
    expect(state.sent).toEqual([
      expect.objectContaining({ from: "Ritesh from QRdx <support@qrdx.dev>" }),
    ]);
  });

  it("sends no Pro first-scan alert after an upgrade when Free's went", async () => {
    state.plan = "free";
    await scan("s1", minutes(60), 1);
    expect(state.sent).toHaveLength(1);
    state.plan = "pro";
    invalidateSubscribers(scope);
    await scan("s2", minutes(61), 2);
    expect(state.sent).toHaveLength(1);
  });
});

describe("/success's line about scan emails", () => {
  const on = (plan: "free" | "pro" | "business" = "pro") =>
    ownerScanEmailsOn({ userId: "u_owner", organizationId: ORG, plan });

  it("says they're on with the default, or with milestones chosen", async () => {
    expect(await on("pro")).toBe(true);
    expect(await on("business")).toBe(true);
    await settings.setEmailEvents("u_owner", ORG, [
      "scan.milestone",
      "digest.weekly",
    ]);
    expect(await on()).toBe(true);
  });

  it("stays quiet when they turned them off, or on Free", async () => {
    expect(await on("free")).toBe(false);
    await settings.setEmailEvents("u_owner", ORG, ["form.submitted"]);
    expect(await on()).toBe(false);
    await settings.setEmailEvents("u_owner", ORG, []);
    expect(await on()).toBe(false);
  });
});

describe("the settings switches", () => {
  const render = async (userId: string) => {
    const [workspace] = await settings.listNotificationWorkspaces(userId);
    if (!workspace) throw new Error("no workspace");
    return renderIntl(
      <ConfirmIdentityProvider>
        <WorkspaceNotifications email={address(userId)} workspace={workspace} />
      </ConfirmIdentityProvider>,
    );
  };
  const checked = (html: string, event: string) =>
    new RegExp(
      `<button[^>]*aria-checked="true"[^>]*id="${ORG}-email-${event.replace(".", "\\.")}"`,
    ).test(html) ||
    new RegExp(
      `<button[^>]*id="${ORG}-email-${event.replace(".", "\\.")}"[^>]*aria-checked="true"`,
    ).test(html);

  it("show the defaults on with no row, and only them", async () => {
    const html = await render("u_owner");
    expect(checked(html, "scan.milestone")).toBe(true);
    for (const event of ["digest.weekly", "form.submitted", "code.created"]) {
      expect(checked(html, event), event).toBe(false);
    }
    // Everyone's default is the codes they make, owners too.
    for (const page of [html, await render("u_maker")]) {
      expect(page).toContain("On by default for the codes you make.");
      expect(page).toContain("Get them for every code in this workspace");
    }
  });

  it("show a row's choice, off included", async () => {
    await settings.setEmailEvents("u_owner", ORG, []);
    expect(checked(await render("u_owner"), "scan.milestone")).toBe(false);
  });

  it("stay off on Free", async () => {
    state.plan = "free";
    expect(checked(await render("u_owner"), "scan.milestone")).toBe(false);
  });
});

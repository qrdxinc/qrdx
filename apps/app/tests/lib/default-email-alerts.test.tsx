// Scan alerts on by default (lib/events/types.ts DEFAULT_EMAIL_EVENTS): on a
// plan with email alerts, someone with no email row for the workspace gets
// each code's first scan and its milestones, if they're an owner or made
// the code, and never the digest; an email row, even one with no events,
// wins; Free gets only its own first-scan email, and a code never gets both,
// even while its workspace changes plans; the unsubscribe link of a default
// email saves a row; the settings switches show the defaults on. Tables in
// memory, sendEmail captured: nothing is sent or stored.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";
import { renderIntl } from "../support/intl";

const state = vi.hoisted(() => ({
  plan: "pro" as "free" | "pro" | "business",
  redis: new Map<string, unknown>(),
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
vi.mock("@repo/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/rate-limit")>()),
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  redis: {
    get: async (key: string) => state.redis.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      state.redis.set(key, value);
      return "OK";
    },
  },
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
const { invalidateSubscribers, loadSubscribers } = await import(
  "@/lib/events/subscribers"
);
const settings = await import("@/lib/events/notification-settings");
const { runWeeklyDigest } = await import("@/lib/events/digest");
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
  state.redis.clear();
  state.sent.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
  it("email each code's first scan and milestones to its maker and the owners, nobody else", async () => {
    for (const plan of ["pro", "business"] as const) {
      state.plan = plan;
      state.sent.length = 0;
      invalidateSubscribers(scope);
      await scan(`s1_${plan}`, minutes(1), 1);
      expect(recipients(), plan).toEqual([
        address("u_maker"),
        address("u_owner"),
      ]);
      expect(state.sent[0]?.subject).toBe("“Spring menu” got its first scan");
    }
    state.sent.length = 0;
    await scan("s10", minutes(90), 10);
    expect(recipients()).toEqual([address("u_maker"), address("u_owner")]);
    await scan("s11", minutes(91), 11);
    expect(state.sent).toHaveLength(2);
  });

  it("never sends the digest, form responses or code changes by default", async () => {
    const subscribers = await loadSubscribers(scope);
    expect(subscribers.targets).toEqual([]);
    expect(subscribers.defaultEmail.map((p) => [p.userId, p.owner])).toEqual([
      ["u_owner", true],
      ["u_maker", false],
      ["u_other", false],
    ]);
    const [workspace] = await settings.listNotificationWorkspaces("u_owner");
    expect(workspace?.email).toBeNull();
    expect(workspace?.emailByDefault).toBe("everyCode");
    expect(
      (await settings.listNotificationWorkspaces("u_maker"))[0]?.emailByDefault,
    ).toBe("ownCodes");
    // The digest goes only to rows that ask for it.
    expect((await runWeeklyDigest({ shard: "all" })).candidates).toBe(0);
    await settings.setEmailEvents("u_owner", ORG, ["digest.weekly"]);
    expect((await runWeeklyDigest({ shard: "all" })).candidates).toBe(1);
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
    await scan("s1", minutes(1), 1);
    expect(state.sent).toHaveLength(0);
    const [workspace] = await settings.listNotificationWorkspaces("u_owner");
    expect(workspace?.email?.events).toEqual([]);
    expect(workspace?.emailByDefault).toBeNull();
  });

  it("send every code's milestones to a member who turned them on", async () => {
    await settings.setEmailEvents("u_other", ORG, ["scan.milestone"]);
    await scan("s1", minutes(1), 1);
    expect(recipients()).toEqual([
      address("u_maker"),
      address("u_other"),
      address("u_owner"),
    ]);
  });

  it("have an unsubscribe link that saves the person's choice", async () => {
    await scan("s1", minutes(1), 1);
    const owner = state.sent.find((email) => email.to === address("u_owner"));
    const token = new URL(owner?.unsubscribeUrl ?? "").searchParams.get(
      "token",
    );
    const parsed = verifyUnsubscribeToken(token ?? "");
    expect(parsed).toEqual({
      settingId: `default:u_owner:${ORG}`,
      event: "scan.milestone",
    });
    expect(owner?.idempotencyKey).toMatch(/:default:u_owner:org_acme$/);
    await settings.applyUnsubscribe(
      parsed?.settingId ?? "",
      parsed?.event ?? "all",
    );
    expect(
      fakeDb
        .rows("notificationSetting")
        .map((row) => [row.userId, row.organizationId, row.events]),
    ).toEqual([["u_owner", ORG, []]]);
    state.sent.length = 0;
    await scan("s10", minutes(90), 10);
    expect(recipients()).toEqual([address("u_maker")]);
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
    expect(state.sent.map((email) => email.subject)).toEqual([
      "“Spring menu” got its first scan",
      "“Spring menu” got its first scan",
    ]);
    expect(state.sent.some((email) => email.from)).toBe(false);
  });

  it("sends no Free email after a downgrade when the first scan came on Pro", async () => {
    await scan("s1", minutes(1), 1);
    expect(state.sent).toHaveLength(2);
    state.plan = "free";
    invalidateSubscribers(scope);
    await scan("s2", minutes(60), 2);
    expect(state.sent).toHaveLength(2);
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
    expect(html).not.toContain("On by default for the codes you make");
    expect(await render("u_maker")).toContain(
      "On by default for the codes you make",
    );
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

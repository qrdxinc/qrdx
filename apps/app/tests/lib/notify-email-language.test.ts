// Alert emails (lib/events/notify.tsx) go out in the recipient's saved
// language, else English. They run after someone else's request (a scan, a
// form response, a teammate's edit), where Next still lets them read that
// request's cookies, so the language menu's cookie must not pick the language.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  cookieLocale: "es" as string | undefined,
  sent: [] as { to: string; subject: string }[],
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
  cookies: async () => ({
    get: (name: string) =>
      name === "NEXT_LOCALE" && state.cookieLocale
        ? { name, value: state.cookieLocale }
        : undefined,
  }),
  headers: async () => new Headers(),
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async (message: { to: string; subject: string }) => {
    state.sent.push({ to: message.to, subject: message.subject });
  },
}));
vi.mock("@/lib/events/unsubscribe", () => ({
  unsubscribeUrl: () => "https://qrdx.dev/unsubscribe/test",
}));
vi.mock("@/lib/workspaces", () => ({ workspaceSlug: async () => null }));

const { notifyTargets } = await import("@/lib/events/notify");

const firstScan = {
  id: "evt_1",
  type: "scan.milestone" as const,
  created_at: "2026-11-18T09:00:00.000Z",
  data: {
    milestone: 1,
    code: { id: "code_1", slug: "aB3dE5f", title: "Menu", scan_count: 1 },
    scan: {
      scanned_at: "2026-11-18T09:00:00.000Z",
      city: null,
      country: null,
      os: null,
      browser: null,
    },
  },
};

function emailTarget(userId: string, email: string) {
  return {
    id: `target_${userId}`,
    userId,
    userName: userId,
    channel: "email" as const,
    target: email,
    events: ["scan.milestone"],
  };
}

const scope = { userId: "owner", organizationId: null };

beforeEach(() => {
  fakeDb.reset();
  state.sent = [];
  state.cookieLocale = "es";
});

describe("alert emails pick the recipient's language", () => {
  it("sends English to a recipient with no saved language, whatever the request's cookie says", async () => {
    fakeDb.seed("user", [
      { id: "owner", email: "owner@example.com", name: "Owner", locale: null },
    ]);

    await notifyTargets(
      firstScan as never,
      [emailTarget("owner", "owner@example.com")],
      scope as never,
    );

    expect(state.sent).toEqual([
      { to: "owner@example.com", subject: "“Menu” got its first scan" },
    ]);
  });

  it("sends the recipient's saved language", async () => {
    state.cookieLocale = "de";
    fakeDb.seed("user", [
      { id: "owner", email: "owner@example.com", name: "Owner", locale: "es" },
    ]);

    await notifyTargets(
      firstScan as never,
      [emailTarget("owner", "owner@example.com")],
      scope as never,
    );

    expect(state.sent).toEqual([
      { to: "owner@example.com", subject: "“Menu” recibió su primer escaneo" },
    ]);
  });
});

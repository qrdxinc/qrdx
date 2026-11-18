// When an alert or the weekly digest has no workspace name to show (a
// personal scope, or a workspace whose row is gone), it says "your
// workspace" in the email's language, and a code-change alert names the
// fields that changed in it too. English is unchanged. Nothing is sent:
// sendEmail is a mock and the tables are in memory.
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import es from "@/messages/es.json";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  sent: [] as { to: string; subject: string; react: ReactElement }[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
// The request's language never decides these emails.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "NEXT_LOCALE" ? { name, value: "de" } : undefined,
  }),
  headers: async () => new Headers(),
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@/lib/email/send", () => ({
  isEmailConfigured: true,
  sendEmail: async (message: (typeof state.sent)[number]) => {
    state.sent.push(message);
    return { sent: true, id: `em_${state.sent.length}` };
  },
}));
vi.mock("@/lib/events/unsubscribe", () => ({
  unsubscribeUrl: () => "https://qrdx.dev/unsubscribe/test",
}));
vi.mock("@/lib/workspaces", () => ({ workspaceSlug: async () => null }));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => "pro",
}));
vi.mock("@repo/auth/workspace-two-factor", () => ({
  workspaceRequiresTwoFactor: async () => false,
}));

const { notifyTargets, workspaceLabel, workspaceTitle } = await import(
  "@/lib/events/notify"
);
const { runWeeklyDigest } = await import("@/lib/events/digest");

const text = (email: ReactElement) => render(email, { plainText: true });

const code = {
  id: "code_1",
  slug: "aB3dE5f",
  title: "Menu",
  scan_count: 1,
  short_link: "https://qrdx.dev/q/aB3dE5f",
  destination_url: "https://example.com",
};

function people() {
  fakeDb.seed("user", [
    { id: "u_es", email: "es@example.com", name: "Ana", locale: "es" },
    { id: "u_en", email: "en@example.com", name: "Bo", locale: null },
  ]);
}

const target = (userId: string, events: string[]) => ({
  id: `t_${userId}`,
  userId,
  userName: userId,
  channel: "email" as const,
  target: `${userId === "u_es" ? "es" : "en"}@example.com`,
  events,
});

beforeEach(() => {
  fakeDb.resetAll();
  state.sent = [];
});

describe("the fallback words", () => {
  it("are English by default, as before", async () => {
    expect(workspaceLabel(null)).toBe("your workspace");
    expect(workspaceTitle(null)).toBe("Your workspace");
    expect(workspaceLabel("Acme")).toBe("Acme");
    expect(workspaceTitle("Acme")).toBe("Acme");
  });
});

describe("alerts without a workspace name", () => {
  it("say “your workspace” and the changed fields in each recipient's language", async () => {
    people();
    await notifyTargets(
      {
        id: "evt_1",
        type: "code.updated",
        created_at: "2026-11-18T09:00:00.000Z",
        data: {
          code,
          actor_id: "u_en",
          changes: ["destination_url", "title", "style", "domain_id", "other"],
        },
      } as never,
      [
        target("u_es", ["code.updated"]),
        target("u_en", ["code.updated"]),
      ] as never,
      { userId: "u_es", organizationId: null } as never,
    );
    const byAddress = Object.fromEntries(
      state.sent.map((email) => [email.to, email]),
    );
    const spanish = await text(
      byAddress["es@example.com"]?.react as ReactElement,
    );
    expect(spanish).toContain(es.emails.alerts.yourWorkspace);
    expect(spanish).toContain(
      "Destino, Título, Diseño, Dominio del enlace corto, other",
    );
    expect(spanish).not.toContain("your workspace");
    const english = await text(
      byAddress["en@example.com"]?.react as ReactElement,
    );
    expect(english).toContain(
      "Bo changed this dynamic QR code in your workspace.",
    );
    // The label and its value are separated by a no-break space.
    expect(english).toContain(
      "Changed:\u00a0Destination, Title, Design, Short link domain, other",
    );
    expect(english).toContain(
      "You get this because code change alerts are on for your workspace.",
    );
  });

  it("name the workspace when it has one", async () => {
    people();
    fakeDb.seed("organization", [{ id: "org_acme", name: "Acme" }]);
    await notifyTargets(
      {
        id: "evt_2",
        type: "scan.milestone",
        created_at: "2026-11-18T09:00:00.000Z",
        data: { milestone: 100, code },
      } as never,
      [target("u_es", ["scan.milestone"])] as never,
      { userId: "u_es", organizationId: "org_acme" } as never,
    );
    const spanish = await text(state.sent[0]?.react as ReactElement);
    expect(spanish).toContain("Acme");
    expect(spanish).not.toContain(es.emails.alerts.yourWorkspace);
  });
});

describe("the weekly digest without a workspace name", () => {
  const NOW = new Date("2026-11-16T10:00:00Z");

  it("says “Your workspace” in each recipient's language", async () => {
    // The workspace's row is gone, so its name is unknown.
    ["es", null].forEach((locale, index) => {
      const id = `u_${index}`;
      fakeDb.seed("user", [
        { id, name: id, email: `${id}@example.com`, locale },
      ]);
      fakeDb.seed("member", [
        { id: `m_${index}`, organizationId: "org_gone", userId: id },
      ]);
      fakeDb.seed("notificationSetting", [
        {
          id: `ns_${index}`,
          userId: id,
          organizationId: "org_gone",
          channel: "email",
          events: ["digest.weekly"],
        },
      ]);
    });
    fakeDb.seed("qrCode", [
      {
        id: "c_menu",
        organizationId: "org_gone",
        userId: "u_0",
        slug: "menu",
        title: "Menu",
        deletedAt: null,
        createdAt: new Date("2026-10-01T00:00:00Z"),
      },
    ]);
    fakeDb.seed(
      "qrScan",
      Array.from({ length: 3 }, (_, i) => ({
        id: `s_${i}`,
        qrCodeId: "c_menu",
        scannedAt: new Date(`2026-11-1${i}T12:00:00Z`),
        visitorHash: `v_${i}`,
        country: "ES",
      })),
    );

    const summary = await runWeeklyDigest({ now: NOW, shard: "all" });
    expect(summary).toMatchObject({ sent: 2, failed: 0 });
    const byAddress = Object.fromEntries(
      state.sent.map((email) => [email.to, email]),
    );
    const spanish = await text(
      byAddress["u_0@example.com"]?.react as ReactElement,
    );
    expect(spanish).toContain(`${es.emails.weeklyDigest.yourWorkspace} ·`);
    expect(spanish).not.toContain("Your workspace");
    const english = await text(
      byAddress["u_1@example.com"]?.react as ReactElement,
    );
    expect(english).toContain("Your workspace ·");
    expect(english).toContain(
      "You get this because the weekly digest is on for Your workspace.",
    );
  }, 10_000);
});

// Which language the team invitation (lib/events/emails.tsx) and the weekly
// digest (lib/events/digest.tsx) go out in. An invitation: the invitee's
// saved language when the address has an account, else the inviter's (they
// send it from their own request), else English; admin resends pass no
// inviter's language, so they're English unless the invitee chose one. The
// digest: each recipient's saved language, else English, read with the
// recipients rather than once per recipient. The request's language cookie
// says "de" throughout and must never decide. Nothing is sent: sendEmail is
// a mock and the tables are in memory.
import { render } from "@react-email/render";
import { createElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { fakeDb, repoDatabase } from "../support/fake-db";

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
  fixedWindow: () => ({}),
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
vi.mock("@/lib/workspaces", () => ({ workspaceSlug: async () => "acme" }));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => "pro",
}));
vi.mock("@repo/auth/workspace-two-factor", () => ({
  workspaceRequiresTwoFactor: async () => false,
}));

const { sendTeamInviteEmail } = await import("@/lib/events/emails");
const { runWeeklyDigest } = await import("@/lib/events/digest");
const { PortalInviteEmail, portalInviteSubject } = await import(
  "@/ee/client-portal/invite-email"
);
const { emailIntl } = await import("@/lib/i18n/email");

const text = (email: ReactElement) => render(email, { plainText: true });

beforeEach(() => {
  fakeDb.resetAll();
  state.sent = [];
  fakeDb.seed("organization", [{ id: "org_acme", name: "Acme", slug: "acme" }]);
});

describe("team invitations", () => {
  const invitation = (email: string) => ({
    id: "inv_1",
    email,
    role: "admin",
    expiresAt: new Date("2026-11-20T10:00:00Z"),
    organizationId: "org_acme",
    inviterId: "u_ada",
  });

  beforeEach(() => {
    fakeDb.seed("user", [
      { id: "u_ada", name: "Ada", email: "ada@acme.example", locale: "fr" },
      { id: "u_eva", name: "Eva", email: "eva@example.com", locale: "es" },
      { id: "u_ned", name: "Ned", email: "ned@example.com", locale: null },
    ]);
  });

  it("go out in the invitee's saved language, whatever the inviter's", async () => {
    await sendTeamInviteEmail(invitation("eva@example.com"), {
      inviterLocale: "de",
    });
    expect(state.sent.map((email) => email.subject)).toEqual([
      "Ada te invitó a Acme en QRdx como administrador",
    ]);
    const body = await text(state.sent[0]?.react as ReactElement);
    expect(body).toContain(es.emails.teamInvite.roles.admin);
    expect(body).toContain(es.emails.teamInvite.accept);
  });

  it("go out in the inviter's language to an address without one", async () => {
    await sendTeamInviteEmail(invitation("new@example.com"), {
      inviterLocale: "de",
    });
    await sendTeamInviteEmail(invitation("ned@example.com"), {
      inviterLocale: "de",
    });
    expect(state.sent.map((email) => email.subject)).toEqual([
      "Ada hat dich zu Acme auf QRdx eingeladen, als Admin",
      "Ada hat dich zu Acme auf QRdx eingeladen, als Admin",
    ]);
  });

  it("go out in English from admin (no inviter's language), cookie or not", async () => {
    await sendTeamInviteEmail(invitation("new@example.com"));
    expect(state.sent.map((email) => email.subject)).toEqual([
      "Ada invited you to Acme on QRdx as an admin",
    ]);
    const body = await text(state.sent[0]?.react as ReactElement);
    expect(body).toContain(
      "Ada invited you to the Acme workspace as an admin. Admins manage people, settings, domains and everyone's codes.",
    );
    expect(body).toContain(
      "The invitation expires on Nov 20, 2026, 10:00 AM UTC.",
    );
    // Admin still honours a language the invitee chose.
    await sendTeamInviteEmail(invitation("eva@example.com"));
    expect(state.sent[1]?.subject).toBe(
      "Ada te invitó a Acme en QRdx como administrador",
    );
  });

  it("say who invited in the email's language when the inviter has no name", async () => {
    const ada = fakeDb.find("user", { id: "u_ada" });
    if (ada) ada.name = "";
    await sendTeamInviteEmail(invitation("eva@example.com"));
    await sendTeamInviteEmail(invitation("new@example.com"));
    expect(state.sent.map((email) => email.subject)).toEqual([
      `${es.emails.teamInvite.someone} te invitó a Acme en QRdx como administrador`,
      `${en.emails.teamInvite.someone} invited you to Acme on QRdx as an admin`,
    ]);
  });
});

describe("client portal invitations", () => {
  const props = {
    portalName: "North Agency",
    inviterName: "Ana",
    portalUrl: "https://qrdx.dev/portal/agency",
    folders: ["Menus", "Flyers", "Posters"],
  };

  it("read as before in English", async () => {
    const body = await text(createElement(PortalInviteEmail, props));
    expect(portalInviteSubject("North Agency")).toBe(
      "North Agency shared QR code reports with you",
    );
    expect(body).toContain(
      "Ana invited you to see North Agency's QR codes in Menus, Flyers and Posters: how often each one is scanned",
    );
    expect(body).toContain("Open the reports");
  });

  it("read in Spanish with a Spanish translator, the list joined the Spanish way", async () => {
    const intl = await emailIntl("es");
    const body = await text(
      createElement(PortalInviteEmail, { ...props, intl }),
    );
    expect(portalInviteSubject("North Agency", intl)).toBe(
      "North Agency compartió contigo informes de códigos QR",
    );
    expect(body).toContain(
      "Ana te invitó a ver los códigos QR de North Agency en Menus, Flyers y Posters:",
    );
    expect(body).toContain(es.emails.portalInvite.open);
    expect(body).not.toContain("Open the reports");
  });
});

describe("the weekly digest", () => {
  // The week of Monday 9 November 2026, sent on Monday 16 November.
  const NOW = new Date("2026-11-16T10:00:00Z");

  function seedRecipients(locales: (string | null)[]) {
    locales.forEach((locale, index) => {
      const id = `u_${index}`;
      fakeDb.seed("user", [
        {
          id,
          name: id,
          email: `${id}@example.com`,
          locale,
          twoFactorEnabled: true,
        },
      ]);
      fakeDb.seed("member", [
        { id: `m_${index}`, organizationId: "org_acme", userId: id },
      ]);
      fakeDb.seed("notificationSetting", [
        {
          id: `ns_${index}`,
          userId: id,
          organizationId: "org_acme",
          channel: "email",
          events: ["digest.weekly"],
        },
      ]);
    });
    fakeDb.seed("qrCode", [
      {
        id: "c_menu",
        organizationId: "org_acme",
        userId: "u_0",
        slug: "menu",
        title: "Menu",
        deletedAt: null,
        createdAt: new Date("2026-10-01T00:00:00Z"),
      },
    ]);
    fakeDb.seed(
      "qrScan",
      Array.from({ length: 12 }, (_, i) => ({
        id: `s_${i}`,
        qrCodeId: "c_menu",
        scannedAt: new Date(`2026-11-1${i % 5}T12:00:00Z`),
        visitorHash: `v_${i % 4}`,
        country: "ES",
      })),
    );
  }

  /** Runs the digest and returns the tables its queries read from. */
  async function run() {
    const database = repoDatabase.database as {
      select: (...args: unknown[]) => { from: (table: unknown) => unknown };
    };
    const select = database.select.bind(database);
    const tables: string[] = [];
    const spy = vi.spyOn(database, "select").mockImplementation((...args) => {
      const query = select(...args);
      return {
        ...query,
        from: (table: unknown) => {
          tables.push((table as { __table: string }).__table);
          return query.from(table);
        },
      };
    });
    try {
      const summary = await runWeeklyDigest({ now: NOW, shard: "all" });
      return { summary, tables };
    } finally {
      spy.mockRestore();
    }
  }

  it("goes out in each recipient's saved language, else English", async () => {
    seedRecipients(["es", null]);
    const { summary } = await run();
    expect(summary).toMatchObject({ candidates: 2, sent: 2, failed: 0 });
    const byAddress = Object.fromEntries(
      state.sent.map((email) => [email.to, email]),
    );
    expect(byAddress["u_0@example.com"]?.subject).toBe(
      "Tu semana en QRdx: 12 escaneos",
    );
    expect(byAddress["u_1@example.com"]?.subject).toBe(
      "Your QRdx week: 12 scans",
    );
    const spanish = await text(
      byAddress["u_0@example.com"]?.react as ReactElement,
    );
    expect(spanish).toContain(es.emails.weeklyDigest.open);
    // A row of the countries list: the name, three spaces, the count.
    expect(spanish).toMatch(/España {3}12/);
    expect(spanish).toContain("u_0@example.com");
    expect(spanish).toContain("9 nov – 15 nov");
    const english = await text(
      byAddress["u_1@example.com"]?.react as ReactElement,
    );
    expect(english).toContain("Open your dashboard");
    expect(english).toMatch(/Spain {3}12/);
    expect(english).toContain("This email was meant for u_1@example.com.");
    expect(english).toContain("Nov 9 – Nov 15");
  }, 10_000);

  it("reads the languages with the recipients: no query per recipient", async () => {
    seedRecipients(["es", null]);
    const chosen = await run();
    fakeDb.resetAll();
    fakeDb.seed("organization", [
      { id: "org_acme", name: "Acme", slug: "acme" },
    ]);
    state.sent = [];
    seedRecipients([null, null]);
    const unchosen = await run();
    expect(chosen.summary.sent).toBe(2);
    expect(unchosen.summary.sent).toBe(2);
    // The same queries whether or not anyone chose a language, and none
    // reads the user table on its own (the recipients query joins it).
    expect(chosen.tables).toEqual(unchosen.tables);
    expect(chosen.tables).not.toContain("user");
    // One recipients query; the rest is each recipient's numbers.
    expect(
      chosen.tables.filter((table) => table === "notificationSetting"),
    ).toHaveLength(1);
    expect(chosen.tables.filter((table) => table === "qrScan")).toHaveLength(8);
  }, 10_000);
});

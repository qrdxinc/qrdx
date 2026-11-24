// The welcome email (lib/email/welcome.tsx) and where sign-up sends it
// (lib/analytics/sign-up-hook.ts): once per account (welcome:<userId>), from
// EMAIL_FROM_PERSONAL else EMAIL_FROM, in the person's language with Pro's
// price in their currency, only where notes from the team exist, and never
// to someone who turned them off, a banned account or a reserved test
// address. The tables are in memory and sendEmail is captured: nothing is
// sent or stored.
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  env: {
    EMAIL_FROM: "QRdx <hello@qrdx.dev>",
    EMAIL_FROM_PERSONAL: "Ritesh from QRdx <support@qrdx.dev>",
  } as Record<string, string | undefined>,
  teamNotes: true,
  sendResult: { sent: true, id: "em_1" } as
    | { sent: true; id: string }
    | { sent: false; reason: "failed"; error: string },
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
  isFeatureAvailable: (id: string) => id === "teamNotes" && state.teamNotes,
}));
vi.mock("@/lib/email/send", () => ({
  isEmailConfigured: true,
  sendEmail: vi.fn(async (options: (typeof state.sent)[number]) => {
    state.sent.push(options);
    return state.sendResult;
  }),
}));

const { baseUrl } = await import("@repo/email/origin");
const { sendWelcomeEmail } = await import("@/lib/email/welcome");
const { verifyTeamNotesToken } = await import("@/lib/events/unsubscribe");

const person = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: "Sam Lee",
  email: `${id}@mail.example.org.uk`,
  banned: false,
  banExpires: null,
  locale: null,
  teamNotes: true,
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

beforeEach(() => {
  fakeDb.resetAll();
  state.sent.length = 0;
  state.sendResult = { sent: true, id: "em_1" };
  state.teamNotes = true;
  state.env.EMAIL_FROM = "QRdx <hello@qrdx.dev>";
  state.env.EMAIL_FROM_PERSONAL = "Ritesh from QRdx <support@qrdx.dev>";
  fakeDb.seed("user", [
    person("u_new"),
    person("u_es", { locale: "es", name: "Ana" }),
    person("u_off", { teamNotes: false }),
    person("u_banned", { banned: true }),
    person("u_test", { email: "e2e@qrdx.test" }),
  ]);
});

describe("sendWelcomeEmail", () => {
  it("sends one short note from the personal sender, once per account", async () => {
    expect(await sendWelcomeEmail({ userId: "u_new", country: "US" })).toBe(
      "sent",
    );
    const { email, html, text } = await rendered();
    expect(email).toMatchObject({
      to: "u_new@mail.example.org.uk",
      from: "Ritesh from QRdx <support@qrdx.dev>",
      replyTo: "support@qrdx.dev",
      subject: "Welcome to QRdx",
      idempotencyKey: "welcome:u_new",
      tags: [{ name: "kind", value: "welcome" }],
    });
    const token = new URL(email.unsubscribeUrl ?? "").searchParams.get("token");
    expect(verifyTeamNotesToken(token ?? "")).toBe("u_new");
    for (const line of [
      "Hi Sam,",
      "QRdx makes QR codes you can change after they're printed",
      "Make a dynamic code.",
      "Watch its scans:",
      "Change where it points whenever you like, even after it's printed.",
      "Static codes stay free, and the codes you make keep working if you change plans or stop paying. Free also includes 10 dynamic codes.",
      "Pro is $5 a month or $48 a year and adds unlimited dynamic codes, 5 custom domains, email alerts at every scan milestone, and a weekly summary if you want one. Local taxes may be added at checkout.",
      "reply to this email. A person reads every reply.",
      "Ritesh from QRdx",
      "You're getting this because you just made a QRdx account.",
      "This email was meant for u_new@mail.example.org.uk.",
      "Unsubscribe",
    ]) {
      expect(text, line).toContain(line);
    }
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) =>
      (m[1] ?? "").replaceAll("&amp;", "&"),
    );
    expect(hrefs).toContain(new URL("/playground", baseUrl).toString());
    // The button makes a code too.
    expect(text).toMatch(/Make your first code \S*\/playground/);
    expect(hrefs).toContain(
      new URL("/dashboard?to=analytics", baseUrl).toString(),
    );
    // The frame every QRdx email shares: the logo on top, signed by a person.
    expect(html).toMatch(
      /<img alt="QRdx"[^>]* src="[^"]*\/email\/qrdx-logo\.png"/,
    );
  });

  it("isn't sent without a personal sender: it promises a person reads replies", async () => {
    state.env.EMAIL_FROM_PERSONAL = undefined;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await sendWelcomeEmail({ userId: "u_new", country: null })).toBe(
      "no_personal_sender",
    );
    expect(state.sent).toHaveLength(0);
  });

  it("isn't sent to an agency's portal client", async () => {
    fakeDb.seed("portalClient", [
      {
        id: "pc_1",
        organizationId: "org_agency",
        email: "u_new@mail.example.org.uk",
      },
    ]);
    expect(await sendWelcomeEmail({ userId: "u_new", country: null })).toBe(
      "portal_client",
    );
    expect(state.sent).toHaveLength(0);
  });

  it("greets 'there' when the name is the address's local part", async () => {
    fakeDb.seed("user", [
      person("u_info", { name: "info", email: "info@shop.example.org.uk" }),
    ]);
    await sendWelcomeEmail({ userId: "u_info", country: null });
    const { text } = await rendered();
    expect(text).toContain("Hi there,");
  });

  it("is in the person's language, with Pro's price in their currency", async () => {
    await sendWelcomeEmail({ userId: "u_es", country: "IN" });
    const { email, html, text } = await rendered();
    expect(email.subject).toBe("Te damos la bienvenida a QRdx");
    expect(html).toMatch(/<html[^>]*lang="es"/);
    // The editor link opens in their language.
    expect(html).toContain(new URL("/es/playground", baseUrl).toString());
    expect(text).toContain("Ana");
    // The language picks the format, the country the currency (lib/pricing.ts).
    expect(text).toMatch(/199\s₹ al mes o 1499\s₹ al año/);
  });

  it("skips people who turned notes off, banned accounts, test addresses and unknown ids", async () => {
    expect(await sendWelcomeEmail({ userId: "u_off", country: null })).toBe(
      "opted_out",
    );
    expect(await sendWelcomeEmail({ userId: "u_banned", country: null })).toBe(
      "banned",
    );
    expect(await sendWelcomeEmail({ userId: "u_test", country: null })).toBe(
      "reserved_address",
    );
    expect(await sendWelcomeEmail({ userId: "u_gone", country: null })).toBe(
      "not_found",
    );
    expect(state.sent).toHaveLength(0);
  });

  it("sends nothing where notes from the team don't exist (self-hosted, no email)", async () => {
    state.teamNotes = false;
    expect(await sendWelcomeEmail({ userId: "u_new", country: null })).toBe(
      "off",
    );
    expect(state.sent).toHaveLength(0);
  });

  it("reports a failed send", async () => {
    state.sendResult = { sent: false, reason: "failed", error: "boom" };
    expect(await sendWelcomeEmail({ userId: "u_new", country: null })).toBe(
      "failed",
    );
  });
});

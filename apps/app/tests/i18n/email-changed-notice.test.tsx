// The "your address was changed" notice (packages/email/templates/email-change.tsx),
// sent to the OLD address by lib/account/email-change-server.tsx. A security
// notice: the account's saved language, else English, never the language of
// the request that changed the address (it may not be the owner's, which is
// why the notice is sent). The device and place in it follow the email's
// language too. Nothing is emailed: sendEmail renders and keeps each email,
// against in-memory tables.
import { render } from "@react-email/render";
import {
  EMAIL_CHANGED_SUBJECT,
  EmailChangedEmail,
  emailChangedSubject,
} from "@repo/email/templates/email-change";
import type { SecurityEventDetails } from "@repo/email/templates/security-parts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENGLISH_EMAIL, emailIntl } from "@/lib/i18n/email";
import es from "@/messages/es.json";
import { fakeDb } from "../support/fake-db";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const state = vi.hoisted(() => ({
  /** The request's language menu cookie (NEXT_LOCALE), if any */
  cookie: null as string | null,
  sent: [] as { to: string; subject: string; html: string }[],
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
  headers: async () =>
    new Headers({
      "user-agent": CHROME_MAC,
      "x-real-ip": "198.51.100.7",
      "x-vercel-ip-city": "Berlin",
      "x-vercel-ip-country": "DE",
      "x-vercel-ip-timezone": "Europe/Berlin",
      ...(state.cookie ? { cookie: `NEXT_LOCALE=${state.cookie}` } : {}),
    }),
  cookies: async () => ({
    get: (name: string) =>
      name === "NEXT_LOCALE" && state.cookie
        ? { name, value: state.cookie }
        : undefined,
  }),
}));
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => true,
}));
vi.mock("@/lib/polar", () => ({ isBillingConfigured: false, polar: {} }));
// Outside production the helper only logs; here it sends.
vi.mock("@/lib/account/email-change", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account/email-change")>()),
  deliverEmailChangedNotice: async (
    _notice: unknown,
    deps: { send: () => Promise<unknown> },
  ) => {
    await deps.send();
    return "emailed";
  },
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async ({
    to,
    subject,
    react,
  }: {
    to: string;
    subject: string;
    react: React.ReactElement;
  }) => {
    state.sent.push({ to, subject, html: await render(react) });
    return { sent: true };
  },
}));

const { afterEmailChanged } = await import("@/lib/account/email-change-server");

const details: SecurityEventDetails = {
  device: "Chrome on macOS",
  location: "Berlin, Germany",
  ip: "198.51.100.7",
  time: "Nov 18, 2026, 1:00 PM GMT+1",
};

// React separates adjacent text and values with comments; mail clients
// ignore them.
const html = async (element: React.ReactElement) =>
  (await render(element)).replaceAll("<!-- -->", "");

function account(locale: string | null) {
  fakeDb.seed("user", [
    {
      id: "u_1",
      name: "Ana",
      email: "new@example.com",
      locale,
    },
  ]);
}

beforeEach(() => {
  fakeDb.reset();
  state.sent = [];
  state.cookie = null;
  vi.stubEnv("VERCEL", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the email-changed notice", () => {
  it("renders in Spanish with a Spanish translator", async () => {
    const intl = await emailIntl("es");
    const page = await html(
      <EmailChangedEmail
        details={details}
        intl={intl}
        newEmail="new@example.com"
      />,
    );
    expect(emailChangedSubject(intl)).toBe(es.emails.emailChanged.subject);
    expect(page).toContain('lang="es"');
    expect(page).toContain(es.emails.emailChanged.subject);
    expect(page).toContain(
      "Tu cuenta de QRdx ahora usa <strong>new@example.com</strong>.",
    );
    expect(page).toContain(es.emails.emailChanged.reason);
    expect(page).toContain(es.emails.security.nothingElse);
    expect(page).toContain(es.emails.security.review);
    expect(page).toContain('href="mailto:support@qrdx.dev"');
    expect(page).not.toContain("Your QRdx");
  });

  it("is unchanged in English", async () => {
    expect(emailChangedSubject(ENGLISH_EMAIL)).toBe(EMAIL_CHANGED_SUBJECT);
    const page = await html(
      <EmailChangedEmail
        intl={ENGLISH_EMAIL}
        details={details}
        newEmail="new@example.com"
      />,
    );
    expect(page).toContain('lang="en"');
    expect(page).toContain("Your QRdx email was changed");
    expect(page).toContain(
      "Your QRdx account now uses <strong>new@example.com</strong>. Sign-in codes and team invitations go there from now on.",
    );
    expect(page).toContain(
      "You got this email because this address was the email for a QRdx account.",
    );
    expect(page).toContain(
      'contact support at <a href="mailto:support@qrdx.dev"',
    );
    const text = await render(
      <EmailChangedEmail
        intl={ENGLISH_EMAIL}
        details={details}
        newEmail="new@example.com"
      />,
      { plainText: true },
    );
    expect(text).toContain("Your QRdx account now uses new@example.com.");
    expect(text).toContain("If this was you, there's nothing else to do.");
    expect(text).toContain(
      "If this wasn't you, contact support at support@qrdx.dev from this address straight away, and we'll help you get your account back.",
    );
  });

  it("goes out in the account's saved language, not the request's", async () => {
    account("es");
    state.cookie = "de";
    await afterEmailChanged({
      userId: "u_1",
      previousEmail: "old@example.com",
      newEmail: "new@example.com",
    });
    expect(state.sent).toHaveLength(1);
    const [email] = state.sent;
    expect(email.to).toBe("old@example.com");
    // The footer names the old address, the one it went to.
    expect(email.html).toContain(">old@example.com</span>");
    expect(email.subject).toBe(es.emails.emailChanged.subject);
    // The device and place in the email's language too.
    expect(email.html).toContain("Chrome en macOS");
    expect(email.html).toContain("Berlin, Alemania");
    expect(email.html).toContain(es.emails.security.device);
  });

  it("goes out in English for an account without one, whatever the request's language", async () => {
    account(null);
    state.cookie = "es";
    await afterEmailChanged({
      userId: "u_1",
      previousEmail: "old@example.com",
      newEmail: "new@example.com",
    });
    expect(state.sent).toHaveLength(1);
    const [email] = state.sent;
    expect(email.subject).toBe(EMAIL_CHANGED_SUBJECT);
    expect(email.html).toContain("Chrome on macOS");
    expect(email.html).toContain("Berlin, Germany");
  });

  it("names support, in the account's language, when support moved it", async () => {
    account("es");
    await afterEmailChanged({
      userId: "u_1",
      previousEmail: "old@example.com",
      newEmail: "new@example.com",
      bySupport: true,
    });
    const [email] = state.sent;
    expect(email.html).toContain(es.emails.security.support);
    expect(email.html).not.toContain("Chrome en macOS");
  });
});

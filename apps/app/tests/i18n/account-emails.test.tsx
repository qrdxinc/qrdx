// The account and security emails in the recipient's language: the
// "Confirm it's you" code, the new sign-in alert, the passkey, two-step
// verification and payout address notices. Each template renders in Spanish
// with a Spanish translator and in English by default; the senders pick the
// language by the rules in lib/i18n/email-locale.ts (a code the person asked
// for: their account's language, else the language menu's cookie; a security
// notice: the account's language, else English, never the request's).
// Nothing is emailed: sendEmail is captured, against in-memory tables.
import { render } from "@react-email/render";
import {
  CONFIRMATION_CODE_SUBJECT,
  ConfirmationCodeEmail,
  confirmationCodeSubject,
} from "@repo/email/templates/confirmation-code";
import {
  NEW_SIGN_IN_SUBJECT,
  NewSignInEmail,
  newSignInSubject,
} from "@repo/email/templates/new-sign-in";
import {
  PASSKEY_NOTICE_SUBJECTS,
  PasskeyNoticeEmail,
  passkeyNoticeSubject,
} from "@repo/email/templates/passkey-notice";
import {
  PAYOUT_EMAIL_NOTICE_SUBJECT,
  PayoutEmailNoticeEmail,
  payoutEmailNoticeSubject,
} from "@repo/email/templates/payout-email-notice";
import type { SecurityEventDetails } from "@repo/email/templates/security-parts";
import {
  backupCodesLeftText,
  TwoFactorNoticeEmail,
  twoFactorNoticeLines,
  twoFactorNoticeSubject,
} from "@repo/email/templates/two-factor-notice";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInMethodLabel } from "@/lib/account/new-sign-in-notice";
import { ENGLISH_EMAIL, emailIntl } from "@/lib/i18n/email";
import { formatSecurityTime } from "@/lib/security/request-details";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  /** The request's language menu cookie (NEXT_LOCALE), if any */
  cookie: null as string | null,
  sent: [] as { to: string; subject: string; html: string }[],
  /** The delivery helpers only log outside production; here they send. */
  sendNow: async (_notice: unknown, deps: { send: () => unknown }) => {
    await deps.send();
    return "emailed" as const;
  },
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
      "user-agent": "test",
      ...(state.cookie ? { cookie: `NEXT_LOCALE=${state.cookie}` } : {}),
    }),
  cookies: async () => ({
    get: (name: string) =>
      name === "NEXT_LOCALE" && state.cookie
        ? { name, value: state.cookie }
        : undefined,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({
  after: (run: () => unknown) => {
    void run();
  },
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => true,
}));
// Every email is rendered and kept, never sent.
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
vi.mock("@/lib/auth/sign-in-code-delivery", () => ({
  addressKey: (email: string) => email,
  addressMayRequestCode: async () => true,
  deliverSignInCode: state.sendNow,
}));
vi.mock("@/lib/account/passkeys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account/passkeys")>()),
  deliverPasskeyNotice: state.sendNow,
}));
vi.mock("@/lib/account/two-factor-notice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account/two-factor-notice")>()),
  deliverTwoFactorNotice: state.sendNow,
}));
vi.mock("@/lib/account/new-sign-in-notice", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/account/new-sign-in-notice")
  >()),
  deliverNewSignInNotice: state.sendNow,
}));
// "Confirm it's you" for a signed-in account without two-step verification.
vi.mock("@/lib/account/session-origin-server", () => ({
  getSessionAllowingHold: async () => ({
    user: { id: "user_1", email: "ada@qrdx.test" },
    session: { id: "session_1", createdAt: new Date() },
  }),
  isSessionHeld: async () => false,
  moveSessionOrigin: async () => {},
}));
vi.mock("@/lib/account/reauth", () => ({ signInCodesAvailable: () => true }));
vi.mock("@/lib/account/two-factor-server", () => ({
  loadTwoFactorFacts: async () => ({ on: false, row: null, passkeys: 0 }),
  countBackupCodes: async () => 3,
  clearCodeFailures: async () => {},
  passkeysWorkHere: () => true,
  releaseCodeAttempt: async () => {},
  reserveCodeAttempt: async () => ({ ok: false, reason: "off" }),
}));
vi.mock("@/lib/account/two-factor-reset-server", () => ({
  cancelTwoFactorResetQuietly: async () => {},
}));
vi.mock("@/lib/account/linked-sign-ins-server", () => ({
  linkedSignInsFor: async () => [],
}));

const confirmation = await import("@/lib/account/confirmation-server");
const passkeys = await import("@/lib/account/passkeys-server");
const twoFactor = await import("@/lib/account/two-factor-notice-server");
const payouts = await import("@/lib/affiliates/paypal-notice-server");
const newSignIn = await import("@/lib/account/new-sign-in-notice-server");

const EMAIL = "ada@qrdx.test";
const DETAILS: SecurityEventDetails = {
  device: "Chrome on macOS",
  location: "Mumbai, India",
  ip: "203.0.113.24",
  time: "7 nov 2026, 15:04 GMT+5:30",
};

const text = (element: React.ReactElement) =>
  render(element, { plainText: true });

/** The account, with a saved language or none. */
function account(locale: string | null) {
  fakeDb.reset();
  fakeDb.seed("user", [
    {
      id: "user_1",
      email: EMAIL,
      name: "Ada",
      locale,
      twoFactorEnabled: false,
    },
  ]);
}

/** Every security notice the account can get, sent once each. */
async function sendSecurityNotices() {
  await passkeys.sendPasskeyNotice({
    email: EMAIL,
    change: "added",
    passkeyName: "MacBook",
  });
  await twoFactor.sendTwoFactorNotice("on", EMAIL);
  await payouts.sendPayoutEmailNotice({
    email: EMAIL,
    paypalEmail: "ada@example.com",
    replaced: true,
  });
  await newSignIn.notifyNewSignIn({
    user: { id: "user_1", email: EMAIL, name: "Ada" },
    method: "google",
    secondStep: null,
    headers: new Headers({ "user-agent": "test" }),
  });
  // notifyNewSignIn sends from after(): let it finish.
  await vi.waitFor(() => expect(state.sent).toHaveLength(4));
  return state.sent.map((email) => email.subject);
}

const subjectsIn = (emails: typeof es.emails) => [
  emails.passkeyNotice.added.subject,
  emails.twoFactorNotice.on.subject,
  emails.payoutEmailNotice.subject,
  emails.newSignIn.subject,
];

beforeEach(() => {
  state.cookie = null;
  state.sent = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("the account and security emails in Spanish", async () => {
  const intl = await emailIntl("es");
  const t = es.emails;

  it("the confirmation code", async () => {
    expect(confirmationCodeSubject(intl)).toBe(t.confirmationCode.subject);
    const element = (
      <ConfirmationCodeEmail
        code="503118"
        details={DETAILS}
        expiresInMinutes={10}
        intl={intl}
      />
    );
    const html = await render(element);
    const plain = await text(element);
    expect(html).toContain('lang="es"');
    expect(plain).toContain(t.confirmationCode.enter);
    expect(plain).toContain("503118");
    expect(plain).toContain("10 minutos");
    // Label and value are table columns in the plain text (DetailsTable).
    expect(plain).toContain(`${t.security.device}   Chrome on macOS`);
    expect(plain).toContain(t.security.review);
    expect(html).toContain('href="mailto:support@qrdx.dev"');
  });

  it("the new sign-in alert, with how they signed in", async () => {
    expect(newSignInSubject(intl)).toBe(t.newSignIn.subject);
    const method = signInMethodLabel("email-otp", "passkey", intl);
    expect(method).toBe(
      `${t.newSignIn.methods.emailOtp} y después ${t.newSignIn.secondSteps.passkey}`,
    );
    expect(signInMethodLabel("google", null, intl)).toBe("Google");
    const element = (
      <NewSignInEmail details={DETAILS} intl={intl} method={method} />
    );
    const plain = await text(element);
    expect(plain).toContain(t.newSignIn.body);
    expect(plain).toContain(t.newSignIn.signOut);
    expect(plain).toContain(`${t.newSignIn.signedInWith}   ${method}`);
    // The inbox preview, with the place.
    expect(await render(element)).toContain(
      "Chrome on macOS inició sesión en tu cuenta de QRdx cerca de Mumbai, India.",
    );
  });

  it("the passkey notices", async () => {
    for (const change of ["added", "removed"] as const) {
      expect(passkeyNoticeSubject(change, intl)).toBe(
        t.passkeyNotice[change].subject,
      );
      const html = await render(
        <PasskeyNoticeEmail
          change={change}
          details={DETAILS}
          intl={intl}
          passkeyName="MacBook"
        />,
      );
      expect(html).toContain('lang="es"');
      expect(html).toContain("<strong>MacBook</strong>");
      expect(html).toContain(t.passkeyNotice.reason);
    }
  });

  it("the two-step verification notices, with the day and the codes left", async () => {
    expect(twoFactorNoticeSubject("off", intl)).toBe(
      t.twoFactorNotice.off.subject,
    );
    const plain = await text(
      <TwoFactorNoticeEmail details={DETAILS} intl={intl} kind="off" />,
    );
    expect(plain).toContain(t.twoFactorNotice.off.body);
    expect(plain).toContain(t.security.nothingElse);
    expect(
      twoFactorNoticeLines(
        "support-reset-scheduled",
        { dueAt: new Date("2026-11-16T00:00:00.000Z") },
        intl,
      )[1],
    ).toContain("16 de noviembre de 2026 (UTC)");
    expect(backupCodesLeftText(1, intl)).toBe(
      `Te queda 1 código de respaldo. ${t.twoFactorNotice.backupCodeUsed.makeNew}`,
    );
    expect(backupCodesLeftText(0, intl)).toMatch(
      /^Ese era tu último código de respaldo\./,
    );
  });

  it("the payout address notice", async () => {
    expect(payoutEmailNoticeSubject(intl)).toBe(t.payoutEmailNotice.subject);
    const html = await render(
      <PayoutEmailNoticeEmail
        details={DETAILS}
        intl={intl}
        paypalEmail="ada@example.com"
        recipient="sam@example.com"
        replaced
      />,
    );
    expect(html).toContain(
      "Se cambió la dirección de PayPal de tus pagos de afiliado.",
    );
    expect(html).toContain("<strong>ada@example.com</strong>");
    // The footer names the account's address, in Spanish too.
    expect(html).toMatch(/Este correo era para <span[^>]*>sam@example\.com</);
  });

  it("the time of the request, in the email's language", () => {
    const now = new Date("2026-11-07T09:34:00Z");
    expect(formatSecurityTime(now, "Asia/Kolkata", "es")).toBe(
      "7 nov 2026, 15:04 GMT+5:30",
    );
    expect(formatSecurityTime(now, "Asia/Kolkata")).toBe(
      "Nov 7, 2026, 3:04 PM GMT+5:30",
    );
  });
});

describe("in English, as before", () => {
  it("keeps the subjects", () => {
    expect(confirmationCodeSubject(ENGLISH_EMAIL)).toBe(
      CONFIRMATION_CODE_SUBJECT,
    );
    expect(newSignInSubject(ENGLISH_EMAIL)).toBe(NEW_SIGN_IN_SUBJECT);
    expect(passkeyNoticeSubject("removed", ENGLISH_EMAIL)).toBe(
      PASSKEY_NOTICE_SUBJECTS.removed,
    );
    expect(payoutEmailNoticeSubject(ENGLISH_EMAIL)).toBe(
      PAYOUT_EMAIL_NOTICE_SUBJECT,
    );
    expect(twoFactorNoticeSubject("on", ENGLISH_EMAIL)).toBe(
      en.emails.twoFactorNotice.on.subject,
    );
    expect(signInMethodLabel("email-otp", "totp")).toBe(
      "Email code, then an authenticator code",
    );
  });
});

describe("which language each email goes out in", () => {
  it("a security notice: the account's saved language, not the request's", async () => {
    account("es");
    state.cookie = "de";
    expect(await sendSecurityNotices()).toEqual(subjectsIn(es.emails));
    for (const email of state.sent) {
      expect(email.to).toBe(EMAIL);
      expect(email.html).toContain('lang="es"');
    }
  });

  it("a security notice for an account without one: English, whatever the request's language", async () => {
    account(null);
    state.cookie = "es";
    expect(await sendSecurityNotices()).toEqual(subjectsIn(en.emails));
    for (const email of state.sent) expect(email.html).toContain('lang="en"');
  });

  it("the confirmation code: the request's language when the account has none", async () => {
    account(null);
    state.cookie = "es";
    expect(await confirmation.sendConfirmationCode()).toEqual({ ok: true });
    expect(state.sent.map((email) => email.subject)).toEqual([
      es.emails.confirmationCode.subject,
    ]);
    expect(state.sent[0].html).toContain(es.emails.confirmationCode.enter);
  });

  it("the confirmation code: the account's language before the request's", async () => {
    account("de");
    state.cookie = "es";
    expect(await confirmation.sendConfirmationCode()).toEqual({ ok: true });
    expect(state.sent.map((email) => email.subject)).toEqual([
      de.emails.confirmationCode.subject,
    ]);
  });
});

// "Confirm it's you" and the session check, in another language: what the
// server answers (wrong codes, rate limits, passkey refusals, signing in
// again) comes in the person's language, which the dialog and the check page
// show as it is. That language is the app's rule (lib/i18n/app-locale.ts,
// run for real here): the saved one, else the language menu's cookie, else
// English. Only next-intl's server entry, which needs Next's plugin, is
// swapped for what i18n/request.ts does: the locale's catalog over English.
// Also: the "Open Gmail" button, the check page's title and copy, and the
// catalog's copies of the server's English.
import type { Locale } from "@repo/i18n/config";
import { mergeMessages, pickMessages } from "@repo/i18n/messages";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIGN_IN_NAMESPACES } from "@/lib/i18n/playground";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { fakeDb } from "../support/fake-db";

const USER = "user_1";
const SESSION = "session_1";

const state = vi.hoisted(() => ({
  signedIn: true,
  email: "ada@gmail.com",
  /** The language menu's cookie (NEXT_LOCALE), if any */
  cookieLocale: undefined as string | undefined,
  /** Every other cookie the browser sends */
  jar: new Map<string, string>(),
  limited: false,
  errors: [] as string[],
}));

const authError = (code: string) =>
  Object.assign(new Error(code), { body: { code } });

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", async () => {
  const { LOCALE_COOKIE: localeCookie } = await import("@repo/i18n/config");
  return {
    headers: async () =>
      new Headers({ host: "localhost:3000", "user-agent": "test" }),
    cookies: async () => ({
      get: (name: string) => {
        const value =
          name === localeCookie ? state.cookieLocale : state.jar.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string, options?: { maxAge?: number }) => {
        if (options?.maxAge === 0) state.jar.delete(name);
        else state.jar.set(name, value);
      },
    }),
  };
});
// What i18n/request.ts gives getTranslations: the locale's catalog over
// English.
vi.mock("next-intl/server", async () => {
  const { createTranslator: translator } = await import("next-intl");
  const { loadMessages } = await import("@/lib/i18n/messages");
  return {
    getTranslations: async ({
      locale,
      namespace,
    }: {
      locale: Locale;
      namespace?: string;
    }) =>
      translator({
        locale,
        messages: await loadMessages(locale),
        namespace: namespace as never,
      }),
  };
});
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
    back: () => undefined,
    forward: () => undefined,
  }),
}));
vi.mock("next/server", () => ({
  after: (run: () => unknown) => {
    void run();
  },
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({
    limit: async () => ({ success: !state.limited }),
  }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/passkey", () => ({ cookiesToSet: () => [] }));
vi.mock("@repo/auth/passkey-rp", () => ({
  passkeyRelyingParty: () => ({ rpID: "localhost", origin: "x" }),
  isPasskeyOrigin: () => true,
}));
vi.mock("@repo/auth/client", () => ({ authClient: {} }));
vi.mock("@/lib/account/reauth", () => ({ signInCodesAvailable: () => true }));
vi.mock("@/lib/account/linked-sign-ins-server", () => ({
  linkedSignInsFor: async () => [],
}));
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => false,
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async () => ({ sent: true }),
}));
vi.mock("@/lib/shared", () => ({
  logError: (error: Error) => state.errors.push(error.message),
}));
vi.mock("@/lib/account/two-factor-notice-server", () => ({
  sendBackupCodeUsedNotice: async () => {},
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.signedIn
          ? {
              user: { id: "user_1", email: state.email },
              session: { id: "session_1", createdAt: new Date() },
            }
          : null,
      // A passkey that didn't check the person (no PIN, fingerprint or face).
      verifyPasskeyAuthentication: async () => {
        throw authError("PASSKEY_USER_VERIFICATION_REQUIRED");
      },
    },
  },
}));

const actions = await import("@/components/confirm-identity/actions");
const { CONFIRMATION_MESSAGES, confirmationMessages } = await import(
  "@/lib/account/confirmation"
);
const { PASSKEY_MESSAGES, passkeyMessages } = await import(
  "@/lib/account/passkeys"
);
const { checkSession } = await import(
  "@/app/(app)/(auth)/session-check/_lib/actions"
);
const { generateMetadata } = await import(
  "@/app/(app)/(auth)/session-check/page"
);
const { SessionCheck } = await import(
  "@/app/(app)/(auth)/session-check/session-check"
);

const spanish = mergeMessages(en, es);

/** The Spanish for an English string, checked to be a translation. */
function translated(english: string, spanishText: string): string {
  expect(spanishText).toBeTruthy();
  expect(spanishText).not.toBe(english);
  return spanishText;
}

/** The account, with the language it saved in Settings, if any. */
function account({
  locale = null,
  passkeys = 0,
}: {
  locale?: string | null;
  passkeys?: number;
} = {}) {
  fakeDb.seed("user", [
    { id: USER, email: state.email, twoFactorEnabled: false, locale },
  ]);
  for (let i = 1; i <= passkeys; i++) {
    fakeDb.seed("passkey", [
      { id: `pk_${i}`, userId: USER, name: `Key ${i}`, credentialID: `c${i}` },
    ]);
  }
}

/** An emailed code waiting for this session, whatever was typed. */
function codeSent() {
  fakeDb.seed("verification", [
    {
      id: "code_1",
      identifier: `qrdx-confirm-code-${SESSION}`,
      value: JSON.stringify({ userId: USER, attempts: 0, hash: "not-it" }),
      expiresAt: new Date(Date.now() + 600_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
}

beforeEach(() => {
  fakeDb.resetAll();
  state.signedIn = true;
  state.email = "ada@gmail.com";
  state.cookieLocale = undefined;
  state.jar = new Map();
  state.limited = false;
  state.errors = [];
});

describe("Confirm it's you, with the language menu on Spanish", () => {
  beforeEach(() => {
    state.cookieLocale = "es";
  });

  it("says a wrong emailed code and too many tries in Spanish", async () => {
    account();
    codeSent();
    expect(await actions.confirmWithEmailCode({ code: "123456" })).toEqual({
      ok: false,
      error: translated(
        en.auth.confirmationMessages.wrongCode,
        es.auth.confirmationMessages.wrongCode,
      ),
    });
    state.limited = true;
    expect(await actions.confirmWithEmailCode({ code: "123456" })).toEqual({
      ok: false,
      error: translated(
        en.auth.confirmationMessages.rateLimited,
        es.auth.confirmationMessages.rateLimited,
      ),
    });
    expect(state.errors).toEqual([]);
  });

  it("says a code that's gone, and that it is, in Spanish", async () => {
    account();
    expect(await actions.confirmWithEmailCode({ code: "123456" })).toEqual({
      ok: false,
      error: translated(
        en.auth.confirmationMessages.codeExpired,
        es.auth.confirmationMessages.codeExpired,
      ),
      codeDead: true,
    });
  });

  it("says a backup code that isn't one in Spanish (the two-step copy)", async () => {
    account();
    expect(await actions.confirmWithCode({ code: "not a code!" })).toEqual({
      ok: false,
      error: translated(
        en.auth.twoFactorMessages.invalidBackupCode,
        es.auth.twoFactorMessages.invalidBackupCode,
      ),
    });
  });

  it("says a passkey that didn't check the person in Spanish", async () => {
    account({ passkeys: 1 });
    expect(await actions.confirmWithPasskey({ response: {} })).toEqual({
      ok: false,
      error: translated(
        en.auth.passkeyMessages.noUserVerification,
        es.auth.passkeyMessages.noUserVerification,
      ),
    });
  });

  it("says why signing in again didn't confirm, in Spanish", async () => {
    account();
    expect(
      await actions.finishSignInConfirmation({
        failed: true,
        error: "account_not_linked",
      }),
    ).toEqual({
      ok: false,
      error: translated(
        en.auth.confirmationMessages.signInNotLinked,
        es.auth.confirmationMessages.signInNotLinked,
      ),
    });
    // Back without the cookie that started it (another browser).
    expect(
      await actions.finishSignInConfirmation({ failed: false, error: null }),
    ).toEqual({
      ok: false,
      error: translated(
        en.auth.confirmationMessages.signInFailed,
        es.auth.confirmationMessages.signInFailed,
      ),
    });
  });

  it("labels the webmail button in Spanish, keeping the provider's name", async () => {
    account();
    const label = translated(
      en.auth.mailProvider.open,
      es.auth.mailProvider.open,
    );
    const result = await actions.getConfirmationOptions();
    expect(result.ok && result.options.mailProvider).toEqual({
      label: label.replace("{provider}", "Gmail"),
      href: "https://mail.google.com/mail/",
    });
    expect(result.ok && result.options.mailProvider?.label).toContain("Gmail");
  });

  it("says signed out in Spanish", async () => {
    state.signedIn = false;
    expect(await actions.getConfirmationOptions()).toEqual({
      ok: false,
      error: translated(
        en.auth.confirmationMessages.signedOut,
        es.auth.confirmationMessages.signedOut,
      ),
    });
  });
});

describe("whose language it is", () => {
  it("is the account's saved one over the language menu's", async () => {
    account({ locale: "es" });
    state.cookieLocale = "fr";
    codeSent();
    expect(await actions.confirmWithEmailCode({ code: "123456" })).toEqual({
      ok: false,
      error: es.auth.confirmationMessages.wrongCode,
    });
  });

  it("is English, as before, with neither", async () => {
    account();
    codeSent();
    expect(await actions.confirmWithEmailCode({ code: "123456" })).toEqual({
      ok: false,
      error: "That code isn't right. Check the email and try again.",
    });
    state.limited = true;
    expect(await actions.confirmWithEmailCode({ code: "123456" })).toEqual({
      ok: false,
      error: "Too many tries. Wait a few minutes and try again.",
    });
    state.limited = false;
    expect(await actions.confirmWithPasskey({ response: {} })).toEqual({
      ok: false,
      error: CONFIRMATION_MESSAGES.passkeyUnavailable,
    });
    const options = await actions.getConfirmationOptions();
    expect(options.ok && options.options.mailProvider?.label).toBe(
      "Open Gmail",
    );
    state.email = "ada@outlook.com";
    const outlook = await actions.getConfirmationOptions();
    expect(outlook.ok && outlook.options.mailProvider?.label).toBe(
      "Open Outlook",
    );
  });
});

describe("the session check", () => {
  const inSpanish = (node: ReactNode) =>
    renderToStaticMarkup(
      <NextIntlClientProvider
        locale="es"
        messages={pickMessages(spanish, SIGN_IN_NAMESPACES)}
        timeZone="UTC"
      >
        {node}
      </NextIntlClientProvider>,
    );
  const check = es.app.sessionCheck.sessionCheck;
  const english = en.app.sessionCheck.sessionCheck;

  it("asks in Spanish, with the page's title", async () => {
    state.cookieLocale = "es";
    expect((await generateMetadata()).title).toBe(
      translated(english.title, check.title),
    );
    const html = inSpanish(<SessionCheck next="/dashboard" returning />);
    expect(html).toContain(translated(english.title, check.title));
    expect(html).toContain(translated(english.body, check.body));
  });

  it("says signed out in Spanish", async () => {
    state.cookieLocale = "es";
    state.signedIn = false;
    expect(await checkSession()).toEqual({
      ok: false,
      error: translated(english.signedOut, check.signedOut),
    });
  });

  it("keeps its English", async () => {
    state.signedIn = false;
    expect(await checkSession()).toEqual({
      ok: false,
      error: "Sign in again to continue.",
    });
    expect((await generateMetadata()).title).toBe("Confirm it's you");
    expect(english).toMatchObject({
      title: "Confirm it's you",
      body: "This sign-in is being used from a different country and a different browser than where it started. Confirm it's you to keep going.",
      signedOut: "Sign in again to continue.",
      failed: "Something went wrong. Check your connection and try again.",
    });
  });
});

describe("the catalog's copies of the server's English", () => {
  it("match CONFIRMATION_MESSAGES, every one", () => {
    const t = createTranslator({
      locale: "en",
      messages: en,
      namespace: "auth.confirmationMessages",
    });
    expect(confirmationMessages(t)).toEqual(CONFIRMATION_MESSAGES);
  });

  it("match PASSKEY_MESSAGES, every one", () => {
    const t = createTranslator({
      locale: "en",
      messages: en,
      namespace: "auth.passkeyMessages",
    });
    expect(passkeyMessages(t)).toEqual(PASSKEY_MESSAGES);
  });
});

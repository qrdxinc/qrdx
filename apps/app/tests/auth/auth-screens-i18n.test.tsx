// The sign-in screens in another language: their copy comes from the
// catalog (auth, app.signIn), the page title too, and the messages built
// outside React (sign-in errors, backup code problems) take the page's
// translator. The catalog's copies of English the server still sends
// (TWO_FACTOR_MESSAGES, CONFIRMATION_MESSAGES) must match it. The sign-out
// screen: sign-out-screen-i18n.test.tsx.
import { LOCKOUT_MINUTES } from "@repo/auth/sign-in-challenge-rules";
import { mergeMessages, pickMessages } from "@repo/i18n/messages";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SIGN_IN_NAMESPACES } from "@/lib/i18n/playground";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
// The panel's hooks outside an app router: a static render needs none of
// their behavior.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
    back: () => undefined,
    forward: () => undefined,
  }),
  usePathname: () => "/sign-in",
  useSearchParams: () => new URLSearchParams(),
}));
// The person's language on app pages, here Spanish.
const spanish = mergeMessages(en, es);
vi.mock("@/lib/i18n/app-locale", () => ({
  getAppTranslations: async (namespace: string) =>
    createTranslator({
      locale: "es",
      messages: spanish,
      namespace: namespace as never,
    }),
}));

const { SignInPage } = await import("@/app/(app)/(auth)/sign-in/sign-in-page");
const { generateMetadata } = await import("@/app/(app)/(auth)/sign-in/page");
const { signInErrorMessage } = await import(
  "@/app/(app)/(auth)/sign-in/_lib/error-message"
);
const { backupCodeProblem } = await import(
  "@/app/(app)/(auth)/components/second-step"
);
const { TWO_FACTOR_MESSAGES, twoFactorMessages } = await import(
  "@/lib/auth/two-factor"
);
const { CONFIRMATION_MESSAGES, CONFIRMATION_REASONS } = await import(
  "@/lib/account/confirmation"
);

/** Rendered with only the catalog parts the sign-in layout sends. */
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

/** The Spanish for an English string, checked to be a translation. */
function translated(english: string, spanishText: string): string {
  expect(spanishText).toBeTruthy();
  expect(spanishText).not.toBe(english);
  return spanishText;
}

/** As React writes text into HTML. */
const escaped = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("'", "&#x27;")
    .replaceAll('"', "&quot;");

describe("/sign-in in Spanish", () => {
  const errors = createTranslator({
    locale: "es",
    messages: spanish,
    namespace: "auth.signInErrors",
  });

  it("says why a sign-in was refused, naming the provider", () => {
    const expected = translated(
      en.auth.signInErrors.accountNotLinked,
      es.auth.signInErrors.accountNotLinked,
    ).replace("{provider}", "GitHub");
    expect(signInErrorMessage("account_not_linked", "github", errors)).toBe(
      expected,
    );
    const html = inSpanish(
      <SignInPage
        error="account_not_linked"
        next="/dashboard"
        signedOut={false}
        via="github"
      />,
    );
    expect(html).toContain(escaped(expected));
  });

  it("says the person is signed out", () => {
    expect(inSpanish(<SignInPage next="/dashboard" signedOut />)).toContain(
      escaped(
        translated(
          en.app.signIn.signInPage.signedOut,
          es.app.signIn.signInPage.signedOut,
        ),
      ),
    );
  });

  it("titles the page in the person's language", async () => {
    expect((await generateMetadata()).title).toBe(
      translated(
        en.app.signIn.signInPage.pageTitle,
        es.app.signIn.signInPage.pageTitle,
      ),
    );
  });

  it("joins look-alike characters with the language's own word", () => {
    const step = createTranslator({
      locale: "es",
      messages: spanish,
      namespace: "auth.secondStep",
    });
    const or = translated(
      en.auth.secondStep.backupCode.or,
      es.auth.secondStep.backupCode.or,
    );
    expect(backupCodeProblem("ABCD0-FGH21", step)).toBe(
      es.auth.secondStep.backupCode.lookalikes.replace(
        "{chars}",
        or.replace("{first}", '"0"').replace("{second}", '"1"'),
      ),
    );
  });
});

describe("the catalog's copies of English the server still sends", () => {
  it("match TWO_FACTOR_MESSAGES", () => {
    const t = createTranslator({
      locale: "en",
      messages: en,
      namespace: "auth.twoFactorMessages",
    });
    expect(twoFactorMessages(t)).toEqual(TWO_FACTOR_MESSAGES);
  });

  it("match CONFIRMATION_MESSAGES and CONFIRMATION_REASONS", () => {
    for (const [key, english] of Object.entries(en.auth.confirmationMessages)) {
      expect(
        CONFIRMATION_MESSAGES[key as keyof typeof CONFIRMATION_MESSAGES],
        key,
      ).toBe(english);
    }
    expect(en.auth.confirmIdentityDialog.reasons).toEqual(CONFIRMATION_REASONS);
  });
});

describe("the second step's English", () => {
  const t = createTranslator({
    locale: "en",
    messages: en,
    namespace: "auth.secondStep",
  });

  it("is what it was before it moved to the catalog", () => {
    expect(t("passkey.locked", { minutes: LOCKOUT_MINUTES })).toBe(
      `Too many failed tries in a row. Try again in ${LOCKOUT_MINUTES} minutes.`,
    );
    expect(backupCodeProblem("AB!DE-FG#23", t)).toBe(
      'Backup codes only have letters and digits. Remove "!" or "#".',
    );
    expect(backupCodeProblem("ABC01-OIH23", t)).toBe(
      'Backup codes never use "0" or "1" or "O" or "I". Check for a look-alike letter or digit.',
    );
  });
});

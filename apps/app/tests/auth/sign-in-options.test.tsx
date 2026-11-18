// The sign-in panel shows only the ways in this server can run
// (lib/auth/sign-in-options.ts): Google and GitHub with their client id and
// secret, email codes where a code can reach someone. First the server's
// answer from its real environment, through the delivery guard and the
// feature rules, against the rule it sends codes by; then the panel as the
// /sign-in page renders it for (a) nothing set, (b) GitHub only, (c) Resend
// only. The clean-machine self-host test of 18 Nov 2026 (Docker Compose,
// localhost, no OAuth app, no Resend) showed every button and "Code sent"
// for a code that never went out.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInPage } from "@/app/(app)/(auth)/sign-in/sign-in-page";
import { OAuthSignIn } from "@/app/(app)/oauth/authorize/oauth-sign-in";
import type { SignInOptions } from "@/lib/auth/sign-in-options";
import en from "@/messages/en.json";
import { renderIntl } from "../support/intl";

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

/** A catalog string as it appears in rendered HTML (apostrophes escaped). */
const escaped = <T extends Record<string, string>>(strings: T): T =>
  Object.fromEntries(
    Object.entries(strings).map(([key, value]) => [
      key,
      value.replaceAll("'", "&#x27;"),
    ]),
  ) as T;

const panel = escaped(en.auth.signInPanel);
const emailForm = escaped(en.auth.emailCodeSignIn);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** The server's answer with only `env` set, as `nodeEnv` runs. */
async function serverOptions(
  nodeEnv: "development" | "production",
  env: Record<string, string>,
) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const { getSignInOptions } = await import(
    "@/lib/auth/sign-in-options-server"
  );
  const { signInCodesAvailable } = await import("@/lib/account/reauth");
  return { options: getSignInOptions(), codesSendable: signInCodesAvailable() };
}

const RESEND = {
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "QRdx <a@qr.example.com>",
};
const GITHUB = { GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: "gh-secret" };
const GOOGLE = { GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret" };

describe("what the server offers, from its environment", () => {
  it("offers nothing on the clean-machine Docker test", async () => {
    const { options, codesSendable } = await serverOptions("production", {});
    expect(options).toEqual({
      google: false,
      github: false,
      email: false,
      sso: false,
    });
    expect(codesSendable).toBe(false);
  });

  it("offers GitHub and Google with their credentials", async () => {
    const { options } = await serverOptions("production", {
      ...GITHUB,
      ...GOOGLE,
    });
    expect(options).toMatchObject({ google: true, github: true, email: false });
  });

  it("still offers no email codes on localhost with Resend, as the server can't send them", async () => {
    const { options, codesSendable } = await serverOptions(
      "production",
      RESEND,
    );
    expect(options.email).toBe(false);
    expect(codesSendable).toBe(false);
  });

  it("offers email codes with Resend on the site's own domain", async () => {
    const { options, codesSendable } = await serverOptions("production", {
      ...RESEND,
      NEXT_PUBLIC_APP_URL: "https://qr.example.com",
    });
    expect(options.email).toBe(true);
    expect(codesSendable).toBe(true);
  });

  it("keeps email codes in local dev, where they print in the terminal", async () => {
    const { options, codesSendable } = await serverOptions("development", {});
    expect(options.email).toBe(true);
    expect(codesSendable).toBe(true);
  });
});

const NOTHING: SignInOptions = {
  google: false,
  github: false,
  email: false,
  sso: false,
};

const render = (options: SignInOptions, mode?: "signin" | "signup") =>
  renderIntl(
    <SignInPage
      mode={mode}
      next="/dashboard"
      options={options}
      signedOut={false}
    />,
  );

describe("the sign-in page", () => {
  it("(a) with nothing set, says sign-in isn't set up and points to the self-hosting guide", () => {
    for (const mode of ["signin", "signup"] as const) {
      const html = render(NOTHING, mode);
      expect(html, mode).toContain(panel.signInIsntSetUp);
      expect(html, mode).toContain(panel.thisSiteHasNoEmail);
      expect(html, mode).toContain('href="/docs/self-hosting"');
      for (const dead of [
        `>${panel.google}<`,
        `>${panel.github}<`,
        emailForm.emailMeACode,
        panel.newToQrdxGoogleGithub,
        panel.newToQrdxYourFirst,
      ]) {
        expect(html, `${mode}: ${dead}`).not.toContain(dead);
      }
    }
  });

  it("(b) with GitHub only, shows GitHub alone", () => {
    const html = render({ ...NOTHING, github: true });
    expect(html).toContain(`>${panel.github}<`);
    expect(html).not.toContain(`>${panel.google}<`);
    expect(html).not.toContain(emailForm.emailMeACode);
    // No "or" between GitHub and a form that isn't there.
    expect(html).not.toContain(`>${panel.or}<`);
    expect(html).toContain(panel.newToQrdxYourFirst);
    expect(html).not.toContain(panel.signInIsntSetUp);
  });

  it("(c) with email codes only, shows the email form alone", () => {
    const html = render({ ...NOTHING, email: true });
    expect(html).toContain(emailForm.emailMeACode);
    expect(html).not.toContain(`>${panel.github}<`);
    expect(html).not.toContain(`>${panel.google}<`);
    expect(html).not.toContain(`>${panel.or}<`);
    expect(html).toContain(panel.newToQrdxYourFirst);
  });

  it("with all three, looks as it always has", () => {
    const html = render({
      ...NOTHING,
      google: true,
      github: true,
      email: true,
    });
    for (const text of [
      `>${panel.google}<`,
      `>${panel.github}<`,
      `>${panel.or}<`,
      emailForm.emailMeACode,
      panel.newToQrdxGoogleGithub,
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).not.toContain(panel.signInIsntSetUp);
  });

  it("doesn't suggest an email code for a refused sign-in where there are none", () => {
    const refused = (options: SignInOptions) =>
      renderIntl(
        <SignInPage
          error="google_email_unverified"
          next="/dashboard"
          options={options}
          signedOut={false}
          via="google"
        />,
      );
    const withCodes = refused({ ...NOTHING, google: true, email: true });
    expect(withCodes).toContain("Sign in with an email code instead.");
    const googleOnly = refused({ ...NOTHING, google: true });
    expect(googleOnly).not.toContain("email code");
    expect(googleOnly).toContain("Ask whoever runs this site for help.");
  });
});

describe("the OAuth authorize page, signed out", () => {
  const oauth = escaped(en.app.oauth.authorize.oauthSignIn);
  const callbackURL = "/oauth/authorize?client_id=app_1&scope=codes%3Aread";
  const renderStep = (providers: { google: boolean; github: boolean }) =>
    renderIntl(
      <OAuthSignIn
        app={{ name: "Acme", logoUrl: null }}
        callbackURL={callbackURL}
        providers={providers}
        scopes={[]}
      />,
    );

  it("shows only the providers this server runs", () => {
    const html = renderStep({ google: false, github: true });
    expect(html).toContain(oauth.continueWithGithub);
    expect(html).not.toContain(oauth.continueWithGoogle);
    expect(html).not.toContain(oauth.continueToSignIn);
  });

  it("with neither, hands over to the sign-in page and comes back", () => {
    const html = renderStep({ google: false, github: false });
    expect(html).not.toContain(oauth.continueWithGithub);
    expect(html).not.toContain(oauth.continueWithGoogle);
    expect(html).toContain(oauth.continueToSignIn);
    expect(html).toContain(
      `href="/sign-in?next=${encodeURIComponent(callbackURL)}"`,
    );
  });
});

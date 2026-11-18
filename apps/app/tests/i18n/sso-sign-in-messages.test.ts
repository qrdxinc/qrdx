// Starting an SSO sign-in for an address whose domain has no connection, or
// whose connection can't be used now (packages/auth/ee/sso.ts answers
// SSO_NOT_FOUND / SSO_NOT_AVAILABLE with an English message). The sign-in
// screen shows the reader's language from the code, naming the typed
// address's domain (the one the server looked up), never the server's text.
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SignInErrorTranslator } from "@/ee/sso/messages";
import { loadMessages } from "@/lib/i18n/messages";

const state = vi.hoisted(() => ({
  error: null as null | { status: number; code?: string; message?: string },
}));

vi.mock("@repo/auth/client", () => ({
  authClient: {
    signIn: {
      sso: async () => ({ data: null, error: state.error }),
    },
  },
}));

const { startSsoSignIn } = await import("@/ee/sso/start-sso-sign-in");

async function translator(locale: "en" | "es") {
  return createTranslator({
    locale,
    messages: await loadMessages(locale),
    namespace: "auth.signInErrors",
  }) as unknown as SignInErrorTranslator;
}

// What packages/auth/ee/sso.ts sends for a domain (its English).
const notFound = (domain: string) => ({
  status: 404,
  code: "SSO_NOT_FOUND",
  message: `No SSO is set up for ${domain}.`,
});
const unavailable = (domain: string) => ({
  status: 403,
  code: "SSO_NOT_AVAILABLE",
  message: `SSO for ${domain} isn't available right now. Sign in another way.`,
});

beforeEach(() => {
  state.error = null;
});

describe("SSO that isn't set up or available", () => {
  it("is explained in Spanish, naming the typed address's domain", async () => {
    const t = await translator("es");
    state.error = notFound("acme.com");
    expect(await startSsoSignIn(" Ana@Acme.com ", "/dashboard", t)).toBe(
      "No hay SSO configurado para acme.com.",
    );
    state.error = unavailable("acme.com");
    expect(await startSsoSignIn("ana@acme.com", "/dashboard", t)).toBe(
      "El SSO de acme.com no está disponible en este momento. Inicia sesión de otra forma.",
    );
  });

  it("reads in English exactly as the server's message did", async () => {
    const t = await translator("en");
    for (const error of [notFound("acme.com"), unavailable("acme.com")]) {
      state.error = error;
      expect(await startSsoSignIn("ana@acme.com", "/dashboard", t)).toBe(
        error.message,
      );
    }
  });

  it("never shows the server's text", async () => {
    const t = await translator("en");
    state.error = { ...notFound("acme.com"), message: "Something else." };
    expect(await startSsoSignIn("ana@acme.com", "/dashboard", t)).toBe(
      "No SSO is set up for acme.com.",
    );
    // No domain to name: the general message.
    expect(await startSsoSignIn("not an address", "/dashboard", t)).toBe(
      "SSO isn't set up for that address.",
    );
  });
});

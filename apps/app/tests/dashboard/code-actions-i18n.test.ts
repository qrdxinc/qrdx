// The code, page, domain, tag, suggestion and webhook actions in another
// language: what they say themselves (signing in, validation, plan limits)
// comes in the person's language, which the dashboard shows as it is. That
// language is the app's rule (lib/i18n/app-locale.ts, run for real here):
// the saved one, else the language menu's cookie, else English. Only
// next-intl's server entry, which needs Next's plugin, is swapped for what
// i18n/request.ts does: the locale's catalog over English. Also: English
// stays English word for word, admin stays English, a catalog that can't be
// read answers in English, and the catalog's English matches
// CODE_ACTION_MESSAGES.
import type { Locale } from "@repo/i18n/config";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { fakeDb } from "../support/fake-db";

const USER = "u_ana";
const ORG = "org_acme";
const CODE = "ckanacode0001";

const state = vi.hoisted(() => ({
  signedIn: true,
  plan: "free" as "free" | "pro" | "business",
  /** The language menu's cookie (NEXT_LOCALE), if any */
  cookieLocale: undefined as string | undefined,
  limited: false,
  catalogFails: false,
  errors: [] as string[],
}));

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
      get: (name: string) =>
        name === localeCookie && state.cookieLocale !== undefined
          ? { name, value: state.cookieLocale }
          : undefined,
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
    }) => {
      if (state.catalogFails) throw new Error("catalog unavailable");
      return translator({
        locale,
        messages: await loadMessages(locale),
        namespace: namespace as never,
      });
    },
  };
});
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: !state.limited,
      limit: 60,
      remaining: state.limited ? 0 : 59,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.signedIn ? { user: { id: USER }, session: { id: "s_1" } } : null,
    },
  },
}));
vi.mock("@/lib/scope", async (importOriginal) => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    ...(await importOriginal<typeof import("@/lib/scope")>()),
    getActiveScope: async () => {
      if (!state.signedIn) throw new UnauthorizedError();
      return { userId: USER, organizationId: ORG, role: "owner" };
    },
  };
});
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/app/(app)/admin/_lib/guard", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    assertAdmin: async () => {
      throw new UnauthorizedError();
    },
  };
});
vi.mock("@/lib/code-versions", () => ({ snapshotCodeVersion: async () => {} }));
vi.mock("@/lib/shared", () => ({
  logError: (error: Error) => state.errors.push(error.message),
}));

const lifecycle = await import("@/actions/code-lifecycle");
const marketing = await import("@/actions/code-marketing");
const pages = await import("@/actions/landing-pages");
const domains = await import("@/actions/custom-domains");
const tags = await import("@/actions/tags");
const suggestions = await import("@/actions/code-suggestions");
const qrCodes = await import("@/actions/qr-codes");
const files = await import("@/actions/files");
const webhooks = await import("@/app/(app)/dashboard/webhooks/_lib/actions");
const { CODE_ACTION_MESSAGES, codeActionMessages } = await import(
  "@/lib/code-actions/messages"
);

const english = en.codeActions;
const spanish = es.codeActions;

/** The Spanish for an English string, checked to be a translation. */
function translated(englishText: string, spanishText: string): string {
  expect(spanishText).toBeTruthy();
  expect(spanishText).not.toBe(englishText);
  return spanishText;
}

/** The account, with the language it saved in Settings, if any. */
function account(locale: string | null = null) {
  fakeDb.seed("user", [{ id: USER, email: "ana@example.com", locale }]);
}

/** A dynamic code of the workspace. */
function code() {
  fakeDb.seed("qrCode", [
    {
      id: CODE,
      userId: USER,
      organizationId: ORG,
      kind: "redirect",
      destinationUrl: "https://shop.example/",
      scanCount: 0,
      isActive: true,
      deletedAt: null,
      passwordHash: null,
      startsAt: null,
      expiresAt: null,
      scanLimit: null,
      pausedAt: null,
      fallbackUrl: null,
      routing: null,
      utm: null,
      pixels: null,
    },
  ]);
}

const rule = {
  id: "r1",
  name: "",
  enabled: true,
  conditions: [{ type: "device", devices: ["mobile"] }],
  action: { type: "redirect", url: "https://apps.apple.com/" },
};

beforeEach(() => {
  fakeDb.resetAll();
  state.signedIn = true;
  state.plan = "free";
  state.cookieLocale = undefined;
  state.limited = false;
  state.catalogFails = false;
  state.errors = [];
  account();
  code();
});

describe("with the language menu on Spanish", () => {
  beforeEach(() => {
    state.cookieLocale = "es";
  });

  it("says a code's access controls in Spanish (code-lifecycle)", async () => {
    expect(
      await lifecycle.updateCodeLifecycle({ id: CODE, password: "abc" }),
    ).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: translated(
          "Use at least 4 characters for the password",
          "Usa al menos 4 caracteres para la contraseña",
        ),
      },
    });
    expect(
      await lifecycle.updateCodeLifecycle({ id: CODE, password: "secret12" }),
    ).toEqual({
      success: false,
      error: {
        code: "PLAN_REQUIRED",
        message: translated(
          english.lifecycle.planRequired,
          spanish.lifecycle.planRequired,
        ),
      },
    });
    expect(await lifecycle.getCodeLifecycle("ckmissing0001")).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: translated(
          english.lifecycle.notFound,
          spanish.lifecycle.notFound,
        ),
      },
    });
    state.signedIn = false;
    expect(await lifecycle.setCodePaused({ id: CODE, paused: true })).toEqual({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: translated(english.lifecycle.signIn, spanish.lifecycle.signIn),
      },
    });
    expect(state.errors).toEqual([]);
  });

  it("names the plan a feature needs in Spanish (code-marketing)", async () => {
    const result = await marketing.saveCodeRouting({
      id: CODE,
      routing: { rules: [rule] },
    });
    expect(result).toEqual({
      success: false,
      error: {
        code: "PLAN_REQUIRED",
        message: translated(
          "Smart routing is a Pro feature. You can still turn off or remove what's already set up.",
          "El enrutamiento inteligente es una función de Pro. Aún puedes desactivar o eliminar lo que ya está configurado.",
        ),
      },
    });
    expect(
      await marketing.testCodeRouting({
        id: CODE,
        routing: null,
        sample: {
          device: "mobile",
          os: null,
          country: "USA",
          region: "",
          language: "",
          at: "2026-11-18T12:00:00.000Z",
          scanNumber: 1,
          visitor: "",
        },
      }),
    ).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: translated(
          english.marketing.countryCode,
          spanish.marketing.countryCode,
        ),
      },
    });
  });

  it("says which rule a bad URL is in, in Spanish (code-marketing)", async () => {
    state.plan = "pro";
    const result = await marketing.saveCodeRouting({
      id: CODE,
      routing: {
        rules: [
          { ...rule, action: { type: "redirect", url: "javascript:alert(1)" } },
        ],
      },
    });
    expect(result.success).toBe(false);
    // The rule's label is this file's; what's wrong with the URL is the
    // code service's (lib, shared with the REST API) and stays English.
    expect(!result.success && result.error.message).toMatch(/^Regla 1: \S/);
  });

  it("says a page selection in Spanish (landing-pages)", async () => {
    expect(await pages.deleteLandingPages({ ids: [] })).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: translated(
          english.landingPages.selectAtLeastOne,
          spanish.landingPages.selectAtLeastOne,
        ),
      },
    });
    const ids = Array.from({ length: 101 }, (_, i) => `page_${i}`);
    expect(await pages.deleteLandingPages({ ids })).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: translated(
          "Select up to 100 pages at a time",
          "Selecciona hasta 100 páginas a la vez",
        ),
      },
    });
  });

  it("asks for a domain in Spanish (custom-domains)", async () => {
    expect(await domains.addCustomDomain({ hostname: "   " })).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: translated(
          english.customDomains.enterDomain,
          spanish.customDomains.enterDomain,
        ),
      },
    });
  });

  it("says its own tag messages in Spanish (tags, through runOrganize)", async () => {
    expect(await tags.updateCodeTag({ id: "tag_1" })).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: translated(
          english.tags.nothingToUpdate,
          spanish.tags.nothingToUpdate,
        ),
      },
    });
  });

  it("says too many suggestions in Spanish (code-suggestions)", async () => {
    state.limited = true;
    expect(
      await suggestions.suggestCodeDetailsAction({
        destinationUrl: "https://shop.example/",
      } as never),
    ).toEqual({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: translated(
          english.codeSuggestions.rateLimited,
          spanish.codeSuggestions.rateLimited,
        ),
      },
    });
  });

  it("says signed out in Spanish (qr-codes, webhooks)", async () => {
    state.signedIn = false;
    expect(await qrCodes.getQrCode(CODE)).toEqual({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: translated(english.qrCodes.signIn, spanish.qrCodes.signIn),
      },
    });
    expect(await webhooks.deleteWebhookEndpoint({ id: "wh_1" })).toEqual({
      ok: false,
      error: translated(english.webhooks.signIn, spanish.webhooks.signIn),
    });
  });

  it("keeps admin in English (files)", async () => {
    expect(
      await files.adminSetFileBlocked({ id: "file_1", blocked: true }),
    ).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to manage files." },
    });
  });
});

describe("whose language it is", () => {
  it("is the account's saved one over the language menu's", async () => {
    fakeDb.resetAll();
    account("es");
    state.cookieLocale = "fr";
    expect(await domains.addCustomDomain({ hostname: "" })).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: spanish.customDomains.enterDomain,
      },
    });
  });

  it("is English, word for word as before, with neither", async () => {
    expect(
      await lifecycle.updateCodeLifecycle({ id: CODE, password: "abc" }),
    ).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Use at least 4 characters for the password",
      },
    });
    expect(
      await lifecycle.updateCodeLifecycle({ id: CODE, password: "secret12" }),
    ).toEqual({
      success: false,
      error: {
        code: "PLAN_REQUIRED",
        message:
          "Passwords, schedules, scan limits and fallback URLs are part of Pro.",
      },
    });
    expect(
      await marketing.saveCodeRouting({ id: CODE, routing: { rules: [rule] } }),
    ).toEqual({
      success: false,
      error: {
        code: "PLAN_REQUIRED",
        message:
          "Smart routing is a Pro feature. You can still turn off or remove what's already set up.",
      },
    });
    expect(await pages.deleteLandingPages({ ids: [] })).toEqual({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Select at least one page" },
    });
    expect(await domains.addCustomDomain({ hostname: "" })).toEqual({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Enter a domain" },
    });
    expect(await tags.updateCodeTag({ id: "tag_1" })).toEqual({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Nothing to update" },
    });
    state.limited = true;
    expect(
      await suggestions.suggestCodeDetailsAction({
        destinationUrl: "https://shop.example/",
      } as never),
    ).toEqual({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "That's a lot of suggestions. Try again in a minute.",
      },
    });
    state.limited = false;
    state.signedIn = false;
    expect(await qrCodes.getQrCode(CODE)).toEqual({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in to manage dynamic QR codes.",
      },
    });
    expect(await webhooks.deleteWebhookEndpoint({ id: "wh_1" })).toEqual({
      ok: false,
      error: "Sign in to manage webhooks.",
    });
    expect(state.errors).toEqual([]);
  });

  it("is English, logged, when the catalog can't be read", async () => {
    state.cookieLocale = "es";
    state.catalogFails = true;
    expect(await pages.deleteLandingPages({ ids: [] })).toEqual({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Select at least one page" },
    });
    expect(state.errors).toEqual(["catalog unavailable"]);
  });
});

describe("the catalog's English", () => {
  it("matches CODE_ACTION_MESSAGES, every one", () => {
    const t = createTranslator({
      locale: "en",
      messages: en,
      namespace: "codeActions",
    });
    const fromCatalog = codeActionMessages(t);
    // The messages built from parts, with every plan and a few values.
    const said = (messages: typeof CODE_ACTION_MESSAGES) => {
      const {
        rule: ruleLabel,
        variant,
        problemIn,
        planRequired,
        ...plain
      } = messages.marketing;
      return {
        ...messages,
        marketing: {
          ...plain,
          rule: [1, 12].map(ruleLabel),
          variant: variant({ label: "Rule 2", variant: "B" }),
          problemIn: problemIn({ label: "Menu", problem: "invalid URL" }),
          planRequired: Object.fromEntries(
            Object.entries(planRequired).map(([feature, say]) => [
              feature,
              (["pro", "business", null] as const).map(say),
            ]),
          ),
        },
      };
    };
    expect(said(fromCatalog)).toEqual(said(CODE_ACTION_MESSAGES));
  });
});

// The code, page, domain, folder, tag, bulk, suggestion and webhook actions
// in another language: what they say themselves (signing in, validation,
// plan limits) comes in the language of the page that shows it, and so does
// what organize.ts throws for them (names included), which stays English
// for its own callers. The code builder and the
// editor send their page's language (useLocale(): /es/playground is Spanish,
// /playground English, whatever the cookie says), and so do the code and
// barcode routes when the page adds ?locale=. Without one, it's the app's
// rule (lib/i18n/app-locale.ts, run for real here): the saved language,
// else the language menu's cookie, else English; the dashboard renders in
// that same language. Only next-intl's server entry, which needs Next's
// plugin, is swapped for what i18n/request.ts does: the locale's catalog
// over English. Also: English stays English word for word, admin stays
// English, a catalog that can't be read answers in English, and the
// catalog's English matches CODE_ACTION_MESSAGES.
import type { Locale } from "@repo/i18n/config";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
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
  const scope = () => {
    if (!state.signedIn) throw new UnauthorizedError();
    return { userId: USER, organizationId: ORG, role: "owner" as const };
  };
  return {
    ...(await importOriginal<typeof import("@/lib/scope")>()),
    getActiveScope: async () => scope(),
    getActiveWorkspace: async () => ({
      scope: scope(),
      workspace: { id: ORG, slug: "acme", name: "Acme" },
    }),
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
vi.mock("@/lib/log-error", () => ({
  logError: (error: Error) => state.errors.push(error.message),
}));

const lifecycle = await import("@/actions/code-lifecycle");
const marketing = await import("@/actions/code-marketing");
const pages = await import("@/actions/landing-pages");
const domains = await import("@/actions/custom-domains");
const tags = await import("@/actions/tags");
const folders = await import("@/actions/folders");
const bulk = await import("@/actions/bulk-codes");
const organize = await import("@/app/(app)/dashboard/codes/_lib/organize");
const suggestions = await import("@/actions/code-suggestions");
const qrCodes = await import("@/actions/qr-codes");
const files = await import("@/actions/files");
const webhooks = await import("@/app/(app)/dashboard/webhooks/_lib/actions");
const barcodes = await import("@/actions/barcodes");
const codeOptions = await import(
  "@/app/(app)/dashboard/codes/_lib/code-option-actions"
);
const codesRoute = await import("@/app/api/playground/codes/route");
const barcodesRoute = await import("@/app/api/barcodes/route");
const { CODE_ACTION_MESSAGES, codeActionMessages } = await import(
  "@/lib/code-actions/messages"
);
const { ValidationError } = await import("@/types/errors");

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

/** The workspace's folder "Spring" and tag "VIP". */
function organized() {
  fakeDb.seed("folder", [
    {
      id: "folder_spring",
      userId: USER,
      organizationId: ORG,
      parentId: null,
      name: "Spring",
      position: 0,
    },
  ]);
  fakeDb.seed("tag", [
    {
      id: "tag_vip",
      userId: USER,
      organizationId: ORG,
      name: "VIP",
      color: "blue",
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
  organized();
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

  it("says folder, tag and bulk messages in Spanish (organize, through runOrganize)", async () => {
    // A schema's message (folderNameSchema)
    expect(
      await folders.createCodeFolder({ name: "Spring/Summer", parentId: null }),
    ).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: translated(
          english.organize.folderNameSlash,
          spanish.organize.folderNameSlash,
        ),
      },
    });
    // Messages that name a folder or tag: the name comes with the error,
    // as the person typed it.
    expect(
      await folders.createCodeFolder({ name: "spring", parentId: null }),
    ).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: translated(
          'A folder named "spring" already exists there.',
          'Ya existe una carpeta llamada "spring" en ese lugar.',
        ),
      },
    });
    expect(await tags.createCodeTag({ name: "vip" })).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: translated(
          'A tag named "vip" already exists.',
          'Ya existe una etiqueta llamada "vip".',
        ),
      },
    });
    // A throw with a status (404), and the bulk actions' selection
    expect(
      await folders.renameCodeFolder({ id: "folder_gone", name: "Autumn" }),
    ).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: translated(
          english.organize.folderNotFound,
          spanish.organize.folderNotFound,
        ),
      },
    });
    expect(await bulk.trashQrCodes({ ids: [] })).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: translated(
          english.organize.selectAtLeastOne,
          spanish.organize.selectAtLeastOne,
        ),
      },
    });
    state.signedIn = false;
    expect(
      await bulk.setQrCodesFavorite({ ids: [CODE], favorite: true }),
    ).toEqual({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: translated(english.organize.signIn, spanish.organize.signIn),
      },
    });
    expect(state.errors).toEqual([]);
  });

  it("keeps organize's own errors English for logs and the API", async () => {
    const scope = { userId: USER, organizationId: ORG, role: "owner" as const };
    const error = await organize
      .createTag(scope, { name: "vip", color: "gray" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toBe('A tag named "vip" already exists.');
    await expect(
      organize.renameFolder(scope, { id: "folder_gone", name: "Autumn" }),
    ).rejects.toThrow("Folder not found");
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

describe("on a page whose URL carries the language (the builder, the editor)", () => {
  it("is the page's Spanish with no cookie and no saved language", async () => {
    expect(
      await lifecycle.updateCodeLifecycle({ id: CODE, password: "abc" }, "es"),
    ).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Usa al menos 4 caracteres para la contraseña",
      },
    });
    expect(
      await marketing.saveCodeRouting(
        { id: CODE, routing: { rules: [rule] } },
        "es",
      ),
    ).toEqual({
      success: false,
      error: {
        code: "PLAN_REQUIRED",
        message:
          "El enrutamiento inteligente es una función de Pro. Aún puedes desactivar o eliminar lo que ya está configurado.",
      },
    });
    expect(
      await tags.setQrCodeTags(
        { codeId: CODE, tagIds: Array.from({ length: 11 }, (_, i) => `t${i}`) },
        "es",
      ),
    ).toMatchObject({
      success: false,
      error: { message: "Un código puede tener hasta 10 etiquetas." },
    });
    state.limited = true;
    expect(
      await suggestions.suggestCodeDetailsAction(
        { destinationUrl: "https://shop.example/" } as never,
        "es",
      ),
    ).toMatchObject({
      error: { message: spanish.codeSuggestions.rateLimited },
    });
    state.limited = false;
    state.signedIn = false;
    expect(await qrCodes.createQrCode({} as never, undefined, "es")).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: spanish.qrCodes.signIn },
    });
    expect(await barcodes.saveBarcode({} as never, "es")).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: spanish.barcodes.signIn },
    });
    expect(await codeOptions.getCodeOptions(CODE, "es")).toEqual({
      success: false,
      error: { message: spanish.codeOptions.signIn },
    });
    expect(state.errors).toEqual([]);
  });

  it("is the page's English over a Spanish cookie and a saved Spanish", async () => {
    fakeDb.resetAll();
    account("es");
    code();
    state.cookieLocale = "es";
    expect(
      await lifecycle.updateCodeLifecycle({ id: CODE, password: "abc" }, "en"),
    ).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Use at least 4 characters for the password",
      },
    });
    expect(
      await marketing.saveCodeRouting(
        { id: CODE, routing: { rules: [rule] } },
        "en",
      ),
    ).toEqual({
      success: false,
      error: {
        code: "PLAN_REQUIRED",
        message:
          "Smart routing is a Pro feature. You can still turn off or remove what's already set up.",
      },
    });
    state.signedIn = false;
    expect(await qrCodes.getQrCode(CODE, "en")).toEqual({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in to manage dynamic QR codes.",
      },
    });
    // The same calls without the page's language: the dashboard's rule.
    expect(await qrCodes.getQrCode(CODE)).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: spanish.qrCodes.signIn },
    });
  });

  it("comes to the builder's tag and folder writes", async () => {
    expect(await tags.createCodeTag({ name: "vip" }, "es")).toMatchObject({
      success: false,
      error: { message: 'Ya existe una etiqueta llamada "vip".' },
    });
    expect(
      await bulk.moveQrCodes({ ids: [CODE], folderId: "folder_gone" }, "es"),
    ).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: spanish.organize.folderNotFound },
    });
    // The page's English over a Spanish cookie
    state.cookieLocale = "es";
    expect(await tags.createCodeTag({ name: "vip" }, "en")).toMatchObject({
      error: { message: 'A tag named "vip" already exists.' },
    });
    expect(state.errors).toEqual([]);
  });

  it("is ignored when it isn't one of QRdx's languages (the app's rule)", async () => {
    state.cookieLocale = "fr";
    state.signedIn = false;
    expect(await qrCodes.getQrCode(CODE, "xx")).toMatchObject({
      error: { message: fr.codeActions.qrCodes.signIn },
    });
  });

  it("comes through the code and barcode routes with ?locale=", async () => {
    state.signedIn = false;
    state.cookieLocale = "fr";
    const post = (path: string) =>
      new Request(new URL(path, "http://localhost:3000"), {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        },
        body: JSON.stringify({ destinationUrl: "https://shop.example/" }),
      });
    const spanishCode = await codesRoute.POST(
      post("/api/playground/codes?locale=es"),
    );
    expect(spanishCode.status).toBe(401);
    expect(await spanishCode.json()).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: spanish.qrCodes.signIn },
    });
    // Without it, as before: the app's rule (here the cookie's French).
    expect(
      await (await codesRoute.POST(post("/api/playground/codes"))).json(),
    ).toMatchObject({
      error: { message: fr.codeActions.qrCodes.signIn },
    });
    // /barcode-generator is English: its page says so.
    expect(
      await (await barcodesRoute.POST(post("/api/barcodes?locale=en"))).json(),
    ).toMatchObject({ error: { message: "Sign in to save barcodes." } });
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
    expect(
      await folders.createCodeFolder({ name: "Spring/Summer", parentId: null }),
    ).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Folder names can't contain /",
      },
    });
    expect(
      await folders.createCodeFolder({ name: "spring", parentId: null }),
    ).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: 'A folder named "spring" already exists there.',
      },
    });
    expect(await tags.createCodeTag({ name: "vip" })).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: 'A tag named "vip" already exists.',
      },
    });
    expect(
      await folders.renameCodeFolder({ id: "folder_gone", name: "Autumn" }),
    ).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Folder not found" },
    });
    expect(await bulk.trashQrCodes({ ids: [] })).toEqual({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Select at least one code" },
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
    expect(
      await bulk.setQrCodesFavorite({ ids: [CODE], favorite: true }),
    ).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to manage your codes." },
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
      const { folderExists, tagExists, ...organizePlain } = messages.organize;
      return {
        ...messages,
        organize: {
          ...organizePlain,
          folderExists: ["Spring", 'Q4 "launch"'].map((name) =>
            folderExists({ name }),
          ),
          tagExists: ["VIP", "{name}"].map((name) => tagExists({ name })),
        },
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

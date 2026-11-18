// What the community, theme, code builder and search actions answer, in the
// language of the page that asked (lib/i18n/action-locale.ts). The editor
// and the community pages send their page's language: /es/playground gets
// Spanish without any cookie, and an English page (/community, /playground)
// gets English over a Spanish cookie and a Spanish saved language. The
// dashboard sends nothing, so its actions follow the app's rule (saved,
// else the cookie, else English). Each refusal is checked in Spanish, then
// the same call in English, unchanged. The real actions run against
// in-memory tables; the session, the open workspace, the cookie and the
// rate limits are fakes, and next-intl's server entry does what
// i18n/request.ts does (the locale's catalog over English). Nothing
// connects anywhere.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "u_ana" as string | null,
  scope: null as null | {
    userId: string;
    organizationId: string;
    role: "owner" | "admin" | "member";
  },
  /** The language menu's cookie (NEXT_LOCALE), if any */
  cookieLocale: undefined as string | undefined,
  limited: false,
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
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/headers", async () => {
  const { LOCALE_COOKIE } = await import("@repo/i18n/config");
  return {
    headers: async () => new Headers(),
    cookies: async () => ({
      get: (name: string) =>
        name === LOCALE_COOKIE && state.cookieLocale
          ? { name, value: state.cookieLocale }
          : undefined,
    }),
  };
});
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.userId ? { user: { id: state.userId } } : null,
    },
  },
}));
// What i18n/request.ts gives getTranslations: the locale's catalog over
// English.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/lib/i18n/messages");
  return {
    getTranslations: async ({
      locale,
      namespace,
    }: {
      locale: "en";
      namespace?: string;
    }) =>
      createTranslator({
        locale,
        messages: await loadMessages(locale),
        namespace: namespace as never,
      }),
    getLocale: async () => "en",
  };
});
vi.mock("@/lib/shared", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    getCurrentUserId: async () => {
      if (!state.userId) throw new UnauthorizedError();
      return state.userId;
    },
    logError: (error: Error) => state.errors.push(error.message),
  };
});
vi.mock("@/lib/log-error", () => ({
  logError: (error: Error) => state.errors.push(error.message),
}));
vi.mock("@/lib/scope", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  class WorkspaceNotFoundError extends Error {}
  const scope = () => {
    if (!(state.userId && state.scope)) throw new UnauthorizedError();
    return state.scope;
  };
  return {
    WorkspaceNotFoundError,
    getActiveScope: async () => scope(),
    getActiveWorkspace: async () => ({
      scope: scope(),
      workspace: { id: scope().organizationId, slug: "ana" },
    }),
  };
});
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({
    limit: async () => ({ success: !state.limited }),
  }),
  slidingWindow: () => null,
}));
vi.mock("@/app/(app)/dashboard/codes/_lib/qr-codes", async (original) => ({
  ...(await original<object>()),
  listCodes: async () => ({ codes: [] }),
}));
vi.mock("@/lib/plans", async (original) => ({
  ...(await original<object>()),
  getPlan: async () => "free",
}));
vi.mock("@/lib/workspaces", async (original) => {
  const { ownWorkspaceId } = await import("@repo/auth/own-workspace-id");
  return {
    ...(await original<object>()),
    ensureOwnWorkspaceFor: async (userId: string) => ({
      id: ownWorkspaceId(userId),
    }),
  };
});
vi.mock("@/lib/limit-notices", () => ({ noteLimitUsage: () => undefined }));

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { MAX_FREE_THEMES } from "@repo/config";
import { mergeMessages } from "@repo/i18n/messages";
import { createTranslator } from "next-intl";
import { getOfficialFrame } from "qrdx";
import {
  importCommunityFrameSvg,
  publishCommunityFrame,
  saveCommunityProfileAction,
  toggleCommunityLike,
} from "@/actions/community";
import { publishTheme } from "@/actions/community-themes";
import { copyThemeToTeam, createTheme } from "@/actions/qr-themes";
import { searchWorkspace } from "@/components/app-shell/search-actions";
import { getCodeBuilderData } from "@/components/code-builder/actions";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { fakeDb } from "../support/fake-db";

const spanish = mergeMessages(en, es) as typeof en;
const esChecks = createTranslator({
  locale: "es",
  messages: spanish,
  namespace: "communityActions.checks",
});
const esThemes = createTranslator({
  locale: "es",
  messages: spanish,
  namespace: "communityActions.qrThemes",
});
const ES = es.communityActions;
const EN = en.communityActions;

const wifi = getOfficialFrame("wifi-card");
if (!wifi) throw new Error("no wifi-card");
const FRAME = { style: "custom", spec: wifi.spec };
const NOW = new Date("2026-11-18T10:00:00Z");
const OWN = ownWorkspaceId("u_ana");

/** Ana's saved language (Settings > General > Language), or none. */
function savedLanguage(locale: string | null) {
  const ana = fakeDb.find("user", { id: "u_ana" });
  if (ana) ana.locale = locale;
}

/** The person speaks Spanish everywhere the app could tell. */
function spanishEverywhere() {
  state.cookieLocale = "es";
  savedLanguage("es");
}

function savedTheme(id: string, organizationId = OWN) {
  return {
    id,
    userId: "u_ana",
    organizationId,
    name: `${id} theme`,
    style: { fgColor: "#000000", bgColor: "#ffffff", level: "M" },
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

beforeEach(() => {
  fakeDb.resetAll();
  state.userId = "u_ana";
  state.scope = { userId: "u_ana", organizationId: OWN, role: "owner" };
  state.cookieLocale = undefined;
  state.limited = false;
  state.errors = [];
  fakeDb.defaults("communityProfile", {
    handle: null,
    bio: null,
    verifiedAt: null,
    status: "active",
    workspaceId: null,
  });
  fakeDb.seed("user", [
    {
      id: "u_ana",
      name: "Ana",
      email: "ana@example.com",
      image: null,
      banned: false,
      banExpires: null,
      locale: null,
    },
  ]);
  fakeDb.seed("qrPreset", [savedTheme("t_mine")]);
});

// No answer fell back to English because a translation failed (that's
// logged), and nothing else went wrong on the way.
afterEach(() => expect(state.errors).toEqual([]));

describe("the editor's community actions (pages under [lang])", () => {
  it("refuse a publish without the licence in the page's language", async () => {
    const input = { frame: FRAME, name: "Card", acceptLicense: false };

    // /es/playground: Spanish with no cookie and no saved language.
    expect(await publishCommunityFrame(input, "es")).toEqual({
      ok: false,
      code: "LICENSE_REQUIRED",
      message: ES.checks.licenceRequired,
    });
    // /playground: English, though the person otherwise speaks Spanish.
    spanishEverywhere();
    expect(await publishCommunityFrame(input, "en")).toEqual({
      ok: false,
      code: "LICENSE_REQUIRED",
      message: "Confirm the CC0 licence to publish.",
    });
    expect(ES.checks.licenceRequired).not.toBe(EN.checks.licenceRequired);
  });

  it("say what the checks refuse (personal data) in the page's language", async () => {
    const input = {
      frame: FRAME,
      name: "Write to ana@example.com",
      acceptLicense: true,
    };
    expect(await publishCommunityFrame(input, "es")).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      message: ES.checks.noEmails,
    });
    spanishEverywhere();
    expect(await publishCommunityFrame(input, "en")).toMatchObject({
      message: "Leave email addresses out of names, labels and descriptions.",
    });
    // Nothing was published either way.
    expect(fakeDb.rows("communityItem")).toHaveLength(0);
  });

  it("refuse an SVG that's too large, or too many imports", async () => {
    const big = "x".repeat(220_000);
    expect(await importCommunityFrameSvg(big, "es")).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      message: ES.community.svgTooLarge,
    });
    spanishEverywhere();
    expect(await importCommunityFrameSvg(big, "en")).toMatchObject({
      message: "SVG files can be up to 200 KB.",
    });
    state.limited = true;
    expect(await importCommunityFrameSvg("<svg/>", "es")).toMatchObject({
      code: "RATE_LIMITED",
      message: ES.community.tooManyImports,
    });
    expect(await importCommunityFrameSvg("<svg/>", "en")).toMatchObject({
      message: "Too many imports. Try again in an hour.",
    });
  });

  it("answer a like in the language of the page it came from", async () => {
    // The editor's community sheet on /es/playground.
    expect(await toggleCommunityLike("item_gone", "es")).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: ES.checks.itemNotFound,
    });
    // An item's community page, which is English only.
    spanishEverywhere();
    expect(await toggleCommunityLike("item_gone", "en")).toMatchObject({
      message: "This item isn't in the community.",
    });
    // Before manual-sql/0012: the community isn't available yet.
    fakeDb.missing("communityItem");
    expect(await toggleCommunityLike("item_gone", "es")).toMatchObject({
      code: "UNAVAILABLE",
      message: ES.checks.unavailable,
    });
    expect(await toggleCommunityLike("item_gone", "en")).toMatchObject({
      message: "The community update isn't available on this deployment yet.",
    });
    // The missing table is reported once (lib/community/store.ts).
    expect(state.errors).toEqual(['relation "communityItem" does not exist']);
    state.errors = [];
  });

  it("refuse publishing a saved theme in the page's language", async () => {
    expect(
      await publishTheme("t_mine", [], { acceptLicense: false, locale: "es" }),
    ).toEqual({
      success: false,
      error: expect.objectContaining({
        code: "LICENSE_REQUIRED",
        message: ES.checks.licenceRequired,
      }),
    });
    spanishEverywhere();
    expect(
      await publishTheme("t_mine", [], { acceptLicense: false, locale: "en" }),
    ).toEqual({
      success: false,
      error: expect.objectContaining({
        message: "Confirm the CC0 licence to publish.",
      }),
    });
  });

  it("say the saved-theme limit in the page's language, with the limit", async () => {
    fakeDb.seed(
      "qrPreset",
      Array.from({ length: MAX_FREE_THEMES - 1 }, (_, index) =>
        savedTheme(`t_${index}`),
      ),
    );
    const theme = { name: "One more", style: {} };
    const spanishLimit = await createTheme(theme, "es");
    expect(spanishLimit).toEqual({
      success: false,
      error: expect.objectContaining({
        code: "THEME_LIMIT_REACHED",
        message: esThemes("themeLimit", { limit: MAX_FREE_THEMES }),
      }),
    });
    expect(JSON.stringify(spanishLimit)).toContain(String(MAX_FREE_THEMES));
    spanishEverywhere();
    expect(await createTheme(theme, "en")).toEqual({
      success: false,
      error: expect.objectContaining({
        message: `You have reached the limit of ${MAX_FREE_THEMES} saved themes on the Free plan. Upgrade to Pro for unlimited themes.`,
      }),
    });
    // Nothing over the limit was kept.
    expect(fakeDb.rows("qrPreset")).toHaveLength(MAX_FREE_THEMES);
  });

  it("report what the code builder couldn't load in the page's language", async () => {
    state.userId = null;
    expect(await getCodeBuilderData("es")).toEqual({
      success: false,
      error: { message: ES.codeBuilder.signInAgain },
    });
    state.cookieLocale = "es";
    expect(await getCodeBuilderData("en")).toEqual({
      success: false,
      error: { message: "Sign in again to create codes." },
    });
  });
});

describe("the app's actions (no language in the URL)", () => {
  it("answer in the saved language, else the cookie, else English", async () => {
    savedLanguage("es");
    expect(await copyThemeToTeam("t_mine")).toEqual({
      ok: false,
      error: ES.qrThemes.openAnotherWorkspace,
    });
    savedLanguage(null);
    state.cookieLocale = "es";
    expect(await copyThemeToTeam("t_mine")).toEqual({
      ok: false,
      error: ES.qrThemes.openAnotherWorkspace,
    });
    state.cookieLocale = undefined;
    expect(await copyThemeToTeam("t_mine")).toEqual({
      ok: false,
      error: "Open another workspace to share themes with it.",
    });
  });

  it("say why a community handle can't be saved, with its lengths", async () => {
    const input = { handle: "ab", displayName: "Ana", showPicture: false };
    savedLanguage("es");
    expect(await saveCommunityProfileAction(input)).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      message: esChecks("handleFormat", { min: 3, max: 30 }),
    });
    savedLanguage(null);
    expect(await saveCommunityProfileAction(input)).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      message:
        'Use 3 to 30 lowercase letters, numbers, "_" or "-", starting with a letter or number.',
    });
  });

  it("search in the app's language, page types included", async () => {
    fakeDb.seed("landingPage", [
      {
        id: "p_1",
        organizationId: OWN,
        title: "Spring sale",
        type: "coupon",
        updatedAt: NOW,
      },
    ]);
    state.cookieLocale = "es";
    const found = await searchWorkspace("spring");
    expect(found).toMatchObject({
      ok: true,
      pages: [{ title: "Spring sale", detail: "Cupón" }],
    });
    state.limited = true;
    expect(await searchWorkspace("spring")).toEqual({
      ok: false,
      error: ES.search.tooMany,
    });

    state.cookieLocale = undefined;
    expect(await searchWorkspace("spring")).toEqual({
      ok: false,
      error: "Too many searches. Wait a moment.",
    });
    state.limited = false;
    expect(await searchWorkspace("spring")).toMatchObject({
      ok: true,
      pages: [{ title: "Spring sale", detail: "Coupon" }],
    });
  });
});

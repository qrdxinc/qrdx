// The language a server action answers in (lib/i18n/action-locale.ts): the
// language of the page that called it, which the page sends. A translated
// page's language wins without a cookie, an English page's over a Spanish
// cookie and a Spanish saved language, and anything that isn't one of
// QRdx's languages falls back to the app's rule (saved, else the cookie,
// else English). The session, the cookie and the user row are fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "u_ana" as string | null,
  /** The language menu's cookie (NEXT_LOCALE), if any */
  cookieLocale: undefined as string | undefined,
  sessionReads: 0,
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
      getSession: async () => {
        state.sessionReads++;
        return state.userId ? { user: { id: state.userId } } : null;
      },
    },
  },
}));
vi.mock("@/lib/log-error", () => ({
  logError: (error: Error) => state.errors.push(error.message),
}));

import { actionLocale, actionText } from "@/lib/i18n/action-locale";
import { fakeDb } from "../support/fake-db";

/** Ana's saved language (Settings > General > Language), or none. */
function savedLanguage(locale: string | null) {
  const ana = fakeDb.find("user", { id: "u_ana" });
  if (ana) ana.locale = locale;
  else fakeDb.seed("user", [{ id: "u_ana", name: "Ana", locale }]);
}

beforeEach(() => {
  fakeDb.resetAll();
  state.userId = "u_ana";
  state.cookieLocale = undefined;
  state.sessionReads = 0;
  state.errors = [];
  savedLanguage(null);
});

describe("actionLocale", () => {
  it("is the translated page's language, with no cookie and none saved", async () => {
    expect(await actionLocale("es")).toBe("es");
    expect(await actionLocale("zh-Hans")).toBe("zh-Hans");
    state.userId = null;
    expect(await actionLocale("ja")).toBe("ja");
  });

  it("is English from an English page, over a Spanish cookie and a Spanish saved language", async () => {
    state.cookieLocale = "es";
    savedLanguage("es");
    expect(await actionLocale("en")).toBe("en");
    expect(await actionLocale("en", "u_ana")).toBe("en");
  });

  it("follows the page over the app's language either way", async () => {
    state.cookieLocale = "fr";
    savedLanguage("de");
    expect(await actionLocale("es")).toBe("es");
    // The page's language is used as it is: no session read.
    expect(state.sessionReads).toBe(0);
  });

  it("falls back to the app's rule for anything that isn't a language", async () => {
    // Saved, else the cookie, else English.
    savedLanguage("de");
    state.cookieLocale = "fr";
    for (const sent of [undefined, "", "xx", "ES", "es-ES", 42, null, {}]) {
      expect(await actionLocale(sent)).toBe("de");
    }
    savedLanguage(null);
    expect(await actionLocale(undefined)).toBe("fr");
    state.cookieLocale = "<script>";
    expect(await actionLocale("../en")).toBe("en");
    state.userId = null;
    state.cookieLocale = "ko";
    expect(await actionLocale(undefined)).toBe("ko");
  });

  it("uses the user the action already knows without reading the session again", async () => {
    savedLanguage("it");
    expect(await actionLocale(undefined, "u_ana")).toBe("it");
    savedLanguage(null);
    state.cookieLocale = "pt-BR";
    expect(await actionLocale(undefined, "u_ana")).toBe("pt-BR");
    state.cookieLocale = undefined;
    expect(await actionLocale(undefined, "u_ana")).toBe("en");
    expect(state.sessionReads).toBe(0);
  });
});

describe("actionText", () => {
  const ENGLISH = { hello: "Hello" };
  const spanish = vi.fn(async (locale: string) => ({
    hello: `Hola (${locale})`,
  }));

  beforeEach(() => spanish.mockClear());

  it("builds the page's language from the catalog", async () => {
    expect(
      await actionText(ENGLISH, spanish, { pageLocale: "es", action: "t" }),
    ).toEqual({ hello: "Hola (es)" });
  });

  it("returns the English as it is for English, without reading the catalog", async () => {
    state.cookieLocale = "es";
    const text = await actionText(ENGLISH, spanish, {
      pageLocale: "en",
      action: "t",
    });
    expect(text).toBe(ENGLISH);
    expect(spanish).not.toHaveBeenCalled();
  });

  it("answers in English, logged, when the catalog can't be read", async () => {
    const broken = async (): Promise<typeof ENGLISH> => {
      throw new Error("catalog unreadable");
    };
    expect(
      await actionText(ENGLISH, broken, { pageLocale: "es", action: "t" }),
    ).toBe(ENGLISH);
    expect(state.errors).toEqual(["catalog unreadable"]);
  });

  it("answers in English, logged, when the language can't be read", async () => {
    // No language sent and no session to read it from.
    const { auth } = await import("@repo/auth/server");
    const getSession = vi
      .spyOn(auth.api, "getSession")
      .mockRejectedValueOnce(new Error("session store down"));
    const cookies = await import("next/headers");
    const read = vi
      .spyOn(cookies, "cookies")
      .mockRejectedValueOnce(new Error("no request"));
    expect(await actionText(ENGLISH, spanish, { action: "t" })).toBe(ENGLISH);
    expect(state.errors).toEqual(["no request"]);
    getSession.mockRestore();
    read.mockRestore();
  });
});

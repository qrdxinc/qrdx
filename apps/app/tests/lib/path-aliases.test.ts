// Path aliases (lib/path-aliases.ts): which old paths can open a code on a
// custom domain, how a request path or typed input is matched, and what's
// kept for QRdx and for back-halves, as apps/docs/content/docs/migrate.mdx
// ("Path aliases") describes it.
import { describe, expect, it } from "vitest";
import {
  PATH_ALIAS_MAX_LENGTH,
  PATH_ALIAS_MAX_SEGMENTS,
} from "@/lib/path-alias-limits";
import {
  aliasPathOf,
  aliasUrl,
  hostedPageSlugOf,
  PATH_ALIAS_MESSAGES,
  parsePathAlias,
  pathAliasProblem,
} from "@/lib/path-aliases";

const UUID = "4f1c2a9e-6b7d-4e1a-9c3f-2d8e7b6a5c41";
const UUID2 = "0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b";

describe("the old shapes the switch campaign found", () => {
  it("can all be aliases", () => {
    for (const path of [
      // Flowcode 2: /r/ codes, some a single character, and batch links
      "/r/NBDX",
      "/r/X",
      "/r/fhoxePqJ_X",
      `/s/${UUID}/code_batch-1/${UUID2}`,
      // Unitag, ME-QR, Flowcode 1, QR Planet
      "/a/cbey7J",
      "/l/spring-menu",
      "/p/QNA8kOWzd",
      "/object/12345",
      // BL.INK: two words
      "/code-of-conduct/clip",
      // One part that isn't a back-half: too short, or with a dot
      "/ab",
      "/X",
      "/menu.html",
      "/-menu",
    ]) {
      expect(pathAliasProblem(path), path).toBeNull();
      expect(aliasPathOf(path), path).toBe(path);
    }
  });
});

describe("pathAliasProblem", () => {
  it("leaves paths that fit a back-half to back-halves", () => {
    for (const path of ["/spring-menu", "/Ab3xK9q", "/abc", "/Spring_Menu"]) {
      expect(pathAliasProblem(path), path).toBe("backHalf");
    }
  });

  it("keeps QRdx's own paths and well-known files, in any case", () => {
    for (const path of [
      "/api/events",
      "/API/v1/codes",
      "/stats/abc/og",
      "/01/09506000134352",
      "/q/abc",
      "/_next/static/x.js",
      "/robots.txt",
      "/favicon.ico",
      "/sitemap.xml",
    ]) {
      expect(pathAliasProblem(path), path).toBe("reserved");
    }
  });

  it("refuses empty parts, dot segments, odd characters and long paths", () => {
    expect(pathAliasProblem("/")).toBe("empty");
    expect(pathAliasProblem("")).toBe("empty");
    for (const path of [
      "/r//abc",
      "/.env",
      "/r/../admin",
      "/r/./x",
      "/r/a b",
      "/r/ä",
      "/r/a%20b",
      "/r/a?b",
      "r/abc",
    ]) {
      expect(pathAliasProblem(path), path).toBe("characters");
    }
    expect(pathAliasProblem(`/${"a/".repeat(PATH_ALIAS_MAX_SEGMENTS)}b`)).toBe(
      "segments",
    );
    expect(pathAliasProblem(`/r/${"a".repeat(PATH_ALIAS_MAX_LENGTH)}`)).toBe(
      "length",
    );
  });

  it("has a message for every problem", () => {
    for (const message of Object.values(PATH_ALIAS_MESSAGES)) {
      expect(message).toMatch(/\.$/);
    }
  });
});

describe("aliasPathOf (request paths)", () => {
  it("ignores a trailing slash and keeps case", () => {
    expect(aliasPathOf("/r/NBDX/")).toBe("/r/NBDX");
    expect(aliasPathOf("/r/nbdx")).toBe("/r/nbdx");
  });

  it("decodes escapes before matching", () => {
    expect(aliasPathOf("/r/%41bc")).toBe("/r/Abc");
    expect(aliasPathOf("/r/%E0%A4%A")).toBeNull();
  });

  it("never matches what can't be an alias", () => {
    for (const path of ["/", "/spring-menu", "/api/events", "/.env", "/r//x"]) {
      expect(aliasPathOf(path), path).toBeNull();
    }
  });
});

describe("parsePathAlias (what an owner types, or an import finds)", () => {
  it("takes a path with or without slashes, or the whole old link", () => {
    for (const input of [
      "r/abc",
      "/r/abc",
      "/r/abc/",
      "  /r/abc  ",
      "/r/abc?utm_source=flyer",
      "/r/abc#top",
      "https://go.brand.com/r/abc?utm_source=flyer",
      "HTTPS://GO.BRAND.COM/r/abc",
    ]) {
      expect(parsePathAlias(input, "go.brand.com"), input).toEqual({
        ok: true,
        path: "/r/abc",
      });
    }
  });

  it("refuses a link on another domain", () => {
    expect(
      parsePathAlias("https://qr.other.com/r/abc", "go.brand.com"),
    ).toEqual({ ok: false, problem: "otherDomain" });
  });

  it("explains what's wrong", () => {
    expect(parsePathAlias("", "go.brand.com")).toEqual({
      ok: false,
      problem: "empty",
    });
    expect(parsePathAlias("spring-menu")).toEqual({
      ok: false,
      problem: "backHalf",
    });
    expect(parsePathAlias("/api/x")).toEqual({
      ok: false,
      problem: "reserved",
    });
    expect(parsePathAlias("/r/%zz")).toEqual({
      ok: false,
      problem: "characters",
    });
  });
});

describe("hostedPageSlugOf", () => {
  it("names the back-half whose hosted page shares a /p/ alias's path", () => {
    expect(hostedPageSlugOf("/p/QNA8kOWzd")).toBe("QNA8kOWzd");
    // Not a back-half's shape: QRdx never serves a hosted page there.
    expect(hostedPageSlugOf("/p/X")).toBeNull();
    expect(hostedPageSlugOf("/p/abc/def")).toBeNull();
    expect(hostedPageSlugOf("/r/abc")).toBeNull();
  });
});

describe("aliasUrl", () => {
  it("is the old link on the domain", () => {
    expect(aliasUrl("go.brand.com", "/r/abc")).toBe(
      "https://go.brand.com/r/abc",
    );
  });
});

// The docs are English only. The docs URLs of the other languages
// (/es/docs/..., their .md copies, the old /docs-md route) redirect to the
// English page, 307 for now, in this app's own next.config.ts: on qrdx.dev
// the main app answers them first (apps/app/tests/lib/docs-zone.test.ts).
import { createRequire } from "node:module";
import { TRANSLATED_LOCALES } from "@repo/i18n/config";
import { formerDocsSegments } from "@repo/i18n/docs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Next's own copy of the matcher it applies to next.config.ts (no types).
const pathToRegexp = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp",
) as {
  match: (
    source: string,
  ) => (path: string) => false | { params: Record<string, unknown> };
  compile: (path: string) => (params: Record<string, unknown>) => string;
};

interface Rule {
  source: string;
  destination: string;
  permanent?: boolean;
  has?: unknown[];
}

/** Where the first rule matching `path` sends it, with its rule. */
function follow(rules: readonly Rule[], path: string) {
  for (const rule of rules) {
    const found = pathToRegexp.match(rule.source)(path);
    if (!found) continue;
    return {
      rule,
      target: pathToRegexp.compile(rule.destination)(found.params),
    };
  }
  return undefined;
}

describe("next.config.ts redirects", () => {
  let redirects: Rule[];
  let rewrites: Rule[];

  beforeAll(async () => {
    vi.resetModules();
    // No MDX for the routing rules.
    vi.doMock("fumadocs-mdx/next", () => ({
      createMDX: () => (config: unknown) => config,
    }));
    const config = (await import("@/next.config")).default;
    redirects = ((await config.redirects?.()) ?? []) as Rule[];
    const phases = (await config.rewrites?.()) as {
      beforeFiles: Rule[];
      afterFiles: Rule[];
      fallback: Rule[];
    };
    rewrites = [
      ...phases.beforeFiles,
      ...phases.afterFiles,
      ...phases.fallback,
    ];
  }, 60_000);
  afterAll(() => {
    vi.doUnmock("fumadocs-mdx/next");
    vi.resetModules();
  });

  it("knows every language's segment but English's", () => {
    expect(formerDocsSegments()).toHaveLength(TRANSLATED_LOCALES.length);
    expect(formerDocsSegments()).toEqual(
      expect.arrayContaining(["es", "pt-br", "zh-hans", "hi"]),
    );
    expect(formerDocsSegments()).not.toContain("en");
  });

  it.each(formerDocsSegments())(
    "/%s/docs and its pages go to the English page, for now (307)",
    (segment) => {
      for (const [path, to] of [
        [`/${segment}/docs`, "/docs"],
        [`/${segment}/docs/angular`, "/docs/angular"],
        [
          `/${segment}/docs/help/dynamic-codes/password`,
          "/docs/help/dynamic-codes/password",
        ],
      ] as const) {
        const found = follow(redirects, path);
        expect(found?.target, path).toBe(to);
        // `permanent: false` is a 307 in Next.
        expect(found?.rule.permanent, path).toBe(false);
        expect(found?.rule.has, path).toBeUndefined();
      }
    },
  );

  it.each([
    ["/es/docs.md", "/docs.md"],
    ["/ja/docs.mdx", "/docs.mdx"],
    ["/zh-hans/docs/angular.md", "/docs/angular.md"],
    ["/pt-br/docs/developers/mcp.mdx", "/docs/developers/mcp.mdx"],
    ["/docs-md/es", "/docs.md"],
    ["/docs-md/de/teams", "/docs/teams.md"],
    ["/docs-md/pt-br/help/faq", "/docs/help/faq.md"],
  ])("the Markdown copy %s goes to %s", (path, to) => {
    const found = follow(redirects, path);
    expect(found?.target).toBe(to);
    expect(found?.rule.permanent).toBe(false);
  });

  it("leaves the English docs and their Markdown copies alone", () => {
    for (const path of [
      "/docs",
      "/docs/angular",
      "/docs/help/dynamic-codes/password",
      "/docs.md",
      "/docs/angular.md",
      "/llms.mdx/angular",
      "/llms-full.txt",
      "/api/search",
    ]) {
      expect(follow(redirects, path), path).toBeUndefined();
    }
  });

  it("still sends /en/docs to /docs for good (308)", () => {
    expect(follow(redirects, "/en/docs")?.target).toBe("/docs");
    expect(follow(redirects, "/en/docs/angular")?.target).toBe("/docs/angular");
    expect(follow(redirects, "/en/docs")?.rule.permanent).toBe(true);
  });

  it("doesn't take a path that only looks like a language's docs", () => {
    for (const path of ["/xx/docs", "/es/documentation", "/es/x/docs", "/es"]) {
      expect(follow(redirects, path), path).toBeUndefined();
    }
  });

  it("keeps no rewrite for the other languages", () => {
    for (const rule of rewrites) {
      expect(rule.source, rule.source).not.toMatch(/:lang|docs-md/);
      expect(rule.destination, rule.source).not.toMatch(/docs-md|\/en\/docs/);
    }
  });
});

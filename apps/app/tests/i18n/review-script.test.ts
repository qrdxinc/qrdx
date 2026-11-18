// Marking translated strings reviewed (scripts/i18n-review.ts): the marking
// on small fixtures, the writer against the real review files, then the
// command's refusals and its dry run on the real catalogs (nothing written).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TRANSLATED_LOCALES } from "@repo/i18n/config";
import { describe, expect, it } from "vitest";
import {
  type Catalog,
  flatten,
  formatJson,
  markReviewed,
  type ReviewFile,
  type ReviewStatus,
  sourceHash,
} from "@/lib/i18n/catalog";
import en from "@/messages/en.json";

const APP = path.join(import.meta.dirname, "../..");
const MESSAGES = path.join(APP, "messages");

const english: Catalog = {
  app: {
    signIn: { title: "Sign in", button: "Continue" },
    signInHelp: "Need help?",
  },
  nav: { home: "Home", docs: "Docs", pricing: "Pricing", blog: "Blog" },
};
const catalog: Catalog = {
  app: {
    signIn: { title: "Iniciar sesión", button: "Continuar" },
    signInHelp: "¿Necesitas ayuda?",
  },
  // nav.blog isn't translated.
  nav: { home: "Inicio", docs: "Documentación", pricing: "Precios" },
};
const entry = (message: string, status: ReviewStatus = "machine") => ({
  source: sourceHash(message),
  status,
});
// nav.docs was translated from older English; nav.pricing was never recorded.
const review: ReviewFile = {
  "app.signIn.title": entry("Sign in"),
  "app.signIn.button": entry("Continue", "reviewed"),
  "app.signInHelp": entry("Need help?"),
  "nav.home": entry("Home"),
  "nav.docs": entry("Documentation"),
};
const mark = (...prefixes: string[]) =>
  markReviewed({ english, catalog, review, prefixes });

describe("markReviewed", () => {
  it("marks fresh machine strings and leaves reviewed ones as they are", () => {
    const report = mark("app.signIn");
    expect(report.marked).toEqual(["app.signIn.title"]);
    expect(report.reviewed).toEqual(["app.signIn.button"]);
    expect(report.skipped).toEqual([]);
    expect(report.review["app.signIn.title"]).toEqual(
      entry("Sign in", "reviewed"),
    );
    // The review passed in is untouched.
    expect(review["app.signIn.title"]?.status).toBe("machine");
  });

  it("matches a prefix by whole key segments: app.signIn isn't app.signInHelp", () => {
    expect(mark("app.signIn").review["app.signInHelp"]?.status).toBe("machine");
    expect(mark("app.signInHelp").marked).toEqual(["app.signInHelp"]);
    expect(mark("app").marked).toEqual(["app.signIn.title", "app.signInHelp"]);
    expect(mark("app.sign", "nav.home", "shop").unmatched).toEqual([
      "app.sign",
      "shop",
    ]);
  });

  it("refuses stale, unrecorded and missing strings, in English key order", () => {
    const report = mark("nav");
    expect(report.marked).toEqual(["nav.home"]);
    expect(report.skipped).toEqual([
      {
        key: "nav.docs",
        reason: "stale (the English changed since it was translated)",
      },
      {
        key: "nav.pricing",
        reason: "no review entry (run i18n:translate --record)",
      },
      { key: "nav.blog", reason: "missing (shows in English)" },
    ]);
    expect(report.review["nav.docs"]).toEqual(review["nav.docs"]);
    expect(report.review["nav.pricing"]).toBeUndefined();
  });

  it("changes only the marked statuses in the written file", () => {
    const before = formatJson(review).split("\n");
    const report = mark("app", "nav");
    expect(report.marked).toHaveLength(3);
    const after = formatJson(report.review).split("\n");
    expect(after).toHaveLength(before.length);
    const changed = after.flatMap((line, i) =>
      line === before[i] ? [] : [[before[i], line]],
    );
    expect(changed).toEqual(
      report.marked.map(() => [
        '    "status": "machine"',
        '    "status": "reviewed"',
      ]),
    );
    expect(Object.keys(report.review)).toEqual(Object.keys(review));
  });
});

describe("the review files", () => {
  it.each(TRANSLATED_LOCALES)(
    "%s is written byte for byte the way the scripts write it",
    (locale) => {
      const text = readFileSync(
        path.join(MESSAGES, `review/${locale}.json`),
        "utf8",
      );
      expect(formatJson(JSON.parse(text))).toBe(text);
    },
  );
});

describe("bun run --filter app i18n:review", () => {
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/i18n-review.ts", ...args],
      { cwd: APP, encoding: "utf8" },
    );
  const files = () =>
    ["es.json", "review/es.json"].map((file) =>
      readFileSync(path.join(MESSAGES, file), "utf8"),
    );

  // These runs read the real catalogs. Each passes --dry-run as well, so a
  // refusal that stops working can't write to them.
  it("refuses English, an unknown locale, no prefix and a prefix that matches nothing", () => {
    const before = files();
    const source = run("en", "nav", "--dry-run");
    expect(source.status).toBe(1);
    expect(source.stderr).toContain("en is the source language");
    const unknown = run("xx", "nav", "--dry-run");
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('Unknown locale "xx"');
    const none = run("es", "--dry-run");
    expect(none.status).toBe(1);
    expect(none.stderr).toContain("Usage:");
    // One prefix that matches nothing stops the whole run.
    const unmatched = run("es", "nav", "app.sign", "--dry-run");
    expect(unmatched.status).toBe(1);
    expect(unmatched.stderr).toContain("No es string to review under app.sign");
    expect(files()).toEqual(before);
  }, 30_000);

  it("prints what a dry run would mark and writes nothing", () => {
    const before = files();
    const result = run("es", "nav", "--dry-run");
    const summary = result.stdout.match(
      /^es \(dry run, nothing written\): would mark (\d+), already reviewed (\d+), skipped (\d+)$/m,
    );
    expect(summary, result.stdout + result.stderr).not.toBeNull();
    const [would, already, skipped] = (summary ?? []).slice(1).map(Number);
    const listed = result.stdout
      .split("\n")
      .filter((line) => line.startsWith("would mark nav."));
    expect(listed).toHaveLength(would ?? -1);
    const nav = [...flatten(en as Catalog).keys()].filter((key) =>
      key.startsWith("nav."),
    );
    expect((would ?? 0) + (already ?? 0) + (skipped ?? 0)).toBe(nav.length);
    expect(files()).toEqual(before);
  }, 30_000);
});

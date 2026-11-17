// @repo/i18n (packages/i18n) holds the languages, URLs and docs rules the
// docs site shares with this app, and loads the docs' messages from a copy
// of their English namespaces (lib/i18n/docs-messages.ts writes it from
// messages/en.json before the docs site builds; it isn't committed). Built
// in memory here, the copy must load like this app's English catalog (the
// docs site checks it covers every namespace it reads).
import { TRANSLATED_LOCALES } from "@repo/i18n/config";
import {
  type DocsMessagesReader,
  loadDocsMessages,
} from "@repo/i18n/docs-messages";
import {
  DOCS_MESSAGES_COMMAND,
  DOCS_NAMESPACES,
  pickMessages,
} from "@repo/i18n/messages";
import { describe, expect, it } from "vitest";
import { docsMessagesFiles } from "@/lib/i18n/docs-messages";
import { loadMessages } from "@/lib/i18n/messages";

/** The copy as `i18n:docs-messages` would write it, without the disk. */
const files = docsMessagesFiles();
const inMemory: DocsMessagesReader = () =>
  Promise.resolve(JSON.parse(files.get("en.json") as string));

describe("the docs' copy of their messages", () => {
  it("is one English file, with the docs' namespaces only", () => {
    // The docs are English only: no other language gets a copy.
    expect([...files.keys()]).toEqual(["en.json"]);
    const text = files.get("en.json") as string;
    expect(text.endsWith("}\n")).toBe(true);
    expect(Object.keys(JSON.parse(text) as object).sort()).toEqual(
      [...DOCS_NAMESPACES].sort(),
    );
  });

  it("loads like this app's English catalog", async () => {
    const app = pickMessages(await loadMessages("en"), DOCS_NAMESPACES);
    expect(await loadDocsMessages(inMemory)).toEqual(app);
  });

  it("names the command when the copy wasn't written", async () => {
    const nothing: DocsMessagesReader = () =>
      Promise.reject(new Error("ENOENT"));
    await expect(loadDocsMessages(nothing)).rejects.toThrow(
      `packages/i18n/messages/en.json is missing: run \`${DOCS_MESSAGES_COMMAND}\` first`,
    );
    const broken: DocsMessagesReader = () => Promise.resolve([]);
    await expect(loadDocsMessages(broken)).rejects.toThrow(
      "packages/i18n/messages/en.json isn't a catalog",
    );
  });
});

describe("the translated catalogs", () => {
  // `docs` holds the docs site's own copy, which is English only. A
  // translation of it would never be shown (i18n:check fails on one).
  it.each(TRANSLATED_LOCALES)(
    "%s has no copy of the docs' strings",
    async (locale) => {
      const catalog = (await import(`@/messages/${locale}.json`)).default;
      expect(Object.keys(catalog)).not.toContain("docs");
    },
  );
});

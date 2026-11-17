// The docs assistant's empty state (components/chat): which tab a page is
// in, decided from the tabs' URLs so their titles don't matter, and a
// full set of suggested questions for every tab in the English catalog the
// docs read (packages/i18n/messages/en.json, written by zone-inputs).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { docsSectionOf } from "@/components/chat/section";
import {
  SUGGESTION_KEYS,
  SUGGESTION_SECTIONS,
} from "@/components/chat/suggestions";

const tab = (...urls: string[]) => ({ urls: new Set(urls) });

const TABS = [
  tab("/docs/help", "/docs/help/contact", "/docs/help/dynamic-codes/create"),
  tab("/docs/dynamic-qr-codes", "/docs/smart-routing", "/docs/teams"),
  tab("/docs/developers", "/docs/developers/mcp", "/docs/webhooks"),
  tab("/docs/getting-started", "/docs/usage", "/docs/components/qr-code"),
  tab("/docs/self-hosting"),
];

describe("docsSectionOf", () => {
  it("names the tab a page is in, by the tabs' pages", () => {
    expect(docsSectionOf("/docs/help/contact", TABS)).toBe("help");
    expect(docsSectionOf("/docs/smart-routing", TABS)).toBe("guides");
    expect(docsSectionOf("/docs/webhooks", TABS)).toBe("developers");
    expect(docsSectionOf("/docs/components/qr-code", TABS)).toBe("react");
    expect(docsSectionOf("/docs/self-hosting", TABS)).toBe("selfHosting");
  });

  it("ignores a query or a hash", () => {
    expect(docsSectionOf("/docs/help/contact?x=1", TABS)).toBe("help");
    expect(docsSectionOf("/docs/developers/mcp#top", TABS)).toBe("developers");
  });

  it("falls back to home for /docs and pages no tab lists", () => {
    expect(docsSectionOf("/docs", TABS)).toBe("home");
    expect(docsSectionOf("/docs/unknown", TABS)).toBe("home");
    expect(docsSectionOf("/docs/help", [{}])).toBe("home");
  });
});

describe("suggested questions", () => {
  const catalog = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "../../../../packages/i18n/messages/en.json"),
      "utf8",
    ),
  ) as { docs: { chat: { suggestions: Record<string, string> } } };

  // One level: "home_q1", not "home.q1" (next-intl's key types give up on
  // deeper nesting and the shell's strings lose their types with it).
  it("exist for every section and key, as real questions", () => {
    const questions = catalog.docs.chat.suggestions;
    expect(Object.keys(questions).sort()).toEqual(
      SUGGESTION_SECTIONS.flatMap((section) =>
        SUGGESTION_KEYS.map((key) => `${section}_${key}`),
      ).sort(),
    );
    for (const section of SUGGESTION_SECTIONS) {
      for (const key of SUGGESTION_KEYS) {
        const question = questions[`${section}_${key}`] ?? "";
        expect(question.length, `${section}.${key}`).toBeGreaterThan(10);
        expect(question.endsWith("?"), `${section}.${key}`).toBe(true);
      }
    }
  });
});

// The /ai/art FAQ's answers are in the server-rendered HTML while closed, as
// native <details> (a closed Radix accordion panel has no content, so
// crawlers saw 12 questions and 1 answer), and match the FAQPage structured
// data word for word, plan allowances included.
import { describe, expect, it, vi } from "vitest";
import { renderIntl } from "../support/intl";

vi.mock(
  "next-intl/server",
  async () => (await import("../support/intl")).intlServer,
);

import { ALLOWANCES } from "@/app/[lang]/(home)/ai/art/content";
import { AIArtFAQ } from "@/components/sections/ai-art/ai-art-faq";

const html = renderIntl(await AIArtFAQ({ allowances: ALLOWANCES }));

/** Text of `html` with tags dropped and entities decoded. */
const text = (fragment: string) => {
  // Strip until nothing changes, so no tag survives a partial match.
  let stripped = fragment;
  for (let previous = ""; stripped !== previous; ) {
    previous = stripped;
    stripped = stripped.replace(/<[^>]*>/g, "");
  }
  // `&amp;` last, so "&amp;quot;" becomes "&quot;" and not a quote.
  return stripped
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .trim();
};

const schema = JSON.parse(
  html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1] ?? "{}",
) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };

const details = [...html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];

describe("/ai/art FAQ (server HTML)", () => {
  it("renders one closed <details> per question, one open at a time", () => {
    expect(details.length).toBe(schema.mainEntity.length);
    expect(details.length).toBeGreaterThan(0);
    for (const [, attributes] of details) {
      expect(attributes).toContain('name="ai-art-faq"');
      // The `open` attribute, not the `open:` class variant
      expect(attributes).not.toMatch(/(^|\s)open(=|\s|$)/);
    }
  });

  it("has every answer in the HTML, matching the structured data", () => {
    details.forEach(([, , body], index) => {
      const entity = schema.mainEntity[index];
      const question = text(
        body?.match(/<summary\b[^>]*>([\s\S]*?)<svg/)?.[1] ?? "",
      );
      const answer = text(body?.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
      expect(question).toBe(entity?.name);
      expect(answer).toBe(entity?.acceptedAnswer.text);
      expect(answer.length).toBeGreaterThan(20);
      // Each question is a heading, as the accordion's header was.
      expect(body).toMatch(/<summary\b[^>]*><h3>[^<]+<\/h3>/);
    });
  });

  it("states each plan's monthly allowance in the visible answer", () => {
    const visible = text(html.replace(/<script[\s\S]*?<\/script>/g, ""));
    const count = (value: number | null) =>
      value === null ? "unlimited" : String(value);
    expect(visible).toContain(
      `Free accounts get ${count(ALLOWANCES.free)} credits a month, Pro ${count(ALLOWANCES.pro)} and Business ${count(ALLOWANCES.business)}`,
    );
  });
});

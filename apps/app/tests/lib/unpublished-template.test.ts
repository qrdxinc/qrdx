// A hosted page nobody has published yet (lib/landing/template-samples.ts
// isUnpublishedTemplate): still at version 1 and exactly one of its type's
// templates. Scans of it get "This page isn't ready yet" instead of the
// template's samples (in November 2026, PDF pages whose owners never
// published showed "Everything in the box · Aero 2 user guide" to the
// people scanning them). Anything the owner published, or any page made
// with content of its own, still renders.
import { describe, expect, it } from "vitest";
import { parseLandingPageContent } from "@/lib/landing/blocks";
import { isUnpublishedTemplate } from "@/lib/landing/template-samples";
import { buildTemplateContent, listTemplates } from "@/lib/landing/templates";
import type { LandingPageContent } from "@/types/landing";

/** As the database gives it back: JSON, then parsed for reading. */
function stored(content: LandingPageContent): LandingPageContent {
  const parsed = parseLandingPageContent(JSON.parse(JSON.stringify(content)), {
    mode: "read",
  });
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

const variants = listTemplates().flatMap((template) =>
  template.variants.map((variant) => [template.type, variant.id] as const),
);

describe("isUnpublishedTemplate", () => {
  it.each(variants)(
    "a new %s/%s page, read back from the database, isn't published",
    (type, variantId) => {
      // Built twice: block and item ids differ between pages.
      const content = stored(buildTemplateContent(type, variantId));
      expect(
        JSON.stringify(content) ===
          JSON.stringify(buildTemplateContent(type, variantId)),
      ).toBe(false);
      expect(isUnpublishedTemplate({ type, version: 1, content })).toBe(true);
    },
  );

  it("counts a published page as published, even with the template unchanged", () => {
    const content = stored(buildTemplateContent("pdf", "document"));
    expect(isUnpublishedTemplate({ type: "pdf", version: 2, content })).toBe(
      false,
    );
  });

  it("counts any change of the owner's as content", () => {
    const content = stored(buildTemplateContent("pdf", "document"));
    const withPdf: LandingPageContent = {
      ...content,
      blocks: content.blocks.map((block) =>
        block.type === "pdf"
          ? {
              ...block,
              props: {
                ...block.props,
                source: { type: "url", url: "https://acme.test/menu.pdf" },
              },
            }
          : block,
      ),
    };
    expect(
      isUnpublishedTemplate({ type: "pdf", version: 1, content: withPdf }),
    ).toBe(false);

    const fewerBlocks = { ...content, blocks: content.blocks.slice(1) };
    expect(
      isUnpublishedTemplate({ type: "pdf", version: 1, content: fewerBlocks }),
    ).toBe(false);

    const otherTheme = {
      ...content,
      theme: { ...content.theme, radius: content.theme.radius + 1 },
    };
    expect(
      isUnpublishedTemplate({ type: "pdf", version: 1, content: otherTheme }),
    ).toBe(false);
  });

  it("never matches another type's template or an unknown type", () => {
    const pdf = stored(buildTemplateContent("pdf", "document"));
    expect(
      isUnpublishedTemplate({ type: "links", version: 1, content: pdf }),
    ).toBe(false);
    expect(
      isUnpublishedTemplate({ type: "no-such-type", version: 1, content: pdf }),
    ).toBe(false);
  });
});

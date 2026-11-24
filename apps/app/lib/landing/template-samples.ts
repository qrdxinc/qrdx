import type { LandingPageContent } from "@/types/landing";
import { listBlocks } from "./blocks";
import { collectSampleTexts } from "./samples";
import { buildTemplateContent, getTemplate } from "./templates";

/**
 * The wording a page of `type` starts with: its templates' headings, labels
 * and notes, and every block's defaults ("Your name", "Visit our website").
 * The page editor marks what's still unchanged as a sample (lib/landing/samples.ts).
 * Kept apart from samples.ts so the client editor gets the words, not every
 * template.
 */
export function templateSampleTexts(type: string): string[] {
  const texts = new Set<string>();
  for (const variant of getTemplate(type)?.variants ?? []) {
    collectSampleTexts(buildTemplateContent(type, variant.id).blocks, texts);
  }
  for (const block of listBlocks()) {
    collectSampleTexts(block.defaults, texts);
  }
  return [...texts];
}

/**
 * The content as JSON with its keys sorted and every `id` left out: block
 * and item ids are random for each new page, everything else in a template
 * is the same each time it's built.
 */
function withoutIds(value: unknown): string {
  return JSON.stringify(value, (key, inner: unknown) => {
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return Object.fromEntries(
        Object.entries(inner)
          .filter(([name]) => name !== "id")
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      );
    }
    return key === "id" ? undefined : inner;
  });
}

/**
 * Whether a page was never published: still at its first version, and its
 * content is exactly one of its type's templates as a new page gets it.
 * A page's stored content only changes when it's published, so this is a
 * page nobody has put their own content on yet. Scans of it get "This page
 * isn't ready yet" instead of the template's sample name, photos and text
 * (app/(app)/p/[slug]/page.tsx).
 *
 * Both sides are parsed content (the blocks' defaults filled in), so a block
 * gaining an option doesn't count as a change. A page whose type's template
 * wording changed since it was made no longer matches, and shows as before.
 * Pages made with content of their own at version 1 (a code switched to a
 * page, a community template) never match a built-in template.
 */
export function isUnpublishedTemplate(page: {
  type: string;
  version: number;
  content: LandingPageContent;
}): boolean {
  if (page.version !== 1) return false;
  const variants = getTemplate(page.type)?.variants ?? [];
  if (variants.length === 0) return false;
  const content = withoutIds(page.content);
  return variants.some(
    (variant) =>
      withoutIds(buildTemplateContent(page.type, variant.id)) === content,
  );
}

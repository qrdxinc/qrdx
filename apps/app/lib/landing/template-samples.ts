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

import type { LandingBlock, LandingPageContent } from "@/types/landing";
import { getBlock } from "./blocks";

// Sample content on hosted pages: what a page type's template and the blocks'
// defaults ship with (example.com links, @example.com addresses, 555-01xx
// numbers, a service's front page in place of a profile, the template
// photos and wording) until the owner replaces it. Client-safe and pure:
//
// - the page editor marks samples, lists them before publishing and removes
//   them in one go (findSamples, removeSamples);
// - the public page never shows a sample link (withoutSampleLinks in
//   app/(app)/p/_lib/public-page.ts), so a page published with its samples
//   doesn't send visitors to example.com. Sample text and photos still show.
//
// tests/lib/landing-samples.test.ts checks that every link in every template
// and block default counts as a sample.

/** Where the template photos live (lib/landing/templates/media.ts TEMPLATE_MEDIA_PATH). */
export const TEMPLATE_PHOTO_PATH = "/images/templates/";

/** RFC 2606's example domains, and their subdomains. */
const EXAMPLE_DOMAIN = /(^|\.)example\.(com|net|org)$/i;

/** 555-0100 to 555-0199: North American numbers set aside for fiction. */
const SAMPLE_PHONE_DIGITS = /^1?(\d{3})?55501\d{2}$/;

/**
 * Links the templates use that open a service's front page or a stock
 * video, not anyone's own profile, as host + path (no "www.", no trailing
 * slash).
 */
const SAMPLE_PLACEHOLDER_LINKS: ReadonlySet<string> = new Set([
  "apps.apple.com",
  "bandcamp.com",
  "behance.net",
  "bsky.app",
  "cash.app",
  "discord.com",
  "dribbble.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "mixcloud.com",
  "music.apple.com",
  "open.spotify.com",
  "paypal.me",
  "pinterest.com",
  "play.google.com/store/apps",
  "podcasts.apple.com",
  "soundcloud.com",
  "threads.net",
  "tiktok.com",
  "venmo.com",
  "wise.com",
  "x.com",
  "youtube.com",
  // The templates' sample video
  "youtube.com/watch?v=aqz-KE-bpKQ",
]);

/**
 * Blocks that are a list of links: one whose every item was a sample has
 * nothing left to show and goes.
 */
const LINK_LIST_BLOCKS: ReadonlySet<string> = new Set(["links", "socials"]);

/** Props that hold words a visitor reads (headings, labels, names, notes). */
const TEXT_KEYS: ReadonlySet<string> = new Set([
  "eyebrow",
  "title",
  "subtitle",
  "heading",
  "label",
  "description",
  "body",
  "text",
  "note",
  "name",
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "value",
  "details",
  "terms",
  "address",
]);

/** Props whose value names the item in a list ("Register your warranty"). */
const ITEM_NAME_KEYS = ["label", "title", "name", "network", "platform"];

/**
 * Blocks that are only their words and links: once everything in one is a
 * sample, removing samples removes the block. Others (a PDF, a gallery, a
 * form) keep their slot for the owner's own file or fields.
 */
const WORDS_ONLY_BLOCKS: ReadonlySet<string> = new Set([
  "header",
  "text",
  "links",
  "socials",
  "button",
  "contact",
  "details",
  "menu",
  "rating",
]);

function isSampleEmail(address: string): boolean {
  const domain = address.trim().split("@")[1]?.split("?")[0] ?? "";
  return EXAMPLE_DOMAIN.test(domain);
}

function isSamplePhone(number: string): boolean {
  return SAMPLE_PHONE_DIGITS.test(number.replace(/\D/g, ""));
}

function isSampleWebLink(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (EXAMPLE_DOMAIN.test(host)) return true;
  if (/yourname/i.test(url.pathname + url.search)) return true;
  const path = url.pathname.replace(/\/+$/, "");
  return SAMPLE_PLACEHOLDER_LINKS.has(`${host}${path}${url.search}`);
}

/**
 * Whether a link, address or phone number is a template's stand-in:
 * https://example.com/…, hello@example.com, tel:+1 555 0142, a profile link
 * with no profile ("https://instagram.com/", "https://paypal.me/yourname").
 */
export function isSampleLink(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^mailto:/i.test(text)) return isSampleEmail(text.slice(7));
  if (/^tel:/i.test(text)) return isSamplePhone(text.slice(4));
  if (/^https?:\/\//i.test(text)) return isSampleWebLink(text);
  if (/^[^\s@]+@[^\s@]+$/.test(text)) return isSampleEmail(text);
  if (/^\+?[\d\s().-]{7,}$/.test(text)) return isSamplePhone(text);
  return false;
}

/** Whether an image URL is one of the template photos. */
export function isSamplePhoto(value: string): boolean {
  return value.includes(TEMPLATE_PHOTO_PATH);
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** A link, address or number that isn't a sample, or an uploaded file. */
function isOwnerData(key: string, value: string): boolean {
  if (key === "fileId") return value.length > 0;
  return (
    (/^(https?:|mailto:|tel:)/i.test(value) ||
      /^[^\s@]+@[^\s@]+$/.test(value)) &&
    !isSampleLink(value) &&
    !isSamplePhoto(value)
  );
}

/** The object's own sample link, if it has one (not its children's). */
function ownSampleLink(item: Json): string | null {
  for (const value of Object.values(item)) {
    if (typeof value === "string" && isSampleLink(value)) return value;
  }
  return null;
}

/** The object is an image source (`{ url, … }`) showing a template photo. */
function isSamplePhotoObject(item: Json): boolean {
  return typeof item.url === "string" && isSamplePhoto(item.url);
}

/**
 * The template photo a list item shows: the item itself (`{ url, alt }`) or
 * its image source (a gallery image's `source`).
 */
function photoIn(item: Json): Json | null {
  if (isSamplePhotoObject(item)) return item;
  for (const child of Object.values(item)) {
    if (isObject(child) && isSamplePhotoObject(child)) return child;
  }
  return null;
}

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

function itemName(item: Json): string | null {
  return firstText(...ITEM_NAME_KEYS.map((key) => item[key]));
}

/** "example.com/warranty" from "https://example.com/warranty". */
export function displayLink(value: string): string {
  return value
    .trim()
    .replace(/^(https?:\/\/|mailto:|tel:)/i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

export type SampleKind = "link" | "photo" | "text";

export interface SampleItem {
  blockId: string;
  blockType: string;
  kind: SampleKind;
  /** What the owner recognizes: the item's label, the heading, the photo's description */
  text: string;
  /** For links: where it points ("example.com/warranty") */
  link?: string;
}

/** Text of a page type's templates (lib/landing/template-samples.ts). */
export type SampleTexts = ReadonlySet<string>;

function collect(
  value: unknown,
  block: LandingBlock,
  texts: SampleTexts,
  found: SampleItem[],
  inList = false,
): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, block, texts, found, true);
    return;
  }
  if (!isObject(value)) return;
  const base = { blockId: block.id, blockType: block.type };
  const link = ownSampleLink(value);
  // A list item (a link, a social profile, a gallery photo) is one sample.
  if (inList && link) {
    const shown = displayLink(link);
    found.push({
      ...base,
      kind: "link",
      text: itemName(value) ?? shown,
      link: shown,
    });
    return;
  }
  const photo = inList ? photoIn(value) : null;
  if (photo) {
    const text = firstText(value.alt, photo.alt, value.caption) ?? "Photo";
    found.push({ ...base, kind: "photo", text });
    return;
  }
  // Anything else (a block's props, a nested object): each of its fields.
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      if (isSampleLink(item)) {
        const shown = displayLink(item);
        found.push({
          ...base,
          kind: "link",
          text: itemName(value) ?? shown,
          link: shown,
        });
      } else if (
        TEXT_KEYS.has(key) &&
        texts.has(item) &&
        !(link && ITEM_NAME_KEYS.includes(key))
      ) {
        found.push({ ...base, kind: "text", text: item });
      }
    } else if (isObject(item) && isSamplePhotoObject(item)) {
      found.push({
        ...base,
        kind: "photo",
        text: firstText(item.alt) ?? "Photo",
      });
    } else if (typeof item === "object") {
      collect(item, block, texts, found);
    }
  }
}

/** The page's visible sample links, photos and (given its template's text) wording, in page order. */
export function findSamples(
  content: LandingPageContent,
  texts: SampleTexts = new Set(),
): SampleItem[] {
  const found: SampleItem[] = [];
  for (const block of content.blocks) {
    if (block.hidden) continue;
    collect(block.props, block, texts, found);
  }
  return found;
}

/** Sample counts by block id (the editor's "Sample" badges). */
export function samplesByBlock(items: SampleItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.blockId, (counts.get(item.blockId) ?? 0) + 1);
  }
  return counts;
}

interface Cleaned {
  value: unknown;
  /** A list that had items lost all of them */
  emptied: boolean;
}

/**
 * Drops list items that link to a sample (and, with `photos`, list items
 * showing a template photo), empties a field holding a sample link, leaves
 * out a nested object that links to one (an event's call to action) and,
 * with `photos`, image props showing a template photo. Returns a new value;
 * the input isn't changed.
 */
function clean(value: unknown, photos: boolean): Cleaned {
  if (Array.isArray(value)) {
    let emptied = false;
    const kept: unknown[] = [];
    for (const item of value) {
      if (
        isObject(item) &&
        (ownSampleLink(item) || (photos && photoIn(item)))
      ) {
        continue;
      }
      const next = clean(item, photos);
      emptied ||= next.emptied;
      kept.push(next.value);
    }
    return {
      value: kept,
      emptied: emptied || (value.length > 0 && kept.length === 0),
    };
  }
  if (!isObject(value)) return { value, emptied: false };
  let emptied = false;
  const next: Json = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && isSampleLink(item)) {
      next[key] = "";
    } else if (
      isObject(item) &&
      (ownSampleLink(item) || (photos && isSamplePhotoObject(item)))
    ) {
      // Left out: optional props validate without it; a block that needs it
      // fails validation and isn't kept.
    } else {
      const cleaned = clean(item, photos);
      emptied ||= cleaned.emptied;
      next[key] = cleaned.value;
    }
  }
  return { value: next, emptied };
}

/** The block's props, validated by its schema, or null when they no longer pass. */
function validProps(type: string, props: unknown): Json | null {
  const definition = getBlock(type);
  if (!definition) return null;
  const result = definition.schema.safeParse(props);
  return result.success ? (result.data as Json) : null;
}

/** Sample text, and nothing the owner added: no own link, address, file or other wording. */
function onlySampleWords(value: unknown, texts: SampleTexts): boolean {
  let sampleWords = 0;
  let ownData = false;
  const visit = (item: unknown, key: string) => {
    if (ownData) return;
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry, key);
    } else if (isObject(item)) {
      for (const [childKey, child] of Object.entries(item))
        visit(child, childKey);
    } else if (typeof item === "string" && item.trim()) {
      if (isOwnerData(key, item)) {
        ownData = true;
      } else if (TEXT_KEYS.has(key)) {
        if (texts.has(item)) sampleWords += 1;
        else ownData = true;
      }
    }
  };
  visit(value, "");
  return !ownData && sampleWords > 0;
}

/**
 * The page without its samples: sample links and template photos go, and a
 * words-only block (a header, links, a menu) that held nothing but samples
 * goes too. The owner's own text, links and files stay, and a block that no
 * longer validates without its sample is dropped rather than published broken.
 */
export function removeSamples(
  content: LandingPageContent,
  texts: SampleTexts = new Set(),
): LandingPageContent {
  const blocks: LandingBlock[] = [];
  for (const block of content.blocks) {
    if (
      WORDS_ONLY_BLOCKS.has(block.type) &&
      onlySampleWords(block.props, texts)
    ) {
      continue;
    }
    const cleaned = clean(block.props, true);
    if (cleaned.emptied && LINK_LIST_BLOCKS.has(block.type)) continue;
    const props = validProps(block.type, cleaned.value);
    if (!props) continue;
    blocks.push({ ...block, props });
  }
  return { ...content, blocks };
}

/**
 * The page as visitors see it: no link, button or embed that points at a
 * sample. A list loses its sample items (a links block with nothing else
 * left goes), a single sample link is emptied, and a block that needs the
 * link it lost (a button) isn't shown. Sample text and photos stay; the
 * editor asks the owner about those.
 */
export function withoutSampleLinks(
  content: LandingPageContent,
): LandingPageContent {
  let changed = false;
  const blocks: LandingBlock[] = [];
  for (const block of content.blocks) {
    const cleaned = clean(block.props, false);
    if (JSON.stringify(cleaned.value) === JSON.stringify(block.props)) {
      blocks.push(block);
      continue;
    }
    changed = true;
    if (cleaned.emptied && LINK_LIST_BLOCKS.has(block.type)) continue;
    const props = validProps(block.type, cleaned.value);
    if (props) blocks.push({ ...block, props });
  }
  return changed ? { ...content, blocks } : content;
}

/**
 * Adds the reader-facing wording in `value` (headings, labels, notes) of two
 * words or more to `into`: single words such as "Downloads" or "Espresso"
 * are too common to call a sample.
 */
export function collectSampleTexts(
  value: unknown,
  into: Set<string>,
  key = "",
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectSampleTexts(item, into, key);
  } else if (isObject(value)) {
    for (const [childKey, child] of Object.entries(value)) {
      collectSampleTexts(child, into, childKey);
    }
  } else if (
    typeof value === "string" &&
    TEXT_KEYS.has(key) &&
    /\S\s+\S/.test(value.trim())
  ) {
    into.add(value);
  }
  return into;
}

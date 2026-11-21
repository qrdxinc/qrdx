// Message catalogs. apps/app/messages holds every string, in English and
// each language, and the main app loads those (apps/app/lib/i18n/messages.ts).
// An app that can't import the main app's files (the docs site, which is
// English only) reads a copy of the English namespaces the docs use
// (DOCS_NAMESPACES) from messages/en.json through docs-messages.ts. The copy
// isn't committed: that app writes it right before it builds or starts
// (DOCS_MESSAGES_COMMAND), so it can't go stale between merges.
//
// English is the source; in the main app a key a translation lacks falls
// back to English, so a slip never shows a raw key.

type Catalog = Record<string, unknown>;

const isObject = (value: unknown): value is Catalog =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `base` with every string `override` has for the same key. */
export function mergeMessages<T extends Catalog>(
  base: T,
  override: unknown
): T {
  if (!isObject(override)) return base;
  const out: Catalog = { ...base };
  for (const [key, value] of Object.entries(base)) {
    const next = override[key];
    if (isObject(value)) out[key] = mergeMessages(value, next);
    else if (typeof next === "string" && next.trim() !== "") out[key] = next;
  }
  return out as T;
}

/**
 * The parts of a catalog client components read, by dotted path
 * ("home.editor"), so the browser gets only those, not every page's copy.
 */
export function pickMessages(
  messages: Catalog,
  paths: readonly string[]
): Catalog {
  const out: Catalog = {};
  for (const path of paths) {
    const keys = path.split(".");
    let source: unknown = messages;
    for (const key of keys) source = isObject(source) ? source[key] : undefined;
    if (source === undefined) continue;
    let target = out;
    for (const key of keys.slice(0, -1)) {
      if (!isObject(target[key])) target[key] = {};
      target = target[key] as Catalog;
    }
    target[keys.at(-1) as string] = source;
  }
  return out;
}

/** What every page's client components translate: the shared chrome. */
export const CHROME_NAMESPACES = [
  "nav",
  "footer",
  "localeSwitcher",
  "consent",
  // The sign-in dialog and "Confirm it's you", mounted on every page.
  "auth",
  // The "New" pill on recently added options (apps/app/components/new-tag.tsx)
  "common.newTag",
  "common.nameIsNew",
] as const;

/**
 * The namespaces the docs read, copied into messages/en.json: the docs
 * interface (`docs`), the product links under every docs page (`footer`),
 * the site's title and description (`meta`) and the cookie banner
 * (`consent`).
 */
export const DOCS_NAMESPACES = ["consent", "docs", "footer", "meta"] as const;

/** Where the docs catalog is written, from the repository root (not committed). */
export const DOCS_MESSAGES_DIR = "packages/i18n/messages";

/** The copy's one file: the docs are English only. */
export const DOCS_MESSAGES_FILE = "en.json";

/** Writes the copy (apps/app/scripts/i18n-docs-messages.ts). */
export const DOCS_MESSAGES_COMMAND = "bun run --filter app i18n:docs-messages";

/**
 * The namespaces of `catalog` the docs read, in the catalog's own order.
 */
export function docsMessages(catalog: Catalog): Catalog {
  const names = new Set<string>(DOCS_NAMESPACES);
  return Object.fromEntries(
    Object.entries(catalog).filter(([name]) => names.has(name))
  );
}

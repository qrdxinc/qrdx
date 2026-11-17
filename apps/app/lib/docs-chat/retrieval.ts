// How the docs assistant and the MCP docs tools read the docs: through the
// docs site's own public endpoints, fetched from the server. A search is
// GET <docs>/api/search?query=…&locale=… (fumadocs' search route, one index
// per language); a page is its Markdown copy, GET <docs>/docs/<path>.md
// (or /<lang>/docs/<path>.md), the same text "Copy Markdown" gives readers.
// No index of our own, no vector store: the docs app already keeps both.
//
// Pure apart from `fetch`: the docs origin, the public origin, `fetch` and
// the availability check are passed in, so the tests run on fakes and
// nothing here reads the environment (lib/docs-chat/server.ts does).

import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_INFO,
  type Locale,
} from "@repo/i18n/config";
import {
  docsLocaleFromSegment,
  englishDocsPath,
  hasDocs,
} from "@repo/i18n/docs";
import { DOCS_CHAT } from "./config";

/** One page a search found, with the best snippet the index had for it. */
export interface DocsSearchHit {
  /** The page's title. */
  title: string;
  /** Its docs path as served in the searched language: /docs/a, /es/docs/a. */
  path: string;
  /** Its public URL. */
  url: string;
  /** A short passage that matched, or the page's description. */
  snippet: string;
  /** The tab or section the page sits in ("Help", "Developers"), when known. */
  section?: string;
}

export interface DocsSearchResult {
  hits: DocsSearchHit[];
  /** The language the hits came from: English when the asked one had none. */
  lang: Locale;
}

/** A docs page as Markdown, cut to the size the model may read. */
export interface DocsPage {
  title: string;
  /** The path it was read from (with its language prefix, if any). */
  path: string;
  url: string;
  /** The language of the text: English when the page isn't translated. */
  lang: Locale;
  markdown: string;
  /** True when the text was cut at DOCS_CHAT.maxPageChars. */
  truncated: boolean;
}

export type DocsRetrievalErrorCode =
  | "invalid_path"
  | "not_found"
  | "unavailable"
  | "fetch_failed";

export class DocsRetrievalError extends Error {
  constructor(
    readonly code: DocsRetrievalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DocsRetrievalError";
  }
}

export interface DocsRetrieverOptions {
  /** Where the docs site answers (DOCS_ZONE_URL, or qrdx.dev), any trailing slash dropped. */
  docsOrigin: string;
  /** The origin readers see the docs on (the app URL), for the hits' URLs. */
  publicOrigin: string;
  fetch?: typeof fetch;
  /**
   * False for a docs page this deployment hides because its feature isn't
   * set up (lib/feature-availability.ts isPathAvailable, by English path).
   * Such pages are never returned or read. Defaults to everything shown.
   */
  isPathAvailable?: (englishPath: string) => boolean;
  now?: () => number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  fetchTimeoutMs?: number;
}

/** A fumadocs search result (fumadocs-core/search SortedResult). */
interface SortedResult {
  id: string;
  url: string;
  type: "page" | "heading" | "text";
  content: string;
  breadcrumbs?: string[];
}

const DOCS_PATH = /^\/docs(?:\/[a-z0-9]+(?:[-.][a-z0-9]+)*)*$/;

/**
 * A docs path the retriever accepts, from what a model or an agent passed:
 * "/docs/developers/mcp", "docs/developers/mcp.md", a full URL on
 * `publicOrigin` or `docsOrigin`, with or without a language prefix. Query
 * strings, hashes and the .md/.mdx suffix are dropped. Null for anything
 * else (another site, a path outside the docs, odd characters).
 */
export function normalizeDocsPath(
  input: string,
  origins: readonly string[] = [],
): { path: string; lang: Locale } | null {
  let raw = input.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (!origins.some((origin) => sameOrigin(origin, url.origin))) return null;
    raw = url.pathname;
  }
  raw = raw.split(/[?#]/, 1)[0] ?? raw;
  if (!raw.startsWith("/")) raw = `/${raw}`;
  raw = raw.replace(/\/+$/, "").replace(/\.mdx?$/, "");
  // A language prefix: /es/docs/a.
  let lang: Locale = DEFAULT_LOCALE;
  const prefixed = /^\/([^/]+)(\/docs(?:\/.*)?)$/.exec(raw);
  if (prefixed) {
    const locale = docsLocaleFromSegment(prefixed[1]);
    if (!locale) return null;
    lang = locale;
    raw = prefixed[2] as string;
  }
  if (raw === "/docs/index") raw = "/docs";
  if (!DOCS_PATH.test(raw)) return null;
  return { path: raw, lang };
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** The path of a docs page in `lang`: /docs/a in English, /pt-br/docs/a in Portuguese. */
export function localizedDocsPath(englishPath: string, lang: Locale): string {
  if (lang === DEFAULT_LOCALE) return englishPath;
  return `/${LOCALE_INFO[lang].segment}${englishPath}`;
}

/** "/docs/developers/mcp" → "Developers"; "/docs" and one-level pages have none. */
function sectionOf(englishPath: string): string | undefined {
  const parts = englishPath.split("/").filter(Boolean);
  if (parts.length < 3) return undefined;
  const folder = parts[1] as string;
  return folder.charAt(0).toUpperCase() + folder.slice(1).replaceAll("-", " ");
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The hits of one search, grouped by page in the order fumadocs ranked
 * them: the page row gives the title, the first heading or text row the
 * snippet. Pages this deployment hides are left out.
 */
export function groupSearchResults(
  rows: SortedResult[],
  options: {
    publicOrigin: string;
    limit: number;
    isPathAvailable: (englishPath: string) => boolean;
  },
): DocsSearchHit[] {
  const byPath = new Map<string, DocsSearchHit & { hasSnippet: boolean }>();
  for (const row of rows) {
    const pathname = (row.url.split(/[?#]/, 1)[0] ?? row.url).replace(
      /\/+$/,
      "",
    );
    const normalized = normalizeDocsPath(pathname);
    if (!normalized) continue;
    const path = localizedDocsPath(normalized.path, normalized.lang);
    const english = englishDocsPath(path);
    if (!options.isPathAvailable(english)) continue;
    let hit = byPath.get(path);
    if (!hit) {
      if (byPath.size >= options.limit) continue;
      hit = {
        title: "",
        path,
        url: `${options.publicOrigin}${path}`,
        snippet: "",
        section: sectionOf(english),
        hasSnippet: false,
      };
      byPath.set(path, hit);
    }
    const content = oneLine(String(row.content ?? ""));
    if (row.type === "page") {
      if (!hit.title) hit.title = content;
    } else if (!hit.hasSnippet && content) {
      hit.snippet = cut(content, DOCS_CHAT.snippetChars);
      hit.hasSnippet = true;
    }
  }
  return [...byPath.values()].map(({ hasSnippet: _, ...hit }) => ({
    ...hit,
    title: hit.title || hit.path.split("/").pop() || hit.path,
  }));
}

/**
 * The parts of a page's Markdown copy (lib/get-llm-text.tsx in the docs
 * app): "# Title (Section)", a "URL:" line, a "Source:" line, the
 * description, then the body. The title loses its "(Section)" suffix.
 */
export function parseMarkdownPage(text: string): {
  title: string;
  body: string;
} {
  const lines = text.split("\n");
  let title = "";
  let index = 0;
  if (lines[0]?.startsWith("# ")) {
    title = lines[0].slice(2).trim();
    index = 1;
  }
  while (index < lines.length) {
    const line = lines[index] as string;
    if (
      line.trim() === "" ||
      line.startsWith("URL:") ||
      line.startsWith("Source:")
    ) {
      index++;
      continue;
    }
    break;
  }
  return {
    title: title.replace(/\s*\([^()]*\)\s*$/, "").trim(),
    body: lines.slice(index).join("\n").trim(),
  };
}

interface CacheEntry<T> {
  expires: number;
  value: T;
}

/** A small TTL cache that drops its oldest entry past `max`. */
class SmallCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttl: number,
    private readonly max: number,
    private readonly now: () => number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { expires: this.now() + this.ttl, value });
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

export interface DocsRetriever {
  /** Search the docs in `lang`; falls back to English when nothing matches. */
  search(
    query: string,
    lang?: Locale,
    limit?: number,
  ): Promise<DocsSearchResult>;
  /**
   * A docs page as Markdown, in `lang` when it's translated, else English.
   * `input` is a path or URL as normalizeDocsPath takes it; its own
   * language prefix wins over `lang`.
   */
  readPage(input: string, lang?: Locale): Promise<DocsPage>;
  /** The origins readPage accepts URLs on. */
  readonly origins: readonly string[];
}

/**
 * The language of a docs request, as a locale ("pt-BR", what next-intl's
 * useLocale gives the client) or a URL segment ("pt-br"): a language with
 * docs, else English.
 */
export function docsLang(value: string | undefined | null): Locale {
  if (!value) return DEFAULT_LOCALE;
  if (isLocale(value) && hasDocs(value)) return value;
  return docsLocaleFromSegment(value.toLowerCase()) ?? DEFAULT_LOCALE;
}

export function createDocsRetriever(
  options: DocsRetrieverOptions,
): DocsRetriever {
  const docsOrigin = options.docsOrigin.replace(/\/+$/, "");
  const publicOrigin = options.publicOrigin.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const isPathAvailable = options.isPathAvailable ?? (() => true);
  const now = options.now ?? Date.now;
  const timeout = options.fetchTimeoutMs ?? DOCS_CHAT.fetchTimeoutMs;
  const searches = new SmallCache<DocsSearchResult>(
    options.cacheTtlMs ?? DOCS_CHAT.cacheTtlMs,
    options.cacheMaxEntries ?? DOCS_CHAT.cacheMaxEntries,
    now,
  );
  const pages = new SmallCache<DocsPage | null>(
    options.cacheTtlMs ?? DOCS_CHAT.cacheTtlMs,
    options.cacheMaxEntries ?? DOCS_CHAT.cacheMaxEntries,
    now,
  );
  const origins = [publicOrigin, docsOrigin];

  async function get(url: string, accept: string): Promise<Response> {
    try {
      return await doFetch(url, {
        headers: { accept },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      throw new DocsRetrievalError(
        "fetch_failed",
        `The docs site didn't answer (${error instanceof Error ? error.name : "error"}).`,
      );
    }
  }

  async function searchOnce(
    query: string,
    lang: Locale,
    limit: number,
  ): Promise<DocsSearchHit[]> {
    const params = new URLSearchParams({ query, locale: lang });
    const response = await get(
      `${docsOrigin}/api/search?${params}`,
      "application/json",
    );
    if (!response.ok) {
      throw new DocsRetrievalError(
        "fetch_failed",
        `Docs search answered ${response.status}.`,
      );
    }
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) return [];
    return groupSearchResults(rows as SortedResult[], {
      publicOrigin,
      limit,
      isPathAvailable,
    });
  }

  return {
    origins,

    async search(rawQuery, langInput = DEFAULT_LOCALE, limitInput) {
      const query = oneLine(rawQuery).slice(0, DOCS_CHAT.maxQueryChars);
      const limit = Math.max(
        1,
        Math.min(limitInput ?? DOCS_CHAT.searchLimit, DOCS_CHAT.searchLimit),
      );
      const lang = langInput;
      if (!query) return { hits: [], lang };
      const key = `${lang}\u0000${limit}\u0000${query.toLowerCase()}`;
      const cached = searches.get(key);
      if (cached) return cached;
      let hits = await searchOnce(query, lang, limit);
      let from = lang;
      if (hits.length === 0 && lang !== DEFAULT_LOCALE) {
        hits = await searchOnce(query, DEFAULT_LOCALE, limit);
        from = DEFAULT_LOCALE;
      }
      const result = { hits, lang: from };
      searches.set(key, result);
      return result;
    },

    async readPage(input, langInput = DEFAULT_LOCALE) {
      const normalized = normalizeDocsPath(input, origins);
      if (!normalized) {
        throw new DocsRetrievalError(
          "invalid_path",
          "Not a docs page. Pass a path like /docs/developers/mcp (from search_docs), or its URL.",
        );
      }
      const english = normalized.path;
      if (!isPathAvailable(english)) {
        throw new DocsRetrievalError(
          "unavailable",
          "This page describes a feature that isn't set up on this deployment, so the docs don't offer it.",
        );
      }
      const wanted =
        normalized.lang !== DEFAULT_LOCALE ? normalized.lang : langInput;
      const langs: Locale[] =
        wanted === DEFAULT_LOCALE ? [DEFAULT_LOCALE] : [wanted, DEFAULT_LOCALE];
      for (const lang of langs) {
        const path = localizedDocsPath(english, lang);
        const key = `${lang}\u0000${english}`;
        let page = pages.get(key);
        if (page === undefined) {
          page = await fetchPage(path, english, lang);
          pages.set(key, page);
        }
        if (page) return page;
      }
      throw new DocsRetrievalError(
        "not_found",
        `No docs page at ${english}. Use a path from search_docs.`,
      );
    },
  };

  /** The page at `path` in `lang`, or null when the docs site has none. */
  async function fetchPage(
    path: string,
    english: string,
    lang: Locale,
  ): Promise<DocsPage | null> {
    const response = await get(`${docsOrigin}${path}.md`, "text/markdown");
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new DocsRetrievalError(
        "fetch_failed",
        `The docs site answered ${response.status} for ${path}.`,
      );
    }
    // A translation that isn't done yet comes back in English, with a
    // Content-Language header saying so (the docs app's docs-md route).
    const contentLanguage = response.headers.get("content-language") ?? "";
    const actual: Locale =
      lang !== DEFAULT_LOCALE && /^en\b/i.test(contentLanguage)
        ? DEFAULT_LOCALE
        : lang;
    const text = await response.text();
    const { title, body } = parseMarkdownPage(text);
    const truncated = body.length > DOCS_CHAT.maxPageChars;
    const servedPath =
      actual === lang ? path : localizedDocsPath(english, actual);
    const url = `${publicOrigin}${servedPath}`;
    const markdown = truncated
      ? `${body.slice(0, DOCS_CHAT.maxPageChars).trimEnd()}\n\n[The page continues; the rest is at ${url}]`
      : body;
    return {
      title: title || english.split("/").pop() || english,
      path: servedPath,
      url,
      lang: actual,
      markdown,
      truncated,
    };
  }
}

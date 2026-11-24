// What llms.txt lists of the marketing site's own pages, read from what the
// site publishes for everyone: the blog's RSS feed (each post's title, link
// and one-line description) and the comparisons' sitemap. Pure:
// lib/agents/llms-content.ts fetches them, and keeps this app's own copy of
// the posts and comparisons when the site can't be read.
import type { LlmsLink } from "./llms-txt";

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

/** An element's text: CDATA unwrapped, entities decoded, spaces collapsed. */
function text(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(
    xml,
  );
  if (!match) return;
  const raw = (match[1] ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const decoded = raw
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity])
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
  return decoded.replace(/\s+/g, " ").trim() || undefined;
}

/** A URL's path on `origin`, or undefined for another host or no URL. */
function pathOn(url: string | undefined, origin: URL): string | undefined {
  if (!url) return;
  try {
    const parsed = new URL(url, origin);
    if (parsed.host !== origin.host) return;
    return parsed.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return;
  }
}

/**
 * The posts in an RSS feed, in the feed's order (newest first), as links
 * relative to `origin`: title, path and the post's one-line description.
 * Items on another host, or without a title or link, are left out.
 */
export function parseRssPosts(xml: string, origin: URL): LlmsLink[] {
  const posts: LlmsLink[] = [];
  for (const [, item = ""] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = text(item, "title");
    const url = pathOn(text(item, "link"), origin);
    if (!(title && url?.startsWith("/blog/"))) continue;
    posts.push({ title, url, description: text(item, "description") });
  }
  return posts;
}

/** The paths of a sitemap's pages on `origin`, in its order. */
export function parseSitemapPaths(xml: string, origin: URL): string[] {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].flatMap(([loc]) => {
    const path = pathOn(text(loc, "loc"), origin);
    return path ? [path] : [];
  });
}

/**
 * The comparisons in the site's sitemap (every /compare/<slug>), titled and
 * described from this app's copy of them where it has the same page; a
 * page only the site has is named by its slug.
 */
export function comparePages(
  paths: readonly string[],
  known: readonly LlmsLink[],
): LlmsLink[] {
  const byPath = new Map(known.map((page) => [page.url, page]));
  return paths.flatMap((path) => {
    const slug = /^\/compare\/([^/]+)$/.exec(path)?.[1];
    if (!slug) return [];
    return [byPath.get(path) ?? { title: `QRdx vs ${slug}`, url: path }];
  });
}

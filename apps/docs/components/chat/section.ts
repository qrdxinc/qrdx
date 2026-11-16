// Which docs tab a page belongs to, for the chat's suggested questions
// (components/chat/suggestions.ts) and the analytics `tab` property. Decided
// from the tabs' page URLs, not their titles, which are translated.
import { englishDocsPath } from "@repo/i18n/docs";

export type DocsSection =
  | "home"
  | "help"
  | "guides"
  | "developers"
  | "react"
  | "selfHosting";

/** A page each tab is known to hold (the meta.json of each root folder in content/docs). */
const MARKERS: readonly [DocsSection, string][] = [
  ["help", "/docs/help"],
  ["developers", "/docs/developers"],
  ["selfHosting", "/docs/self-hosting"],
  ["react", "/docs/getting-started"],
  ["guides", "/docs/dynamic-qr-codes"],
];

/** The shape of a layout tab this needs (fumadocs-ui LayoutTab). */
export interface SectionTab {
  urls?: Set<string>;
}

/**
 * The tab holding `pathname` (a docs URL in any language), by the pages it
 * lists; "home" for /docs itself and for anything no tab lists.
 */
export function docsSectionOf(
  pathname: string,
  tabs: readonly SectionTab[],
): DocsSection {
  const page = englishDocsPath(pathname.split(/[?#]/, 1)[0] ?? pathname);
  for (const tab of tabs) {
    if (!tab.urls) continue;
    const pages = new Set([...tab.urls].map((url) => englishDocsPath(url)));
    if (!pages.has(page)) continue;
    const match = MARKERS.find(([, marker]) => pages.has(marker));
    if (match) return match[0];
  }
  return "home";
}

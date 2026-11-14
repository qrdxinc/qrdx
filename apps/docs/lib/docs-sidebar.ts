import type { Root } from "fumadocs-core/page-tree";
import { getSidebarTabs } from "fumadocs-ui/components/sidebar/tabs";
import { docsTabs, filterPageTree, mapLinkNodes } from "@/lib/docs-tree";
import { isPathAvailable } from "@/lib/feature-availability";
import type { Locale } from "@/lib/i18n/config";
import { englishDocsPath } from "@/lib/i18n/docs";
import { localizeHref } from "@/lib/i18n/paths";
import { localizedSource } from "@/lib/source";

const trees = new Map<Locale, Root>();

/**
 * The sidebar in `locale`: no entry for docs of features this deployment
 * can't offer, and links out of the docs to that language's pages. Shared
 * by the docs layout and the docs 404 (its section cards).
 */
export function sidebarTree(locale: Locale): Root {
  const cached = trees.get(locale);
  if (cached) return cached;
  const tree = mapLinkNodes(
    filterPageTree(localizedSource.getPageTree(locale), (url) =>
      isPathAvailable(englishDocsPath(url)),
    ),
    (url) => localizeHref(url, locale),
  );
  trees.set(locale, tree);
  return tree;
}

/** The docs' sections (Help, Guides, Developers, React library, Self-hosting) in `locale`, as the layout's tabs. */
export function sidebarTabs(locale: Locale) {
  return docsTabs(sidebarTree(locale));
}

/**
 * The same sections with their icons as content draws them: fumadocs'
 * tabs wrap each icon for its own switcher (full size, a border on phones),
 * which is wrong inside a card's icon tile (the docs 404).
 */
export function sidebarSections(locale: Locale) {
  return getSidebarTabs(sidebarTree(locale), {
    transform: (option) => option,
  }).filter((tab) => !tab.unlisted);
}

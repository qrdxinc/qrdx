import type { Node, Root } from "fumadocs-core/page-tree";
import { getSidebarTabs } from "fumadocs-ui/components/sidebar/tabs";
import { docsTabs, filterPageTree, mapLinkNodes } from "@/lib/docs-tree";
import { isPathAvailable } from "@/lib/feature-availability";
import type { Locale } from "@/lib/i18n/config";
import { englishDocsPath } from "@/lib/i18n/docs";
import { localizeHref } from "@/lib/i18n/paths";
import { localizedSource } from "@/lib/source";

/**
 * The sidebar shows icons on folders (sections and their groups) only:
 * some tabs' pages carry an `icon` in their frontmatter and others don't,
 * which made the tabs look different from one another.
 */
function withoutPageIcons(root: Root): Root {
  const visit = (nodes: Node[]): Node[] =>
    nodes.map((node): Node => {
      if (node.type === "page") return { ...node, icon: undefined };
      if (node.type !== "folder") return node;
      return {
        ...node,
        index: node.index ? { ...node.index, icon: undefined } : node.index,
        children: visit(node.children),
      };
    });
  return { ...root, children: visit(root.children) };
}

const trees = new Map<Locale, Root>();

/**
 * The sidebar in `locale`: no entry for docs of features this deployment
 * can't offer, and links out of the docs to that language's pages. Shared
 * by the docs layout and the docs 404 (its section cards).
 */
export function sidebarTree(locale: Locale): Root {
  const cached = trees.get(locale);
  if (cached) return cached;
  const tree = withoutPageIcons(
    mapLinkNodes(
      filterPageTree(localizedSource.getPageTree(locale), (url) =>
        isPathAvailable(englishDocsPath(url)),
      ),
      (url) => localizeHref(url, locale),
    ),
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

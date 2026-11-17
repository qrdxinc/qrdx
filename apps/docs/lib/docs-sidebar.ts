import type { Node, Root } from "fumadocs-core/page-tree";
import { getSidebarTabs } from "fumadocs-ui/components/sidebar/tabs";
import { docsTabs, filterPageTree } from "@/lib/docs-tree";
import { isPathAvailable } from "@/lib/feature-availability";
import { source } from "@/lib/source";

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

let tree: Root | undefined;

/**
 * The sidebar: no entry for docs of features this deployment can't offer.
 * Shared by the docs layout and the docs 404 (its section cards).
 */
export function sidebarTree(): Root {
  tree ??= withoutPageIcons(filterPageTree(source.pageTree, isPathAvailable));
  return tree;
}

/** The docs' sections (Help, Guides, Developers, React library, Self-hosting), as the layout's tabs. */
export function sidebarTabs() {
  return docsTabs(sidebarTree());
}

/**
 * The same sections with their icons as content draws them: fumadocs'
 * tabs wrap each icon for its own switcher (full size, a border on phones),
 * which is wrong inside a card's icon tile (the docs 404).
 */
export function sidebarSections() {
  return getSidebarTabs(sidebarTree(), {
    transform: (option) => option,
  }).filter((tab) => !tab.unlisted);
}

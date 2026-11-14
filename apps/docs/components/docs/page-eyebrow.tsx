import Link from "fumadocs-core/link";
import { findPath, type Root } from "fumadocs-core/page-tree";
import { Fragment, type ReactNode } from "react";

interface Crumb {
  name: ReactNode;
  url?: string;
}

/**
 * The section a page sits in (its root folder: Help, Guides, Developers,
 * React library or Self-hosting), then the folders inside it, from the
 * page tree. A folder whose index is the page itself isn't repeated.
 */
export function eyebrowItems(tree: Root, url: string): Crumb[] {
  const path = findPath(
    tree.children,
    (node) => node.type === "page" && node.url === url,
  );
  if (!path) return [];
  const items: Crumb[] = [];
  for (let i = 0; i < path.length; i++) {
    const node = path[i];
    if (node.type !== "folder") continue;
    if (node.index === path[i + 1]) continue;
    items.push({ name: node.name, url: node.index?.url });
  }
  return items;
}

/**
 * Above a page's title: the section in the accent, the folder inside it in
 * muted text. Nothing on the docs home, which is in no section.
 */
export function PageEyebrow({ tree, url }: { tree: Root; url: string }) {
  const items = eyebrowItems(tree, url);
  if (items.length === 0) return null;
  const [section, ...rest] = items;
  return (
    <p className="not-prose flex flex-wrap items-center gap-x-2 text-[0.8125rem] font-medium">
      {section.url ? (
        <Link
          className="text-fd-primary transition-opacity hover:opacity-80"
          href={section.url}
        >
          {section.name}
        </Link>
      ) : (
        <span className="text-fd-primary">{section.name}</span>
      )}
      {rest.map((item) => (
        <Fragment key={item.url ?? String(item.name)}>
          <span aria-hidden className="text-fd-muted-foreground/50">
            /
          </span>
          {item.url ? (
            <Link
              className="text-fd-muted-foreground transition-colors hover:text-fd-foreground"
              href={item.url}
            >
              {item.name}
            </Link>
          ) : (
            <span className="text-fd-muted-foreground">{item.name}</span>
          )}
        </Fragment>
      ))}
    </p>
  );
}

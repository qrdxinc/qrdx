import { getTranslations } from "next-intl/server";
import { ZoneLink as Link } from "@/components/zone-link";
import { isPathAvailable } from "@/lib/feature-availability";

/** The product pages a docs reader is most likely to want next. */
const LINKS = [
  { href: "/playground", key: "links.playground" },
  { href: "/dynamic-qr-code", key: "links.dynamicCodes" },
  { href: "/ai/art", key: "links.aiArt" },
  { href: "/qr-code-generator", key: "links.generators" },
  { href: "/barcode-generator", key: "links.barcode" },
  { href: "/compare", key: "columns.compare" },
  { href: "/pricing", key: "links.pricing" },
] as const;

/**
 * A slim footer under every docs page. The sidebar only links inside /docs,
 * so without it the docs never point readers (or crawlers) at the product.
 * It reuses the site footer's copy and sits in a row of its own under the
 * page, in the content column of fumadocs' notebook layout grid (column 3,
 * the row after the page) at the reading column's width
 * (--docs-page-width, styles/styles.css). Spanning the whole grid instead
 * would let its width grow the grid's min-content side columns and squeeze
 * the page on phones.
 */
export async function DocsProductLinks() {
  const t = await getTranslations("footer");
  const links = LINKS.filter(({ href }) => isPathAvailable(href));

  return (
    <footer className="col-start-3 col-end-4 row-start-4 flex">
      <nav
        aria-label={t("navLabel")}
        className="mx-4 mb-8 flex w-full max-w-[calc(var(--docs-page-width)-2rem)] flex-wrap items-center gap-x-5 gap-y-2 border-t pt-6 text-sm md:mx-6 md:max-w-[calc(var(--docs-page-width)-3rem)] xl:mx-8 xl:max-w-[calc(var(--docs-page-width)-4rem)]"
      >
        <Link className="font-medium text-fd-foreground" href="/">
          QRdx
        </Link>
        {links.map(({ href, key }) => (
          <Link
            className="text-fd-muted-foreground transition-colors hover:text-fd-foreground"
            href={href}
            key={href}
            prefetch={false}
          >
            {t(key)}
          </Link>
        ))}
      </nav>
    </footer>
  );
}

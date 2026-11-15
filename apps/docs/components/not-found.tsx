import { SearchNormal1 } from "iconsax-reactjs";
import { getLocale, getTranslations } from "next-intl/server";
import { HelpSearchTrigger } from "@/components/docs/help-search-trigger";
import { Card, Cards } from "@/components/mdx/card";
import { HairlineFigure } from "@/components/mockups/hairline";
import { sidebarSections } from "@/lib/docs-sidebar";
import type { Locale } from "@/lib/i18n/config";

/**
 * Docs 404, shown inside the docs layout so the header, sidebar and search
 * stay: search first, then the five sections as cards, in the docs'
 * language with links to that language's pages.
 */
export async function DocsNotFound() {
  const locale = (await getLocale()) as Locale;
  const [t, ts] = await Promise.all([
    getTranslations({ locale, namespace: "docs.notFound" }),
    getTranslations({ locale, namespace: "docs.shell.notFound" }),
  ]);
  const sections = sidebarSections(locale);
  return (
    // [grid-area:main] places it in the docs layout grid, like DocsPage does.
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 [grid-area:main] md:px-6 md:py-16">
      <div className="flex flex-col items-center gap-5 text-center">
        <HairlineFigure className="h-28 w-40" figure="LostCode" />
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">
            {t("title")}
          </h1>
          <p className="text-pretty text-fd-muted-foreground">{t("body")}</p>
        </div>
        <HelpSearchTrigger className="group flex w-full max-w-md items-center gap-3 rounded-full border bg-fd-card px-4 py-3 text-start text-fd-muted-foreground transition-colors hover:border-fd-foreground/20 hover:text-fd-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring">
          <SearchNormal1 aria-hidden className="size-4.5 shrink-0" />
          <span className="flex-1 text-sm">{ts("search")}</span>
          <kbd className="hidden rounded-md border bg-fd-muted px-1.5 py-0.5 font-mono text-xs sm:inline">
            ⌘K
          </kbd>
        </HelpSearchTrigger>
      </div>
      <section
        aria-labelledby="not-found-sections"
        className="flex flex-col gap-3"
      >
        <h2
          className="font-medium text-fd-muted-foreground text-sm"
          id="not-found-sections"
        >
          {ts("sections")}
        </h2>
        <Cards className="my-0">
          {sections.map((section) => (
            <Card
              arrow
              description={section.description}
              href={section.url}
              icon={section.icon}
              key={section.url}
              title={section.title}
            />
          ))}
        </Cards>
      </section>
    </div>
  );
}

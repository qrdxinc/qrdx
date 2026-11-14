import { TreeContextProvider } from "fumadocs-ui/contexts/tree";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import { RootProvider } from "fumadocs-ui/provider/base";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { DocsChatSlot } from "@/components/chat/slot";
import { DocsFrameworkProvider } from "@/components/docs/docs-framework-provider";
import { DocsProductLinks } from "@/components/docs/docs-product-links";
import { DocsSidebarFooter } from "@/components/docs/docs-sidebar-footer";
import CustomSearchDialog from "@/components/search";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { sidebarTabs, sidebarTree } from "@/lib/docs-sidebar";
import { LOCALE_INFO } from "@/lib/i18n/config";
import {
  fumadocsTranslations,
  requireDocsLocale,
} from "@/lib/i18n/docs-server";
import { CHROME_NAMESPACES, pickMessages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { baseOptions, headerLinks, logo } from "@/lib/layout.shared";
import { organizationSchema } from "@/lib/seo-schema";
import { localizedSource } from "@/lib/source";

/** What the docs' client components translate (search, page actions, feedback, language menu). */
const DOCS_CLIENT_NAMESPACES = [
  ...CHROME_NAMESPACES,
  "docs.client",
  "docs.shell",
] as const;

export default async function Layout({
  children,
}: LayoutProps<"/[lang]/docs">) {
  const locale = await requireDocsLocale();
  const [messages, translations, t] = await Promise.all([
    getMessages(),
    fumadocsTranslations(locale),
    getTranslations({ locale, namespace: "docs.shell.header" }),
  ]);
  const tree = sidebarTree(locale);

  return (
    <DocsFrameworkProvider>
      <TreeContextProvider tree={localizedSource.getPageTree(locale)}>
        <NextIntlClientProvider
          messages={pickMessages(messages, DOCS_CLIENT_NAMESPACES)}
        >
          <RootProvider
            i18n={{ locale: LOCALE_INFO[locale].segment, translations }}
            search={{ SearchDialog: CustomSearchDialog }}
          >
            {/*
              fumadocs' notebook layout: one header across the top (the
              logo, search in the middle with its ⌘K hint, Dashboard and
              GitHub on the right), the tabs (Help, Guides, Developers,
              React library, Self-hosting) in a row under it, the sidebar
              and the page below. Under `lg` the tabs become a switcher at
              the top of the sidebar and the header items move into the
              mobile menu (lib/layout.shared.tsx).
            */}
            <DocsLayout
              tree={tree}
              tabs={sidebarTabs(locale)}
              tabMode="navbar"
              {...baseOptions()}
              links={headerLinks({
                dashboard: t("dashboard"),
                github: t("github"),
              })}
              nav={{
                ...baseOptions().nav,
                mode: "top",
                url: localizePath("/", locale),
                title: (
                  <>
                    {logo}
                    <span className="font-medium text-[15px]">QRdx</span>
                    <span className="font-normal text-[15px] text-fd-muted-foreground">
                      {t("docs")}
                    </span>
                  </>
                ),
              }}
              // One footer bar on every width: the language menu, with
              // the GitHub link and theme switch fumadocs adds in the
              // mobile menu (DocsSidebarFooter).
              sidebar={{ footer: DocsSidebarFooter, className: "border-e" }}
            >
              <JsonLd data={organizationSchema} />
              {children}
              <DocsProductLinks locale={locale} />
              {/* The AI chat's mount point (components/chat/slot.tsx, the Ask AI lane). */}
              <DocsChatSlot />
            </DocsLayout>
          </RootProvider>
        </NextIntlClientProvider>
      </TreeContextProvider>
    </DocsFrameworkProvider>
  );
}

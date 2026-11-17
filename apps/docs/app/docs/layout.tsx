import { TreeContextProvider } from "fumadocs-ui/contexts/tree";
import { RootProvider } from "fumadocs-ui/provider/base";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
// fumadocs' notebook DocsLayout with the docs assistant docked beside the
// page (components/chat/layout.tsx); the same props.
import { DocsChatLayout as DocsLayout } from "@/components/chat/layout";
import { DocsChatSlot } from "@/components/chat/slot";
import { DocsFrameworkProvider } from "@/components/docs/docs-framework-provider";
import { DocsProductLinks } from "@/components/docs/docs-product-links";
import CustomSearchDialog from "@/components/search";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { sidebarTabs, sidebarTree } from "@/lib/docs-sidebar";
import { CHROME_NAMESPACES, pickMessages } from "@/lib/i18n/messages";
import { baseOptions, headerLinks, logo } from "@/lib/layout.shared";
import { organizationSchema } from "@/lib/seo-schema";
import { source } from "@/lib/source";

/** The catalog paths the docs' client components read (search, page actions, feedback, the chat). */
const DOCS_CLIENT_NAMESPACES = [
  ...CHROME_NAMESPACES,
  "docs.client",
  "docs.shell",
  "docs.chat",
] as const;

export default async function Layout({ children }: LayoutProps<"/docs">) {
  const [messages, t] = await Promise.all([
    getMessages(),
    getTranslations("docs.shell.header"),
  ]);
  const tree = sidebarTree();

  return (
    <DocsFrameworkProvider>
      <TreeContextProvider tree={source.pageTree}>
        <NextIntlClientProvider
          messages={pickMessages(messages, DOCS_CLIENT_NAMESPACES)}
        >
          <RootProvider search={{ SearchDialog: CustomSearchDialog }}>
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
              tabs={sidebarTabs()}
              tabMode="navbar"
              {...baseOptions()}
              links={headerLinks({
                dashboard: t("dashboard"),
                github: t("github"),
              })}
              nav={{
                ...baseOptions().nav,
                mode: "top",
                url: "/",
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
              sidebar={{ className: "border-e" }}
            >
              <JsonLd data={organizationSchema} />
              {children}
              <DocsProductLinks />
              {/* The AI chat's mount point (components/chat/slot.tsx, the Ask AI lane). */}
              <DocsChatSlot />
            </DocsLayout>
          </RootProvider>
        </NextIntlClientProvider>
      </TreeContextProvider>
    </DocsFrameworkProvider>
  );
}

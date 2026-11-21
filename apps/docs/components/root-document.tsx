import "@/styles/styles.css";
import { cn } from "@repo/design-system/lib/utils";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { Provider } from "@/app/providers";
import { ConsentEarlyScript } from "@/components/consent/consent-early-script";
import { RootIntlProvider } from "@/components/root-intl-provider";
import { SearchHighlightStyle } from "@/components/search-highlight-style";
import { fonts } from "@/lib/fonts";
import {
  CHROME_NAMESPACES,
  DOCS_LOCALE,
  pickMessages,
} from "@/lib/i18n/messages";

/**
 * The <html> document of the docs site: the main app's
 * (apps/app/components/root-document.tsx) without what only the main app
 * has, such as the sign-in dialog, the editor's saved state and the
 * availability context (the docs decide availability on the server).
 */
export async function RootDocument({
  children,
  messages: extra = [],
}: {
  children: ReactNode;
  /** More catalog paths for client components on every page under this root. */
  messages?: readonly string[];
}) {
  const messages = await getMessages();
  return (
    <html
      className={cn(fonts)}
      dir="ltr"
      lang={DOCS_LOCALE}
      suppressHydrationWarning
    >
      {/* biome-ignore lint/style/noHeadElement: the docs' root document renders its own <head> (consent script, search styles) */}
      <head>
        <ConsentEarlyScript />
        <SearchHighlightStyle />
        <meta name="darkreader-lock" />
      </head>
      <body className="antialiased font-sans bg-background relative flex min-h-screen flex-col">
        <RootIntlProvider
          locale={DOCS_LOCALE}
          messages={pickMessages(messages, [...CHROME_NAMESPACES, ...extra])}
          timeZone="UTC"
        >
          {/* PostHog and Featurebase load from the consent manager in Provider, after consent. */}
          <Provider>{children}</Provider>
        </RootIntlProvider>
      </body>
    </html>
  );
}

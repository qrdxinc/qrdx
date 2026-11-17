// next-intl's request configuration (wired in next.config.ts). The docs are
// English only, so the locale is fixed and the docs stay statically
// rendered: nothing here reads the URL, headers or cookies. next-intl stays
// for the catalog (apps/app/messages/en.json holds the docs' copy too), its
// typed keys and its ICU formatting.
import { getRequestConfig } from "next-intl/server";
import { DOCS_LOCALE, loadMessages } from "@/lib/i18n/messages";

export default getRequestConfig(async () => ({
  locale: DOCS_LOCALE,
  messages: await loadMessages(),
  // Static HTML must not depend on the server's clock zone.
  timeZone: "UTC",
  // A missing key or a bad ICU argument is a bug the type check catches.
  onError(error) {
    if (process.env.NODE_ENV !== "production") console.error(error);
  },
}));

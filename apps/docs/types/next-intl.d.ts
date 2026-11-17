// Typed keys and ICU arguments for next-intl, from the namespaces of the
// English catalog the docs read (lib/i18n/messages.ts): a wrong key or a
// missing argument fails `tsc`.
import type { DOCS_LOCALE, Messages } from "@/lib/i18n/messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: typeof DOCS_LOCALE;
    Messages: Messages;
  }
}

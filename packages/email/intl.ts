import type { Locale } from "@repo/i18n/config";
import type { createTranslator } from "use-intl/core";

// The templates' language. The copy lives in the app's catalogs
// (apps/app/messages/<locale>.json, namespace `emails`), which this package
// can't import, so every template takes an `intl`: the locale and a
// translator the app makes (apps/app/lib/i18n/email.ts). The app tells this
// package its catalog's shape, so a wrong key or a missing argument fails
// the app's `tsc`:
//
//   declare module "@repo/email/intl" {
//     interface EmailCatalog { messages: typeof en }
//   }
//
// Without that (this package's own typecheck), any key and arguments pass,
// as use-intl does for an app that declares no catalog.

// biome-ignore lint/suspicious/noEmptyInterface: filled in by the app (above)
export interface EmailCatalog {}

type Messages = EmailCatalog extends { messages: infer M extends object }
  ? M
  : Record<string, any>;

export type EmailTranslator = ReturnType<
  typeof createTranslator<Messages, "emails">
>;

export interface EmailIntl {
  locale: Locale;
  t: EmailTranslator;
}

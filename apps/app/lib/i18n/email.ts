// Emails in the recipient's language. Email templates (@repo/email) render
// outside any request's React tree (react-email), so they take a translator
// rather than reading one from context: `intl` holds the locale (for <html
// lang>) and a translator for the `emails` namespace of
// messages/<locale>.json. Senders pass ENGLISH_EMAIL for English, and
// emailIntl() for the recipient's language.
// use-intl/core (next-intl's own core) has no React: emails also render in
// node:test suites run with the react-server condition.

import type { EmailIntl } from "@repo/email/intl";
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/config";
import { createTranslator } from "use-intl/core";
import en from "@/messages/en.json";
import { loadMessages } from "./messages";

export type { EmailIntl } from "@repo/email/intl";

export const ENGLISH_EMAIL: EmailIntl = {
  locale: DEFAULT_LOCALE,
  t: createTranslator({
    locale: DEFAULT_LOCALE,
    messages: en,
    namespace: "emails",
  }),
};

/** A translator for emails in `locale` (English for "en" or a missing catalog). */
export async function emailIntl(locale: Locale): Promise<EmailIntl> {
  if (locale === DEFAULT_LOCALE) return ENGLISH_EMAIL;
  const messages = await loadMessages(locale);
  return {
    locale,
    t: createTranslator({ locale, messages, namespace: "emails" }),
  };
}

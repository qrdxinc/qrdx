// The docs' message catalog: the copy of the English namespaces the docs
// read (DOCS_NAMESPACES) that @repo/i18n keeps in packages/i18n/messages,
// written from apps/app/messages/en.json before every dev server, build,
// typecheck and test here (scripts/zone-inputs.mjs). The docs are English
// only.
import { loadDocsMessages } from "@repo/i18n/docs-messages";
import type { DOCS_NAMESPACES } from "@repo/i18n/messages";
// Types only: the keys and arguments of the namespaces the copy holds, from
// the catalog they're copied from, so a wrong key fails tsc here too.
import type en from "../../../app/messages/en.json";

export { pickMessages } from "@repo/i18n/messages";

/** The docs' one language. */
export const DOCS_LOCALE = "en";

export type Messages = Pick<typeof en, (typeof DOCS_NAMESPACES)[number]>;

/** The docs' catalog (throws, naming the command, if the copy is missing). */
export async function loadMessages(): Promise<Messages> {
  return (await loadDocsMessages()) as unknown as Messages;
}

/**
 * What every page's client components translate: the parts of the site's
 * shared chrome the docs show (the product links' copy and the cookie
 * banner).
 */
export const CHROME_NAMESPACES = ["footer", "consent"] as const;

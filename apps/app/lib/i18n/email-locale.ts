import "server-only";

// Which language an email goes out in: the recipient's saved language
// (user.locale), else, for codes the person asked for themselves, the
// language the site was in (the language menu's cookie on that request),
// else English. Security notices (a new sign-in, a passkey or two-step
// change, a new payout address) never use the request's language: whoever
// made the change may not be the account's owner, which is why they're sent.
import { database as db, user } from "@repo/database";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@repo/i18n/config";
import { eq } from "drizzle-orm";
import { type EmailIntl, emailIntl } from "./email";
import { cookieLocale, savedUserLocale } from "./user-locale";

/** The saved language of the account with this address, if any. */
async function localeForAddress(email: string): Promise<Locale | null> {
  try {
    const [row] = await db
      .select({ locale: user.locale })
      .from(user)
      .where(eq(user.email, email.trim().toLowerCase()))
      .limit(1);
    return isLocale(row?.locale) ? row.locale : null;
  } catch {
    return null;
  }
}

/** The language menu's cookie, when this runs inside a request. */
async function requestCookieLocale(): Promise<Locale | null> {
  try {
    return await cookieLocale();
  } catch {
    return null;
  }
}

/**
 * For a code sent to an address (sign-in, a new address, "Confirm it's you"):
 * the account's language, else the cookie's. `fromRequest: false` for a
 * security notice: the account's language, else English.
 */
export async function emailIntlForAddress(
  email: string,
  { fromRequest = true }: { fromRequest?: boolean } = {},
): Promise<EmailIntl> {
  const locale =
    (await localeForAddress(email)) ??
    (fromRequest ? await requestCookieLocale() : null) ??
    DEFAULT_LOCALE;
  return emailIntl(locale);
}

/** For an email to a known account (notifications): its saved language. */
export async function emailIntlForUser(userId: string): Promise<EmailIntl> {
  return emailIntl((await savedUserLocale(userId)) ?? DEFAULT_LOCALE);
}

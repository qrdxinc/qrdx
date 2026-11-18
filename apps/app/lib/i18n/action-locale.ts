import "server-only";

// The language a server action answers in: the language of the page that
// shows the answer. A server action has no root params (i18n/request.ts)
// and its request carries no language a page renders in: /playground/<id>
// and /dashboard have no prefix but show the cookie's or the person's
// language, and /community has none and shows English. So the page says:
// its client components pass next-intl's useLocale() with the call, which
// is the [lang] segment on translated pages (/es/playground), English on
// English-only ones, and the person's language on app pages. The value comes
// from the client, so it's only used when it names one of QRdx's languages;
// otherwise (nothing sent, or an older client) the app's rule applies:
// getAppLocale(), the saved language, else the language menu's cookie.
import { DEFAULT_LOCALE, isLocale, type Locale } from "@repo/i18n/config";
import { logError } from "@/lib/log-error";
import { getAppLocale } from "./app-locale";
import { cookieLocale, savedUserLocale } from "./user-locale";

/**
 * The language of the page that called the action (see above). `userId`,
 * when the action already knows who's asking, saves reading the session
 * again for the app's rule.
 */
export async function actionLocale(
  pageLocale?: unknown,
  userId?: string,
): Promise<Locale> {
  if (isLocale(pageLocale)) return pageLocale;
  if (!userId) return await getAppLocale();
  return (
    (await savedUserLocale(userId)) ?? (await cookieLocale()) ?? DEFAULT_LOCALE
  );
}

/**
 * `english` in the action's language, built by `inLocale` from the catalog
 * (getTranslations with that locale and a helper such as
 * communityActionMessages(t)). English as it is when the language is
 * English, and English, logged, when the language or the catalog can't be
 * read: a failed translation never fails the action.
 */
export async function actionText<T>(
  english: T,
  inLocale: (locale: Locale) => Promise<T>,
  {
    pageLocale,
    userId,
    action,
  }: { pageLocale?: unknown; userId?: string; action: string },
): Promise<T> {
  try {
    const locale = await actionLocale(pageLocale, userId);
    return locale === DEFAULT_LOCALE ? english : await inLocale(locale);
  } catch (error) {
    logError(error as Error, { action });
    return english;
  }
}

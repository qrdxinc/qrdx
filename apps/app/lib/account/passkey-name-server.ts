import "server-only";

import { getAppLocale, getAppTranslations } from "@/lib/i18n/app-locale";
import { emailIntl } from "@/lib/i18n/email";
import { logError } from "@/lib/shared";
import { defaultPasskeyName } from "./passkeys";
import { deviceWords } from "./sessions";

/**
 * The name a new passkey gets unless the person types one: the device it
 * was made on ("Chrome on macOS", in the words Settings → Sessions uses),
 * else "Passkey", in the account's language (lib/i18n/app-locale.ts). The
 * setup dialog offers it and the server falls back to it. Stored as it is,
 * so names saved before stay as they were. English, logged, when the
 * language can't be read.
 */
export async function newPasskeyName(
  userAgent: string | null,
): Promise<string> {
  try {
    const locale = await getAppLocale();
    const [intl, t] = await Promise.all([
      emailIntl(locale),
      getAppTranslations("app.settings.account.twoFactorSettings"),
    ]);
    return defaultPasskeyName(userAgent, deviceWords(intl), t("passkeyName"));
  } catch (error) {
    logError(error as Error, { action: "account.newPasskeyName" });
    return defaultPasskeyName(userAgent);
  }
}

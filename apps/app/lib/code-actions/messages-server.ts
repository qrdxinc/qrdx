import "server-only";

import { getTranslations } from "next-intl/server";
import { actionText } from "@/lib/i18n/action-locale";
import {
  CODE_ACTION_MESSAGES,
  type CodeActionMessages,
  codeActionMessages,
} from "./messages";

/**
 * CODE_ACTION_MESSAGES in the language of the page that called the action
 * (lib/i18n/action-locale.ts): `pageLocale`, its useLocale(), when it names
 * one of QRdx's languages, else the app's (the saved one, else the language
 * menu's cookie, else English). English as it is, without reading the
 * catalog; English, logged, when that can't be read: the answer still goes
 * out. `userId`, when the action knows who's asking, saves reading the
 * session again. Read once, when an action answers with a message.
 */
export function codeActionText({
  pageLocale,
  userId,
}: {
  pageLocale?: unknown;
  userId?: string;
} = {}): Promise<CodeActionMessages> {
  return actionText(
    CODE_ACTION_MESSAGES,
    async (locale) =>
      codeActionMessages(
        await getTranslations({ locale, namespace: "codeActions" }),
      ),
    { pageLocale, userId, action: "codeActions.text" },
  );
}

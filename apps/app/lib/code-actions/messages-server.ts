import "server-only";

import { getAppTranslations } from "@/lib/i18n/app-locale";
import { logError } from "@/lib/shared";
import {
  CODE_ACTION_MESSAGES,
  type CodeActionMessages,
  codeActionMessages,
} from "./messages";

/**
 * CODE_ACTION_MESSAGES in the person's language (lib/i18n/app-locale.ts:
 * their saved one, else the language menu's cookie, else English). The
 * signed-in app's pages render in that language and show these messages as
 * they are. English, logged, when that can't be read: the answer still goes
 * out. Read once, when an action answers with a message.
 */
export async function codeActionText(): Promise<CodeActionMessages> {
  try {
    return codeActionMessages(await getAppTranslations("codeActions"));
  } catch (error) {
    logError(error as Error, { action: "codeActions.text" });
    return CODE_ACTION_MESSAGES;
  }
}

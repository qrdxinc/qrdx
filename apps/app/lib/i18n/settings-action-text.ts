import "server-only";

// What Settings' server actions answer for the page to show as it is
// (settingsActions in messages/en.json, and the auth.* records the account
// actions share with "Confirm it's you"): in the signed-in app's language,
// the account's saved one, else the language menu's cookie, else English
// (./app-locale.ts). Those pages render in that same language, so a toast or
// a form error reads like the page around it.
//
// Loaded on first use and then kept for the call, so an action that answers
// "ok" reads nothing. English, logged, when the language or its catalog
// can't be read: a translation never fails an action.

import type { Messages, NamespaceKeys, NestedKeyOf } from "next-intl";
import { createTranslator } from "use-intl/core";
import { logError } from "@/lib/shared";
import en from "@/messages/en.json";
import { getAppTranslations } from "./app-locale";
import type { Translator } from "./translator";

type Namespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>;

async function load<NS extends Namespace>(
  namespace: NS,
): Promise<Translator<NS>> {
  try {
    return await getAppTranslations(namespace);
  } catch (error) {
    logError(error as Error, { action: "settingsActions.text", namespace });
    return createTranslator({
      locale: "en",
      messages: en,
      namespace,
    }) as unknown as Translator<NS>;
  }
}

/**
 * `namespace` in the person's language, read the first time the returned
 * function is called (one per action call).
 */
export function settingsActionText<NS extends Namespace>(
  namespace: NS,
): () => Promise<Translator<NS>> {
  let loaded: Promise<Translator<NS>> | undefined;
  return () => {
    loaded ??= load(namespace);
    return loaded;
  };
}

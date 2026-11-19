import type { EmailIntl } from "@repo/email/intl";
import { createTranslator } from "use-intl/core";
import messages from "./emails/messages.json";

// The templates' English: the `emails` namespace of the app's catalog
// (apps/app/messages/en.json), copied by scripts/prepare.mjs. Restart the
// preview to pick up a change to the catalog.
export const english: EmailIntl = {
  locale: "en",
  t: createTranslator({ locale: "en", messages, namespace: "emails" }),
};

// Typed keys and ICU arguments for the email templates (@repo/email), from
// the English catalog, as types/next-intl.d.ts does for next-intl: a wrong
// key or a missing argument in a template fails `tsc`
// (packages/email/intl.ts).
import type en from "@/messages/en.json";

declare module "@repo/email/intl" {
  interface EmailCatalog {
    messages: typeof en;
  }
}

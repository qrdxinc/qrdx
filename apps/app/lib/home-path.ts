// The home page in every language: "/", "/es", "/pt-br" and so on (one
// trailing slash allowed). Pure, so proxy.ts (signed-in visitors go to their
// dashboard) and the consent tools (Featurebase shows here only) share it.

import { splitLocale } from "@repo/i18n/paths";

export function isHomePath(pathname: string): boolean {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return splitLocale(trimmed).path === "/";
}

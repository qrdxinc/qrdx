// The home page in every language: "/", "/es", "/pt-br" and so on (one
// trailing slash allowed). Pure, so proxy.ts (signed-in visitors go to their
// dashboard) and the consent tools (Featurebase shows here only) share it.
//
// The same page also answers at /home and /<language>/home (next.config.ts
// rewrites), which never redirects: the site's logo links there, so a
// signed-in visitor can still reach the home page.

import { splitLocale } from "@repo/i18n/paths";

export function isHomePath(pathname: string): boolean {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return splitLocale(trimmed).path === "/";
}

/** The logo's link: the home page in that language, at its /home address. */
export function landingHref(localizedHome: string): string {
  return localizedHome === "/" ? "/home" : `${localizedHome}/home`;
}

/** The home page at either address: "/", "/es", "/home", "/es/home"… */
export function isLandingPath(pathname: string): boolean {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return isHomePath(trimmed.replace(/\/home$/, "") || "/");
}

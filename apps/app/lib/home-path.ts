// The home page: "/" (one trailing slash allowed). Pure, so proxy.ts
// (signed-in visitors go to their dashboard) and the consent tools
// (Featurebase shows here only) share it.
//
// The home page is English only. The languages' roots (/es, /pt-br) redirect
// to "/" in next.config.ts (@repo/i18n/routing englishOnlyRedirects), ahead
// of the proxy, so a signed-in visitor on /es still ends up on their
// dashboard, in the language the app already uses for them.
//
// The same page also answers at /home (a next.config.ts rewrite), which
// never redirects: the site's logo links there, so a signed-in visitor can
// still reach the home page. /<language>/home redirects to /home.

import { splitLocale } from "@repo/i18n/paths";

/** "/", and "/en", the route it prerenders as (what usePathname() says there). */
export function isHomePath(pathname: string): boolean {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return splitLocale(trimmed).path === "/";
}

/** The logo's link: the home page at its /home address. */
export const LANDING_PATH = "/home";

/** The home page at either address: "/" or "/home". */
export function isLandingPath(pathname: string): boolean {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return isHomePath(trimmed.replace(/\/home$/, "") || "/");
}

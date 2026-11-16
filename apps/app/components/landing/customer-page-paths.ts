import { localeFromSegment } from "@repo/i18n/config";

/**
 * Paths where QRdx's own analytics (PostHog) and support widget (Featurebase)
 * must never load:
 * - pages served to QR visitors on a customer's behalf: hosted pages (/p),
 *   short-link gates (/q) and "campaign ended" pages (/ended); only pixels
 *   the page owner configured may load there;
 * - the scanner (/scan), which promises no tracking;
 * - template demos (/templates/<type>/<id>), which must look like a published
 *   page and record nothing (the /templates gallery itself is a normal page);
 * - public analytics pages (/stats/<token>), shared by a code's owner: the
 *   token in the path is the page's only key;
 * - client portals (/portal/<workspace>, agency tools): a workspace's
 *   white-label view for its clients.
 */
const UNTRACKED_PATHS = ["/p", "/q", "/ended", "/scan", "/stats", "/portal"];

const TEMPLATE_DEMO_PATH = /^\/templates\/[^/]+\/[^/]+\/?$/;

/**
 * "/es/scan" → "/scan": any language prefix, whether or not the page exists
 * in that language (the English-only pages redirect their old translated
 * URLs before anything loads, packages/i18n/routing.ts), so the promise
 * holds for any page that ever renders under one.
 */
function withoutLanguage(pathname: string): string {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  return match && localeFromSegment(match[1]) ? (match[2] ?? "/") : pathname;
}

export function isUntrackedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  const path = withoutLanguage(pathname);
  return (
    TEMPLATE_DEMO_PATH.test(path) ||
    UNTRACKED_PATHS.some(
      (untracked) => path === untracked || path.startsWith(`${untracked}/`),
    )
  );
}

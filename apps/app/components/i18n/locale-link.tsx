"use client";

import { isDocsPagePath } from "@repo/i18n/docs";
import { isLangRootPath } from "@repo/i18n/paths";
import { isSitePagePath } from "@repo/next-config/site-zone";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ComponentProps, useMemo } from "react";
import { useLocalizeHref } from "@/lib/i18n/use-localize-href";

// Internal links that keep the visitor's language. Everything reachable from
// app/[lang] links through these, never next/link or useRouter directly
// (tests/i18n/locale-links.test.ts): on /hi pages a link to /playground goes
// to /hi/playground, and pages that aren't translated keep their English
// URL (packages/i18n/paths.ts). In the signed-in app the language is the
// person's (lib/i18n/app-locale.ts), so its links to public pages follow it.

export { useLocalizeHref } from "@/lib/i18n/use-localize-href";

type LinkProps = ComponentProps<typeof Link>;

/** The props a plain <a> takes: next/link's own ones left out. */
function anchorProps({
  as: _as,
  replace: _replace,
  scroll: _scroll,
  shallow: _shallow,
  passHref: _passHref,
  prefetch: _prefetch,
  locale: _locale,
  legacyBehavior: _legacyBehavior,
  onNavigate: _onNavigate,
  transitionTypes: _transitionTypes,
  ...props
}: Omit<LinkProps, "href">) {
  return props;
}

/**
 * next/link that keeps the visitor's language: on /es pages, a link to
 * /playground goes to /es/playground. Pages that aren't translated, the
 * English-only marketing pages among them (/pricing), keep their English
 * URL (packages/i18n/paths.ts).
 *
 * Docs pages get a plain <a>: another app serves them behind the same URLs
 * (the docs site, @repo/i18n/docs), or qrdx.dev does when this deployment
 * has none (a redirect), and a link from one app into the other must load
 * the page in full. The site's pages (the blog, @repo/next-config/site-zone)
 * too: the marketing site serves them behind the same URLs once SITE_ORIGIN
 * is set, and this app does until then, so a full page load is right in
 * both modes and next/link never tries to load the other app's page here.
 *
 * So do links between this app's two root layouts, app/[lang] (the
 * translated and English-only pages) and app/(app) (sign-in, the dashboard,
 * a shared theme's /playground/<id> …): Next loads such a page in full
 * anyway, after fetching its payload for nothing, and a plain <a> lets the
 * visit's start ride along (@repo/analytics/landing, installVisitForwarding).
 */
export function LocaleLink({ href, ...props }: LinkProps) {
  const localize = useLocalizeHref();
  const pathname = usePathname();
  const target = typeof href === "string" ? localize(href) : href;
  if (
    typeof target === "string" &&
    (isDocsPagePath(target) ||
      isSitePagePath(target) ||
      crossesRootLayout(pathname, target))
  ) {
    return <a href={target} {...anchorProps(props)} />;
  }
  return <Link href={target} {...props} />;
}

/** Whether a link from `pathname` to `href` goes into the other root layout. */
function crossesRootLayout(pathname: string | null, href: string): boolean {
  if (!pathname || !href.startsWith("/") || href.startsWith("//")) {
    return false;
  }
  return isLangRootPath(pathname) !== isLangRootPath(href);
}

type Router = ReturnType<typeof useRouter>;

/** useRouter whose push, replace and prefetch keep the visitor's language. */
export function useLocaleRouter(): Router {
  const router = useRouter();
  const localize = useLocalizeHref();
  return useMemo(
    (): Router => ({
      ...router,
      push: (href, options) => router.push(localize(href), options),
      replace: (href, options) => router.replace(localize(href), options),
      prefetch: (href, options) => router.prefetch(localize(href), options),
    }),
    [router, localize],
  );
}

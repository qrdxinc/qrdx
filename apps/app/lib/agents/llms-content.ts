import "server-only";

import { configuredEntry } from "@repo/availability";
import { CANONICAL_ORIGIN } from "@repo/config";
import { getCatalogBySurface } from "@repo/integrations/src/catalog";
import { SITE_KEY_HEADER } from "@repo/next-config/site-zone";
import type { PricingOptions } from "@/components/sections/pricing/plan-content";
import { env } from "@/env";
import {
  blogSource,
  compareSource,
  customersSource,
  legalSource,
} from "@/lib/content-source";
import { docsZoneManifest } from "@/lib/docs-zone-manifest";
import {
  isFeatureAvailable,
  isPathAvailable,
} from "@/lib/feature-availability";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { filterVisible } from "@/lib/integration-availability-rules";
import { baseUrl } from "@/lib/metadata";
import { getPublishedVersion } from "@/lib/npm-version";
import { PLAN_LIMITS } from "@/lib/plans";
import { siteServes } from "@/lib/site-zone-on";
import cliPackage from "../../../../packages/cli/package.json";
import qrdxPackage from "../../../../packages/qrdx/package.json";
import { buildLlmsTxt, type LlmsDocsSection, type LlmsLink } from "./llms-txt";
import { comparePages, parseRssPosts, parseSitemapPaths } from "./site-feeds";

/** What this deployment offers, as the pricing page reads it. */
export function pricingOptions(): PricingOptions {
  return {
    aiArt: isFeatureAvailable("aiArt"),
    aiThemes: isFeatureAvailable("aiThemes"),
    customDomains: isFeatureAvailable("customDomains"),
    fileStorage: isFeatureAvailable("fileStorage"),
    emailAlerts: isFeatureAvailable("email"),
    freeFirstScan: isFeatureAvailable("teamNotes"),
    sso: isFeatureAvailable("sso"),
    auditLog: isFeatureAvailable("auditLog"),
    clientPortal: isFeatureAvailable("clientPortal"),
    whiteLabel: isFeatureAvailable("whiteLabel"),
    conversions: isFeatureAvailable("conversions"),
    invoiceRequests: isFeatureAvailable("invoiceRequests"),
  };
}

const pageLink = (page: {
  url: string;
  data: { title: string; description?: string };
}): LlmsLink => ({
  title: page.data.title,
  url: page.url,
  description: page.data.description || undefined,
});

/** Legal pages in their sidebar order (content/legal/meta.json). */
function legalPages() {
  const order = legalSource.pageTree.children.flatMap((node) =>
    node.type === "page" ? [node.url] : [],
  );
  const rank = (url: string) =>
    order.includes(url) ? order.indexOf(url) : order.length;
  return legalSource.getPages().sort((a, b) => rank(a.url) - rank(b.url));
}

/**
 * Without a docs site (DOCS_ZONE_URL unset) the docs URLs redirect to
 * qrdx.dev (next.config.ts), so llms.txt links the docs there, from their
 * home page.
 */
const DOCS_ON_QRDX: LlmsDocsSection[] = [
  {
    title: "",
    pages: [
      {
        title: "QRdx docs",
        url: "/docs",
        description:
          "Help articles, guides and the developer docs (REST API, MCP server, CLI, React library), on qrdx.dev",
      },
    ],
  },
];

/** How often llms.txt reads the site's feeds again, in seconds (its route's revalidate). */
const SITE_FEED_REVALIDATE = 3600;

/**
 * A file the marketing site serves (SITE_ORIGIN), asked for as this app's
 * proxy asks, with the zone key; undefined when it can't be read in time.
 */
async function siteFile(path: string): Promise<string | undefined> {
  if (!env.SITE_ORIGIN) return;
  try {
    const response = await fetch(new URL(path, env.SITE_ORIGIN), {
      headers: env.SITE_ZONE_KEY
        ? { [SITE_KEY_HEADER]: env.SITE_ZONE_KEY }
        : {},
      next: { revalidate: SITE_FEED_REVALIDATE },
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? await response.text() : undefined;
  } catch {
    return;
  }
}

const newestFirst = (a: { data: { date: string } }, b: typeof a) =>
  new Date(b.data.date).getTime() - new Date(a.data.date).getTime();

/**
 * Every blog post and comparison, for llms.txt's "Guides and research".
 * While the marketing site serves them (lib/site-zone-on.ts), from what it
 * publishes: the blog's RSS feed (each post's one-line description) and the
 * comparisons' sitemap. When the site can't be read, or doesn't serve them,
 * this app's own copy, which the site's pages started from and which keeps
 * their URLs.
 */
async function guidesAndResearch(): Promise<{
  blog: LlmsLink[];
  compare: LlmsLink[];
}> {
  const ownPosts = blogSource
    .getPages()
    .filter((page) => page.data.published)
    .sort(newestFirst)
    .map(pageLink);
  const ownComparisons = compareSource.getPages().map((page) => ({
    ...pageLink(page),
    title: `QRdx vs ${page.data.title}`,
  }));
  const [feed, sitemap] = await Promise.all([
    siteServes("blog") ? siteFile("/blog/rss.xml") : undefined,
    siteServes("compare") ? siteFile("/compare/sitemap.xml") : undefined,
  ]);
  // The site's links name this deployment's origin or the canonical one.
  const origins = [baseUrl, new URL(CANONICAL_ORIGIN)];
  const posts = feed ? parseRssPosts(feed, origins) : [];
  const comparisons = sitemap
    ? comparePages(parseSitemapPaths(sitemap, origins), ownComparisons)
    : [];
  return {
    blog: posts.length > 0 ? posts : ownPosts,
    compare: comparisons.length > 0 ? comparisons : ownComparisons,
  };
}

/** The /llms.txt body for this deployment. */
export async function llmsTxt(): Promise<string> {
  const [libraryVersion, cliVersion, docsZone, guides] = await Promise.all([
    getPublishedVersion("qrdx"),
    getPublishedVersion("@qrdx/cli"),
    // The docs site's sections when DOCS_ZONE_URL is set (it serves the
    // docs then); null without it.
    docsZoneManifest(),
    guidesAndResearch(),
  ]);

  // Third-party integrations this deployment offers; AI assistants,
  // developer tools and plugins have pages of their own.
  const integrations = filterVisible(
    getIntegrationAvailability(),
    getCatalogBySurface("integrations"),
    (entry) => entry.slug,
  ).map((entry) => ({
    title: entry.name,
    url: `/integrations/${entry.slug}`,
    description: configuredEntry(entry, isFeatureAvailable).tagline,
  }));
  const plugins = getCatalogBySurface("plugins").map((entry) => ({
    title: entry.name,
    url: entry.canonicalPath ?? "/plugins",
    description: `${entry.tagline}${entry.note ? ` ${entry.note}` : ""}`,
  }));

  // Published customers' stories only (lib/content-source.ts).
  const customers = customersSource.getPages().sort(newestFirst).map(pageLink);

  return buildLlmsTxt({
    origin: baseUrl,
    docsOrigin: docsZone ? baseUrl : new URL(CANONICAL_ORIGIN),
    offered: pricingOptions(),
    showsPath: isPathAvailable,
    // Only the marketing site has these pages (SITE_GROUPS.products,
    // .press and .generators).
    customDomainPage: siteServes("products"),
    trackingPage: siteServes("products"),
    pressPage: siteServes("press"),
    appDownloadGenerator: siteServes("generators"),
    limits: PLAN_LIMITS,
    docs: docsZone?.sections ?? DOCS_ON_QRDX,
    blog: guides.blog,
    customers,
    compare: guides.compare,
    legal: legalPages().map(pageLink),
    integrations,
    plugins,
    npm: {
      library: {
        name: "qrdx",
        repo: qrdxPackage.version,
        published: libraryVersion,
      },
      cli: {
        name: "@qrdx/cli",
        repo: cliPackage.version,
        published: cliVersion,
      },
    },
  });
}

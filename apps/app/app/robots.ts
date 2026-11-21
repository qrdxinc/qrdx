import { SITE_GROUP_NAMES, SITE_SITEMAPS } from "@repo/next-config/site-zone";
import type { MetadataRoute } from "next";
import {
  AI_CRAWLERS,
  DISALLOW,
  SEARCH_CRAWLERS,
} from "@/lib/agents/robots-rules";
import { baseUrl } from "@/lib/metadata";
import { siteServes } from "@/lib/site-zone-on";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: ["*", ...SEARCH_CRAWLERS, ...AI_CRAWLERS].map((userAgent) => ({
      userAgent,
      allow: "/",
      disallow: DISALLOW,
    })),
    // The marketing site's own sitemaps, for the groups whose pages it
    // lists itself (app/sitemap.ts leaves them out then).
    sitemap: [
      new URL("/sitemap.xml", baseUrl).toString(),
      // The community's item pages and profiles
      // (app/(app)/(home)/community/sitemap.ts).
      new URL("/community/sitemap.xml", baseUrl).toString(),
      ...SITE_GROUP_NAMES.filter(siteServes).flatMap((group) => {
        const path = SITE_SITEMAPS[group];
        return path ? [new URL(path, baseUrl).toString()] : [];
      }),
    ],
  };
}

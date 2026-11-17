import { SITE_GROUP_NAMES, SITE_GROUPS } from "@repo/next-config/site-zone";
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
    // The marketing site's own sitemaps (<prefix>/sitemap.xml) list the
    // groups it serves (app/sitemap.ts leaves them out then).
    sitemap: [
      new URL("/sitemap.xml", baseUrl).toString(),
      ...SITE_GROUP_NAMES.filter(siteServes).flatMap((group) =>
        SITE_GROUPS[group].map((prefix) =>
          new URL(`${prefix}/sitemap.xml`, baseUrl).toString(),
        ),
      ),
    ],
  };
}

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
    // The marketing site's own sitemap lists the blog while it serves it
    // (app/sitemap.ts leaves the blog out then).
    sitemap: [
      new URL("/sitemap.xml", baseUrl).toString(),
      ...(siteServes("blog")
        ? [new URL("/blog/sitemap.xml", baseUrl).toString()]
        : []),
    ],
  };
}

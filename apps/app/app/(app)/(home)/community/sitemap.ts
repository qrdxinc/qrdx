import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { OFFICIAL_FRAMES } from "qrdx";
import { sitemapItems } from "@/lib/community/queries";
import { communitySitemapEntries } from "@/lib/community/sitemap";
import { COMMUNITY_TAG } from "@/lib/community/tables";
import { baseUrl } from "@/lib/metadata";

// /community/sitemap.xml: the community's item pages and creator profiles
// (lib/community/sitemap.ts), named in robots.txt (app/robots.ts) beside
// the main sitemap, which lists the galleries. Read when it's asked for,
// since the app is built without a database; the list is kept for an hour
// and dropped whenever an item is published or removed (COMMUNITY_TAG).
export const dynamic = "force-dynamic";

const cachedEntries = unstable_cache(
  async () =>
    communitySitemapEntries({
      items: await sitemapItems(),
      officialFrameSlugs: OFFICIAL_FRAMES.map((frame) => frame.id),
    }),
  ["community-sitemap"],
  { revalidate: 3600, tags: [COMMUNITY_TAG] },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return (await cachedEntries()).map(({ path, lastModified }) => ({
    url: new URL(path, baseUrl).toString(),
    ...(lastModified ? { lastModified } : {}),
  }));
}

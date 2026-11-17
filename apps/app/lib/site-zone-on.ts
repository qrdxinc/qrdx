import "server-only";

import { type SiteGroup, siteZoneGroups } from "@repo/next-config/site-zone";
import { env } from "@/env";

/**
 * Whether the marketing site serves `group` on this deployment: SITE_ORIGIN
 * is set (next.config.ts proxies the group's pages there) and
 * SITE_ZONE_GROUPS includes it. Then this app's own copies of those pages
 * are never shown, so the sitemap and llms.txt leave them out and point at
 * the site's own lists.
 */
export function siteServes(group: SiteGroup): boolean {
  return (
    Boolean(env.SITE_ORIGIN) &&
    siteZoneGroups(env.SITE_ZONE_GROUPS).includes(group)
  );
}

import type { Metadata } from "next";
import { brandIconUrl } from "@/ee/client-portal/brand-icon";
import type { PublicStats } from "@/lib/public-stats-shared";

/**
 * A client-branded stats page (agency tools): the client's name in the
 * title and the link preview. Without QRdx marks (Business) the site name,
 * icons and the " | QRdx" title suffix give way to the client's. The page
 * (app/(app)/stats/[token]/page.tsx) adds its no-index settings around it.
 */
export function brandedStatsMetadata(
  stats: PublicStats,
  name: string,
  image: string,
): Metadata {
  const brand = stats.brand as NonNullable<PublicStats["brand"]>;
  const title = `${brand.name} · ${name} scan report`;
  const metadata: Metadata = {
    title: stats.hideQrdx ? { absolute: title } : title,
    description: `Scans of ${name}, prepared for ${brand.name}.`,
    openGraph: {
      title,
      description: `Scans of ${name}, prepared for ${brand.name}.`,
      images: [{ url: image, width: 1200, height: 630 }],
      ...(stats.hideQrdx ? { siteName: brand.name } : {}),
    },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
  if (!stats.hideQrdx) return metadata;
  return {
    ...metadata,
    applicationName: brand.name,
    authors: null,
    creator: null,
    keywords: null,
    manifest: null,
    icons: { icon: brandIconUrl(brand) },
  };
}

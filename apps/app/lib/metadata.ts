import { BRAND_NAME, DEV_BASE_URL, resolveBaseUrl } from "@repo/config";
import type { Metadata } from "next";
import { env } from "@/env";

// resolveBaseUrl is @repo/config's (the email templates resolve the same
// origin: @repo/email/origin).
export { DEV_BASE_URL, resolveBaseUrl };

export const baseUrl = resolveBaseUrl({
  nodeEnv: process.env.NODE_ENV,
  // Read only in development: `env` checks it's a URL
  devAppUrl:
    process.env.NODE_ENV === "development"
      ? env.NEXT_PUBLIC_APP_URL
      : undefined,
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
});

export const siteName = BRAND_NAME;

// Brand first: "qrdx" is the site's biggest search query.
export const siteTitle =
  "QRdx: Free QR Code Generator with Logos and Dynamic Codes";

export const siteDescription =
  "Free QR codes, and dynamic codes that keep working whatever happens to your plan. Design them with logos, colors and frames, no signup or watermark.";

/** Root-layout `keywords`; search engines mostly ignore them, so keep them few and accurate. */
export const siteKeywords = [
  "free qr code generator",
  "dynamic qr code generator",
  "qr code with logo",
  "qr code generator no signup",
  "qr code landing page",
  "qr code analytics",
  "open source qr code generator",
  "qr code api",
  "react qr code library",
  "eps qr code",
];

/** Served by app/opengraph-image.tsx */
export const defaultOgImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "QRdx: free QR code generator with dynamic QR codes, hosted pages and scan analytics",
};

function plainTitle(title: Metadata["title"]): string | undefined {
  if (!title) return undefined;
  if (typeof title === "string") return title;
  if ("absolute" in title && title.absolute) return title.absolute;
  if ("default" in title) return title.default;
  return undefined;
}

/**
 * Page metadata with canonical URL, Open Graph and Twitter card filled in.
 * Pass `path` (e.g. "/pricing") to set `alternates.canonical` and `og:url`.
 * Explicit `openGraph` / `twitter` / `alternates` fields win over the defaults.
 *
 * Pass `ownOgImage: true` when the route segment has its own
 * `opengraph-image.tsx`. Next.js only uses a segment's image file when that
 * segment's metadata sets no `openGraph.images`, so the site-wide default
 * would hide it. Every other page needs the default: setting `openGraph`
 * without images drops the image inherited from app/opengraph-image.tsx.
 */
export function createMetadata({
  path,
  ownOgImage = false,
  ...override
}: Metadata & { path?: string; ownOgImage?: boolean }): Metadata {
  const url = path ? new URL(path, baseUrl).toString() : undefined;
  const title = plainTitle(override.title);
  const description = override.description ?? undefined;

  return {
    ...override,
    openGraph: {
      type: "website",
      siteName,
      locale: "en_US",
      title,
      description,
      url,
      ...(!ownOgImage && { images: [defaultOgImage] }),
      ...override.openGraph,
    },
    twitter: {
      card: "summary_large_image",
      creator: "@bucha_ritesh",
      title,
      description,
      ...override.twitter,
    },
    alternates: {
      ...(url && { canonical: url }),
      ...override.alternates,
    },
  };
}

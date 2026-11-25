// Site-wide structured data. The Organization node goes on QRdx's own pages
// (marketing, docs, the playground) through their layouts, not the root
// layout: hosted pages under /p, on customers' own domains and white-label
// on Business, must not carry QRdx's identity.
//
// Facts only. No ratings or reviews until real ones exist on G2 or
// Capterra, and `sameAs` lists only profiles that exist today: add Product
// Hunt or AlternativeTo URLs once they're live.
import {
  CANONICAL_HOST,
  DISCORD_INVITE_URL,
  GITHUB_PROFILE_URL,
  GITHUB_REPO_URL,
  LINKEDIN_COMPANY_URL,
  MCP_GLAMA_URL,
  MCP_REGISTRY_URL,
  NPM_CLI_URL,
  NPM_LIBRARY_URL,
  SUBREDDIT_URL,
  SUBSTACK_URL,
  SUPPORT_EMAIL,
  WIKIDATA_URL,
  X_PROFILE_URL,
} from "@repo/config";
import type { Locale } from "@repo/i18n/config";
import { localizePath } from "@repo/i18n/paths";
import { CHROME_WEB_STORE_URL } from "@repo/integrations/src/catalog/entries/plugins";
import { baseUrl, defaultOgImage, siteName } from "@/lib/metadata";

const url = (path: string): string => new URL(path, baseUrl).toString();

/** `@id` other schema nodes use to point at QRdx (publisher, provider). */
export const organizationId = url("/#organization");

/** `@id` of the home page's WebSite node. */
export const webSiteId = url("/#website");

export const founderSchema = {
  "@type": "Person",
  "@id": url("/#founder"),
  name: "Ritesh Bucha",
  url: url("/blog/authors/ritesh-bucha"),
  sameAs: [GITHUB_PROFILE_URL, X_PROFILE_URL],
};

/**
 * Other names for the site, on the home page's WebSite node. "QRDX" is also
 * a blockchain and a Japanese QR product, so the domain and what QRdx does
 * tell them apart.
 */
export const webSiteAlternateNames = ["QRdx QR code generator", CANONICAL_HOST];

/**
 * The home page's WebPage node in `locale`. Its primaryImageOfPage is the
 * page's Open Graph image: Google's image guidance names this property (and
 * og:image) as the way to say which image a page prefers. Google still picks
 * the thumbnail it shows.
 */
export function homeWebPageSchema(locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: url(localizePath("/", locale)),
    isPartOf: { "@id": webSiteId },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: url(defaultOgImage.url),
      width: defaultOgImage.width,
      height: defaultOgImage.height,
    },
  };
}

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": organizationId,
  name: siteName,
  // Another product is called QRDX; the domain tells them apart.
  alternateName: CANONICAL_HOST,
  url: url("/"),
  logo: {
    "@type": "ImageObject",
    url: url("/logo.png"),
    width: 512,
    height: 512,
  },
  description:
    "Open-source QR code platform: a free QR code generator, dynamic QR codes with hosted pages and scan analytics, and developer tools.",
  // Says what QRdx is not, for search engines that merge it with the
  // unrelated projects sharing the name.
  disambiguatingDescription:
    "QRdx at qrdx.dev makes and manages QR codes and barcodes. It is software for QR codes, not a cryptocurrency, token or blockchain network.",
  knowsAbout: [
    "QR codes",
    "Dynamic QR codes",
    "QR code design",
    "Barcodes",
    "Scan analytics",
  ],
  email: SUPPORT_EMAIL,
  // The GitHub repository was created on 30 Oct 2025.
  foundingDate: "2025",
  founder: founderSchema,
  sameAs: [
    GITHUB_REPO_URL,
    NPM_LIBRARY_URL,
    NPM_CLI_URL,
    CHROME_WEB_STORE_URL,
    // The official MCP Registry's record and Glama's page for the MCP server.
    MCP_REGISTRY_URL,
    MCP_GLAMA_URL,
    // The QRdx Discord server, through its permanent invite.
    DISCORD_INVITE_URL,
    LINKEDIN_COMPANY_URL,
    // The monthly letter and the subreddit, both run by QRdx.
    SUBSTACK_URL,
    SUBREDDIT_URL,
    // QRdx's Wikidata item.
    WIKIDATA_URL,
  ],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: SUPPORT_EMAIL,
  },
};

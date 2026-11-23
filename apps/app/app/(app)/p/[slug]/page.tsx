import type { Locale } from "@repo/i18n/config";
import { localizePath } from "@repo/i18n/paths";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  CUSTOM_DOMAIN_HEADER,
  isCustomDomainRequest,
} from "@/app/(app)/dashboard/domains/_lib/hostname";
import { LandingPageFooter } from "@/components/landing/page-footer";
import { Pixels } from "@/components/landing/pixels";
import { PreciseLocationPrompt } from "@/components/landing/precise-location";
import { LandingRender } from "@/components/landing/render";
import { hostedPageCss } from "@/ee/white-label/access";
import { negotiateLocale } from "@/lib/i18n/accept-language";
import { requestAppLocale } from "@/lib/i18n/request-locale";
import { scanPagesIntl } from "@/lib/i18n/scan-pages";
import type { BlockRenderContext } from "@/lib/landing/blocks";
import { baseUrl } from "@/lib/metadata";
import { NFC_PARAM } from "@/lib/nfc/links";
import { aliasCode } from "@/lib/path-alias-store";
import { enforcePageLifecycle } from "@/lib/redirect/lifecycle";
import { ScanNotice } from "../_components/scan-notice";
import { loadPublicPage, pageSummary } from "../_lib/public-page";

// Hosted landing pages (qr_code.kind = 'page'), reached via /q/<slug> or
// directly. Customer pages: no QRdx analytics or chat widgets load here (see
// components/landing/customer-page-paths.ts); pixels only when the owner set them.
// The page is the owner's writing (<html lang> stays as it is); QRdx's own
// words around and inside the blocks follow the scanner's Accept-Language,
// per request (lib/i18n/scan-pages.ts). The page is dynamic and never cached.

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The scanner's language, from Accept-Language (never stored or cached). */
async function scannerLocale(): Promise<Locale> {
  return negotiateLocale((await headers()).get("accept-language"));
}

async function load(slug: string) {
  const customDomainId = (await headers()).get(CUSTOM_DOMAIN_HEADER);
  return loadPublicPage({ slug }, customDomainId);
}

/**
 * A path alias at `/p/<slug>` on a custom domain (lib/path-aliases.ts),
 * when no hosted page there has that back-half: the alias's code by its own
 * back-half, which counts the scan like any other (an NFC tap as a tap:
 * `?nfc` comes along, as host-routing.ts passes it). Null otherwise.
 */
async function aliasTarget(slug: string, nfc: boolean): Promise<string | null> {
  const requestHeaders = await headers();
  const domainId = requestHeaders.get(CUSTOM_DOMAIN_HEADER);
  if (!(domainId && isCustomDomainRequest(requestHeaders))) return null;
  try {
    const code = await aliasCode(`/p/${slug}`, domainId);
    if (!code) return null;
    const target = `/${encodeURIComponent(code.slug)}`;
    return nfc ? `${target}?${NFC_PARAM}` : target;
  } catch (error) {
    console.error("Path alias lookup failed:", error);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) {
    const { t } = await scanPagesIntl(await scannerLocale());
    return {
      title: { absolute: t("hosted.notFoundTitle") },
      robots: { index: false },
    };
  }

  // Not published yet: no title, photo or text from the template's samples.
  if (page.notReady) {
    const { t } = await scanPagesIntl(await scannerLocale());
    return {
      title: { absolute: t("hosted.notReadyTitle") },
      robots: { index: false, follow: false },
      openGraph: null,
      twitter: null,
    };
  }

  // Never leak a password-protected page's details into its share preview.
  if (page.code.passwordHash) {
    const { t } = await scanPagesIntl(await scannerLocale());
    return {
      title: { absolute: t("hosted.passwordProtected") },
      robots: { index: false, follow: false },
      openGraph: null,
      twitter: null,
    };
  }

  const { title, description, image, icon } = pageSummary(page);
  const images = image ? [{ url: image }] : undefined;
  return {
    title: { absolute: title },
    description: description || null,
    robots: page.settings.indexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
    // Customer pages: drop QRdx's own site metadata from the root layout.
    applicationName: null,
    keywords: null,
    authors: null,
    creator: null,
    manifest: null,
    openGraph: {
      type: "website",
      title,
      description: description || undefined,
      siteName: title,
      images,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description: description || undefined,
      images,
    },
    // White-label (Business, ee/white-label): the page's own logo instead of
    // the QRdx favicon.
    ...(page.branding.whiteLabel && icon && { icons: { icon, apple: icon } }),
  };
}

export default async function LandingPage({ params, searchParams }: Props) {
  // Before anything renders: the blocks' useTranslations (server
  // components) and not-found.tsx read this request's locale from here.
  const locale = await scannerLocale();
  requestAppLocale().current = locale;
  const { slug } = await params;
  const page = await load(slug);
  if (!page) {
    const target = await aliasTarget(
      slug,
      (await searchParams)[NFC_PARAM] !== undefined,
    );
    if (target) redirect(target);
    notFound();
  }
  // Password gate, schedule, scan limit and pause apply to direct visits too.
  await enforcePageLifecycle(page.code);

  // Never published: the template's samples would read as the owner's page
  // (a stranger's name, a product they don't sell). Say it isn't ready, and
  // tell whoever made the code what to do.
  if (page.notReady) {
    const { t } = await scanPagesIntl(locale);
    return (
      <ScanNotice
        aside={t("hosted.notReadyOwner")}
        locale={locale}
        makeYourOwn={t("status.makeYourOwn")}
        message={t("hosted.notReadyMessage")}
        title={t("hosted.notReadyTitle")}
      />
    );
  }

  const requestHeaders = await headers();
  const context: BlockRenderContext = {
    theme: page.content.theme,
    mode: "live",
    pageId: page.page.id,
    qrCodeId: page.code.id,
    userAgent: requestHeaders.get("user-agent"),
  };

  // Business with the licence (ee/white-label); on a downgrade, or on a
  // server without the licence key, the page keeps rendering without it.
  const css = hostedPageCss(page.branding, page.settings.customCss);

  const reportHref = new URL(
    `/report-abuse?slug=${encodeURIComponent(slug)}`,
    baseUrl,
  ).href;
  // QRdx's home in the language the scanner reads ("/hi").
  const badgeHref = new URL(
    `${localizePath("/", locale)}?ref=made-with-qrdx`,
    baseUrl,
  ).href;

  return (
    <>
      <LandingRender
        content={page.content}
        context={context}
        customCss={css}
        footer={
          <LandingPageFooter
            badge={page.branding.badge}
            badgeHref={badgeHref}
            reportHref={reportHref}
          />
        }
      />
      <Pixels
        customDomain={isCustomDomainRequest(requestHeaders)}
        pageId={page.page.id}
        pixels={page.code.pixels}
        qrCodeId={page.code.id}
      />
      {/* Only when the code asks for precise location (lib/scan-location). */}
      <PreciseLocationPrompt
        pixels={page.code.pixels}
        plan={page.plan}
        qrCodeId={page.code.id}
      />
    </>
  );
}

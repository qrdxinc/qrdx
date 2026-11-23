import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BUSINESS_CARD_PAGE_TYPE,
  nfcPageHref,
} from "@/app/(app)/dashboard/codes/_lib/nfc";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getPageForEdit } from "@/app/(app)/dashboard/pages/_lib/landing-pages";
import { getSavedThemePalettes } from "@/app/(app)/dashboard/pages/_lib/saved-themes";
import { PageEditor } from "@/components/landing/editor/page-editor";
import {
  type PagePlanCopy,
  PagePlanLineProvider,
} from "@/components/landing/editor/page-plan-line";
import { hostedPageBranding } from "@/ee/white-label/access";
import { getCheckoutOpen } from "@/lib/checkout-availability";
import { HttpError } from "@/lib/error-response";
import { formatBytes } from "@/lib/files/types";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { type PagePlanLine, pagePlanLine } from "@/lib/landing/plan-line";
import {
  isUnpublishedTemplate,
  templateSampleTexts,
} from "@/lib/landing/template-samples";
import { getTemplate } from "@/lib/landing/templates";
import { can } from "@/lib/permissions";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { isStorageConfigured } from "@/lib/storage/r2";

export const metadata: Metadata = {
  title: "Edit page",
  robots: { index: false, follow: false },
};

export default async function EditLandingPage({
  params,
}: {
  params: Promise<{ id: string; workspace: string }>;
}) {
  const scope = await requireDashboardScope();
  const { id, workspace } = await params;
  const [page, plan, savedThemes] = await Promise.all([
    getPageForEdit(scope, id).catch((error: unknown) => {
      if (error instanceof HttpError && error.status === 404) notFound();
      throw error;
    }),
    getPlanForScope(scope),
    getSavedThemePalettes(scope),
  ]);
  const limits = getPlanLimits(plan);
  // White-label and custom CSS: Business, and the licence key on a
  // self-hosted server (ee/white-label).
  const branding = hostedPageBranding(limits);
  const code =
    page.codes.find((item) => item.status === "active" && !item.inTrash) ??
    page.codes.find((item) => !item.inTrash) ??
    null;

  // Free's page limits next to uploads and after publishing, for people
  // who can buy Pro here.
  const planLine = pagePlanLine(
    plan,
    { free: getPlanLimits("free"), pro: getPlanLimits("pro") },
    {
      canBuyPro: getCheckoutOpen().pro && can(scope.role, "billing.manage"),
    },
  );
  const planCopy = planLine && (await pagePlanCopy(planLine));

  const editor = (
    <PageEditor
      branding={{
        badge: limits.landingPageBadge,
        whiteLabel: branding.whiteLabel,
      }}
      canUseCustomCss={branding.customCss}
      code={
        code
          ? {
              id: code.id,
              pageUrl: code.pageUrl,
              shortLink: code.shortLink,
              // NFC (feat/nfc): vCard Plus pages go on NFC business cards.
              nfcHref:
                page.type === BUSINESS_CARD_PAGE_TYPE
                  ? nfcPageHref(workspace, code.id)
                  : null,
              customDomain: code.customDomain,
            }
          : null
      }
      initialContent={page.content}
      // Viewers and billing members see the page, not the editor.
      readOnly={!can(scope.role, "content.write")}
      page={{
        id: page.id,
        title: page.title,
        version: page.version,
        typeLabel: getTemplate(page.type)?.label ?? "Page",
      }}
      neverPublished={isUnpublishedTemplate(page)}
      sampleTexts={templateSampleTexts(page.type)}
      savedThemes={savedThemes}
      storageEnabled={isStorageConfigured}
    />
  );

  return <PagePlanLineProvider value={planCopy}>{editor}</PagePlanLineProvider>;
}

/** The Free/Pro line's words, in the person's language. */
async function pagePlanCopy(line: PagePlanLine): Promise<PagePlanCopy> {
  const t = await getAppTranslations("app.dashboard.pages.planLine");
  const sizes = {
    free: formatBytes(line.freeFileBytes),
    pro: formatBytes(line.proFileBytes),
  };
  return {
    upload: t("upload", sizes),
    published: t("published", { ...sizes, pages: line.freePages }),
    seePro: t("seePro"),
  };
}

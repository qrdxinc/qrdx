import "server-only";

import { codePublicStats, database as db } from "@repo/database";
import { eq } from "drizzle-orm";
import { clientTools, requireClientBranding } from "@/ee/client-portal/access";
import {
  ClientBrandsUnavailableError,
  findClientBrand,
  listClientBrands,
} from "@/ee/client-portal/brands";
import type { StatsBranding } from "@/ee/client-portal/brands-shared";
import {
  findShareExtras,
  type ShareExtras,
  verifiedDomains,
} from "@/ee/client-portal/stats-page";
import { isMissingSchemaError } from "@/lib/community/tables";
import { HttpError } from "@/lib/error-response";
import { assertCan } from "@/lib/permissions-server";
import { cheapestPlanWith, getPlanForScope, getPlanLimits } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import {
  canSharePublicStats,
  findShare,
  findSharedCode,
  getPublicStatsShare,
  type PublicStatsShare,
} from "@/lib/public-stats";
import type { ActiveScope } from "@/lib/scope";

// The share dialog's client branding (agency tools, ee/ under the QRdx
// commercial licence): which client brand a code's shared stats page shows
// and the custom domain its link is on. Without the licence key both
// answer NOT_FOUND (./access.ts); the page itself stays shareable.

const planName = (allows: Parameters<typeof cheapestPlanWith>[0]) => {
  const plan = cheapestPlanWith(allows);
  return plan ? PLAN_NAMES[plan] : null;
};

const UNAVAILABLE_BRANDING: StatsBranding = {
  available: false,
  canManage: false,
  allowed: false,
  whiteLabel: false,
  brandingPlan: null,
  whiteLabelPlan: null,
  brandId: null,
  brands: [],
  domainId: null,
  domains: [],
};

/** The code's page branding and the choices the share dialog offers. */
export async function getStatsBranding(
  scope: ActiveScope,
  codeId: string,
): Promise<StatsBranding> {
  requireClientBranding();
  await findSharedCode(scope, codeId);
  const tools = clientTools(getPlanLimits(await getPlanForScope(scope)));
  let extras: ShareExtras | null;
  let brands: Awaited<ReturnType<typeof listClientBrands>>;
  try {
    [extras, brands] = await Promise.all([
      findShareExtras({ codeId }),
      tools.clientReports
        ? listClientBrands(scope.organizationId)
        : Promise.resolve([]),
    ]);
  } catch (error) {
    if (error instanceof ClientBrandsUnavailableError) {
      return UNAVAILABLE_BRANDING;
    }
    throw error;
  }
  if (extras === null && (await findShare(codeId).catch(() => null))) {
    // Shared, but the agency columns aren't there yet.
    return UNAVAILABLE_BRANDING;
  }
  return {
    available: true,
    canManage: canSharePublicStats(scope),
    allowed: tools.clientReports,
    whiteLabel: tools.clientReportsWhiteLabel,
    brandingPlan: planName((l) => l.clientReports),
    whiteLabelPlan: planName((l) => l.clientReportsWhiteLabel),
    brandId: extras?.brandKitId ?? null,
    brands,
    domainId: extras?.domainId ?? null,
    domains: tools.clientReportsWhiteLabel
      ? await verifiedDomains(scope.organizationId)
      : [],
  };
}

/**
 * Sets the brand (null: plain) and the custom domain (null: QRdx's host) of
 * a shared page. A brand needs Pro or Business, a domain needs Business;
 * both must belong to the code's workspace. Sharing must be on.
 */
export async function setStatsBranding(
  scope: ActiveScope,
  codeId: string,
  input: { brandId: string | null; domainId: string | null },
): Promise<{ share: PublicStatsShare; branding: StatsBranding }> {
  requireClientBranding();
  assertCan(scope, "content.write");
  await findSharedCode(scope, codeId);
  const tools = clientTools(getPlanLimits(await getPlanForScope(scope)));
  if (input.brandId) {
    if (!tools.clientReports) {
      throw new HttpError(
        402,
        "PLAN_REQUIRED",
        `Client branding is part of ${planName((l) => l.clientReports) ?? "a paid plan"}.`,
      );
    }
    if (!(await findClientBrand(scope.organizationId, input.brandId))) {
      throw new HttpError(404, "NOT_FOUND", "Client brand not found.");
    }
  }
  if (input.domainId) {
    if (!tools.clientReportsWhiteLabel) {
      throw new HttpError(
        402,
        "PLAN_REQUIRED",
        `Stats links on your own domain are part of ${planName((l) => l.clientReportsWhiteLabel) ?? "a paid plan"}.`,
      );
    }
    const domains = await verifiedDomains(scope.organizationId);
    if (!domains.some((domain) => domain.id === input.domainId)) {
      throw new HttpError(
        404,
        "NOT_FOUND",
        "That domain isn't a verified domain of this workspace.",
      );
    }
  }
  if (!(await findShare(codeId))) {
    throw new HttpError(
      409,
      "CONFLICT",
      "Turn the analytics page on first, then brand it.",
    );
  }
  try {
    await db
      .update(codePublicStats)
      .set({ brandKitId: input.brandId, domainId: input.domainId })
      .where(eq(codePublicStats.qrCodeId, codeId));
  } catch (error) {
    if (isMissingSchemaError(error)) throw new ClientBrandsUnavailableError();
    throw error;
  }
  const [share, branding] = await Promise.all([
    getPublicStatsShare(scope, codeId),
    getStatsBranding(scope, codeId),
  ]);
  return { share, branding };
}

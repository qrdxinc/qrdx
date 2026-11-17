import "server-only";

import {
  brandKit,
  codePublicStats,
  customDomain,
  database as db,
} from "@repo/database";
import { and, eq } from "drizzle-orm";
import { clientTools } from "@/ee/client-portal/access";
import { normalizeAccent } from "@/ee/client-portal/brands-shared";
import { isMissingSchemaError } from "@/lib/community/tables";
import { getPlanForScope, getPlanLimits, type PlanLimits } from "@/lib/plans";
import type { PublicStats } from "@/lib/public-stats-shared";
import type { ActiveScope } from "@/lib/scope";

// Client branding of a shared stats page (agency tools, ee/ under the QRdx
// commercial licence): the client brand /stats/<token> shows, whether it
// drops QRdx's marks, and the verified custom domain its link is served
// on. lib/public-stats.ts (the page itself, AGPL) asks statsLinkHost and
// statsPageBranding; without the licence key (./access.ts) every page is
// plain, on QRdx's host. The columns come from
// manual-sql/2026-11-11-agency.sql.

export interface ShareExtras {
  brandKitId: string | null;
  domainId: string | null;
}

/**
 * A share's brand and domain, looked up on their own so that a database
 * without the agency columns yet still shares plain pages: null then.
 */
export async function findShareExtras(
  where: { codeId: string } | { token: string },
): Promise<ShareExtras | null> {
  try {
    const [row] = await db
      .select({
        brandKitId: codePublicStats.brandKitId,
        domainId: codePublicStats.domainId,
      })
      .from(codePublicStats)
      .where(
        "codeId" in where
          ? eq(codePublicStats.qrCodeId, where.codeId)
          : eq(codePublicStats.token, where.token),
      )
      .limit(1);
    return row
      ? { brandKitId: row.brandKitId ?? null, domainId: row.domainId ?? null }
      : null;
  } catch (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
}

/** The workspace's verified custom domains. */
export async function verifiedDomains(organizationId: string) {
  return db
    .select({ id: customDomain.id, hostname: customDomain.hostname })
    .from(customDomain)
    .where(
      and(
        eq(customDomain.organizationId, organizationId),
        eq(customDomain.verified, true),
      ),
    )
    .orderBy(customDomain.hostname)
    .limit(100);
}

/**
 * The host a share's link is on: its custom domain while that's verified,
 * in the code's workspace, and the plan serves branded pages there
 * (Business, with the licence); otherwise QRdx's own (null).
 */
export async function statsLinkHost(
  scope: Pick<ActiveScope, "userId" | "organizationId">,
  codeId: string,
): Promise<string | null> {
  const extras = await findShareExtras({ codeId });
  if (!extras?.domainId) return null;
  const limits = getPlanLimits(await getPlanForScope(scope));
  if (!clientTools(limits).clientReportsWhiteLabel) return null;
  const domain = (await verifiedDomains(scope.organizationId)).find(
    (row) => row.id === extras.domainId,
  );
  return domain?.hostname ?? null;
}

/**
 * How a shared page looks: its client brand and whether QRdx's marks go.
 * Null when the page mustn't be served here: a request through a custom
 * domain (`customDomainId`) only gets the shares assigned to that domain.
 * A link already sent on that domain keeps opening when the plan or the
 * licence no longer covers white-label pages: it then shows QRdx's marks
 * again, like the same link on QRdx's own host.
 */
export async function statsPageBranding({
  token,
  organizationId,
  limits,
  customDomainId,
}: {
  token: string;
  organizationId: string | null;
  limits: PlanLimits;
  customDomainId: string | null;
}): Promise<Pick<PublicStats, "brand" | "hideQrdx"> | null> {
  const tools = clientTools(limits);
  // Looked up only where it can show.
  const extras =
    tools.clientReports || customDomainId
      ? await findShareExtras({ token })
      : null;
  if (customDomainId && extras?.domainId !== customDomainId) return null;
  const brand =
    tools.clientReports && extras?.brandKitId && organizationId
      ? await loadBrand(organizationId, extras.brandKitId)
      : null;
  return { brand, hideQrdx: Boolean(brand && tools.clientReportsWhiteLabel) };
}

/** A client brand of the workspace for a public page; null if gone. */
async function loadBrand(
  organizationId: string,
  brandKitId: string,
): Promise<PublicStats["brand"]> {
  try {
    const [row] = await db
      .select({
        name: brandKit.name,
        logo: brandKit.logo,
        colors: brandKit.colors,
      })
      .from(brandKit)
      .where(
        and(
          eq(brandKit.id, brandKitId),
          eq(brandKit.organizationId, organizationId),
          eq(brandKit.purpose, "client"),
        ),
      )
      .limit(1);
    if (!row) return null;
    const colors = (row.colors ?? {}) as { accent?: unknown };
    return {
      name: row.name,
      logo: row.logo,
      accent: normalizeAccent(colors.accent),
    };
  } catch (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
}

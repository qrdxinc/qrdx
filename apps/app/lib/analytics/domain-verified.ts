import "server-only";

import { database as db, qrCode } from "@repo/database";
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { acquisitionProps } from "./acquisition";
import { trackServerAfter, userEventOptions } from "./server";

// domain_verified, the own-domain step of the switch funnel: sent once per
// domain, when it first passes its DNS check (when it's added, or on
// Verify; a verified domain never goes back). `after_import` says whether
// the workspace had already imported codes from links on that domain
// (lib/migrate, kept back-halves: the move without a reprint). Never the
// domain itself.

/** Every import marker starts so (lib/migrate/normalize.ts importMarker). */
const IMPORTED = "%[import:%";

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

type Scope = { userId: string; organizationId: string | null };

/**
 * Whether the workspace has a code imported from a link on the domain: on it
 * already (imports put kept back-halves there while it's pending), or still
 * on qrdx.dev, waiting to move (its notes name the old link, as
 * "Imported from Bitly go.brand.com/…").
 */
export async function importedOntoDomain(
  scope: Scope,
  domain: { id: string; hostname: string },
): Promise<boolean> {
  const workspace = scope.organizationId
    ? eq(qrCode.organizationId, scope.organizationId)
    : and(eq(qrCode.userId, scope.userId), isNull(qrCode.organizationId));
  const [row] = await db
    .select({ id: qrCode.id })
    .from(qrCode)
    .where(
      and(
        isNull(qrCode.deletedAt),
        ilike(qrCode.notes, IMPORTED),
        or(
          eq(qrCode.domainId, domain.id),
          and(
            workspace,
            ilike(qrCode.notes, `% ${escapeLike(domain.hostname)}/%`),
          ),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** After a domain of `scope` became verified (domains.ts, add or Verify). */
export function trackDomainVerified(
  scope: Scope,
  domain: { id: string; hostname: string },
): void {
  trackServerAfter("domain_verified", async () => ({
    props: {
      after_import: await importedOntoDomain(scope, domain),
      ...(await acquisitionProps(scope.userId)),
    },
    // Verified once per domain: a repeat can't count twice.
    options: await userEventOptions(scope.userId, domain.id),
  }));
}

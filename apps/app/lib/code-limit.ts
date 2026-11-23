import "server-only";

import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import { database as db, member } from "@repo/database";
import { and, eq, like } from "drizzle-orm";
import { cache } from "react";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { inviteBonusCodes } from "@/lib/invites/bonus";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";

// The one place a workspace's dynamic-code limit is worked out: its plan's
// (lib/plans.ts), plus the codes invites earned its owner when it's someone's
// own workspace (lib/invites). Every check and every count goes through
// here: creating codes (the dashboard, the editor, hosted pages, imports,
// the REST API, the MCP server, the chat bots), restoring archived ones,
// moving a code between workspaces, the app shell's meter, Plan & usage and
// the limit emails, so they all agree.
//
// The bonus is extra allowance, not a plan: it adds to a capped plan's
// number and changes nothing on an unlimited one. Only the owner's own
// workspace gets it, never a team. Like every limit here it only blocks
// making new codes: codes made with it keep working if it's ever revoked.

/** A workspace's dynamic-code limit. */
export interface DynamicCodeLimit {
  /** The plan's number plus `bonus`; Infinity = unlimited */
  limit: number;
  /** Of that, codes earned by invites (0 when none or unlimited) */
  bonus: number;
}

/** Own workspaces' ids look like this (packages/auth/own-workspace-id.ts). */
const OWN_WORKSPACE_ID = /^ws_[0-9a-f]{32}$/;

/**
 * Whose own workspace this is: the person acting (no query), or, for a
 * member acting in someone else's own workspace, its owner; null for a team.
 */
const ownerOfOwnWorkspace = cache(
  async (organizationId: string, actingUserId: string) => {
    if (isOwnWorkspaceOf(organizationId, actingUserId)) return actingUserId;
    if (!OWN_WORKSPACE_ID.test(organizationId)) return null;
    const owners = await db
      .select({ userId: member.userId })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          like(member.role, "%owner%"),
        ),
      );
    return (
      owners.find((row) => isOwnWorkspaceOf(organizationId, row.userId))
        ?.userId ?? null
    );
  },
);

/**
 * The dynamic codes a workspace may have active, and how many of them invites
 * added. Pass `plan` when it's already known, to skip reading it again.
 */
export async function dynamicCodeLimit(
  scope: { userId: string; organizationId: string },
  plan?: Plan,
): Promise<DynamicCodeLimit> {
  const base = getPlanLimits(
    plan ?? (await getPlanForScope(scope)),
  ).dynamicCodes;
  // Self-hosted copies never count a bonus (and never look for one).
  if (!(Number.isFinite(base) && isFeatureAvailable("inviteRewards"))) {
    return { limit: base, bonus: 0 };
  }
  const owner = await ownerOfOwnWorkspace(scope.organizationId, scope.userId);
  const bonus = owner ? await inviteBonusCodes(owner) : 0;
  return { limit: base + bonus, bonus };
}

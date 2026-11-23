// Who owns and who may change an OAuth app. Pure (unit tested) and
// client-safe: the settings pages use the same rules to hide controls.

import { can } from "@/lib/permissions";
import type { ActiveScope } from "@/lib/scope";

/** oauth_app.registration_type of a client that registered itself (RFC 7591). */
export const DYNAMIC_REGISTRATION = "dynamic";

export interface OAuthAppOwnership {
  ownerUserId: string | null;
  organizationId: string | null;
  /**
   * oauth_app.registration_type. Required so no caller can forget it: a
   * self-registered client has no owner either, and must never read as
   * first-party. Undefined only for rows from before the column existed.
   */
  registrationType: string | null | undefined;
}

/** Registered itself at /api/oauth/register: anyone could have made it. */
export function isDynamicApp(
  app: Pick<OAuthAppOwnership, "registrationType">,
): boolean {
  return app.registrationType === DYNAMIC_REGISTRATION;
}

/**
 * Added by the QRdx team, not made in Settings → Developers: no owner, and
 * not a client that registered itself.
 */
export function isFirstPartyApp(app: OAuthAppOwnership): boolean {
  return (
    app.ownerUserId === null &&
    app.organizationId === null &&
    !isDynamicApp(app)
  );
}

/**
 * The app belongs to the open workspace (apps are made in one). First-party
 * and self-registered apps belong to no workspace.
 */
export function isAppInScope(
  scope: Pick<ActiveScope, "userId" | "organizationId">,
  app: OAuthAppOwnership,
): boolean {
  if (isFirstPartyApp(app) || isDynamicApp(app)) return false;
  return scope.organizationId
    ? app.organizationId === scope.organizationId
    : app.organizationId === null && app.ownerUserId === scope.userId;
}

/**
 * Only owners create, edit, delete apps or regenerate their secrets: team
 * owners in a team (admins and members can look), and the user in their
 * own workspace (where their role is always "owner").
 */
export function canManageOAuthApps(scope: Pick<ActiveScope, "role">): boolean {
  return can(scope.role, "oauthApps.manage");
}

export function canEditOAuthApp(
  scope: Pick<ActiveScope, "userId" | "organizationId" | "role">,
  app: OAuthAppOwnership,
): boolean {
  return isAppInScope(scope, app) && canManageOAuthApps(scope);
}

/**
 * Apps whose consent screen shows no "unverified" note: reviewed by the QRdx
 * team, or registered by it. A self-registered client never is.
 */
export function isTrustedApp(
  app: OAuthAppOwnership & { verified: boolean },
): boolean {
  if (isDynamicApp(app)) return false;
  return app.verified || isFirstPartyApp(app);
}

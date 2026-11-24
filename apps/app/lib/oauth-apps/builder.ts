import "server-only";

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { isDynamicApp, isFirstPartyApp } from "./access";

/** The host a redirect URI sends people to, or null when it can't be read. */
export function redirectHostOf(uri: string | undefined): string | null {
  if (!uri) return null;
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

/**
 * Who the consent screen says built the app: QRdx for first-party apps; for
 * an app in its creator's own workspace, the creator's name (as before
 * workspaces, when it was their personal app); else the workspace's name. A
 * client that registered itself names itself, so it's known by the host its
 * redirect URI sends people back to instead.
 */
export function appBuilderName(app: {
  ownerUserId: string | null;
  organizationId: string | null;
  registrationType: string | null | undefined;
  redirectUris?: readonly string[] | null;
  teamName: string | null;
  ownerName: string | null;
}): string {
  if (isDynamicApp(app)) {
    return redirectHostOf(app.redirectUris?.[0]) ?? "an unknown app";
  }
  if (isFirstPartyApp(app)) return "QRdx";
  const ownApp =
    app.ownerUserId !== null &&
    app.organizationId !== null &&
    app.organizationId === ownWorkspaceId(app.ownerUserId);
  return (
    (ownApp ? app.ownerName : app.teamName) ??
    app.ownerName ??
    "an independent developer"
  );
}

import "server-only";

import { isAdmin } from "@repo/auth/admin";
import { database as db, user } from "@repo/database";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { env } from "@/env";
import { sessionCheckPath } from "@/lib/account/session-origin";
import {
  getSessionAllowingHold,
  isSessionHeld,
} from "@/lib/account/session-origin-server";
import { isBanActive, oauthError } from "@/lib/oauth";
import { type AuthorizeParams, redirectWith } from "@/lib/oauth-apps/authorize";
import { signInPath } from "@/lib/safe-redirect";
import {
  adminConsoleClient,
  checkAdminConsoleAuthorizeRequest,
} from "./client";
import { issueAdminConsoleCode } from "./tickets";

/** This deployment's console client, or null while it's unset. */
export const currentAdminConsoleClient = () =>
  adminConsoleClient({
    adminConsoleUrl: env.ADMIN_CONSOLE_URL,
    secret: env.CONSOLE_ZONE_KEY,
  });

/**
 * GET /api/oauth/authorize for the console client (./client.ts): no consent
 * screen, since it's QRdx's own back office, and admins only.
 * - Unset: the client id is unknown, like any other.
 * - A request that isn't exactly the console's gets a JSON error.
 * - Signed out: to /sign-in, which comes back here afterwards.
 * - A held session (lib/account/session-origin.ts) goes to the check page
 *   first. The browser calls this URL itself, so the check sees its real
 *   country and browser: that's where a stolen cookie is stopped.
 * - Anyone who isn't an admin here is sent back with access_denied (the
 *   console shows its 404), so the console never gets a code for them.
 * - An admin gets a one-time code bound to their session and the PKCE
 *   challenge (./tickets.ts).
 */
export async function authorizeAdminConsole(
  req: NextRequest,
  params: AuthorizeParams,
): Promise<Response> {
  const client = currentAdminConsoleClient();
  if (!client) return oauthError("invalid_client", "Unknown client_id");
  const check = checkAdminConsoleAuthorizeRequest(client, params);
  if (!check.ok) return oauthError(check.error, check.description);

  const here = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  const requestHeaders = await headers();
  const found = await getSessionAllowingHold(requestHeaders);
  if (!found) {
    return Response.redirect(
      new URL(signInPath(here), req.nextUrl.origin),
      302,
    );
  }
  if (await isSessionHeld(found.session, requestHeaders)) {
    return Response.redirect(
      new URL(sessionCheckPath(here), req.nextUrl.origin),
      302,
    );
  }

  const [account] = await db
    .select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      banned: user.banned,
      banExpires: user.banExpires,
    })
    .from(user)
    .where(eq(user.id, found.user.id))
    .limit(1);
  if (!(account && isAdmin(account)) || isBanActive(account)) {
    return Response.redirect(
      redirectWith(params, {
        error: "access_denied",
        error_description: "This account can't use the console",
      }),
      302,
    );
  }

  const code = await issueAdminConsoleCode({
    userId: account.id,
    sessionId: found.session.id,
    redirectUri: client.redirectUri,
    codeChallenge: params.codeChallenge as string,
    scopes: check.scopes,
  });
  return Response.redirect(redirectWith(params, { code }), 302);
}

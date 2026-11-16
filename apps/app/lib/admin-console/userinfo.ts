import "server-only";

import { database as db, user } from "@repo/database";
import { eq } from "drizzle-orm";
import { isBanActive, NO_STORE_HEADERS, oauthError } from "@/lib/oauth";
import { currentAdminConsoleClient } from "./authorize";
import { consumeAdminConsoleAccessToken } from "./tickets";

/**
 * GET /api/oauth/userinfo with one of the console's access tokens
 * (./client.ts, ADMIN_CONSOLE_TOKEN_PREFIX): OpenID Connect's claims for
 * the scopes granted, plus `sid`, this app's session that signed in. The
 * console keeps `sid` in its own session: strong confirmations
 * (/admin/confirm) belong to that session, and so does the console's right
 * to act. The token is good once; the console asks once per sign-in.
 */
export async function adminConsoleUserinfo(token: string): Promise<Response> {
  const invalid = () =>
    oauthError("invalid_token", "Invalid or expired token", 401);
  if (!currentAdminConsoleClient()) return invalid();
  const grant = await consumeAdminConsoleAccessToken(token);
  if (!grant) return invalid();

  const [profile] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      banned: user.banned,
      banExpires: user.banExpires,
    })
    .from(user)
    .where(eq(user.id, grant.userId))
    .limit(1);
  if (!profile || isBanActive(profile)) return invalid();

  const claims: Record<string, unknown> = {
    sub: profile.id,
    sid: grant.sessionId,
  };
  if (grant.scopes.includes("email")) {
    claims.email = profile.email;
    claims.email_verified = profile.emailVerified === true;
  }
  if (grant.scopes.includes("profile")) {
    claims.name = profile.name;
    claims.picture = profile.image;
  }
  return Response.json(claims, { headers: NO_STORE_HEADERS });
}

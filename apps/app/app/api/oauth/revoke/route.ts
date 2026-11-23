import { database as db, oauthToken } from "@repo/database";
import { eq, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { hashToken, oauthError } from "@/lib/oauth";

/**
 * Public clients (MCP apps in a browser) revoke from their own origin, as
 * they exchange codes at /api/oauth/token. No cookies are read: knowing the
 * token is what counts.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const response = await revoke(req);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

async function revoke(req: NextRequest): Promise<Response> {
  const body = await req.formData().catch(() => null);
  if (!body) {
    return oauthError("invalid_request", "Request body must be form-encoded");
  }

  const token = body.get("token") as string | null;
  if (!token) {
    return oauthError("invalid_request", "Missing required parameter: token");
  }

  const tokenHash = hashToken(token);

  const [record] = await db
    .select({ id: oauthToken.id })
    .from(oauthToken)
    .where(
      or(
        eq(oauthToken.accessTokenHash, tokenHash),
        eq(oauthToken.refreshTokenHash, tokenHash),
      ),
    )
    .limit(1);

  if (record) {
    await db
      .update(oauthToken)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(oauthToken.id, record.id));
  }

  return new Response(null, { status: 200 });
}

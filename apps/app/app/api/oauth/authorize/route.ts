import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auditOAuthApp } from "@/ee/audit-log/security-events";
import {
  currentSession,
  requireRecentConfirmation,
} from "@/lib/account/confirmation-server";
import { authorizeAdminConsole } from "@/lib/admin-console/authorize";
import { isAdminConsoleClientId } from "@/lib/admin-console/client";
import { baseUrl } from "@/lib/metadata";
import { oauthError } from "@/lib/oauth";
import {
  authorizationResponse,
  authorizeParamEntries,
  checkAuthorizeRequest,
  hasPriorConsent,
  issueAuthorizationCode,
  readAuthorizeParams,
} from "@/lib/oauth-apps/authorize";

// GET: the URL apps send people to. Invalid requests never redirect to the
// redirect_uri (it can't be trusted until it has been checked): apps get a
// JSON error, and a browser goes to the consent page, which explains it.
// People who are signed out, or haven't approved this app for these scopes
// yet, continue on the consent page (/oauth/authorize), which POSTs back here.
// A repeat authorization for scopes already approved skips the page (and
// "Confirm it's you"): it grants nothing new, and the code is only good to
// the app's own registered redirect URI with its client secret. A client
// that registered itself (an MCP client, /api/oauth/register) always gets
// the page: anyone can register one under any name.
// The back-office console is a first-party client defined by environment,
// not an oauth_app row (lib/admin-console): admins only, and no consent page.

function consentPage(req: NextRequest, entries: [string, string][]) {
  const url = new URL("/oauth/authorize", req.nextUrl.origin);
  for (const [key, value] of entries) url.searchParams.set(key, value);
  return url;
}

/** A browser navigation (it asks for HTML), not an app's API call. */
function wantsPage(req: NextRequest): boolean {
  return (req.headers.get("accept") ?? "").includes("text/html");
}

export async function GET(req: NextRequest) {
  const params = readAuthorizeParams((key) =>
    req.nextUrl.searchParams.get(key),
  );
  if (isAdminConsoleClientId(params.clientId)) {
    return authorizeAdminConsole(req, params);
  }
  const check = await checkAuthorizeRequest(params);
  if (!check.ok) {
    // A person in a browser (an app's saved connection whose client was
    // deleted, a broken link) gets the page that says so in words; apps
    // get the JSON. Our own page, never the request's redirect_uri.
    if (wantsPage(req)) {
      return Response.redirect(
        consentPage(req, authorizeParamEntries(params)).toString(),
        302,
      );
    }
    return oauthError(check.error, check.description);
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (
    userId &&
    params.prompt !== "consent" &&
    !check.app.dynamic &&
    (await hasPriorConsent(check.app.id, userId, check.scopes))
  ) {
    const location = await issueAuthorizationCode(
      check.app.id,
      userId,
      params,
      check.scopes,
      { dynamic: check.app.dynamic },
    );
    return Response.redirect(location, 302);
  }

  return Response.redirect(
    consentPage(req, authorizeParamEntries(params)).toString(),
    302,
  );
}

/**
 * Same-origin form posts only: the consent page's own form. Session cookies
 * are SameSite=Lax as well, so a cross-site post would arrive signed out.
 */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") {
    // The public origin too, for proxies that terminate TLS in front of Next.
    return origin === req.nextUrl.origin || origin === baseUrl.origin;
  }
  return req.headers.get("sec-fetch-site") === "same-origin";
}

// POST: the consent page's Allow / Deny buttons.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return oauthError(
      "invalid_request",
      "Authorization must be approved on the QRdx consent page",
      403,
    );
  }
  const form = await req.formData().catch(() => null);
  if (!form) {
    return oauthError("invalid_request", "Request body must be form-encoded");
  }
  const field = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : null;
  };

  const params = readAuthorizeParams(field);
  if (isAdminConsoleClientId(params.clientId)) {
    // It has no consent page: GET issues its codes, or refuses.
    return oauthError("invalid_client", "Unknown client_id");
  }
  const check = await checkAuthorizeRequest(params);
  if (!check.ok) return oauthError(check.error, check.description);

  const session = await currentSession();
  const userId = session?.userId;
  if (!(session && userId)) {
    // Signed out in another tab: sign in again on the consent page.
    return Response.redirect(
      consentPage(req, authorizeParamEntries(params)).toString(),
      303,
    );
  }

  // Approving lets the app keep using the account after this browser signs
  // out, so it asks "Confirm it's you" (the page asks before it posts). A
  // stolen session cookie alone can't approve an app of its own. Without a
  // confirmation in the last 10 minutes (it ran out, or the post didn't come
  // from the page's button), back to the page, where Authorize asks.
  if (
    field("decision") === "allow" &&
    (await requireRecentConfirmation(session))
  ) {
    return Response.redirect(
      consentPage(req, authorizeParamEntries(params)).toString(),
      303,
    );
  }

  if (field("decision") !== "allow") {
    // RFC 6749 §4.1.2.1
    return Response.redirect(
      authorizationResponse(params, {
        error: "access_denied",
        error_description: "The user denied the request",
      }),
      303,
    );
  }

  const location = await issueAuthorizationCode(
    check.app.id,
    userId,
    params,
    check.scopes,
    { dynamic: check.app.dynamic },
  );
  auditOAuthApp(userId, "oauth_app.authorized", check.app, check.scopes);
  return Response.redirect(location, 303);
}

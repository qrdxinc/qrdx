import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { getSignInOptions } from "@/lib/auth/sign-in-options-server";
import {
  authorizeParamEntries,
  checkAuthorizeRequest,
  readAuthorizeParams,
} from "@/lib/oauth-apps/authorize";
import { mcpSignUpTags } from "@/lib/oauth-apps/mcp-sign-up";
import { OAuthConsent, OAuthRequestError } from "./oauth-consent";
import { OAuthSignIn } from "./oauth-sign-in";

export const metadata: Metadata = {
  title: "Authorize app",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Sign-in and consent for /api/oauth/authorize. The request is re-checked
// here (and again when the form posts), so nothing is shown for an unknown
// app or an unregistered redirect_uri.
//
// An MCP client (an app that registered itself, lib/oauth-registration.ts)
// names itself, so the page says who it is by the host it sends people back
// to, and a sign-up that starts here is counted as coming from the MCP
// server (ref=mcp), with the client's family (chatgpt, claude, cursor, ...)
// as its source.
export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const params = readAuthorizeParams((key) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  });
  const check = await checkAuthorizeRequest(params);
  if (!check.ok) {
    return (
      <OAuthRequestError
        description={check.description}
        // An unknown client_id: most often an MCP app's saved connection
        // whose registration was deleted as unused.
        unknownApp={check.error === "invalid_client"}
      />
    );
  }

  const entries = authorizeParamEntries(params);
  const redirectHost = new URL(params.redirectUri as string).host;
  // A self-registered client's name is its own claim: the host it sends
  // people back to goes next to it.
  const appName =
    check.app.dynamic && check.app.name !== redirectHost
      ? `${check.app.name} (${redirectHost})`
      : check.app.name;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    const callbackURL = `/oauth/authorize?${new URLSearchParams(entries)}`;
    const { google, github } = getSignInOptions();
    return (
      <OAuthSignIn
        app={{
          name: appName,
          logoUrl: check.app.logoUrl,
          mcpOnly: check.app.dynamic,
        }}
        callbackURL={callbackURL}
        providers={{ google, github }}
        scopes={check.scopes}
        signUpTags={mcpSignUpTags(check.app)}
      />
    );
  }

  // Authorize asks "Confirm it's you" (app/api/oauth/authorize/route.ts).
  return (
    <ConfirmIdentityProvider>
      <OAuthConsent
        account={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image ?? null,
        }}
        app={{
          mcpOnly: check.app.dynamic,
          name: appName,
          description: check.app.description,
          logoUrl: check.app.logoUrl,
          websiteUrl: check.app.websiteUrl,
          trusted: check.app.trusted,
          // A self-registered client is known by where it sends you back.
          builtBy: check.app.dynamic ? redirectHost : check.app.builtBy,
        }}
        fields={entries}
        redirectHost={redirectHost}
        scopes={check.scopes}
      />
    </ConfirmIdentityProvider>
  );
}

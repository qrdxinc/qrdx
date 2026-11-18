"use client";

import { authClient } from "@repo/auth/client";
import { GithubLogo, GoogleLogo } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { OAuthAppLogo } from "@/components/oauth/oauth-app-logo";
import type { OAuthScope } from "@/lib/oauth-scopes";
import { signInPath } from "@/lib/safe-redirect";
import { AuthorizeShell, ScopeList } from "./oauth-consent";

/**
 * Signed-out step: sign in, then the same URL shows the consent screen.
 * Google and GitHub only where this server runs them (`providers`); with
 * neither, the sign-in page takes over, returning here after.
 */
export function OAuthSignIn({
  app,
  scopes,
  callbackURL,
  providers,
}: {
  app: { name: string; logoUrl: string | null };
  scopes: OAuthScope[];
  callbackURL: string;
  providers: { google: boolean; github: boolean };
}) {
  const t = useTranslations("app.oauth.authorize.oauthSignIn");
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const handleSignIn = async (provider: "google" | "github") => {
    setLoadingProvider(provider);
    try {
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL,
      });
      // e.g. the provider is not configured on this server
      if (error) setLoadingProvider(null);
    } catch {
      setLoadingProvider(null);
    }
  };

  const isLoading = loadingProvider !== null;

  return (
    <AuthorizeShell>
      <div className="mb-8 flex flex-col items-center text-center">
        <OAuthAppLogo logoUrl={app.logoUrl} name={app.name} />
        <p className="text-muted-foreground mt-4 text-sm">
          {t("signInToQrdxTo")}
        </p>
        <h1 className="mt-1 text-lg font-semibold text-balance">{app.name}</h1>
      </div>

      <div className="space-y-3">
        {providers.google && (
          <Button
            className="h-10 w-full justify-center gap-2"
            disabled={isLoading}
            onClick={() => handleSignIn("google")}
            variant="outline"
          >
            <GoogleLogo className="h-4 w-4" />
            {t("continueWithGoogle")}
            {loadingProvider === "google" && (
              <ModuleOrbit aria-hidden className="h-3.5 w-3.5" />
            )}
          </Button>
        )}

        {providers.github && (
          <Button
            className="h-10 w-full justify-center gap-2"
            disabled={isLoading}
            onClick={() => handleSignIn("github")}
            variant="outline"
          >
            <GithubLogo className="h-4 w-4" />
            {t("continueWithGithub")}
            {loadingProvider === "github" && (
              <ModuleOrbit aria-hidden className="h-3.5 w-3.5" />
            )}
          </Button>
        )}

        {/* An email code, single sign-on, or the page saying sign-in isn't set up. */}
        {!(providers.google || providers.github) && (
          <Button
            asChild
            className="h-10 w-full justify-center"
            variant="outline"
          >
            <Link href={signInPath(callbackURL)}>{t("continueToSignIn")}</Link>
          </Button>
        )}
      </div>

      {scopes.length > 0 && (
        <div className="mt-8">
          <ScopeList appName={app.name} scopes={scopes} />
        </div>
      )}

      <p className="text-muted-foreground mt-6 text-center text-xs">
        {t("youllReviewThesePermissionsBefore")}
      </p>
    </AuthorizeShell>
  );
}

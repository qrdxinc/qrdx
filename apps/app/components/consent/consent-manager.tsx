"use client";

import "@/lib/analytics/privacy";
import { ConsentManager as Consent } from "@repo/analytics/consent/consent-manager";
import { getAnalyticsPlan } from "@/actions/analytics";
import { LocaleLink } from "@/components/i18n/locale-link";
import { isHomePath } from "@/lib/home-path";

/**
 * The cookie banner, preferences and consent-gated tools
 * (packages/analytics/consent), with this app's pieces: links that keep the
 * visitor's language, and the server action that reads the signed-in user's
 * plan for PostHog, and Featurebase on the home page only (in every
 * language). @/lib/analytics/privacy registers the app's untracked
 * pages before anything is tracked.
 */
export function ConsentManager() {
  return (
    <Consent
      featurebaseOn={isHomePath}
      getPlan={getAnalyticsPlan}
      link={LocaleLink}
    />
  );
}

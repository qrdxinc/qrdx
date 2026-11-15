"use client";

import { useConsent, useHasConsentPolicy } from "@c15t/nextjs";
import { Analytics, type GetAnalyticsPlan } from "../analytics";
import { FeaturebaseGate } from "../featurebase-gate";

/**
 * QRdx's own third-party tools. Analytics: Umami (cookieless) always runs,
 * PostHog only with the "Analytics" choice, which it follows live (see
 * ../posthog.ts). Featurebase loads in production after "Functionality" is
 * allowed, on the pages the app picks (featurebaseOn, ../featurebase-gate.tsx).
 * Revoking a category reloads the page (c15t default), so a tool that
 * already ran stops there.
 */
export function ConsentScripts({
  getPlan,
  featurebaseOn,
}: {
  getPlan?: GetAnalyticsPlan;
  /** The pages that show Featurebase (default: every page). */
  featurebaseOn?: (pathname: string) => boolean;
}) {
  const ready = useHasConsentPolicy();
  const measurement = useConsent("measurement");
  const functionality = useConsent("functionality");
  return (
    <>
      {/* null until the stored choice is known, so PostHog waits for it. */}
      <Analytics measurement={ready ? measurement : null} getPlan={getPlan} />
      <FeaturebaseGate allowed={functionality} on={featurebaseOn} />
    </>
  );
}

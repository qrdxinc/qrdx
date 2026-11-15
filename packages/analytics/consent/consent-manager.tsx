"use client";

import { ConsentRoot } from "@c15t/nextjs";
import type { GetAnalyticsPlan } from "../analytics";
import { consentConfig } from "./config";
import type { ConsentLink } from "./consent-copy";
import { ConsentScripts } from "./consent-scripts";
import { CookieBanner } from "./cookie-banner";
import { CookiePreferences } from "./cookie-preferences";

/**
 * c15t consent for QRdx's own pages. Rendered beside the page tree (not
 * around it) and only off customer pages, so hosted pages never get the
 * provider, banner or QRdx's tools. The app passes its link component and,
 * if it has one, the server action that reads the signed-in user's plan.
 */
export function ConsentManager({
  link,
  getPlan,
  featurebaseOn,
}: {
  link: ConsentLink;
  getPlan?: GetAnalyticsPlan;
  /** The pages that show Featurebase (default: every page). */
  featurebaseOn?: (pathname: string) => boolean;
}) {
  return (
    <ConsentRoot config={consentConfig}>
      <CookieBanner link={link} />
      <CookiePreferences link={link} />
      <ConsentScripts featurebaseOn={featurebaseOn} getPlan={getPlan} />
    </ConsentRoot>
  );
}

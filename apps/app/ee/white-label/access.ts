import "server-only";

import { scopeCustomCss } from "@/ee/white-label/custom-css";
import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { getPlanForScope, getPlanLimits, type PlanLimits } from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";

// White-label and custom CSS on hosted pages (/p). A page has them under the
// same rule as the audit log: its workspace's plan includes them (Business,
// lib/plans.ts `whiteLabel` and `customCss`), and on a self-hosted server it
// also needs the QRdx licence key (packages/availability/rules.ts
// `whiteLabel`). Without either, a page keeps serving with QRdx's default
// branding and without its custom CSS, which stays stored (Never-Hostage):
// nothing here ever stops a page from rendering or from being saved.

export interface HostedPageBranding {
  /** No QRdx branding: the page's own logo is its browser icon */
  whiteLabel: boolean;
  /** The page's custom CSS is applied, and can be edited */
  customCss: boolean;
}

const OFF: HostedPageBranding = { whiteLabel: false, customCss: false };

/** What a page whose workspace has `limits` gets here. */
export function hostedPageBranding(
  limits: Pick<PlanLimits, "whiteLabel" | "customCss">,
): HostedPageBranding {
  if (!isFeatureAvailable("whiteLabel")) return OFF;
  return { whiteLabel: limits.whiteLabel, customCss: limits.customCss };
}

/**
 * The page's custom CSS, scoped to the page, when its branding applies it;
 * null otherwise, and for stored CSS that no longer passes the checks.
 */
export function hostedPageCss(
  branding: Pick<HostedPageBranding, "customCss">,
  css: string,
): string | null {
  if (!(branding.customCss && css.trim())) return null;
  const result = scopeCustomCss(css);
  return result.ok ? result.css : null;
}

/**
 * Saving a page with custom CSS: 402 without the plan, where the feature
 * exists. On a server without the licence the editor doesn't offer custom
 * CSS and pages never apply it, so CSS a page already holds is kept as it is
 * and saving goes through.
 */
export async function assertCustomCssAllowed(
  scope: ActiveScope,
  css: string,
): Promise<void> {
  if (!(css.trim() && isFeatureAvailable("whiteLabel"))) return;
  if (!getPlanLimits(await getPlanForScope(scope)).customCss) {
    throw new HttpError(
      402,
      "PLAN_REQUIRED",
      "Custom CSS is a Business feature. Remove it from Settings to publish.",
    );
  }
}

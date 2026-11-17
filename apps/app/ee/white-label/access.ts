import "server-only";

import {
  PAGE_SETTINGS_TYPE,
  type PageSettings,
} from "@/components/landing/page-settings-block";
import { scopeCustomCss } from "@/ee/white-label/custom-css";
import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { getPlanForScope, getPlanLimits, type PlanLimits } from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";
import type { LandingPageContent } from "@/types/landing";

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
 * Saving page content with custom CSS, where the feature exists: 400 for CSS
 * outside the safe subset (custom-css.ts), then 402 without the plan. On a
 * server without the licence the editor doesn't offer custom CSS and pages
 * never apply it, so CSS a page already holds is kept as it is, unchecked,
 * and saving goes through.
 */
export async function assertCustomCssAllowed(
  scope: ActiveScope,
  content: LandingPageContent,
): Promise<void> {
  const index = content.blocks.findIndex(
    (block) => block.type === PAGE_SETTINGS_TYPE,
  );
  const settings = content.blocks[index]?.props as PageSettings | undefined;
  const css = settings?.customCss ?? "";
  if (!(css.trim() && isFeatureAvailable("whiteLabel"))) return;
  const result = scopeCustomCss(css);
  if (!result.ok) {
    // Worded like the other block problems a save reports.
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      `${result.error} (blocks.${index}.props.customCss)`,
    );
  }
  if (!getPlanLimits(await getPlanForScope(scope)).customCss) {
    throw new HttpError(
      402,
      "PLAN_REQUIRED",
      "Custom CSS is a Business feature. Remove it from Settings to publish.",
    );
  }
}

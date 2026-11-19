// The hosted-page editor's plain Free/Pro line (components/landing/editor/
// page-plan-line.tsx): what Free includes for pages and what Pro changes.
// Pure; the limits come in from lib/plans.ts (server-only), never typed.

import type { PlanLimits } from "@/lib/plans";
import type { Plan } from "@/lib/pricing";

export interface PagePlanLine {
  /** Hosted pages on Free */
  freePages: number;
  /** Largest upload on Free and on Pro, in bytes */
  freeFileBytes: number;
  proFileBytes: number;
}

/**
 * The line for a page on `plan`: only on Free, only when this person can
 * buy Pro here (checkout sells it and they may change the plan, the rule of
 * Home's card and the sidebar's Upgrade row), and only where Pro does what
 * the line says (removes the footer and the page cap, takes bigger files).
 * A server with other limits (self-hosted, a licence key that drops the
 * footer everywhere) gets no line rather than a wrong one.
 */
export function pagePlanLine(
  plan: Plan,
  { free, pro }: { free: PlanLimits; pro: PlanLimits },
  { canBuyPro }: { canBuyPro: boolean },
): PagePlanLine | null {
  if (plan !== "free" || !canBuyPro) return null;
  const proLiftsAll =
    free.landingPageBadge &&
    !pro.landingPageBadge &&
    Number.isFinite(free.landingPages) &&
    !Number.isFinite(pro.landingPages) &&
    pro.maxFileBytes > free.maxFileBytes;
  if (!proLiftsAll) return null;
  return {
    freePages: free.landingPages,
    freeFileBytes: free.maxFileBytes,
    proFileBytes: pro.maxFileBytes,
  };
}

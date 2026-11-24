import "server-only";

import type { EeFeature } from "@repo/auth/ee-license";
import { registerPlanLimits } from "@repo/auth/plan-limits";
import { eeOnEveryPlan, type FeatureContext } from "@repo/availability";
import { MAX_FREE_THEMES } from "@repo/config";
import { database as db, member } from "@repo/database";
import { and, eq, like, or } from "drizzle-orm";
import { cache } from "react";
import { featureContext } from "./feature-context";
import { FREE_DYNAMIC_CODES, FREE_HOSTED_PAGES } from "./free-plan-limits";
import { holdsPlanRole } from "./permissions";
import {
  AI_ART_PER_MONTH,
  API_REQUESTS_PER_DAY,
  FILE_STORAGE_BYTES,
  FORM_RESPONSES_PER_MONTH,
  MAX_FILE_BYTES,
  PRO_TEAM_MEMBERS,
} from "./plan-allowances";
import { type Plan, planForProductId } from "./pricing";
import { SCAN_HISTORY_DAYS } from "./scan-history";
import { getMyActiveSubscription } from "./subscription";

/**
 * Plans and their limits — the single source of truth for feature gating
 * (prices and display names live in the client-safe lib/pricing.ts).
 * packages/auth reads them too (registered at the end of this file): who may
 * create more workspaces, seats, workspace SSO and required two-step
 * verification. A self-hosted server changes PLAN_LIMITS below; without
 * billing (Polar) every account is on Free.
 *
 * Never-Hostage Guarantee: limits only block creating new things. Existing
 * dynamic codes keep redirecting on every plan, including after a downgrade,
 * a failed payment or a cancellation; scans are unlimited and never paused.
 */
export type { Plan };

export const PLANS: readonly Plan[] = ["free", "pro", "business"];

/** Use `Number.isFinite(limit)` to tell a cap from "unlimited". */
export const UNLIMITED = Number.POSITIVE_INFINITY;

export interface PlanLimits {
  /** Active (non-archived) dynamic QR codes per scope */
  dynamicCodes: number;
  /** Hosted landing pages per scope */
  landingPages: number;
  /** Hosted pages show a "Made with QRdx" footer */
  landingPageBadge: boolean;
  /** No QRdx branding on hosted pages */
  whiteLabel: boolean;
  /** Custom CSS on hosted pages */
  customCss: boolean;
  /** Total bytes of uploaded files per scope */
  storageBytes: number;
  /** Largest single upload, in bytes */
  maxFileBytes: number;
  /**
   * How far back scan analytics can be queried (lib/scan-history.ts). Only
   * a read limit: scans are kept as long as their code exists.
   */
  analyticsRetentionDays: number;
  /**
   * Planned, not built: raw scans older than this may one day be rolled up
   * into daily counts. Nothing reads it today, and nothing deletes or rolls
   * up scans by age or plan, so it isn't advertised. It never exceeds a
   * higher plan's, and covers the whole window of a plan with a finite one.
   */
  rawScanRetentionDays: number;
  customDomains: number;
  /** Choose a code's back-half (qrdx.dev/q/spring-menu) instead of a generated one */
  customSlugs: boolean;
  /** May create teams (organizations) */
  teams: boolean;
  /** Members per team, owner included */
  teamMembers: number;
  /** Per-folder access rules for team members */
  folderPermissions: boolean;
  /**
   * Workspace single sign-on, OIDC and SAML (packages/auth/ee/sso.ts). An
   * ee feature: see getPlanLimits.
   */
  sso: boolean;
  /**
   * The workspace may require two-step verification of its members
   * (packages/auth/workspace-two-factor.ts reads this).
   */
  requireTwoFactor: boolean;
  /** The workspace audit log (ee/audit-log). An ee feature: see getPlanLimits. */
  auditLog: boolean;
  /** Password, start/expiry dates and scan limits (lib/redirect/lifecycle.ts) */
  linkControls: boolean;
  /** Device/geo/time/language rules, A/B splits and UTM (lib/redirect/routing.ts) */
  routing: boolean;
  /**
   * A code may ask scanners for their precise location (opt-in per code, the
   * scanner decides in the browser): GPS scan points in analytics and
   * geofence rules that use them (lib/scan-location). Free keeps IP-based
   * location.
   */
  preciseLocation: boolean;
  /** Retargeting pixels */
  pixels: boolean;
  /** Conversion tracking */
  conversions: boolean;
  /** Email digests and alerts */
  emailAlerts: boolean;
  /** Webhooks, Zapier and Slack/Discord notifications */
  webhooks: boolean;
  /** OAuth apps a workspace can register (Settings → Developers) */
  oauthApps: number;
  /** Form submissions accepted per calendar month across hosted pages */
  formResponsesPerMonth: number;
  /** REST API requests per day */
  apiRequestsPerDay: number;
  /** May create dynamic codes in bulk via the REST API */
  bulkApi: boolean;
  /** AI QR art images per calendar month */
  aiArtPerMonth: number;
  /** The AI art quota is shared by the whole team */
  aiArtPooled: boolean;
  savedThemes: number;
  /** Saved themes can be shared with a team */
  teamThemes: boolean;
  /** @deprecated Brand kits are merged into saved themes; use `savedThemes`. */
  brandKits: number;
  /**
   * Saved barcodes per scope, not counting the trash (lib/barcodes). Static,
   * so nothing is hosted: every plan saves them, the cap only stops abuse.
   */
  savedBarcodes: number;

  // ─── Agency tools (feat/agency-tools) ──────────────────────────────────────
  /**
   * Shared stats pages (/stats/<token>) can carry a client's name, logo and
   * accent color (ee/client-portal/brands.ts). Pro keeps a small "Made with
   * QRdx".
   */
  clientReports: boolean;
  /**
   * Client-branded stats pages show no QRdx mark, and their link can be
   * served on one of the workspace's verified custom domains.
   */
  clientReportsWhiteLabel: boolean;
  /**
   * The read-only client portal (/portal/<workspace>, ee/client-portal):
   * invited clients see the folders shared with them, under the workspace's
   * branding.
   */
  clientPortal: boolean;
  /**
   * A yearly plan can be paid by invoice. Polar's checkout only takes cards
   * and wallets, so a request reaches QRdx and the invoice is arranged by
   * hand (lib/invoice-requests.ts).
   */
  invoiceBilling: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    dynamicCodes: FREE_DYNAMIC_CODES,
    landingPages: FREE_HOSTED_PAGES,
    landingPageBadge: true,
    whiteLabel: false,
    customCss: false,
    storageBytes: FILE_STORAGE_BYTES.free,
    maxFileBytes: MAX_FILE_BYTES.free,
    analyticsRetentionDays: SCAN_HISTORY_DAYS.free,
    rawScanRetentionDays: 365,
    customDomains: 0,
    customSlugs: false,
    teams: false,
    teamMembers: 1,
    folderPermissions: false,
    sso: false,
    requireTwoFactor: false,
    auditLog: false,
    linkControls: false,
    routing: false,
    preciseLocation: false,
    pixels: false,
    conversions: false,
    emailAlerts: false,
    webhooks: false,
    oauthApps: 1,
    formResponsesPerMonth: FORM_RESPONSES_PER_MONTH.free,
    apiRequestsPerDay: API_REQUESTS_PER_DAY.free,
    bulkApi: false,
    aiArtPerMonth: AI_ART_PER_MONTH.free,
    aiArtPooled: false,
    savedThemes: MAX_FREE_THEMES,
    teamThemes: false,
    brandKits: 1,
    savedBarcodes: 1000,
    // Agency tools (feat/agency-tools)
    clientReports: false,
    clientReportsWhiteLabel: false,
    clientPortal: false,
    invoiceBilling: false,
  },
  pro: {
    dynamicCodes: UNLIMITED,
    landingPages: UNLIMITED,
    landingPageBadge: false,
    whiteLabel: false,
    customCss: false,
    storageBytes: FILE_STORAGE_BYTES.pro,
    maxFileBytes: MAX_FILE_BYTES.pro,
    analyticsRetentionDays: SCAN_HISTORY_DAYS.pro,
    // Same planned threshold as Business: both keep the whole history.
    rawScanRetentionDays: 395,
    customDomains: 5,
    customSlugs: true,
    teams: true,
    teamMembers: PRO_TEAM_MEMBERS,
    folderPermissions: false,
    sso: false,
    requireTwoFactor: false,
    auditLog: false,
    linkControls: true,
    routing: true,
    preciseLocation: true,
    pixels: true,
    conversions: false,
    emailAlerts: true,
    webhooks: false,
    oauthApps: 5,
    formResponsesPerMonth: FORM_RESPONSES_PER_MONTH.pro,
    apiRequestsPerDay: API_REQUESTS_PER_DAY.pro,
    bulkApi: true,
    aiArtPerMonth: AI_ART_PER_MONTH.pro,
    aiArtPooled: false,
    savedThemes: UNLIMITED,
    // Pro includes 3-member teams; shared themes are what make them useful.
    teamThemes: true,
    brandKits: UNLIMITED,
    savedBarcodes: 10_000,
    // Agency tools (feat/agency-tools)
    clientReports: true,
    clientReportsWhiteLabel: false,
    clientPortal: false,
    invoiceBilling: false,
  },
  business: {
    dynamicCodes: UNLIMITED,
    landingPages: UNLIMITED,
    landingPageBadge: false,
    whiteLabel: true,
    customCss: true,
    storageBytes: FILE_STORAGE_BYTES.business,
    maxFileBytes: MAX_FILE_BYTES.business,
    analyticsRetentionDays: SCAN_HISTORY_DAYS.business,
    // Planned: ~13 months raw, then daily rollups. Not built, so not advertised.
    rawScanRetentionDays: 395,
    customDomains: 25,
    customSlugs: true,
    teams: true,
    teamMembers: UNLIMITED,
    folderPermissions: true,
    sso: true,
    requireTwoFactor: true,
    auditLog: true,
    linkControls: true,
    routing: true,
    preciseLocation: true,
    pixels: true,
    conversions: true,
    emailAlerts: true,
    webhooks: true,
    oauthApps: 25,
    formResponsesPerMonth: FORM_RESPONSES_PER_MONTH.business,
    apiRequestsPerDay: API_REQUESTS_PER_DAY.business,
    bulkApi: true,
    aiArtPerMonth: AI_ART_PER_MONTH.business,
    aiArtPooled: true,
    savedThemes: UNLIMITED,
    teamThemes: true,
    brandKits: UNLIMITED,
    savedBarcodes: 100_000,
    // Agency tools (feat/agency-tools)
    clientReports: true,
    clientReportsWhiteLabel: true,
    clientPortal: true,
    invoiceBilling: true,
  },
};

/**
 * The plan limits each ee feature stands for (the names a licence key can
 * list: packages/auth/ee-license.ts EE_FEATURES).
 */
const EE_LIMITS: Record<EeFeature, Partial<PlanLimits>> = {
  // packages/auth/ee/sso.ts
  sso: { sso: true },
  // ee/audit-log
  auditLog: { auditLog: true },
  // ee/client-portal
  clientPortal: {
    clientReports: true,
    clientReportsWhiteLabel: true,
    clientPortal: true,
  },
  // ee/white-label: no QRdx branding, so no "Made with QRdx" footer either
  whiteLabel: { whiteLabel: true, customCss: true, landingPageBadge: false },
  // ee/conversions
  conversions: { conversions: true },
};

// A self-hosted server with a valid ee licence key that sells no plans gives
// every plan the ee features its licence covers (@repo/availability
// eeOnEveryPlan). Worked out once per feature context, which only changes
// when the licence expires or its grace period ends (lib/feature-context.ts).
const eeLimitsIn = new WeakMap<FeatureContext, Partial<PlanLimits> | null>();

function eeLimitsOnEveryPlan(): Partial<PlanLimits> | null {
  const context = featureContext();
  const known = eeLimitsIn.get(context);
  if (known !== undefined) return known;
  const extra: Partial<PlanLimits> | null = eeOnEveryPlan(context)
    ? Object.assign(
        {},
        ...(context.eeFeatures ?? []).map((feature) => EE_LIMITS[feature]),
      )
    : null;
  eeLimitsIn.set(context, extra);
  return extra;
}

/**
 * The limits a scope on `plan` gets here: PLAN_LIMITS, plus the limits of
 * each ee feature its licence covers (EE_LIMITS) on every plan where the
 * licence covers them without a plan (a self-hosted server with a valid key
 * and no billing). On qrdx.dev and anywhere that sells plans, exactly
 * PLAN_LIMITS.
 */
export function getPlanLimits(plan: Plan): PlanLimits {
  const limits = PLAN_LIMITS[plan];
  const extra = eeLimitsOnEveryPlan();
  return extra ? { ...limits, ...extra } : limits;
}

/**
 * Plans whose limits pass `allows`, cheapest first. Copy that names a plan
 * ("needs Pro", "part of Pro and Business") uses this, never a fixed name.
 */
export function plansWith(allows: (limits: PlanLimits) => boolean): Plan[] {
  return PLANS.filter((plan) => allows(PLAN_LIMITS[plan]));
}

/** The cheapest plan whose limits pass `allows`; null when none does. */
export function cheapestPlanWith(
  allows: (limits: PlanLimits) => boolean,
): Plan | null {
  return plansWith(allows)[0] ?? null;
}

const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, business: 2 };

/** The most generous of several plans (free for none). */
export function highestPlan(plans: Iterable<Plan>): Plan {
  let best: Plan = "free";
  for (const plan of plans) {
    if (PLAN_RANK[plan] > PLAN_RANK[best]) best = plan;
  }
  return best;
}

/**
 * Plan granted by an entitled subscription to `productId`. Products not in
 * the configured env ids (renamed, legacy, ...) count as Pro.
 */
export function planForSubscriptionProduct(productId: string): Plan {
  return planForProductId(productId) ?? "pro";
}

/** The plan an entitled subscription grants; Free without one. */
export function planForSubscription(
  subscription: { productId: string } | null,
): Plan {
  return subscription
    ? planForSubscriptionProduct(subscription.productId)
    : "free";
}

/** A user's own plan, from their entitled Polar subscription. */
export const getPlan = cache(
  async (userId: string): Promise<Plan> =>
    planForSubscription(await getMyActiveSubscription(userId)),
);

/**
 * Plan for resources owned by an organization: the best plan among the
 * members who pay for it, its owners and billing members (PLAN_ROLES in
 * lib/permissions.ts; packages/auth/server.ts counts seats the same way). An
 * organization without either falls back to Free.
 */
export const getOwnerPlanForOrganization = cache(
  async (organizationId: string): Promise<Plan> => {
    const payers = await db
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          or(like(member.role, "%owner%"), like(member.role, "%billing%")),
        ),
      );

    const plans = await Promise.all(
      payers.filter((m) => holdsPlanRole(m.role)).map((m) => getPlan(m.userId)),
    );
    return highestPlan(plans);
  },
);

/** Plan that governs a personal or team scope (see lib/scope). */
export function getPlanForScope(scope: {
  userId: string;
  organizationId: string | null;
}): Promise<Plan> {
  return scope.organizationId
    ? getOwnerPlanForOrganization(scope.organizationId)
    : getPlan(scope.userId);
}

// packages/auth decides who may create more workspaces, seats, workspace SSO
// and required two-step verification from these limits
// (packages/auth/plan-limits.ts). Every server that loads this module hands
// them over; instrumentation.ts and the auth route load it at start-up.
registerPlanLimits(getPlanLimits);

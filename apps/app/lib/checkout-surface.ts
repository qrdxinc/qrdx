// Which button or page led to a payment. Checkout (actions/checkout.ts) adds
// it to Polar's checkout metadata next to the plan and interval; Polar copies
// that metadata onto the subscription, and the webhook stores it in
// subscription.metadata. The client sends a name from this list and the
// server checks it again: anything else is recorded as "unknown".
//
// Pure, no server code: the pricing cards import it, and the marketing site
// renders them (tests/repo/widget-import-graph.test.ts).

import type { BillingInterval } from "@/lib/pricing";

export const CHECKOUT_SURFACES = [
  // Buttons that open Polar's checkout straight away
  /** The plan cards on this app's /pricing */
  "pricing_page",
  /** The plan cards on the marketing site's /pricing (it passes this) */
  "site_pricing",
  /** The Get Pro dialog that locked features open */
  "get_pro_dialog",
  /** The dialog shown when a plan limit stops something */
  "limit_dialog",
  /** A limit card inside a form (new code, domains, change type) */
  "inline_limit",
  /** The dynamic codes meter above the codes list */
  "codes_meter",
  /** The landing pages meter above the pages list */
  "pages_meter",
  /** Settings → Plan & usage */
  "plan_usage",
  /** The AI art studio, /ai/art */
  "ai_art_studio",
  /** The editor's Art tab */
  "art_tab",
  // Links that go through /pricing first (?from=<surface>)
  /** The header's Get Pro button */
  "header_get_pro",
  /** The app sidebar's Upgrade row */
  "sidebar_upgrade",
  /** The account menu's Upgrade to Pro */
  "account_menu",
  /** The dashboard home's "your code is live" card */
  "home_card",
  /** Scan history past the plan's range (analytics page, a code's analytics) */
  "analytics_locked",
  /** A code option the workspace's plan doesn't include */
  "code_options",
  /** Requiring two-step verification for a team */
  "team_two_factor",
  /** The AI chat's limit messages */
  "ai_chat",
  /** The upgrade link at the top of /ai */
  "ai_page",
  /** Billing portal without a Polar customer yet */
  "billing_portal",
  /** Back to pricing from /success after a checkout that didn't finish */
  "success_page",
  /** The limit notice email's upgrade button */
  "limit_email",
  /** The first-scan email's pricing link */
  "first_scan_email",
] as const;

export type KnownCheckoutSurface = (typeof CHECKOUT_SURFACES)[number];
export type CheckoutSurface = KnownCheckoutSurface | "unknown";

/** The pricing page's query parameter: /pricing?from=limit_email */
export const SURFACE_PARAM = "from";

/** `value` when it's on the list, else null. */
export function knownCheckoutSurface(
  value: unknown,
): KnownCheckoutSurface | null {
  return CHECKOUT_SURFACES.includes(value as KnownCheckoutSurface)
    ? (value as KnownCheckoutSurface)
    : null;
}

/** `value` when it's on the list; "unknown" for anything else or nothing. */
export function parseCheckoutSurface(value: unknown): CheckoutSurface {
  return knownCheckoutSurface(value) ?? "unknown";
}

/**
 * `href` with `?from=<surface>` added, keeping its other parameters:
 * withSurface("/pricing?interval=month", "limit_email") →
 * "/pricing?interval=month&from=limit_email".
 */
export function withSurface(
  href: string,
  surface: KnownCheckoutSurface,
): string {
  const hash = href.indexOf("#");
  const path = hash === -1 ? href : href.slice(0, hash);
  const rest = hash === -1 ? "" : href.slice(hash);
  return `${path}${path.includes("?") ? "&" : "?"}${SURFACE_PARAM}=${surface}${rest}`;
}

/** The pricing page for a link from `surface`, optionally on one period. */
export function pricingHref(
  surface: KnownCheckoutSurface,
  interval?: BillingInterval,
): string {
  return withSurface(
    interval ? `/pricing?interval=${interval}` : "/pricing",
    surface,
  );
}

/**
 * The surface a stored subscription's metadata (subscription.metadata, JSON
 * text) records: null when it records none (checkouts from before it was
 * recorded) or isn't JSON, "unknown" when the value isn't on the list.
 */
export function recordedSurface(
  metadata: string | null | undefined,
): CheckoutSurface | null {
  if (!metadata) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (!(parsed && typeof parsed === "object" && "surface" in parsed)) {
      return null;
    }
    return parseCheckoutSurface(parsed.surface);
  } catch {
    return null;
  }
}

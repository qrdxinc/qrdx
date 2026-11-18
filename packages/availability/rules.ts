// Which built-in features this deployment can offer, decided from what is
// configured on QRdx's side (an API key, a bucket, a Vercel token). Pure: the
// environment comes in as an argument and only "is it set" is read (except
// the app URL for passkeys, which must be HTTPS), so this is testable without
// real values and safe to import from client code. The package never reads
// the environment itself: apps/app/lib/feature-availability.ts feeds it the
// server's.
//
// A feature that can't work here is left out everywhere it would be offered:
// nav, footer and dashboard links, pricing rows and plan-card lines, the
// sitemap and llms.txt. It comes back on its own once its variables are set
// (prerendered pages pick the change up on the next deploy). Integrations
// are decided in apps/app/lib/integration-availability-rules.ts, which
// defers to these rules for the catalog entries that are really built-in
// features. Paths in the comments below (lib/…, components/…, proxy.ts) are
// the app's, under apps/app.

import { EE_LICENSE_ENV, type EeFeature } from "@repo/auth/ee-license";
import { passkeyRelyingParty } from "@repo/auth/passkey-rp";
import { isQrdxDeployment } from "./deployment";
import { isFlagOn } from "./flags";
import {
  WORKSPACE_PATTERN_PREFIX,
  workspacePattern,
} from "./workspace-pattern";

export const FEATURE_IDS = [
  "aiThemes",
  "aiArt",
  // The docs assistant (Ask AI in the docs)
  "docsChat",
  "customDomains",
  "domainConnect",
  "fileStorage",
  "email",
  "spamCheck",
  "linkSafety",
  "scheduledJobs",
  "youtubeChannelPicker",
  "spotifyPlaylistPicker",
  // Ways to sign in: the sign-in panel shows only these where they work
  "googleSignIn",
  "githubSignIn",
  "emailSignIn",
  "passkeys",
  "sso",
  "auditLog",
  "clientPortal",
  "whiteLabel",
  "conversions",
  "slackBot",
  "discordBot",
  "telegramBot",
  "affiliates",
  // Paid plans (Polar)
  "billing",
  // Agency tools: "Pay by invoice" requests for Business yearly
  "invoiceRequests",
  // Enterprise pages: the contact form on /enterprise
  "enterpriseRequests",
  // Pricing: euro prices for the EU and EEA, and non-profit discount requests
  "eurPrices",
  "nonprofitDiscounts",
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

/** The variable that turns billing on (FEATURE_RULES.billing). */
export const BILLING_ENV = "POLAR_ACCESS_TOKEN";

export interface FeatureContext {
  /** Environment variables by name. Only whether each is set is read. */
  env: Readonly<Record<string, string | undefined>>;
  /**
   * Hosted on Vercel (VERCEL is set). Vercel routes only domains added to
   * the project, so custom domains need the Domains API there; anywhere else
   * the owner routes the domain and proves it with a DNS TXT record.
   */
  onVercel: boolean;
  /** Production and preview builds (NODE_ENV === "production"). */
  production: boolean;
  /**
   * The ee features a valid QRDX_EE_LICENSE turns on now: signed by QRdx and
   * not past its expiry and grace period. The server checks the key
   * (packages/auth/ee/license.ts, server-only) and passes the result in, so
   * these rules stay pure. Absent or empty: none.
   */
  eeFeatures?: readonly EeFeature[];
  /**
   * Whether this deployment may send email and call other services
   * (lib/delivery-guard.ts): production on its own domain, not a
   * preview, a localhost build or local dev, unless QRDX_ALLOW_DEV_DELIVERY
   * says so. The server works it out and passes the answer in, so these
   * rules stay pure. Absent: not allowed.
   */
  outboundDelivery?: boolean;
}

interface FeatureRule {
  name: string;
  /** Variable names that must be set; empty when nothing needs configuring. */
  requires: (ctx: FeatureContext) => readonly string[];
  /**
   * For a feature that needs more than set variables: false when their
   * values can't work (the variables named by `requires` are then reported).
   */
  usable?: (ctx: FeatureContext) => boolean;
  /**
   * Why `usable` says no although every variable is set, for admins: the
   * Health page shows it in place of the variables, which aren't what's
   * wrong then (featureUnusableReason).
   */
  unusableReason?: string;
  /**
   * Pages that only offer this feature. They leave the nav, footer, app
   * sidebar, sitemap and llms.txt while it's unavailable; the pages
   * themselves keep working (existing users may still need them).
   */
  paths?: readonly string[];
  /**
   * Catalog entries (@repo/integrations) that can't work without it: hidden
   * from /integrations, settings shortcuts, the sitemap and llms.txt.
   */
  catalogSlugs?: readonly string[];
  /** The catalog entry whose `configuredExtras` paragraphs describe it. */
  extrasOf?: string;
}

export const FEATURE_RULES: Record<FeatureId, FeatureRule> = {
  // All AI runs through Vercel AI Gateway (lib/ai/providers.ts); the models
  // per task are in lib/ai/models.ts.
  aiThemes: {
    name: "AI themes (Vercel AI Gateway)",
    requires: () => ["AI_GATEWAY_API_KEY"],
    paths: ["/ai"],
  },
  aiArt: {
    name: "AI QR art (Vercel AI Gateway)",
    requires: () => ["AI_GATEWAY_API_KEY"],
    paths: ["/ai/art", "/docs/developers/ai-art-api"],
  },
  docsChat: {
    // The docs assistant (app/api/docs-chat): answers questions from the
    // docs site's own search and Markdown pages at DOCS_ZONE_URL through the
    // gateway, for anyone. Off without a docs site to read from, or when
    // DOCS_CHAT_ENABLED says "0" or "false" (the kill switch; unset means
    // on). The docs app reads this id at build time and shows the Ask AI
    // button only where it's on.
    name: "Docs assistant (Vercel AI Gateway, docs site)",
    requires: () => ["AI_GATEWAY_API_KEY", "DOCS_ZONE_URL"],
    usable: (ctx) => isDocsChatSwitchedOn(ctx.env.DOCS_CHAT_ENABLED),
  },
  customDomains: {
    // Serving domains already verified never depends on this: proxy.ts reads
    // them from the database. Only adding and verifying new ones does.
    name: "Custom domains",
    requires: (ctx) =>
      ctx.onVercel ? ["VERCEL_API_TOKEN", "VERCEL_PROJECT_ID"] : [],
    paths: [
      `${WORKSPACE_PATTERN_PREFIX}/settings/domains`,
      "/docs/custom-domains",
      "/docs/help/domains/custom-domains",
    ],
    // Tag Manager containers run any script, so they only ever load on a
    // customer's own domain (components/landing/pixels.tsx).
    catalogSlugs: ["custom-domains", "google-tag-manager"],
  },
  domainConnect: {
    // The "Set up with Cloudflare" button on the Domains page (Domain
    // Connect, lib/domain-connect): our template's ids and the key that signs
    // apply links. Only where custom domains can be added at all.
    name: "One-click DNS setup (Domain Connect)",
    requires: (ctx) => [
      ...FEATURE_RULES.customDomains.requires(ctx),
      "DOMAIN_CONNECT_PROVIDER_ID",
      "DOMAIN_CONNECT_SERVICE_ID",
      "DOMAIN_CONNECT_PRIVATE_KEY",
    ],
  },
  fileStorage: {
    name: "File storage (Cloudflare R2)",
    requires: () => [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
    ],
    // The PDF QR code page sells uploading a PDF; the page builder hides the
    // upload page types without storage.
    paths: ["/qr-code-generator/pdf"],
  },
  email: {
    name: "Email (Resend)",
    requires: () => ["RESEND_API_KEY", "EMAIL_FROM"],
    catalogSlugs: ["email-alerts"],
  },
  spamCheck: {
    name: "Form spam check (Turnstile)",
    requires: () => ["TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
  },
  linkSafety: {
    name: "Safe Browsing (Web Risk)",
    requires: () => ["WEB_RISK_API_KEY"],
  },
  scheduledJobs: {
    // Vercel Cron authenticates with it; the jobs refuse to run without it
    // in production (webhook retries, weekly digests).
    name: "Scheduled jobs (cron)",
    requires: (ctx) => (ctx.production ? ["CRON_SECRET"] : []),
  },
  youtubeChannelPicker: {
    // Pasting YouTube links needs nothing; picking from a channel does.
    name: "YouTube channel picker",
    requires: () => ["YOUTUBE_API_KEY"],
    extrasOf: "youtube",
  },
  spotifyPlaylistPicker: {
    name: "Spotify playlist picker",
    requires: () => ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
    extrasOf: "spotify",
  },
  // Google and GitHub sign-in: packages/auth/server.ts registers a provider
  // only when both its client id and secret are set.
  googleSignIn: {
    name: "Google sign-in",
    requires: () => ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
  githubSignIn: {
    name: "GitHub sign-in",
    requires: () => ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  },
  emailSignIn: {
    // Sign-in codes (lib/auth/sign-in-code-delivery.ts): emailed
    // through Resend where outbound delivery is allowed, written to the
    // terminal in local dev. A production build that may not send email (a
    // localhost app URL, a preview) has no way to get a code to anyone, so
    // the email form is left out and asking for a code fails
    // (packages/auth/email-otp.ts). The same rule as canDeliverSignInCodes
    // in lib/account/deletion.ts; tests/lib/feature-availability.test.ts
    // checks they agree.
    name: "Email sign-in codes (Resend; the app URL isn't localhost)",
    requires: (ctx) =>
      ctx.production || ctx.outboundDelivery
        ? ["RESEND_API_KEY", "EMAIL_FROM", "NEXT_PUBLIC_APP_URL"]
        : [],
    usable: (ctx) => Boolean(ctx.outboundDelivery) || !ctx.production,
    // isOutboundDeliveryAllowed's "no" in a production build: on Vercel,
    // any VERCEL_ENV but production; elsewhere, a localhost app URL.
    unusableReason:
      "Outbound email is off on this deployment: NEXT_PUBLIC_APP_URL is localhost or 127.0.0.1, or this is a Vercel preview. Set QRDX_ALLOW_DEV_DELIVERY=1 to allow it.",
  },
  passkeys: {
    // Passkeys belong to the app's host and browsers only offer them over
    // HTTPS (or on localhost): packages/auth/passkey-rp.ts. Pages served from
    // another host (a preview URL) hide them too: see lib/passkeys.ts.
    name: "Passkeys (HTTPS app URL)",
    requires: () => ["NEXT_PUBLIC_APP_URL"],
    usable: (ctx) =>
      passkeyRelyingParty({
        BETTER_AUTH_URL: ctx.env.BETTER_AUTH_URL,
        NEXT_PUBLIC_APP_URL: ctx.env.NEXT_PUBLIC_APP_URL,
      }) !== null,
    paths: ["/docs/help/privacy-and-security/passkeys"],
  },
  sso: {
    // Workspace single sign-on is in ee/ under the QRdx commercial licence
    // and runs only with a valid licence key that covers it
    // (packages/auth/ee/license.ts): without one the server doesn't register
    // it at all. A key that is invalid or expired counts as none.
    name: "Workspace SSO (QRdx license key)",
    requires: () => [EE_LICENSE_ENV],
    usable: (ctx) => Boolean(ctx.eeFeatures?.includes("sso")),
    paths: [
      `${WORKSPACE_PATTERN_PREFIX}/settings/sso`,
      "/docs/help/teams/single-sign-on",
    ],
  },
  auditLog: {
    // The workspace audit log is in ee/ under the same licence: without a
    // valid key that covers it nothing is recorded and Settings → Audit log
    // doesn't exist.
    name: "Workspace audit log (QRdx license key)",
    requires: () => [EE_LICENSE_ENV],
    usable: (ctx) => Boolean(ctx.eeFeatures?.includes("auditLog")),
    paths: [
      `${WORKSPACE_PATTERN_PREFIX}/settings/audit-log`,
      "/docs/help/teams/audit-log",
    ],
  },
  clientPortal: {
    // The client portal and client-branded stats pages (agency tools) are in
    // ee/client-portal under the same licence: without a valid key there is no
    // Settings → Client portal, no portal, and shared stats pages carry no
    // client brand (they keep working, plain).
    name: "Client portal and client reports (QRdx license key)",
    requires: () => [EE_LICENSE_ENV],
    usable: (ctx) => Boolean(ctx.eeFeatures?.includes("clientPortal")),
    paths: [
      `${WORKSPACE_PATTERN_PREFIX}/settings/clients`,
      "/docs/client-portal",
    ],
  },
  whiteLabel: {
    // White-label and custom CSS on hosted pages are in ee/white-label under
    // the same licence: without a valid key every hosted page shows QRdx's default
    // branding and no custom CSS. Pages keep serving either way.
    name: "White-label and custom CSS on hosted pages (QRdx license key)",
    requires: () => [EE_LICENSE_ENV],
    usable: (ctx) => Boolean(ctx.eeFeatures?.includes("whiteLabel")),
  },
  conversions: {
    // Conversion tracking is in ee/conversions under the same licence:
    // without a valid key scans get no qrdx_sid and POST /api/v1/conversions
    // answers 404. Conversions already recorded stay in the data export.
    name: "Conversion tracking (QRdx license key)",
    requires: () => [EE_LICENSE_ENV],
    usable: (ctx) => Boolean(ctx.eeFeatures?.includes("conversions")),
    paths: ["/docs/developers/api/create-conversion"],
  },
  slackBot: {
    // The QRdx bot for Slack (lib/slack-bot): the same Slack app as "Add to
    // Slack" alerts, plus its signing secret, which verifies every request
    // Slack sends. Bot tokens are stored encrypted, so production also needs
    // the integrations' encryption key.
    name: "QRdx bot for Slack",
    requires: (ctx) => [
      "SLACK_CLIENT_ID",
      "SLACK_CLIENT_SECRET",
      "SLACK_SIGNING_SECRET",
      ...(ctx.production ? ["INTEGRATION_ENCRYPTION_KEY"] : []),
    ],
    // The docs page and the /slack landing page (app/(app)/(home)/slack).
    paths: ["/docs/slack-bot", "/slack"],
    extrasOf: "slack",
  },
  discordBot: {
    // The Discord app's /qr and "Make QR code" commands, answered over HTTP
    // (app/api/integrations/discord). Discord signs each request with the
    // app's key; the id builds the "Add to Discord" link.
    name: "Discord bot",
    requires: () => ["DISCORD_APPLICATION_ID", "DISCORD_PUBLIC_KEY"],
    paths: ["/docs/discord-bot", "/discord"],
    catalogSlugs: ["discord-bot"],
    // The webhook alerts entry mentions the bot only where it can be added.
    extrasOf: "discord",
  },
  telegramBot: {
    // The QRdx bot in Telegram (lib/chat-bots/telegram): its token for
    // replies, the secret Telegram sends with every webhook call, and its
    // username for t.me links and help text. Nothing is stored.
    name: "Telegram bot",
    requires: () => [
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_WEBHOOK_SECRET",
      "TELEGRAM_BOT_USERNAME",
    ],
    paths: ["/docs/telegram-bot", "/telegram"],
    catalogSlugs: ["telegram"],
  },
  affiliates: {
    // The affiliate program (lib/affiliates) is QRdx's own: commissions
    // come from qrdx.dev's Polar orders and the terms are QRdx's. It runs
    // wherever QRdx itself runs (qrdx.dev, its previews, local dev: the
    // same test as the MCP server URL, ./deployment.ts) once Polar's
    // webhooks are set up, and never on a self-hosted copy on its own domain.
    name: "Affiliate program (qrdx.dev, with Polar)",
    requires: () => ["POLAR_WEBHOOK_SECRET"],
    usable: (ctx) =>
      isQrdxDeployment({
        appUrl: ctx.env.NEXT_PUBLIC_APP_URL,
        productionUrl: ctx.env.VERCEL_PROJECT_PRODUCTION_URL,
      }),
    paths: [
      "/affiliates",
      "/legal/affiliate-terms",
      "/settings/affiliate",
      "/docs/help/account-and-billing/affiliate-program",
    ],
  },
  billing: {
    // Selling plans through Polar (lib/polar.ts): checkout, the billing
    // portal and the subscriptions the webhook records. Without it nothing
    // is sold, and every account keeps the plan its subscription rows give
    // it: Free on a new self-hosted server (lib/plans.ts).
    name: "Billing (Polar)",
    requires: () => [BILLING_ENV],
  },
  invoiceRequests: {
    // Paying Business yearly by invoice (lib/invoice-requests.ts). Polar's
    // checkout takes cards and wallets only, so a request is emailed to
    // QRdx, who arranges the invoice by hand: QRdx's own sales, so only
    // where QRdx itself runs (like the affiliate program), with email set up.
    name: "Pay by invoice requests (qrdx.dev, with email)",
    requires: () => ["RESEND_API_KEY", "EMAIL_FROM"],
    usable: (ctx) =>
      isQrdxDeployment({
        appUrl: ctx.env.NEXT_PUBLIC_APP_URL,
        productionUrl: ctx.env.VERCEL_PROJECT_PRODUCTION_URL,
      }),
    paths: ["/docs/help/account-and-billing/pay-by-invoice"],
  },
  // ─── Enterprise pages (feat/enterprise-pages) ─────────────────────────────
  enterpriseRequests: {
    // The contact form on /enterprise (lib/enterprise-requests.tsx) emails
    // QRdx's sales address, the same way pay-by-invoice requests go: QRdx's
    // own sales, so only where QRdx itself runs, with email set up. The page
    // stays everywhere and shows the plain address without it.
    name: "Enterprise contact form (qrdx.dev, with email)",
    requires: () => ["RESEND_API_KEY", "EMAIL_FROM"],
    usable: (ctx) =>
      isQrdxDeployment({
        appUrl: ctx.env.NEXT_PUBLIC_APP_URL,
        productionUrl: ctx.env.VERCEL_PROJECT_PRODUCTION_URL,
      }),
  },
  eurPrices: {
    // Euro prices for the EU and EEA (lib/pricing.ts EUR_PRICES). Polar
    // can't be asked from here, so a flag says the EUR prices exist: set it
    // only after every product has one, or checkout fails for those visitors.
    name: "Euro prices (EUR prices on every Polar product)",
    requires: () => ["NEXT_PUBLIC_QRDX_EUR_PRICES"],
    usable: (ctx) => isFlagOn(ctx.env.NEXT_PUBLIC_QRDX_EUR_PRICES),
  },
  nonprofitDiscounts: {
    // Non-profit discount requests (lib/nonprofit-requests.tsx): emailed to
    // QRdx, who replies with a Polar discount code. QRdx's own offer, so
    // only where QRdx itself runs, with email set up (like invoice requests).
    name: "Non-profit discount requests (qrdx.dev, with email)",
    requires: () => ["RESEND_API_KEY", "EMAIL_FROM"],
    usable: (ctx) =>
      isQrdxDeployment({
        appUrl: ctx.env.NEXT_PUBLIC_APP_URL,
        productionUrl: ctx.env.VERCEL_PROJECT_PRODUCTION_URL,
      }),
    paths: ["/docs/help/account-and-billing/nonprofit-discount"],
  },
};

/**
 * Whether the ee features (workspace SSO, the audit log, the client portal
 * and client reports, white-label pages with custom CSS, conversion
 * tracking) come with every plan here: a self-hosted copy on its own domain
 * (./deployment.ts) with a valid licence key (`eeFeatures`) that sells no
 * plans (no "billing", so every account is on Free). Its enterprise
 * agreement covers them, so no plan is asked for.
 * Where plans are sold, and always on QRdx itself (qrdx.dev, its previews,
 * local dev), they stay with the plans that include them
 * (apps/app/lib/plans.ts).
 */
export function eeOnEveryPlan(ctx: FeatureContext): boolean {
  return (
    (ctx.eeFeatures?.length ?? 0) > 0 &&
    missingFeatureSetup("billing", ctx).length > 0 &&
    !isQrdxDeployment({
      appUrl: ctx.env.NEXT_PUBLIC_APP_URL,
      productionUrl: ctx.env.VERCEL_PROJECT_PRODUCTION_URL,
    })
  );
}

/**
 * The docs assistant's switch: on unless DOCS_CHAT_ENABLED is "0" or
 * "false" (any other value, or none, leaves it on).
 */
export function isDocsChatSwitchedOn(value: string | undefined): boolean {
  const flag = value?.trim().toLowerCase();
  return !(flag === "0" || flag === "false");
}

/**
 * The variable names `id` still needs here, in a stable order. Empty when it
 * is available.
 */
export function missingFeatureSetup(
  id: FeatureId,
  ctx: FeatureContext
): string[] {
  const rule = FEATURE_RULES[id];
  const names = rule.requires(ctx);
  const missing = names.filter((name) => !ctx.env[name]?.trim());
  if (missing.length === 0 && rule.usable && !rule.usable(ctx)) {
    return [...names];
  }
  return missing;
}

/**
 * Why `id` is off although every variable it needs is set, in its rule's
 * words (`unusableReason`). Null when it's on, a variable is missing, or the
 * rule has no such words (its variables are the hint then).
 */
export function featureUnusableReason(
  id: FeatureId,
  ctx: FeatureContext
): string | null {
  const rule = FEATURE_RULES[id];
  if (!(rule.unusableReason && rule.usable)) return null;
  const allSet = rule.requires(ctx).every((name) => ctx.env[name]?.trim());
  return allSet && !rule.usable(ctx) ? rule.unusableReason : null;
}

export type FeatureMap = Record<FeatureId, boolean>;

export function computeFeatures(ctx: FeatureContext): FeatureMap {
  return Object.fromEntries(
    FEATURE_IDS.map((id) => [id, missingFeatureSetup(id, ctx).length === 0])
  ) as FeatureMap;
}

/** The feature a catalog entry needs (custom-domains, email-alerts, …). */
export function featureForCatalogSlug(slug: string): FeatureId | undefined {
  return FEATURE_IDS.find((id) =>
    FEATURE_RULES[id].catalogSlugs?.includes(slug)
  );
}

/**
 * A catalog entry's "What it does" paragraphs: `configuredExtras` only where
 * the feature they describe works (the YouTube and Spotify pickers).
 */
export function catalogParagraphs(
  entry: { slug: string; description: string[]; configuredExtras?: string[] },
  features: Readonly<Record<FeatureId, boolean>>
): string[] {
  const id = extraFeatureOf(entry.slug);
  const extras = id && features[id] ? (entry.configuredExtras ?? []) : [];
  return [...entry.description, ...extras];
}

/** The optional extra a catalog entry describes when it's configured. */
function extraFeatureOf(slug: string): FeatureId | undefined {
  return FEATURE_IDS.find((key) => FEATURE_RULES[key].extrasOf === slug);
}

/** The catalog fields configuredEntry reads (IntegrationCatalogEntry's). */
interface ConfigurableEntry {
  slug: string;
  tagline: string;
  plan: string;
  steps: readonly unknown[];
  capabilities: readonly unknown[];
  categories: readonly string[];
  keywords?: readonly string[];
  configured?: {
    tagline?: string;
    plan?: string;
    steps?: readonly unknown[];
    capabilities?: readonly unknown[];
    categories?: readonly string[];
    keywords?: readonly string[];
  };
}

/**
 * A catalog entry as this deployment shows it: with its `configured` parts
 * (the QRdx bot for the Slack entry) only where the feature they describe
 * works. `has` is getFeatures() on the server, useAvailability().has in the
 * browser.
 */
export function configuredEntry<T extends ConfigurableEntry>(
  entry: T,
  has: (feature: FeatureId) => boolean
): T {
  const id = extraFeatureOf(entry.slug);
  const extra = entry.configured;
  if (!(id && extra && has(id))) return entry;
  return {
    ...entry,
    tagline: extra.tagline ?? entry.tagline,
    plan: extra.plan ?? entry.plan,
    steps: extra.steps ?? entry.steps,
    capabilities: [...(extra.capabilities ?? []), ...entry.capabilities],
    categories: [
      ...new Set([...entry.categories, ...(extra.categories ?? [])]),
    ],
    keywords: [...(entry.keywords ?? []), ...(extra.keywords ?? [])],
  };
}

/**
 * How custom domains are connected here (see lib/custom-domains.ts):
 * "vercel" through the Domains API, "manual" with a DNS TXT record when
 * self-hosted, "disabled" on Vercel without API access.
 */
export type CustomDomainMode = "vercel" | "manual" | "disabled";

export function customDomainMode(ctx: FeatureContext): CustomDomainMode {
  const isSet = (name: string) => Boolean(ctx.env[name]?.trim());
  if (isSet("VERCEL_API_TOKEN") && isSet("VERCEL_PROJECT_ID")) return "vercel";
  return ctx.onVercel ? "disabled" : "manual";
}

/** What the server tells client components: ids and paths, never names. */
export interface PublicAvailability {
  /** Features that can't work here. */
  unavailable: FeatureId[];
  /** Pages that only lead to an unavailable feature. */
  hiddenPaths: string[];
  /** Integration slugs hidden here (production and preview only). */
  hiddenIntegrations: string[];
}

/** Everything is offered: the default without a server-provided value. */
export const ALL_AVAILABLE: PublicAvailability = {
  unavailable: [],
  hiddenPaths: [],
  hiddenIntegrations: [],
};

export function toPublicAvailability(
  features: FeatureMap,
  hiddenIntegrations: readonly string[] = []
): PublicAvailability {
  const unavailable = FEATURE_IDS.filter((id) => !features[id]);
  return {
    unavailable,
    hiddenPaths: unavailable.flatMap((id) => FEATURE_RULES[id].paths ?? []),
    hiddenIntegrations: [...hiddenIntegrations].sort(),
  };
}

/**
 * Where the app publishes PublishedAvailability, on its own origin. /zone/
 * holds the documents QRdx's deployments (the app and the docs) read from
 * each other.
 */
export const PUBLISHED_AVAILABILITY_PATH = "/zone/availability.json";

/**
 * What the app publishes at PUBLISHED_AVAILABILITY_PATH for QRdx's other
 * deployments (the docs app reads it at build time): the public
 * availability plus the features that work, so a reader with newer rules
 * can treat an id this deployment doesn't know yet as unavailable. Ids,
 * paths and slugs only, like PublicAvailability.
 */
export interface PublishedAvailability extends PublicAvailability {
  /** Features that work here. */
  available: FeatureId[];
}

export function toPublishedAvailability(
  value: PublicAvailability
): PublishedAvailability {
  return {
    available: FEATURE_IDS.filter((id) => !value.unavailable.includes(id)),
    unavailable: [...value.unavailable],
    hiddenPaths: [...value.hiddenPaths],
    hiddenIntegrations: [...value.hiddenIntegrations],
  };
}

const pathOf = (href: string) => href.split(/[?#]/, 1)[0] ?? href;

/**
 * False for a link to a page that only offers an unavailable feature
 * (exact path; query and hash ignored; any workspace's page matches its
 * /dashboard/[workspace]/… rule). External links always pass.
 */
export function isPathShown(
  hiddenPaths: readonly string[],
  href: string
): boolean {
  return !hiddenPaths.includes(workspacePattern(pathOf(href)));
}

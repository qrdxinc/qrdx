/**
 * Every product event QRdx sends, with its properties. Names are snake_case
 * `object_action`; properties are ids, counts and coarse values (content type,
 * format, plan). Never emails, names, destination URLs, code contents or
 * search text: `track()` also strips anything that looks like them.
 *
 * Client events go through `track()` (track.ts), server events through the
 * app's `trackServer()` (apps/app/lib/analytics/server.ts).
 */

import type { AuthPromptKind, AuthPromptReason } from "./auth-prompt";

/** How someone signed in (Better Auth's last-used login method). */
export type SignInMethod =
  | "google"
  | "github"
  | "email-otp"
  | "passkey"
  | "sso"
  | "unknown";

/** Where a QR was rendered or exported from. */
export type QrSource =
  | "playground"
  | "dashboard"
  | "type_tool"
  | "bulk_tool"
  | "ai_art";

/** The editors whose opening starts the funnel (editor_opened). */
export type EditorSurface =
  | "playground"
  | "type_tool"
  | "barcode"
  | "ai_art"
  | "bulk_tool";

/**
 * Where an import's links came from: a connected account (the provider's
 * API) or a file (an export or a spreadsheet).
 */
export type ImportSource = "account" | "file";

/**
 * How the account behind a server event found QRdx (user_acquisition): its
 * channel ("search", "campaign", "unknown" for accounts with no record) and,
 * for QRdx's own campaigns only, the campaign ("switch"). Never a host, a
 * page or any other tag (apps/app/lib/analytics/acquisition.ts).
 */
export interface AcquisitionProps {
  channel?: string;
  campaign?: string;
}

/**
 * An import's provider and counts: the provider id ("bitly", "uniqode",
 * "csv" for another provider's spreadsheet) or "bulk" (the dashboard's own
 * CSV import), never a link, domain, back-half or code name.
 */
interface ImportProps {
  provider: string;
  source: ImportSource;
  /** Rows (links) in the import */
  rows: number;
  /** Rows left alone: invalid, already imported, duplicates, over the limit */
  skipped: number;
  /** Back-halves kept on the customer's own domain (the no-reprint move) */
  own_domain?: boolean;
}

type NoProps = Record<string, never>;

export interface AnalyticsEvents {
  // Auth
  /**
   * `reason` and `surface`: the sign-in dialog this came from, when it
   * opened in this tab in the last 30 minutes (auth-prompt.ts).
   */
  sign_up: {
    method: SignInMethod;
    reason?: AuthPromptReason;
    surface?: string;
  };
  sign_in: {
    method: SignInMethod;
    reason?: AuthPromptReason;
    surface?: string;
  };
  /**
   * The sign-in dialog opened, or a quiet sign-up line appeared (`kind`):
   * why, and where (a site section such as "playground" or "tools/bulk", or
   * "header").
   */
  auth_prompt_shown: {
    reason: AuthPromptReason;
    surface: string;
    kind: AuthPromptKind;
  };
  /** Closed without signing in, or a sign-up line waved off for good. */
  auth_prompt_dismissed: {
    reason: AuthPromptReason;
    surface: string;
    kind: AuthPromptKind;
  };
  sign_out: NoProps;
  /** Settings → Account: the account moved to a new address (never the address). */
  email_changed: NoProps;

  // QR codes
  /**
   * An editor opened, once per mount: which one, and where the visit came
   * from (editorOpenSource in apps/app/lib/analytics/funnel.ts: a `ref`
   * tag, "direct", "external" or a site section). Never an address.
   */
  editor_opened: { surface: EditorSurface; source: string };
  qr_generated: { content_type: string; source: QrSource; count?: number };
  qr_downloaded: { format: string; source: QrSource; content_type?: string };
  qr_copied: { format: "svg"; source: QrSource };
  /**
   * A barcode download from /barcode-generator or a saved barcode in the
   * dashboard: the file type and symbology id ("ean13"), never the data.
   */
  barcode_downloaded: {
    format: "png" | "jpg" | "webp" | "avif" | "svg" | "pdf" | "eps";
    symbology: string;
    source?: "generator" | "dashboard";
  };
  /**
   * A barcode drawn from a value or symbology other than the page's own,
   * once per symbology per visit: the symbology id, never the data.
   */
  barcode_generated: {
    symbology: string;
    source?: "generator" | "dashboard";
  };
  /** A barcode saved to a workspace: the symbology id, never the data. */
  barcode_saved: { symbology: string; source: "generator" | "dashboard" };

  /**
   * A playground link applied its parameters. `source`: where it came from
   * ("direct", "external", a same-site section or a `ref` tag); `target`:
   * the parameter names it applied, joined with "+" ("type+open"). Never
   * their values: no address, design or content.
   */
  playground_handoff: { source: string; target: string };

  // Themes and AI
  theme_applied: { method: "preset" | "shuffle"; preset?: string };
  ai_theme_generated: { status: "success" | "fail" };
  theme_saved: NoProps;
  theme_shared: { saved: boolean };
  theme_save_failed: { operation: string; error_type: string };
  v0_opened: { saved: boolean };
  ai_art_generated: {
    visibility?: number;
    creativity?: number;
    variations?: number;
    /** Variations that didn't scan as drawn (least blend or Image QR) */
    blended?: number;
    locked_seed: boolean;
    reference: boolean;
    preset?: string;
    /** The quick look (apps/app/components/sections/ai-art/looks.ts) */
    look?: string;
    /** How the code sits in the art: code, scene or photo */
    mode?: string;
  };
  prompt_enhance_started: {
    length: number;
    mention_count: number;
    image_count: number;
  };
  prompt_enhance_finished: { duration_ms?: number; length: number };
  prompt_enhance_failed: { code?: string; status?: number };
  prompt_enhance_canceled: { duration_ms?: number };

  // Dynamic codes and hosted pages
  dynamic_code_created: { source: "playground" | "dashboard" | "page" };
  page_published: { page_type?: string };
  /** Server side, from hosted pages: a count only, nothing about the visitor. */
  form_submitted: NoProps;
  template_used: { template_type: string };

  // NFC tags (feat/nfc): a code's NFC link written to a tag, or a tag locked.
  // `error` is an apps/app/lib/nfc/web-nfc.ts failure kind, never the link.
  nfc_tag_written: { result: "written" | "locked" | "failed"; error?: string };

  // Imports and integrations
  /**
   * An import was planned and recorded: on the server for imports from
   * another provider (apps/app/lib/migrate/server/analytics.ts), in the
   * browser for the dashboard's CSV import. `to_create`: the codes it will
   * make.
   */
  import_started: ImportProps & AcquisitionProps & { to_create: number };
  /** Its last row was handled: codes made, rows skipped and rows failed. */
  import_finished: ImportProps &
    AcquisitionProps & { created: number; failed: number };
  /**
   * The bridge re-pointed an import's old links in the provider's account
   * (or listed what it would change, or put them back), once per run: the
   * links of the import pointing at QRdx after an apply, put back after an
   * undo, or that an apply would change; links the provider refused; and
   * whether the provider stopped the run (its plan or quota, a rate limit,
   * a rejected connection).
   */
  import_bridge_run: AcquisitionProps & {
    provider: string;
    mode: "dry_run" | "apply" | "undo";
    links_changed: number;
    refused: number;
    stopped: boolean;
  };
  integration_connected: { provider: string };

  // Custom domains
  /**
   * A custom domain passed its DNS check for the first time, on the server.
   * `after_import`: the workspace had imported codes from links on that
   * domain (the own-domain move). Never the domain.
   */
  domain_verified: AcquisitionProps & { after_import: boolean };

  // Developers
  oauth_app_created: NoProps;
  webhook_created: { event_count: number };
  mcp_connect_clicked: { client: string };
  plugin_install_clicked: { plugin: string; target: "store" | "source" };
  /** A chat bot's landing page (/slack, /telegram, /discord): its add button. */
  chat_bot_add_clicked: { bot: "slack" | "telegram" | "discord" };

  // Billing
  /**
   * A plan limit stopped something and offered an upgrade: which limit
   * ("ai_requests", "pro_feature", "dynamic_codes") and the plan it hit.
   */
  limit_gate_shown: { limit: string; plan: string };
  /**
   * `surface`: the button or page, as checkout records it on the
   * subscription (apps/app/lib/checkout-surface.ts); `source` is older.
   */
  upgrade_clicked: {
    source: string;
    plan?: "pro" | "business";
    surface?: string;
  };
  checkout_started: {
    plan: "pro" | "business";
    interval: "month" | "year";
    surface: string;
  };
  /** Server side, from the Polar webhook. */
  subscription_activated: {
    plan: "pro" | "business";
    interval?: string;
    surface?: string;
  };

  // Docs and errors
  docs_search: { query_length: number; result_count?: number };
  /**
   * The docs assistant (Ask AI): a question sent, its length, the docs tab
   * it was asked from and whether it was a suggested one. Never the text.
   */
  docs_chat_asked: { query_length: number; tab?: string; suggested?: boolean };
  /** An answer finished: how many docs pages it cited, or why there is none. */
  docs_chat_answered: {
    sources: number;
    outcome: "answered" | "limited" | "error";
  };
  /** "Was this answer helpful?" under an answer. */
  docs_chat_feedback: { helpful: boolean };
  /**
   * "Was this page helpful?" under a docs page: the page's path (English,
   * at most 64 characters) and the answer. Nothing typed, no identity.
   */
  docs_feedback: { path: string; answer: "yes" | "no" };
  "404_viewed": { area: "site" | "docs" };
  query_failed: { error_type: string };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

/** Events the server sends (they may carry no browser context). */
export type ServerAnalyticsEventName =
  | "form_submitted"
  | "integration_connected"
  | "subscription_activated"
  | "import_started"
  | "import_finished"
  | "import_bridge_run"
  | "domain_verified";

/** `track("sign_out")` for events without required properties. */
export type AnalyticsPropsArg<E extends AnalyticsEventName> =
  // biome-ignore lint/complexity/noBannedTypes: `{}` tests "all optional".
  {} extends AnalyticsEvents[E]
    ? [props?: AnalyticsEvents[E]]
    : [props: AnalyticsEvents[E]];

/** What survives sanitizing: flat primitives only. */
export type CleanProps = Record<string, string | number | boolean>;

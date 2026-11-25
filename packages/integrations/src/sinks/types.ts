/**
 * Data out ("event sinks"): QRdx scans and form responses delivered to a
 * connected tool. The app loads items after a cursor, a sink delivers them,
 * and the sync state (stored in integration.metadata, see SINK_STREAMS)
 * records the outcome. Client-safe types only.
 */

export const SINK_PROVIDERS = [
  "google-sheets",
  "hubspot",
  "mailchimp",
  "pipedrive",
  "segment",
] as const;
export type SinkProviderSlug = (typeof SINK_PROVIDERS)[number];

export function isSinkProvider(slug: string): slug is SinkProviderSlug {
  return (SINK_PROVIDERS as readonly string[]).includes(slug);
}

/** What a sink stream carries. */
export type SinkStream = "scans" | "responses";

/** Where a stream keeps its SyncState in integration.metadata. */
export const SYNC_STATE_KEYS = ["sync", "scansSync", "responsesSync"] as const;
export type SyncStateKey = (typeof SYNC_STATE_KEYS)[number];

export interface SinkStreamSlot {
  stream: SinkStream;
  key: SyncStateKey;
}

/**
 * Each sink's streams. Most carry one, kept in metadata.sync. Segment sends
 * scans and form responses side by side, each with its own cursor, retries
 * and status (metadata.scansSync and metadata.responsesSync).
 */
export const SINK_STREAMS: Record<SinkProviderSlug, readonly SinkStreamSlot[]> =
  {
    "google-sheets": [{ stream: "scans", key: "sync" }],
    hubspot: [{ stream: "responses", key: "sync" }],
    mailchimp: [{ stream: "responses", key: "sync" }],
    pipedrive: [{ stream: "responses", key: "sync" }],
    segment: [
      { stream: "scans", key: "scansSync" },
      { stream: "responses", key: "responsesSync" },
    ],
  };

/** The provider's slot for `stream`, or undefined when it doesn't carry it. */
export function sinkStreamSlot(
  provider: SinkProviderSlug,
  stream: SinkStream
): SinkStreamSlot | undefined {
  return SINK_STREAMS[provider].find((slot) => slot.stream === stream);
}

/** One scan as a row (no visitor hash, no IP: nothing identifies a person). */
export interface SinkScan {
  id: string;
  scannedAt: string;
  code: { id: string; slug: string; title: string | null };
  country: string | null;
  city: string | null;
  deviceType: string | null;
  os: string | null;
  browser: string | null;
  referer: string | null;
  language: string | null;
  /** Region or state, as the scan pipeline stores it */
  region?: string | null;
  /** A/B variant served, "<ruleId>:<variantId>" */
  variant?: string | null;
  /** "nfc" for a tap on an NFC tag; "qr" (or null, from before) for a scan */
  source?: "qr" | "nfc" | null;
}

export type SinkAnswerValue = string | number | boolean | string[];

export interface SinkAnswer {
  /** Form field id */
  id: string;
  label: string;
  /** Form field type: text, email, phone, stars, nps, choice, consent */
  type: string;
  value: SinkAnswerValue;
  /** The answer as text (formatAnswerValue) */
  text: string;
}

export interface SinkFormResponse {
  id: string;
  createdAt: string;
  pageId: string;
  pageTitle: string | null;
  /** Form block id */
  formId: string;
  codeSlug: string | null;
  answers: SinkAnswer[];
}

/** Where the last delivered item sits (items are read in (time, id) order). */
export interface SyncCursor {
  at: string;
  id: string;
}

export type SyncStatus = "idle" | "ok" | "retrying" | "failed" | "paused";

/** integration.metadata.sync (or the stream's own key, see SINK_STREAMS) */
export interface SyncState {
  enabled: boolean;
  /** Workspace whose data is sent (null = personal) */
  organizationId: string | null;
  cursor: SyncCursor | null;
  /** Failed tries in a row */
  attempts: number;
  nextAttemptAt: string | null;
  /** A worker holds the stream until then (crash-safe lease) */
  leaseUntil: string | null;
  status: SyncStatus;
  /** Safe text: provider + code, never tokens or personal data */
  lastError: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  /** Totals since the stream was turned on */
  delivered: number;
  skipped: number;
}

export interface SinkDeliveryResult {
  /** Items the tool accepted */
  delivered: number;
  /** Items left out on purpose (no email, no consent, duplicate, invalid) */
  skipped: number;
  /** Advance to here; null = nothing was read */
  cursor: SyncCursor | null;
}

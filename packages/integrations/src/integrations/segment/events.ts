import type { SinkAnswer, SinkFormResponse, SinkScan } from "../../sinks/types";
import {
  jsonBytes,
  SEGMENT_MAX_BATCH_BYTES,
  SEGMENT_MAX_BATCH_EVENTS,
  SEGMENT_MAX_EVENT_BYTES,
  type SegmentTrackEvent,
  type SegmentValue,
} from "./client";

// Scans and form responses as Segment Track calls. Only what the scan
// pipeline and the form already store goes out: no IP address (Segment adds
// none to server-side calls either), no visitor hash, no precise location.
//
// anonymousId: Segment needs one (or a userId) on every call, and counts
// each distinct one as a tracked user. QRdx has no id for the person who
// scanned, and mustn't make one up, so a scan's is its code and a response's
// is its page: one tracked user per code or page, never one per scan.
//
// messageId: Segment drops a call whose messageId it has seen in about the
// last 24 hours, across every workspace. Ours is the scan or response id plus
// the connection, so a retried batch is never counted twice, while two
// connections sending the same scan to two sources both arrive.

const LIBRARY = { name: "qrdx", version: "1" } as const;

/** Longest answer sent, as for the CRMs; shorter when a response is too big. */
const ANSWER_LIMITS = [1000, 200] as const;

/** Batch bytes left for the events after the envelope (sentAt, brackets). */
const BATCH_EVENT_BYTES = SEGMENT_MAX_BATCH_BYTES - 1000;

/** Stable per item and connection; under Segment's 100 characters. */
export function segmentMessageId(
  kind: "scan" | "response",
  itemId: string,
  connectionId: string
): string {
  return `qrdx-${kind}-${itemId.slice(0, 64)}-${connectionId.slice(0, 8)}`;
}

/** Leaves out properties QRdx doesn't have (null or empty). */
function present(
  values: Record<string, SegmentValue | undefined>
): Record<string, SegmentValue> {
  const out: Record<string, SegmentValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") continue;
    out[key] = value;
  }
  return out;
}

/** One scan as a Track call. */
export function scanTrackEvent(
  scan: SinkScan,
  options: { event: string; connectionId: string }
): SegmentTrackEvent {
  return {
    type: "track",
    event: options.event,
    anonymousId: `qrdx-code-${scan.code.id}`,
    messageId: segmentMessageId("scan", scan.id, options.connectionId),
    timestamp: scan.scannedAt,
    properties: present({
      scan_id: scan.id,
      code_id: scan.code.id,
      code_slug: scan.code.slug,
      code_title: scan.code.title?.trim(),
      source: scan.source === "nfc" ? "nfc" : "qr",
      country: scan.country,
      region: scan.region,
      city: scan.city,
      device_type: scan.deviceType,
      os: scan.os,
      browser: scan.browser,
      referrer: scan.referer,
      language: scan.language,
      variant: scan.variant,
    }),
    context: { library: { ...LIBRARY } },
  };
}

function answerValue(answer: SinkAnswer, limit: number): SegmentValue | null {
  if (
    (answer.type === "stars" || answer.type === "nps") &&
    typeof answer.value === "number"
  ) {
    return answer.value;
  }
  if (typeof answer.value === "boolean") return answer.value;
  const text = answer.text.trim().slice(0, limit);
  return text || null;
}

/**
 * The answered questions, keyed by their label as the form shows it (two
 * questions with the same label get the field id after it, as in the Sheets
 * export). Ratings stay numbers and checkboxes true or false.
 */
export function segmentAnswers(
  answers: SinkAnswer[],
  limit: number = ANSWER_LIMITS[0]
): Record<string, SegmentValue> {
  const labels = new Map<string, number>();
  for (const answer of answers) {
    const label = answer.label.trim() || answer.id;
    labels.set(label, (labels.get(label) ?? 0) + 1);
  }
  const out: Record<string, SegmentValue> = {};
  for (const answer of answers) {
    const value = answerValue(answer, limit);
    if (value === null) continue;
    const label = answer.label.trim() || answer.id;
    const key =
      (labels.get(label) ?? 0) > 1 ? `${label} (${answer.id})` : label;
    out[key] = value;
  }
  return out;
}

/** One form response as a Track call. */
export function responseTrackEvent(
  response: SinkFormResponse,
  options: { event: string; connectionId: string; answerLimit?: number }
): SegmentTrackEvent {
  return {
    type: "track",
    event: options.event,
    anonymousId: `qrdx-page-${response.pageId}`,
    messageId: segmentMessageId("response", response.id, options.connectionId),
    timestamp: response.createdAt,
    properties: present({
      response_id: response.id,
      page_id: response.pageId,
      page_title: response.pageTitle?.trim(),
      form_id: response.formId,
      code_slug: response.codeSlug,
      answers: segmentAnswers(response.answers, options.answerLimit),
    }),
    context: { library: { ...LIBRARY } },
  };
}

/**
 * A response's Track call within Segment's 32 KB, shortening long answers
 * if it has to; null when even that doesn't fit (it's skipped).
 */
export function fittedResponseEvent(
  response: SinkFormResponse,
  options: { event: string; connectionId: string }
): SegmentTrackEvent | null {
  for (const answerLimit of ANSWER_LIMITS) {
    const event = responseTrackEvent(response, { ...options, answerLimit });
    if (jsonBytes(event) <= SEGMENT_MAX_EVENT_BYTES) return event;
  }
  return null;
}

/** The events in request-sized groups: 500 KB and 2,500 calls at most. */
export function segmentBatches(
  events: SegmentTrackEvent[]
): SegmentTrackEvent[][] {
  const batches: SegmentTrackEvent[][] = [];
  let current: SegmentTrackEvent[] = [];
  let bytes = 0;
  for (const event of events) {
    // The event plus the comma that separates it
    const size = jsonBytes(event) + 1;
    if (
      current.length > 0 &&
      (bytes + size > BATCH_EVENT_BYTES ||
        current.length >= SEGMENT_MAX_BATCH_EVENTS)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(event);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** The call "Send a test event" sends, to find in the source's Debugger. */
export function testTrackEvent(id: string, now: Date): SegmentTrackEvent {
  return {
    type: "track",
    event: "QRdx Test Event",
    anonymousId: "qrdx-test",
    messageId: `qrdx-test-${id.slice(0, 64)}`,
    timestamp: now.toISOString(),
    properties: { source: "QRdx" },
    context: { library: { ...LIBRARY } },
  };
}

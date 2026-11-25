import { IntegrationApiError, providerRequest } from "../../core/http-client";
import type { SegmentRegion } from "./settings";

const PROVIDER = { slug: "segment", name: "Segment" };

/** The Tracking API by workspace region. */
export const SEGMENT_ENDPOINTS: Record<SegmentRegion, string> = {
  us: "https://api.segment.io/v1",
  eu: "https://events.eu1.segmentapis.com/v1",
};

/** Segment's limits: 32 KB a call, 500 KB and 2,500 calls a batch request. */
export const SEGMENT_MAX_EVENT_BYTES = 32_000;
export const SEGMENT_MAX_BATCH_BYTES = 500_000;
export const SEGMENT_MAX_BATCH_EVENTS = 2500;

/** A source's write key: letters and digits (32 of them today). */
const WRITE_KEY = /^[A-Za-z0-9_-]{20,64}$/;

export type SegmentValue =
  | string
  | number
  | boolean
  | null
  | SegmentValue[]
  | { [key: string]: SegmentValue };

/** A Track call, as /v1/batch takes it. */
export interface SegmentTrackEvent {
  type: "track";
  event: string;
  /** Segment needs a userId or an anonymousId on every call */
  anonymousId: string;
  /** Segment drops a call whose messageId it has already seen */
  messageId: string;
  /** When it happened (ISO 8601) */
  timestamp: string;
  properties: Record<string, SegmentValue>;
  context: { library: { name: string; version: string } };
}

const encoder = new TextEncoder();

/** Bytes of a value as JSON (what Segment's limits count). */
export function jsonBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

/** Segment's error bodies could quote the events sent: keep our own words. */
const describeSegmentError = (_body: unknown, status: number) =>
  status === 400 ? "rejected the events (too large or not valid)." : undefined;

/** Throws when `writeKey` can't be a Segment write key. */
export function assertSegmentWriteKey(writeKey: string): string {
  if (!WRITE_KEY.test(writeKey)) {
    throw new IntegrationApiError({
      provider: PROVIDER.slug,
      status: 400,
      code: "bad_request",
      message:
        "That doesn't look like a Segment write key. Copy it from your source's Settings → API Keys.",
    });
  }
  return writeKey;
}

/**
 * Segment's HTTP Tracking API with a source's write key (Basic auth, the key
 * as the username). The key is only ever sent in the header, never logged or
 * put in an error.
 */
export class SegmentClient {
  private readonly writeKey: string;
  readonly region: SegmentRegion;

  constructor(writeKey: string, region: SegmentRegion = "us") {
    this.writeKey = writeKey;
    this.region = region;
  }

  /**
   * One /v1/batch request. Segment answers 200 to any write key, a wrong one
   * included: only its source's Debugger shows whether events arrived. It
   * answers 400 for a body over its limits, which callers split before.
   */
  async batch(
    events: SegmentTrackEvent[],
    sentAt: Date = new Date()
  ): Promise<void> {
    if (events.length > SEGMENT_MAX_BATCH_EVENTS) {
      throw new RangeError(
        `At most ${SEGMENT_MAX_BATCH_EVENTS} events per batch`
      );
    }
    const body = JSON.stringify({
      batch: events,
      sentAt: sentAt.toISOString(),
    });
    if (encoder.encode(body).length > SEGMENT_MAX_BATCH_BYTES) {
      throw new RangeError(
        `At most ${SEGMENT_MAX_BATCH_BYTES} bytes per batch`
      );
    }
    await providerRequest(PROVIDER, `${SEGMENT_ENDPOINTS[this.region]}/batch`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${this.writeKey}:`)}`,
        "Content-Type": "application/json",
      },
      body,
      describeError: describeSegmentError,
    });
  }
}

export function createSegmentClient(
  writeKey: string,
  region: SegmentRegion = "us"
): SegmentClient {
  return new SegmentClient(assertSegmentWriteKey(writeKey), region);
}

/**
 * Checks a pasted write key as far as Segment allows: its format, and that
 * the Tracking API answers (an empty batch, so nothing is recorded). Segment
 * can't say whether the key belongs to a source; a test event does.
 */
export async function verifySegmentWriteKey(
  writeKey: string,
  { reachOut = true }: { reachOut?: boolean } = {}
): Promise<Record<string, unknown>> {
  const client = createSegmentClient(writeKey);
  if (reachOut) await client.batch([]);
  return {};
}

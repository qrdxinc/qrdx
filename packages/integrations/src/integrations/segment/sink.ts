import { cursorAfter, dedupeLatest } from "../../sinks/state";
import type {
  SinkDeliveryResult,
  SinkFormResponse,
  SinkScan,
} from "../../sinks/types";
import {
  jsonBytes,
  SEGMENT_MAX_EVENT_BYTES,
  type SegmentClient,
  type SegmentTrackEvent,
} from "./client";
import {
  fittedResponseEvent,
  scanTrackEvent,
  segmentBatches,
  testTrackEvent,
} from "./events";

interface StreamOptions {
  /** The Track call's event name */
  event: string;
  /** The integration row's id (part of every messageId) */
  connectionId: string;
}

/**
 * Sends the events in as few requests as Segment's limits allow. If a later
 * request fails, the whole batch is retried; Segment drops the calls it
 * already has by their messageId.
 */
async function sendAll(
  client: SegmentClient,
  events: SegmentTrackEvent[]
): Promise<void> {
  for (const batch of segmentBatches(events)) {
    await client.batch(batch);
  }
}

/** A batch of scans as Track calls. */
export async function sendScansToSegment(
  client: SegmentClient,
  scans: SinkScan[],
  options: StreamOptions
): Promise<SinkDeliveryResult> {
  const events = dedupeLatest(scans, (scan) => scan.id)
    .map((scan) => scanTrackEvent(scan, options))
    .filter((event) => jsonBytes(event) <= SEGMENT_MAX_EVENT_BYTES);
  await sendAll(client, events);
  return {
    delivered: events.length,
    skipped: scans.length - events.length,
    cursor: cursorAfter(scans, (scan) => ({ at: scan.scannedAt, id: scan.id })),
  };
}

/**
 * A batch of form responses as Track calls. One that can't fit in 32 KB,
 * even with its long answers shortened, is skipped.
 */
export async function sendResponsesToSegment(
  client: SegmentClient,
  responses: SinkFormResponse[],
  options: StreamOptions
): Promise<SinkDeliveryResult> {
  const events = dedupeLatest(responses, (response) => response.id).flatMap(
    (response) => fittedResponseEvent(response, options) ?? []
  );
  await sendAll(client, events);
  return {
    delivered: events.length,
    skipped: responses.length - events.length,
    cursor: cursorAfter(responses, (response) => ({
      at: response.createdAt,
      id: response.id,
    })),
  };
}

/** "Send a test event": one call, to look for in the source's Debugger. */
export async function sendSegmentTestEvent(
  client: SegmentClient,
  id: string,
  now: Date = new Date()
): Promise<void> {
  await client.batch([testTrackEvent(id, now)], now);
}

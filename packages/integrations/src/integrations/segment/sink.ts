import {
  cursorAfter,
  dedupeLatest,
  SinkPartialDeliveryError,
} from "../../sinks/state";
import type {
  SinkDeliveryResult,
  SinkFormResponse,
  SinkScan,
  SyncCursor,
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
 * Sends the items' events, in order, in as few requests as Segment's limits
 * allow (`event` is null for an item that can't go). If a request fails
 * after earlier ones went through, the error carries what was delivered and
 * the worker moves the cursor past it: the retry can come after Segment has
 * forgotten those messageIds (about 24 hours), so they mustn't go again.
 */
async function sendItems<T>(
  client: SegmentClient,
  items: T[],
  options: {
    id: (item: T) => string;
    event: (item: T) => SegmentTrackEvent | null;
    cursor: (item: T) => SyncCursor;
  }
): Promise<SinkDeliveryResult> {
  const outgoing = dedupeLatest(items, options.id).flatMap((item) => {
    const event = options.event(item);
    return event ? [{ item, event }] : [];
  });
  let sent = 0;
  for (const batch of segmentBatches(outgoing.map((entry) => entry.event))) {
    try {
      await client.batch(batch);
    } catch (error) {
      const last = outgoing[sent - 1];
      if (!last) throw error;
      // The items up to the last one sent, the ones that couldn't go included
      const through = items.lastIndexOf(last.item) + 1;
      throw new SinkPartialDeliveryError(
        {
          delivered: sent,
          skipped: through - sent,
          cursor: options.cursor(last.item),
        },
        error
      );
    }
    sent += batch.length;
  }
  return {
    delivered: outgoing.length,
    skipped: items.length - outgoing.length,
    cursor: cursorAfter(items, options.cursor),
  };
}

/** A batch of scans as Track calls. */
export function sendScansToSegment(
  client: SegmentClient,
  scans: SinkScan[],
  options: StreamOptions
): Promise<SinkDeliveryResult> {
  return sendItems(client, scans, {
    id: (scan) => scan.id,
    event: (scan) => {
      const event = scanTrackEvent(scan, options);
      return jsonBytes(event) <= SEGMENT_MAX_EVENT_BYTES ? event : null;
    },
    cursor: (scan) => ({ at: scan.scannedAt, id: scan.id }),
  });
}

/**
 * A batch of form responses as Track calls. One that can't fit in 32 KB,
 * even with its long answers shortened, is skipped.
 */
export function sendResponsesToSegment(
  client: SegmentClient,
  responses: SinkFormResponse[],
  options: StreamOptions
): Promise<SinkDeliveryResult> {
  return sendItems(client, responses, {
    id: (response) => response.id,
    event: (response) => fittedResponseEvent(response, options),
    cursor: (response) => ({ at: response.createdAt, id: response.id }),
  });
}

/** "Send a test event": one call, to look for in the source's Debugger. */
export async function sendSegmentTestEvent(
  client: SegmentClient,
  id: string,
  now: Date = new Date()
): Promise<void> {
  await client.batch([testTrackEvent(id, now)], now);
}

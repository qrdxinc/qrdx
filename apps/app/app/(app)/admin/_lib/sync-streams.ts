import { readSyncState } from "@repo/integrations/src/sinks/state";
import {
  SYNC_STATE_KEYS,
  type SyncStateKey,
} from "@repo/integrations/src/sinks/types";

// A connection's data-out streams on the user 360 page. Most sinks keep one
// (metadata.sync); Segment keeps two (scans and form responses), each with
// its own switch and status, so each stream gets its own line.

/** How each stream's line starts. */
const STREAM_LABELS: Record<SyncStateKey, string> = {
  sync: "Sync",
  scansSync: "Scans sync",
  responsesSync: "Responses sync",
};

/** The streams in `value` (each stream's state by its metadata key). */
export function integrationStreams(value: unknown) {
  const states = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  return SYNC_STATE_KEYS.flatMap((key) => {
    const state = readSyncState(states[key]);
    return state
      ? [
          {
            label: STREAM_LABELS[key],
            enabled: state.enabled,
            status: state.status,
            lastError: state.lastError,
            lastAttemptAt: state.lastAttemptAt,
            lastSuccessAt: state.lastSuccessAt,
            delivered: state.delivered,
          },
        ]
      : [];
  });
}

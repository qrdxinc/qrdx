// A connection's data-out streams on the user 360 page
// (app/(app)/admin/_lib/sync-streams.ts): one line per stream, so Segment's
// scans and form responses each show their own switch and status (its scans
// being off no longer hides responses being on), and the other sinks keep
// their one "Sync" line.
import { initialSyncState } from "@repo/integrations/src/sinks/state";
import { describe, expect, it } from "vitest";
import { integrationStreams } from "@/app/(app)/admin/_lib/sync-streams";

const on = {
  ...initialSyncState("org_1"),
  status: "ok" as const,
  delivered: 7,
};
const off = { ...initialSyncState("org_1"), enabled: false, delivered: 3 };

describe("the user 360 page's sync lines", () => {
  it("shows each of Segment's streams, one off and one on", () => {
    const streams = integrationStreams({
      sync: null,
      scansSync: off,
      responsesSync: on,
    });
    expect(
      streams.map(({ label, enabled, status, delivered }) => ({
        label,
        enabled,
        status,
        delivered,
      })),
    ).toEqual([
      { label: "Scans sync", enabled: false, status: "idle", delivered: 3 },
      { label: "Responses sync", enabled: true, status: "ok", delivered: 7 },
    ]);
  });

  it("shows a sink's one stream as Sync", () => {
    expect(integrationStreams({ sync: on }).map((s) => s.label)).toEqual([
      "Sync",
    ]);
  });

  it("shows nothing for a connection without streams, or a broken state", () => {
    expect(integrationStreams(null)).toEqual([]);
    expect(
      integrationStreams({ sync: null, scansSync: { enabled: "yes" } }),
    ).toEqual([]);
  });

  it("never carries the cursor, the lease or the workspace", () => {
    const [line] = integrationStreams({ responsesSync: on });
    expect(Object.keys(line ?? {}).sort()).toEqual([
      "delivered",
      "enabled",
      "label",
      "lastAttemptAt",
      "lastError",
      "lastSuccessAt",
      "status",
    ]);
  });
});

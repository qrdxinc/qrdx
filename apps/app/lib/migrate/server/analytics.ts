import "server-only";

import type { AnalyticsEvents, ImportSource } from "@repo/analytics/events";
import { acquisitionProps } from "@/lib/analytics/acquisition";
import {
  serverEventsEnabled,
  trackServerAfter,
  userEventOptions,
} from "@/lib/analytics/server";
import { getJob, type Scope } from "../importer";
import { isApiProviderId, type ProviderId } from "../providers";
import type {
  ChunkResult,
  ImportPreview,
  JobItem,
  JobSummary,
  RedirectResult,
} from "../types";
import { deps } from "./http";

// The import steps of the switch funnel, sent by the server where each one
// completes: import_started when a job is recorded, import_finished with the
// request that handles its last row, import_bridge_run once per run of the
// bridge. Provider ids and counts only, never a link, domain, back-half or
// code name. Named with the user's analytics consent, an anonymous count
// without it (lib/analytics/server.ts), and labelled with how the account
// found QRdx (lib/analytics/acquisition.ts). The API routes call these after
// the importer returns; nothing here can fail or slow a request.

const sourceOf = (provider: ProviderId): ImportSource =>
  isApiProviderId(provider) ? "account" : "file";

export function importStartedProps({
  job,
  preview,
}: {
  job: JobSummary;
  preview: ImportPreview;
}): AnalyticsEvents["import_started"] {
  return {
    provider: job.provider,
    source: sourceOf(job.provider),
    rows: job.total,
    to_create: preview.creates,
    skipped: job.skipped,
    own_domain: job.backHalfDomain !== null,
  };
}

export function importFinishedProps(
  job: JobSummary,
): AnalyticsEvents["import_finished"] {
  return {
    provider: job.provider,
    source: sourceOf(job.provider),
    rows: job.total,
    created: job.created,
    skipped: job.skipped,
    failed: job.failed,
    own_domain: job.backHalfDomain !== null,
  };
}

/**
 * The request that handled the import's last row. An import that's already
 * done answers with no items, so a repeated call never counts again; one
 * whose last request failed half-way counts when it's resumed.
 */
export const finishesImport = (result: ChunkResult) =>
  result.done && result.items.length > 0;

/** The request that ends a run, where the dashboard's loop stops. */
export const endsBridgeRun = (result: RedirectResult) =>
  result.mode === "dry-run" ||
  result.stopped !== null ||
  result.remaining === 0 ||
  result.items.length === 0;

/**
 * import_bridge_run for a run that ended: `items` are the import's links
 * after it (unused for a dry run, which lists what an apply would change).
 * A run starts by clearing earlier errors, so the errors left are its own.
 */
export function bridgeRunProps(
  result: RedirectResult,
  items: JobItem[],
): AnalyticsEvents["import_bridge_run"] {
  const count = (fn: (item: JobItem) => boolean) => items.filter(fn).length;
  const provider = result.job.provider;
  if (result.mode === "dry-run") {
    return {
      provider,
      mode: "dry_run",
      links_changed: result.items.length,
      refused: 0,
      stopped: false,
    };
  }
  return {
    provider,
    mode: result.mode,
    links_changed:
      result.mode === "undo"
        ? count((item) => Boolean(item.redirect?.undoneAt))
        : count((item) => Boolean(item.redirect && !item.redirect.undoneAt)),
    refused: count((item) => Boolean(item.redirectError)),
    stopped: result.stopped !== null,
  };
}

function trackImportFinished(scope: Scope, job: JobSummary): void {
  trackServerAfter("import_finished", async () => ({
    props: {
      ...importFinishedProps(job),
      ...(await acquisitionProps(scope.userId)),
    },
    // Same import, same event id: a repeat can't count twice.
    options: await userEventOptions(scope.userId, job.id),
  }));
}

export function trackImportStarted(
  scope: Scope,
  started: { job: JobSummary; preview: ImportPreview },
): void {
  trackServerAfter("import_started", async () => ({
    props: {
      ...importStartedProps(started),
      ...(await acquisitionProps(scope.userId)),
    },
    options: await userEventOptions(scope.userId, started.job.id),
  }));
  // Every row skipped: no run follows, so it's finished already.
  if (started.job.status === "done") trackImportFinished(scope, started.job);
}

export function trackImportChunk(scope: Scope, result: ChunkResult): void {
  if (finishesImport(result)) trackImportFinished(scope, result.job);
}

export function trackBridgeRun(scope: Scope, result: RedirectResult): void {
  if (!(endsBridgeRun(result) && serverEventsEnabled())) return;
  // Read the import as this run left it now, not after the response: the
  // next run (an undo) may already be changing it by then.
  const left: Promise<JobItem[]> =
    result.mode === "dry-run"
      ? Promise.resolve([])
      : getJob(deps, scope, result.job.id).then((loaded) => loaded.items);
  // A failed read is logged when the event is built, after the response.
  left.catch(() => undefined);
  trackServerAfter("import_bridge_run", async () => {
    const items = await left;
    return {
      props: {
        ...bridgeRunProps(result, items),
        ...(await acquisitionProps(scope.userId)),
      },
      options: await userEventOptions(scope.userId),
    };
  });
}

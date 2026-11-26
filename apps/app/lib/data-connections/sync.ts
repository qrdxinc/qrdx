import "server-only";

import { database as db, integration } from "@repo/database";
import {
  isIntegrationApiError,
  isSinkProvider,
  SINK_PROVIDERS,
  SINK_STREAMS,
  type SinkDeliveryResult,
  type SinkProviderSlug,
  type SinkStream,
  type SinkStreamSlot,
  SYNC_STATE_KEYS,
  type SyncState,
  type SyncStateKey,
} from "@repo/integrations";
import {
  appendScansToSheet,
  createGoogleSheetsClient,
  type SheetSyncTarget,
} from "@repo/integrations/src/integrations/google-sheets";
import {
  createHubSpotClient,
  upsertResponsesToHubSpot,
} from "@repo/integrations/src/integrations/hubspot";
import {
  createMailchimpClient,
  type MailchimpSettings,
  mailchimpTargets,
  syncResponsesToMailchimp,
} from "@repo/integrations/src/integrations/mailchimp";
import {
  createPipedriveClient,
  type PipedriveSettings,
  syncResponsesToPipedrive,
} from "@repo/integrations/src/integrations/pipedrive";
import {
  createSegmentClient,
  readSegmentSettings,
  sendResponsesToSegment,
  sendScansToSegment,
} from "@repo/integrations/src/integrations/segment";
import type { ResponseSinkSettings } from "@repo/integrations/src/sinks/mapping";
import {
  isSyncDue,
  nextSyncState,
  readSyncState,
  SYNC_BATCH_SIZE,
  SYNC_LEASE_MS,
  syncBatchSize,
  syncFailure,
} from "@repo/integrations/src/sinks/state";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { getConnection } from "@/lib/connected-accounts/server";
import { scheduleWorkerRun } from "@/lib/events/worker-due";
import { loadResponses, loadScans, syncPauseReason } from "./data";
import { dataCallsAllowed } from "./server";

// Data-out worker. Each sink integration keeps its stream state in
// integration.metadata (no extra tables): a (time, id) cursor, failed
// attempts with the webhook backoff schedule, a crash-safe lease and the last
// outcome for the dashboard. Most sinks have one stream, in metadata.sync;
// Segment has two (scans and form responses), each under its own key with
// its own lease, cursor and retries (SINK_STREAMS). Items are read after the
// cursor in batches and delivered in batches; the cursor only moves after
// the tool accepted them, and every sink is idempotent (upsert by email /
// scan id checks / Segment's messageId), so a retry never duplicates
// anything. A run writes only what it owns of a stream's state (writeRunState):
// the switch and the workspace are the person's.

function log(event: string, fields: Record<string, unknown>) {
  console.error(JSON.stringify({ event, ...fields }));
}

const metaJson = sql`coalesce(${integration.metadata}::jsonb, '{}'::jsonb)`;

/** A JSON path in a stream's state, as Postgres's text[] literal. */
const statePath = (key: SyncStateKey, field?: string) =>
  field ? `{${key},${field}}` : `{${key}}`;

/**
 * Writes a stream's state (metadata.sync unless `key` says otherwise), and
 * optionally merges metadata.settings, in place.
 */
export async function writeSyncState(
  integrationId: string,
  state: SyncState,
  settingsPatch?: Record<string, unknown>,
  key: SyncStateKey = "sync",
): Promise<void> {
  const withSync = sql`jsonb_set(${metaJson}, ${statePath(key)}::text[], ${JSON.stringify(state)}::jsonb)`;
  const value = settingsPatch
    ? sql`jsonb_set(${withSync}, '{settings}', coalesce(${metaJson} -> 'settings', '{}'::jsonb) || ${JSON.stringify(settingsPatch)}::jsonb)`
    : withSync;
  await db
    .update(integration)
    .set({ metadata: sql`(${value})::json`, updatedAt: new Date() })
    .where(eq(integration.id, integrationId));
}

/**
 * A run's write of its stream's state, merged into the stored state in one
 * statement: the cursor, retries, lease and outcome. Never `enabled: true`
 * or the workspace, so a stream turned off while the run was delivering
 * stays off (the run can still turn it off itself, when the plan lapsed),
 * and a stream turned on in another workspace meanwhile isn't touched.
 * Returns whether the stream is still on.
 */
async function writeRunState(
  integrationId: string,
  key: SyncStateKey,
  state: SyncState,
  settingsPatch?: Record<string, unknown>,
): Promise<boolean> {
  const { enabled, organizationId, ...owned } = state;
  const fields = enabled ? owned : { ...owned, enabled };
  const merged = sql`coalesce(${metaJson} #> ${statePath(key)}::text[], '{}'::jsonb) || ${JSON.stringify(fields)}::jsonb`;
  // create_missing false: a stream removed meanwhile isn't brought back.
  const withState = sql`jsonb_set(${metaJson}, ${statePath(key)}::text[], ${merged}, false)`;
  const value = settingsPatch
    ? sql`jsonb_set(${withState}, '{settings}', coalesce(${metaJson} -> 'settings', '{}'::jsonb) || ${JSON.stringify(settingsPatch)}::jsonb)`
    : withState;
  const rows = await db
    .update(integration)
    .set({ metadata: sql`(${value})::json`, updatedAt: new Date() })
    .where(
      and(
        eq(integration.id, integrationId),
        sql`(${integration.metadata}::jsonb #>> ${statePath(key, "organizationId")}::text[]) is not distinct from ${organizationId}`,
      ),
    )
    .returning({
      enabled: sql<
        string | null
      >`${integration.metadata}::jsonb #>> ${statePath(key, "enabled")}::text[]`,
    });
  return rows[0]?.enabled === "true";
}

/**
 * Takes the stream's lease in one statement, so two workers (cron and a
 * form-submit trigger) never deliver the same batch.
 */
async function claim(
  integrationId: string,
  key: SyncStateKey,
  now: Date,
): Promise<boolean> {
  const lease = new Date(now.getTime() + SYNC_LEASE_MS).toISOString();
  const rows = await db
    .update(integration)
    .set({
      metadata: sql`jsonb_set(${metaJson}, ${statePath(key, "leaseUntil")}::text[], to_jsonb(${lease}::text))::json`,
    })
    .where(
      and(
        eq(integration.id, integrationId),
        eq(integration.status, "active"),
        sql`(${integration.metadata}::jsonb #>> ${statePath(key, "enabled")}::text[]) = 'true'`,
        sql`coalesce(nullif(${integration.metadata}::jsonb #>> ${statePath(key, "leaseUntil")}::text[], '')::timestamptz, 'epoch'::timestamptz) < ${now.toISOString()}::timestamptz`,
      ),
    )
    .returning({ id: integration.id });
  return rows.length > 0;
}

interface SinkRow {
  id: string;
  userId: string;
  provider: SinkProviderSlug;
  metadata: Record<string, unknown>;
}

const settingsOf = (metadata: Record<string, unknown>) =>
  (metadata.settings ?? {}) as Record<string, unknown>;

export function readSheetTarget(
  metadata: Record<string, unknown>,
): SheetSyncTarget | null {
  const target = settingsOf(metadata).syncTarget as SheetSyncTarget | undefined;
  return target?.spreadsheetId ? target : null;
}

/** What the batches of one worker run share. */
interface RunContext {
  /**
   * Pipedrive persons found or created in this run (email → id). Pipedrive's
   * search can lag behind a create, so an email from an earlier batch isn't
   * searched, and created, a second time.
   */
  pipedrivePeople: Map<string, number>;
  /**
   * The responses of the batch being delivered that already got their
   * Pipedrive lead (metadata.pipedriveLeadsMade). Written as each lead is
   * made, so another attempt at the batch ("Retry now", a backoff retry, a
   * worker that stopped) skips them; emptied once the batch is delivered.
   */
  pipedriveLeadsMade: Set<string>;
}

const PIPEDRIVE_LEADS_MADE = "pipedriveLeadsMade";

/** Response ids recorded in metadata.pipedriveLeadsMade. */
export function readPipedriveLeadsMade(
  metadata: Record<string, unknown>,
): Set<string> {
  const value = metadata[PIPEDRIVE_LEADS_MADE];
  return new Set(
    Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [],
  );
}

/** Records a response's lead, in one statement, before anything can fail. */
async function recordPipedriveLead(
  integrationId: string,
  responseId: string,
): Promise<void> {
  const list = sql`coalesce(${metaJson} -> ${PIPEDRIVE_LEADS_MADE}, '[]'::jsonb)`;
  await db
    .update(integration)
    .set({
      metadata: sql`jsonb_set(${metaJson}, ${`{${PIPEDRIVE_LEADS_MADE}}`}::text[], ${list} || to_jsonb(${responseId}::text))::json`,
    })
    .where(eq(integration.id, integrationId));
}

/** After a delivered batch: its responses won't be read again. */
async function clearPipedriveLeads(integrationId: string): Promise<void> {
  await db
    .update(integration)
    .set({
      metadata: sql`(${metaJson} - ${PIPEDRIVE_LEADS_MADE}::text)::json`,
    })
    .where(eq(integration.id, integrationId));
}

type BatchOutcome = {
  result: SinkDeliveryResult;
  settingsPatch?: Record<string, unknown>;
  read: number;
};

const NOTHING_READ: BatchOutcome = {
  result: { delivered: 0, skipped: 0, cursor: null },
  read: 0,
};

/** Segment: the stream's scans or responses as Track calls. */
async function deliverToSegment(
  row: SinkRow,
  stream: SinkStream,
  state: SyncState,
  writeKey: string,
): Promise<BatchOutcome> {
  const scope = { userId: row.userId, organizationId: state.organizationId };
  const segment = readSegmentSettings(row.metadata.settings);
  const client = createSegmentClient(writeKey, segment.region);
  if (stream === "scans") {
    const scans = await loadScans(scope, {
      codeId: null,
      cursor: state.cursor,
      limit: SYNC_BATCH_SIZE,
    });
    if (scans.length === 0) return NOTHING_READ;
    return {
      result: await sendScansToSegment(client, scans, {
        event: segment.scanEvent,
        connectionId: row.id,
      }),
      read: scans.length,
    };
  }
  const responses = await loadResponses(scope, {
    pageIds: null,
    cursor: state.cursor,
    limit: SYNC_BATCH_SIZE,
  });
  if (responses.length === 0) return NOTHING_READ;
  return {
    result: await sendResponsesToSegment(client, responses, {
      event: segment.responseEvent,
      connectionId: row.id,
    }),
    read: responses.length,
  };
}

/** Delivers one batch for the stream. */
async function deliverBatch(
  row: SinkRow,
  slot: SinkStreamSlot,
  state: SyncState,
  accessToken: string,
  run: RunContext,
): Promise<BatchOutcome> {
  const scope = { userId: row.userId, organizationId: state.organizationId };
  const settings = settingsOf(row.metadata);

  if (row.provider === "segment") {
    return deliverToSegment(row, slot.stream, state, accessToken);
  }

  if (row.provider === "google-sheets") {
    const target = readSheetTarget(row.metadata);
    if (!target) throw new Error("No sheet to sync to");
    const scans = await loadScans(scope, {
      codeId: target.codeId,
      cursor: state.cursor,
      limit: SYNC_BATCH_SIZE,
    });
    if (scans.length === 0) {
      return { result: { delivered: 0, skipped: 0, cursor: null }, read: 0 };
    }
    const result = await appendScansToSheet(
      createGoogleSheetsClient(accessToken),
      target,
      scans,
      { isRetry: state.attempts > 0 },
    );
    return {
      result,
      read: scans.length,
      settingsPatch: {
        syncTarget: { ...target, rowsWritten: result.rowsWritten },
      },
    };
  }

  const responseSettings = settings as unknown as ResponseSinkSettings;
  const responses = await loadResponses(scope, {
    pageIds: responseSettings.pageIds ?? null,
    cursor: state.cursor,
    limit: syncBatchSize(row.provider),
  });
  if (responses.length === 0) {
    return { result: { delivered: 0, skipped: 0, cursor: null }, read: 0 };
  }
  if (row.provider === "hubspot") {
    return {
      result: await upsertResponsesToHubSpot(
        createHubSpotClient(accessToken),
        {
          pageIds: responseSettings.pageIds ?? null,
          forms: responseSettings.forms ?? {},
        },
        responses,
      ),
      read: responses.length,
    };
  }
  if (row.provider === "pipedrive") {
    const pipedrive = settings as unknown as PipedriveSettings;
    return {
      result: await syncResponsesToPipedrive(
        createPipedriveClient(
          accessToken,
          String(row.metadata.apiDomain ?? ""),
        ),
        {
          pageIds: pipedrive.pageIds ?? null,
          forms: pipedrive.forms ?? {},
          createLead: pipedrive.createLead === true,
        },
        responses,
        {
          knownPeople: run.pipedrivePeople,
          // No retry flag: "Retry now" resets the attempt count, so the record
          // of leads already made is what keeps a lead from being made twice.
          leadsMade: run.pipedriveLeadsMade,
          onLeadCreated: async (responseId) => {
            await recordPipedriveLead(row.id, responseId);
            run.pipedriveLeadsMade.add(responseId);
          },
        },
      ),
      read: responses.length,
    };
  }
  const mailchimp = settings as unknown as MailchimpSettings & {
    mergeFields?: Array<{ tag: string; name: string; type: string }>;
  };
  const dc = String(row.metadata.dc ?? "");
  return {
    result: await syncResponsesToMailchimp(
      createMailchimpClient(accessToken, dc),
      {
        audienceId: mailchimp.audienceId,
        tags: mailchimp.tags ?? [],
        withoutConsent: mailchimp.withoutConsent ?? "pending",
        pageIds: mailchimp.pageIds ?? null,
        forms: mailchimp.forms ?? {},
      },
      mailchimpTargets(mailchimp.mergeFields ?? []),
      responses,
    ),
    read: responses.length,
  };
}

const MAX_BATCHES_PER_RUN = 10;

/**
 * When a stream that isn't due now becomes due (epoch ms): its retry time or
 * the end of another run's lease. Null when only new items start it (or it
 * is off, paused or failed for good).
 */
export function syncDueAt(state: SyncState): number | null {
  if (
    !state.enabled ||
    state.status === "failed" ||
    state.status === "paused"
  ) {
    return null;
  }
  const times = [state.nextAttemptAt, state.leaseUntil]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  return times.length > 0 ? Math.max(...times) : null;
}

/** Runs one stream until it is caught up, fails or the budget is used. */
async function syncOne(
  row: SinkRow,
  slot: SinkStreamSlot,
  deadline: number,
): Promise<"ok" | "failed" | "skipped"> {
  const now = new Date();
  let state = readSyncState(row.metadata[slot.key]);
  if (!state) return "skipped";
  if (!isSyncDue(state, now)) {
    // Waiting for a retry, or another run holds it: be back by then.
    const dueAt = syncDueAt(state);
    if (dueAt !== null) await scheduleWorkerRun(dueAt);
    return "skipped";
  }
  if (!(await claim(row.id, slot.key, now))) {
    await scheduleWorkerRun(now.getTime() + SYNC_LEASE_MS);
    return "skipped";
  }

  const release = (next: SyncState) =>
    writeRunState(row.id, slot.key, { ...next, leaseUntil: null });

  try {
    if (!dataCallsAllowed()) {
      await release({
        ...state,
        lastError: "Not sent: delivery is off outside production",
      });
      return "skipped";
    }
    const scope = { userId: row.userId, organizationId: state.organizationId };
    const paused = await syncPauseReason(scope);
    if (paused) {
      await release({
        ...state,
        enabled: false,
        status: "paused",
        lastError: paused,
      });
      return "failed";
    }
    const connection = await getConnection(row.userId, row.provider);
    if (connection?.status !== "active") {
      await release({
        ...state,
        status: "failed",
        lastError: "the connection was rejected; reconnect the account",
      });
      return "failed";
    }

    let caughtUp = false;
    const run: RunContext = {
      pipedrivePeople: new Map(),
      pipedriveLeadsMade: readPipedriveLeadsMade(row.metadata),
    };
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      if (Date.now() > deadline) break;
      let outcome: Awaited<ReturnType<typeof deliverBatch>>;
      try {
        outcome = await deliverBatch(
          row,
          slot,
          state,
          connection.accessToken,
          run,
        );
      } catch (error) {
        state = nextSyncState(state, { ok: false, error });
        await release(state);
        if (state.nextAttemptAt) {
          await scheduleWorkerRun(Date.parse(state.nextAttemptAt));
        }
        const failure = syncFailure(error);
        if (isIntegrationApiError(failure) && failure.code === "unauthorized") {
          await db
            .update(integration)
            .set({ status: "error", updatedAt: new Date() })
            .where(eq(integration.id, row.id));
        }
        // Provider, status and our own text only: no response bodies.
        log("integrations.sync_failed", {
          provider: row.provider,
          integrationId: row.id,
          stream: slot.stream,
          attempts: state.attempts,
          error: state.lastError,
        });
        return "failed";
      }
      if (outcome.read === 0) {
        caughtUp = true;
        break;
      }
      state = nextSyncState(state, { ok: true, result: outcome.result });
      // Keep the lease while more batches follow.
      const stillOn = await writeRunState(
        row.id,
        slot.key,
        {
          ...state,
          leaseUntil: new Date(Date.now() + SYNC_LEASE_MS).toISOString(),
        },
        outcome.settingsPatch,
      );
      // The cursor is past this batch now, so its leads won't be asked for
      // again. (If clearing fails, the stale ids are harmless.)
      if (run.pipedriveLeadsMade.size > 0) {
        await clearPipedriveLeads(row.id);
        run.pipedriveLeadsMade.clear();
      }
      if (outcome.settingsPatch) {
        row.metadata = {
          ...row.metadata,
          settings: { ...settingsOf(row.metadata), ...outcome.settingsPatch },
        };
      }
      // Turned off meanwhile: nothing more goes out until it's on again.
      if (!stillOn || outcome.read < syncBatchSize(row.provider)) {
        caughtUp = true;
        break;
      }
    }
    await release(state);
    // Out of time or batches with items left: the next worker run goes on.
    if (!caughtUp) await scheduleWorkerRun(Date.now());
    return "ok";
  } catch (error) {
    // Lease expires and the next run picks the stream up again.
    await scheduleWorkerRun(Date.now() + SYNC_LEASE_MS);
    log("integrations.sync_crashed", {
      provider: row.provider,
      integrationId: row.id,
      stream: slot.stream,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return "failed";
  }
}

async function loadSinkRows(ids?: string[]): Promise<SinkRow[]> {
  const rows = await db
    .select({
      id: integration.id,
      userId: integration.userId,
      provider: integration.provider,
      metadata: integration.metadata,
    })
    .from(integration)
    .where(
      and(
        inArray(integration.provider, [...SINK_PROVIDERS]),
        eq(integration.status, "active"),
        or(
          ...SYNC_STATE_KEYS.map(
            (key) =>
              sql`(${integration.metadata}::jsonb #>> ${statePath(key, "enabled")}::text[]) = 'true'`,
          ),
        ),
        ids ? inArray(integration.id, ids) : undefined,
      ),
    )
    .limit(500);
  return rows.flatMap((row) =>
    isSinkProvider(row.provider)
      ? [
          {
            ...row,
            provider: row.provider,
            metadata: (row.metadata ?? {}) as Record<string, unknown>,
          },
        ]
      : [],
  );
}

/** The row's streams that are turned on. */
function enabledSlots(row: SinkRow): SinkStreamSlot[] {
  return SINK_STREAMS[row.provider].filter(
    (slot) => readSyncState(row.metadata[slot.key])?.enabled === true,
  );
}

export interface SyncRunSummary {
  streams: number;
  ok: number;
  failed: number;
  skipped: number;
}

/**
 * Cron worker (and triggers): every due stream, within a time budget.
 * `stream` limits it to the streams that carry scans, or responses.
 */
export async function runIntegrationSyncs({
  budgetMs = 15_000,
  integrationIds,
  stream,
}: {
  budgetMs?: number;
  integrationIds?: string[];
  stream?: SinkStream;
} = {}): Promise<SyncRunSummary> {
  const deadline = Date.now() + budgetMs;
  const summary: SyncRunSummary = { streams: 0, ok: 0, failed: 0, skipped: 0 };
  try {
    const rows = await loadSinkRows(integrationIds);
    const streams = rows.flatMap((row) =>
      enabledSlots(row)
        .filter((slot) => !stream || slot.stream === stream)
        .map((slot) => ({ row, slot })),
    );
    summary.streams = streams.length;
    for (const { row, slot } of streams) {
      if (Date.now() > deadline) break;
      summary[await syncOne(row, slot, deadline)]++;
    }
  } catch (error) {
    log("integrations.sync_run_failed", {
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
  }
  return summary;
}

/**
 * Earliest time a stream becomes due again (retries and leases), for the
 * worker's marker. Streams waiting only for new items aren't counted: form
 * responses start them right away and throttled scans mark the worker due.
 */
export async function nextIntegrationSyncDueAt(): Promise<number | null> {
  let next: number | null = null;
  for (const row of await loadSinkRows()) {
    for (const slot of SINK_STREAMS[row.provider]) {
      const state = readSyncState(row.metadata[slot.key]);
      const dueAt = state ? syncDueAt(state) : null;
      if (dueAt !== null && (next === null || dueAt < next)) next = dueAt;
    }
  }
  return next;
}

// ─── Triggers from the event pipeline ────────────────────────────────────────

interface StreamIndexEntry {
  id: string;
  userId: string;
  organizationId: string | null;
  provider: SinkProviderSlug;
  stream: SinkStream;
}

const INDEX_TTL_MS = 30_000;
/** Scans arrive in bursts: one delivery per scan stream per 5 minutes. */
const SCAN_TRIGGER_INTERVAL_MS = 5 * 60_000;
let streamIndex: { at: number; entries: StreamIndexEntry[] } | null = null;
const lastScanTrigger = new Map<string, number>();

/** Call after enabling, disabling or reconfiguring a stream. */
export function invalidateStreamIndex() {
  streamIndex = null;
}

async function enabledStreams(): Promise<StreamIndexEntry[]> {
  if (streamIndex && Date.now() - streamIndex.at < INDEX_TTL_MS) {
    return streamIndex.entries;
  }
  const rows = await loadSinkRows();
  const entries = rows.flatMap((row) =>
    enabledSlots(row).map((slot) => ({
      id: row.id,
      userId: row.userId,
      provider: row.provider,
      stream: slot.stream,
      organizationId:
        readSyncState(row.metadata[slot.key])?.organizationId ?? null,
    })),
  );
  streamIndex = { at: Date.now(), entries };
  return entries;
}

function inScope(
  entry: StreamIndexEntry,
  scope: { userId: string; organizationId: string | null },
) {
  return scope.organizationId
    ? entry.organizationId === scope.organizationId
    : entry.organizationId === null && entry.userId === scope.userId;
}

function runDetached(task: () => Promise<unknown>) {
  const run = () => task().catch(() => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * A new form response or scan in a workspace: deliver to its streams soon
 * (form responses right away, scans at most every five minutes per stream).
 * Never throws and never blocks the caller; the cron worker covers the rest.
 */
export function triggerIntegrationSyncs(
  scope: { userId: string; organizationId: string | null },
  stream: "scans" | "responses",
): void {
  runDetached(async () => {
    const entries = (await enabledStreams()).filter(
      (entry) => inScope(entry, scope) && entry.stream === stream,
    );
    const now = Date.now();
    let waitUntil = Number.POSITIVE_INFINITY;
    const due = entries.filter((entry) => {
      if (stream !== "scans") return true;
      const last = lastScanTrigger.get(entry.id) ?? 0;
      if (now - last < SCAN_TRIGGER_INTERVAL_MS) {
        waitUntil = Math.min(waitUntil, last + SCAN_TRIGGER_INTERVAL_MS);
        return false;
      }
      lastScanTrigger.set(entry.id, now);
      return true;
    });
    if (lastScanTrigger.size > 5000) lastScanTrigger.clear();
    // Throttled scans go out with the next append; make sure one comes.
    if (Number.isFinite(waitUntil)) await scheduleWorkerRun(waitUntil);
    if (due.length === 0) return;
    await runIntegrationSyncs({
      budgetMs: 10_000,
      integrationIds: due.map((entry) => entry.id),
      stream,
    });
  });
}

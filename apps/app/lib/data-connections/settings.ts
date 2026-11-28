import "server-only";

import { database as db, integration } from "@repo/database";
import {
  isSinkProvider,
  SINK_STREAMS,
  type SinkStream,
  type SyncCursor,
  type SyncState,
  type SyncStateKey,
  sinkStreamSlot,
} from "@repo/integrations";
import {
  codeLabel,
  createGoogleSheetsClient,
  RESPONSES_SHEET_TITLE,
  responsesTable,
  SCAN_HEADER,
  SCAN_SHEET_TITLE,
  type SheetSyncTarget,
  scanRow,
  sheetRange,
} from "@repo/integrations/src/integrations/google-sheets";
import {
  createMailchimpClient,
  type MailchimpAudience,
  type MailchimpMergeField,
} from "@repo/integrations/src/integrations/mailchimp";
import {
  createSegmentClient,
  normalizeSegmentEventName,
  readSegmentSettings,
  type SegmentRegion,
  sendSegmentTestEvent,
} from "@repo/integrations/src/integrations/segment";
import type { FormMapping } from "@repo/integrations/src/sinks/mapping";
import {
  initialSyncState,
  readSyncState,
  resumeSyncState,
} from "@repo/integrations/src/sinks/state";
import { and, eq, sql } from "drizzle-orm";
import { getInboxPage } from "@/app/api/forms/_lib/responses";
import { HttpError } from "@/lib/error-response";
import type { ActiveScope } from "@/lib/scope";
import {
  findScopedCode,
  formPagesByIds,
  listFormPages,
  loadResponses,
  loadScans,
  type ScopedFormPage,
  scopedPageIds,
} from "./data";
import { dataCallsAllowed, devDisabled, getFreshConnection } from "./server";
import {
  invalidateStreamIndex,
  readSheetTarget,
  runIntegrationSyncs,
  writeSyncState,
} from "./sync";

/** Rows per export (Google allows 10M cells; this keeps exports quick). */
export const MAX_EXPORT_ROWS = 50_000;
const EXPORT_PAGE = 5000;

async function requireConnection(userId: string, provider: string) {
  const connection = await getFreshConnection(userId, provider);
  if (!connection) {
    throw new HttpError(404, "NOT_CONNECTED", "Connect the account first.");
  }
  if (connection.status !== "active") {
    throw new HttpError(409, "RECONNECT", "Reconnect the account first.");
  }
  return connection;
}

/** A stream switched off: only its switch changes (see patchSettings). */
const OFF = "off";

/**
 * Merges into metadata.settings (and replaces the streams' states given, by
 * their key) in SQL, so a worker writing a sync state meanwhile is never
 * overwritten. A stream given as OFF gets only `enabled: false` and status
 * "paused": the cursor and totals a run may be writing stay the run's.
 */
async function patchSettings(
  integrationId: string,
  _metadata: Record<string, unknown> | null,
  patch: Record<string, unknown>,
  states: Partial<Record<SyncStateKey, SyncState | typeof OFF>> = {},
) {
  const meta = sql`coalesce(${integration.metadata}::jsonb, '{}'::jsonb)`;
  let value = sql`jsonb_set(${meta}, '{settings}', coalesce(${meta} -> 'settings', '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb)`;
  for (const [key, state] of Object.entries(states)) {
    value =
      state === OFF
        ? sql`jsonb_set(jsonb_set(${value}, ${`{${key},enabled}`}::text[], 'false'::jsonb), ${`{${key},status}`}::text[], '"paused"'::jsonb)`
        : sql`jsonb_set(${value}, ${`{${key}}`}::text[], ${JSON.stringify(state)}::jsonb)`;
  }
  await db
    .update(integration)
    .set({ metadata: sql`(${value})::json`, updatedAt: new Date() })
    .where(eq(integration.id, integrationId));
  invalidateStreamIndex();
}

const dateStamp = () => new Date().toISOString().slice(0, 10);

export interface SheetExport {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetTitle: string;
  codeId: string | null;
  label: string;
  rowsWritten: number;
  cursor: SyncCursor | null;
  truncated: boolean;
  createdAt: string;
}

/** New spreadsheet with the scope's scans (one code or all), oldest first. */
export async function exportScansToSheet(
  scope: ActiveScope,
  codeId: string | null,
): Promise<SheetExport> {
  if (!dataCallsAllowed()) throw devDisabled();
  const connection = await requireConnection(scope.userId, "google-sheets");
  const code = codeId ? await findScopedCode(scope, codeId) : null;
  if (codeId && !code) throw new HttpError(404, "NOT_FOUND", "Code not found");
  const label = code ? codeLabel(code) : "All codes";
  const client = createGoogleSheetsClient(connection.accessToken);
  const sheet = await client.createSpreadsheet({
    title: `QRdx scans · ${label} · ${dateStamp()}`,
    sheetTitle: SCAN_SHEET_TITLE,
    header: [...SCAN_HEADER],
  });

  let cursor: SyncCursor | null = null;
  let rowsWritten = 0;
  let truncated = false;
  while (rowsWritten < MAX_EXPORT_ROWS) {
    const scans = await loadScans(scope, {
      codeId,
      cursor,
      limit: Math.min(EXPORT_PAGE, MAX_EXPORT_ROWS - rowsWritten),
    });
    if (scans.length === 0) break;
    await client.appendRows(
      sheet.spreadsheetId,
      sheetRange(sheet.sheetTitle, "A:J"),
      scans.map(scanRow),
    );
    rowsWritten += scans.length;
    const last = scans.at(-1);
    cursor = last ? { at: last.scannedAt, id: last.id } : cursor;
    if (scans.length < EXPORT_PAGE) break;
    if (rowsWritten >= MAX_EXPORT_ROWS) truncated = true;
  }

  const result: SheetExport = {
    spreadsheetId: sheet.spreadsheetId,
    spreadsheetUrl: sheet.spreadsheetUrl,
    sheetTitle: sheet.sheetTitle,
    codeId,
    label,
    rowsWritten,
    cursor,
    truncated,
    createdAt: new Date().toISOString(),
  };
  await patchSettings(connection.id, connection.metadata, {
    lastExport: { ...result, organizationId: scope.organizationId },
  });
  return result;
}

/** New spreadsheet with one page's form responses, one column per question. */
export async function exportResponsesToSheet(
  scope: ActiveScope,
  pageId: string,
): Promise<{ spreadsheetUrl: string; rows: number; truncated: boolean }> {
  if (!dataCallsAllowed()) throw devDisabled();
  const connection = await requireConnection(scope.userId, "google-sheets");
  const page = await getInboxPage(scope, pageId);
  const responses = await loadResponses(scope, {
    pageIds: [page.id],
    cursor: null,
    limit: MAX_EXPORT_ROWS,
  });
  const table = responsesTable(
    responses,
    page.forms.map((form) => ({
      id: form.id,
      title: form.title,
      fields: form.fields.map((field) => ({
        id: field.id,
        label: field.label,
      })),
    })),
  );
  const client = createGoogleSheetsClient(connection.accessToken);
  const sheet = await client.createSpreadsheet({
    title: `QRdx responses · ${page.title?.trim() || "Page"} · ${dateStamp()}`,
    sheetTitle: RESPONSES_SHEET_TITLE,
    header: table.header,
  });
  if (table.rows.length > 0) {
    await client.appendRows(
      sheet.spreadsheetId,
      sheetRange(sheet.sheetTitle, "A:A"),
      table.rows,
    );
  }
  return {
    spreadsheetUrl: sheet.spreadsheetUrl,
    rows: table.rows.length,
    truncated: responses.length >= MAX_EXPORT_ROWS,
  };
}

/** Turns "keep in sync" on for the last scan export, or off. */
export async function setSheetSync(
  scope: ActiveScope,
  enabled: boolean,
): Promise<void> {
  const connection = await requireConnection(scope.userId, "google-sheets");
  const metadata = connection.metadata ?? {};
  const current = readSyncState(metadata.sync);
  if (!enabled) {
    if (current) {
      await patchSettings(connection.id, metadata, {}, { sync: OFF });
    }
    return;
  }
  const lastExport = (
    metadata.settings as
      | { lastExport?: SheetExport & { organizationId: string | null } }
      | undefined
  )?.lastExport;
  if (!lastExport) {
    throw new HttpError(400, "NO_EXPORT", "Export scans to a sheet first.");
  }
  if (lastExport.organizationId !== scope.organizationId) {
    throw new HttpError(
      409,
      "OTHER_WORKSPACE",
      "That sheet belongs to another workspace. Switch to it, or export again here.",
    );
  }
  const target: SheetSyncTarget = {
    spreadsheetId: lastExport.spreadsheetId,
    spreadsheetUrl: lastExport.spreadsheetUrl,
    sheetTitle: lastExport.sheetTitle,
    codeId: lastExport.codeId,
    rowsWritten: lastExport.rowsWritten,
  };
  const sameTarget =
    readSheetTarget(metadata)?.spreadsheetId === target.spreadsheetId;
  const sync =
    current && sameTarget
      ? resumeSyncState(current)
      : initialSyncState(
          scope.organizationId,
          new Date(lastExport.createdAt),
          lastExport.cursor,
        );
  await patchSettings(
    connection.id,
    metadata,
    {
      syncTarget: sameTarget ? readSheetTarget(metadata) : target,
      syncLabel: lastExport.label,
    },
    { sync },
  );
  void runIntegrationSyncs({
    integrationIds: [connection.id],
    budgetMs: 10_000,
  });
}

export interface ResponseSinkInput {
  enabled: boolean;
  pageIds: string[] | null;
  forms: Record<string, FormMapping>;
  /** Mailchimp only */
  audienceId?: string;
  tags?: string[];
  withoutConsent?: "pending" | "skip";
  /** Pipedrive only: also add a lead for every response */
  createLead?: boolean;
}

/**
 * Saves HubSpot / Mailchimp / Pipedrive / Zoho CRM settings and turns the
 * stream on or off.
 */
export async function saveResponseSink(
  scope: ActiveScope,
  provider: "hubspot" | "mailchimp" | "pipedrive" | "zoho-crm",
  input: ResponseSinkInput,
): Promise<void> {
  const connection = await requireConnection(scope.userId, provider);
  const metadata = connection.metadata ?? {};
  const pageIds = input.pageIds
    ? await scopedPageIds(scope, input.pageIds)
    : null;
  const patch: Record<string, unknown> = { pageIds, forms: input.forms };
  if (provider === "mailchimp") {
    if (!input.audienceId) {
      throw new HttpError(400, "VALIDATION_ERROR", "Pick an audience.");
    }
    patch.audienceId = input.audienceId;
    patch.tags = input.tags ?? [];
    patch.withoutConsent = input.withoutConsent ?? "pending";
    if (dataCallsAllowed()) {
      const client = createMailchimpClient(
        connection.accessToken,
        String(metadata.dc ?? ""),
      );
      // Merge fields are cached so the worker maps without an extra call.
      patch.mergeFields = await client.listMergeFields(input.audienceId);
    }
  }
  if (provider === "pipedrive") patch.createLead = input.createLead === true;
  const sync = stateOnSave(
    readSyncState(metadata.sync),
    input.enabled,
    scope.organizationId,
  );
  await patchSettings(connection.id, metadata, patch, sync ? { sync } : {});
}

/**
 * A stream's state after its on switch is saved in a workspace, OFF when
 * it's turned off, or undefined when it doesn't change (the worker owns
 * it). Turning it on in another workspace than before starts it afresh from
 * now.
 */
function stateOnSave(
  current: SyncState | null,
  enabled: boolean,
  organizationId: string | null,
): SyncState | typeof OFF | undefined {
  if (enabled) {
    if (!(current && current.organizationId === organizationId)) {
      return initialSyncState(organizationId);
    }
    if (
      !current.enabled ||
      current.status === "failed" ||
      current.status === "paused"
    ) {
      return resumeSyncState(current);
    }
    return;
  }
  if (current?.enabled) return OFF;
}

export interface SegmentSinkInput {
  region: SegmentRegion;
  scans: { enabled: boolean; event: string };
  responses: { enabled: boolean; event: string };
}

/** Saves Segment's region and event names and turns each stream on or off. */
export async function saveSegmentSink(
  scope: ActiveScope,
  input: SegmentSinkInput,
): Promise<void> {
  const connection = await requireConnection(scope.userId, "segment");
  const metadata = connection.metadata ?? {};
  const scanEvent = normalizeSegmentEventName(input.scans.event);
  const responseEvent = normalizeSegmentEventName(input.responses.event);
  if (!(scanEvent && responseEvent)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Give each event a name of up to 200 characters.",
    );
  }
  const states: Partial<Record<SyncStateKey, SyncState | typeof OFF>> = {};
  for (const slot of SINK_STREAMS.segment) {
    const next = stateOnSave(
      readSyncState(metadata[slot.key]),
      input[slot.stream].enabled,
      scope.organizationId,
    );
    if (next) states[slot.key] = next;
  }
  await patchSettings(
    connection.id,
    metadata,
    { region: input.region, scanEvent, responseEvent },
    states,
  );
}

/**
 * "Send a test event": one Track call to the source, so the person can find
 * it in Segment's Debugger (Segment accepts any write key, so this is how a
 * wrong key or region shows). `region` is the one picked in the panel, which
 * may not be saved yet.
 */
export async function sendSegmentTest(
  userId: string,
  region?: SegmentRegion,
): Promise<void> {
  if (!dataCallsAllowed()) throw devDisabled();
  const connection = await requireConnection(userId, "segment");
  const saved = readSegmentSettings(connection.metadata?.settings);
  await sendSegmentTestEvent(
    createSegmentClient(connection.accessToken, region ?? saved.region),
    crypto.randomUUID(),
  );
}

/**
 * "Retry now": clears a failed stream and runs it. `stream` picks one of a
 * provider's streams (Segment has two); by default its first.
 */
export async function retrySync(
  userId: string,
  provider: string,
  stream?: SinkStream,
) {
  const connection = await requireConnection(userId, provider);
  const slot = isSinkProvider(provider)
    ? stream
      ? sinkStreamSlot(provider, stream)
      : SINK_STREAMS[provider][0]
    : undefined;
  const state = slot ? readSyncState(connection.metadata?.[slot.key]) : null;
  if (!(slot && state)) {
    throw new HttpError(400, "NOT_ENABLED", "The sync isn't on.");
  }
  await writeSyncState(
    connection.id,
    resumeSyncState(state),
    undefined,
    slot.key,
  );
  invalidateStreamIndex();
  return runIntegrationSyncs({
    integrationIds: [connection.id],
    stream: slot.stream,
    budgetMs: 20_000,
  });
}

export async function listMailchimpAudiences(
  userId: string,
): Promise<MailchimpAudience[]> {
  if (!dataCallsAllowed()) throw devDisabled();
  const connection = await requireConnection(userId, "mailchimp");
  const client = createMailchimpClient(
    connection.accessToken,
    String(connection.metadata?.dc ?? ""),
  );
  return (await client.listAudiences({ count: 100 })).audiences;
}

export async function listMailchimpMergeFields(
  userId: string,
  audienceId: string,
): Promise<MailchimpMergeField[]> {
  if (!dataCallsAllowed()) throw devDisabled();
  const connection = await requireConnection(userId, "mailchimp");
  const client = createMailchimpClient(
    connection.accessToken,
    String(connection.metadata?.dc ?? ""),
  );
  return client.listMergeFields(audienceId);
}

export interface SinkView {
  sync: SyncState | null;
  /** Each stream's state, for a provider with more than one (Segment) */
  streams?: Partial<Record<SinkStream, SyncState | null>>;
  settings: Record<string, unknown>;
  /** The first page of form pages, most recently updated first */
  pages: ScopedFormPage[];
  /** Where the next page of `pages` starts; null when that's all */
  pagesCursor: string | null;
  /** The pages the sync is limited to (settings.pageIds), wherever they sit in the list */
  selectedPages: ScopedFormPage[];
  workspaceId: string | null;
}

/** What the settings panel needs (no tokens). */
export async function getSinkView(
  scope: ActiveScope,
  provider: string,
): Promise<SinkView | null> {
  const [row] = await db
    .select({ metadata: integration.metadata, status: integration.status })
    .from(integration)
    .where(
      and(
        eq(integration.userId, scope.userId),
        eq(integration.provider, provider),
      ),
    )
    .limit(1);
  if (!row) return null;
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const settings = (metadata.settings as Record<string, unknown>) ?? {};
  const pageIds = Array.isArray(settings.pageIds)
    ? settings.pageIds.filter((id): id is string => typeof id === "string")
    : [];
  // Sheets exports scans and Segment sends every page: no page list.
  const [first, selectedPages] =
    provider === "google-sheets" || provider === "segment"
      ? [{ items: [], nextCursor: null }, []]
      : await Promise.all([
          listFormPages(scope),
          formPagesByIds(scope, pageIds),
        ]);
  const slots = isSinkProvider(provider) ? SINK_STREAMS[provider] : [];
  return {
    sync: readSyncState(metadata.sync),
    ...(slots.length > 1 && {
      streams: Object.fromEntries(
        slots.map((slot) => [slot.stream, readSyncState(metadata[slot.key])]),
      ),
    }),
    settings,
    pages: first.items,
    pagesCursor: first.nextCursor,
    selectedPages,
    workspaceId: scope.organizationId,
  };
}

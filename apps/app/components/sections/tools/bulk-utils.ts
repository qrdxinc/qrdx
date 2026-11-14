import {
  CANONICAL_ORIGIN,
  MAX_BULK_TOOL_ROWS,
  MAX_BULK_TOOL_ROWS_SIGNED_OUT,
} from "@repo/config";

/** Rows in one file (@repo/config limits.ts, where the reasoning is). */
export const MAX_BULK_ROWS = MAX_BULK_TOOL_ROWS;
/** Rows in one file without an account; more asks for a free one. */
export const MAX_SIGNED_OUT_ROWS = MAX_BULK_TOOL_ROWS_SIGNED_OUT;
export const MAX_CSV_BYTES = 10 * 1024 * 1024;

/** A file this long needs a free account first (signed-in files skip it). */
export function needsAccount(rowCount: number, signedIn: boolean): boolean {
  return !signedIn && rowCount > MAX_SIGNED_OUT_ROWS;
}

// ── Keeping the file through a sign-in ─────────────────────────────────────
// An email code signs in without leaving the page, so the parsed file just
// stays in memory. Google and GitHub leave and come back, which loses it,
// so the rows wait in this tab's sessionStorage: on this device only,
// never uploaded, gone with the tab, and taken (removed) as soon as the
// page reads them back. A file too big for storage leaves a marker, so the
// page can say why it's gone.

const STASH_KEY = "qrdx:bulk-file";
/** Long enough for any sign-in; an older file isn't brought back. */
export const BULK_STASH_MAX_AGE_MS = 30 * 60_000;

export interface BulkFile {
  name: string;
  rows: string[][];
  hasHeader: boolean;
}

type StashStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function tabStorage(): StashStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Keeps the file for the sign-in's round trip. */
export function stashBulkFile(
  file: BulkFile,
  now: number = Date.now(),
  storage: StashStorage | null = tabStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STASH_KEY, JSON.stringify({ ...file, at: now }));
  } catch {
    try {
      storage.setItem(STASH_KEY, JSON.stringify({ lost: true, at: now }));
    } catch {
      // Nothing can be kept; the page just starts empty.
    }
  }
}

export function clearBulkStash(
  storage: StashStorage | null = tabStorage(),
): void {
  try {
    storage?.removeItem(STASH_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * The file kept for a sign-in, once (it's removed as it's read): the file,
 * "lost" when it was too big to keep, or null.
 */
export function takeBulkStash(
  now: number = Date.now(),
  storage: StashStorage | null = tabStorage(),
): BulkFile | "lost" | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(STASH_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  clearBulkStash(storage);
  try {
    const stash = JSON.parse(raw) as Partial<BulkFile> & {
      at?: unknown;
      lost?: unknown;
    };
    if (
      typeof stash.at !== "number" ||
      stash.at > now ||
      now - stash.at > BULK_STASH_MAX_AGE_MS
    ) {
      return null;
    }
    if (stash.lost === true) return "lost";
    const rows = stash.rows;
    if (
      !Array.isArray(rows) ||
      !rows.every(
        (row) =>
          Array.isArray(row) && row.every((cell) => typeof cell === "string"),
      )
    ) {
      return null;
    }
    return {
      name: typeof stash.name === "string" ? stash.name : "",
      rows,
      hasHeader: stash.hasHeader !== false,
    };
  } catch {
    return null;
  }
}

export interface CsvTable {
  columns: string[];
  rows: string[][];
  /** True when the file had more than MAX_BULK_ROWS data rows. */
  truncated: boolean;
}

/** Turns raw CSV cells into named columns and capped data rows. */
export function toTable(data: string[][], hasHeader: boolean): CsvTable {
  const width = data.reduce((max, row) => Math.max(max, row.length), 0);
  const header = hasHeader ? (data[0] ?? []) : [];
  const body = hasHeader ? data.slice(1) : data;

  return {
    columns: Array.from(
      { length: width },
      (_, i) => header[i]?.replace(/^﻿/, "").trim() || `Column ${i + 1}`,
    ),
    rows: body.slice(0, MAX_BULK_ROWS),
    truncated: body.length > MAX_BULK_ROWS,
  };
}

const VALUE_COLUMN = /^(value|url|link|data|content|text|qr|qr ?code)$/i;
const FILENAME_COLUMN = /^(file ?name|name|label|id|title|sku)$/i;

export function guessValueColumn(columns: string[]): number {
  const index = columns.findIndex((name) => VALUE_COLUMN.test(name));
  return index === -1 ? 0 : index;
}

export function guessFilenameColumn(
  columns: string[],
  valueColumn: number,
): number {
  return columns.findIndex(
    (name, i) => i !== valueColumn && FILENAME_COLUMN.test(name),
  );
}

/** Keeps names portable across Windows, macOS and Linux zip tools. */
export function sanitizeFilename(raw: string): string {
  return (
    raw
      .normalize("NFKC")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[.\-\s]+|[.\s]+$/g, "")
      .slice(0, 100)
  );
}

/** Returns a function that hands out unique (case-insensitive) file names. */
export function createFilenameAllocator() {
  const used = new Set<string>();
  const next = new Map<string, number>();

  return (base: string, extension: string): string => {
    const key = base.toLowerCase();
    let n = next.get(key) ?? 1;
    let candidate =
      n === 1 ? `${base}.${extension}` : `${base}-${n}.${extension}`;
    while (used.has(candidate.toLowerCase())) {
      n++;
      candidate = `${base}-${n}.${extension}`;
    }
    next.set(key, n + 1);
    used.add(candidate.toLowerCase());
    return candidate;
  };
}

/** Decodes the data URLs qrdx returns (base64 PNG or URI-encoded SVG). */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);

  if (meta.endsWith(";base64")) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(data));
}

/** Loads an image once so each generated code embeds it without refetching. */
export async function imageToDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  const response = await fetch(src, { mode: "cors" });
  if (!response.ok) throw new Error(`Logo request failed (${response.status})`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export const SAMPLE_CSV_ROWS = [
  { value: CANONICAL_ORIGIN, filename: "qrdx-home" },
  { value: `${CANONICAL_ORIGIN}/pricing`, filename: "pricing" },
  {
    value: "WIFI:T:WPA;S:Office Guest;P:welcome123;H:false;;",
    filename: "office-wifi",
  },
  { value: "mailto:hello@example.com", filename: "email-us" },
  { value: "tel:+14155550132", filename: "call-us" },
];

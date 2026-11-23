import { execSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { environment, LocalStorage } from "@raycast/api";
import {
  artworkSize,
  buildQRProps,
  buildSVGString,
  type QRRenderProps,
  squareSVG,
} from "./qr-engine";
import { DEFAULT_SETTINGS, type Settings } from "./types";

const STORAGE_KEY = "saved-qrs-v1";
const PREVIEW_SIZE = 256;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedQR {
  id: string;
  name: string;
  url: string;
  settings: Settings;
  savedAt: number;
}

// ─── Preview PNG ──────────────────────────────────────────────────────────────

function previewDir(): string {
  const dir = join(environment.supportPath, "saved-previews");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function savedPreviewPath(id: string): string {
  return join(previewDir(), `${id}.png`);
}

/** Draws a saved code's list icon: the code with any frame, on a square. */
export function generateSavedPreview(id: string, qrProps: QRRenderProps): void {
  const dir = previewDir();
  const svgPath = join(dir, `${id}.svg`);
  const pngPath = join(dir, `${id}.png`);
  const svgString = squareSVG(
    buildSVGString(qrProps),
    artworkSize(qrProps),
    PREVIEW_SIZE
  );
  writeFileSync(
    svgPath,
    `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`,
    "utf-8"
  );
  try {
    execSync(
      `sips -s format png "${svgPath}" --out "${pngPath}" --resampleHeightWidth ${PREVIEW_SIZE} ${PREVIEW_SIZE} 2>/dev/null`,
      { stdio: "pipe" }
    );
  } finally {
    try {
      unlinkSync(svgPath);
    } catch {
      /* ignore */
    }
  }
}

export function deleteSavedPreview(id: string): void {
  const pngPath = savedPreviewPath(id);
  try {
    if (existsSync(pngPath)) unlinkSync(pngPath);
  } catch {
    /* ignore */
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/** The saved codes as stored. */
async function readList(): Promise<SavedQR[]> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedQR[];
  } catch {
    return [];
  }
}

export async function loadSavedQRs(): Promise<SavedQR[]> {
  // Codes saved before frames have no frame settings: they're read with the
  // defaults (no frame) and keep their template, which still draws. What's
  // stored changes only when the code itself is saved again.
  return (await readList()).map((saved) => ({
    ...saved,
    settings: { ...DEFAULT_SETTINGS, ...saved.settings },
  }));
}

async function persist(list: SavedQR[]): Promise<void> {
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export async function saveQR(entry: SavedQR): Promise<void> {
  const list = await readList();
  const existing = list.findIndex((q) => q.id === entry.id);
  if (existing >= 0) {
    list[existing] = entry;
  } else {
    list.unshift(entry);
  }
  await persist(list);
}

export async function deleteQR(id: string): Promise<void> {
  const list = await readList();
  await persist(list.filter((q) => q.id !== id));
  deleteSavedPreview(id);
}

// ─── Build QRProps from saved entry ──────────────────────────────────────────

export function savedToQRProps(saved: SavedQR): QRRenderProps {
  return buildQRProps(saved.url, saved.settings);
}

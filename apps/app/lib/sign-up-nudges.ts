// Quiet sign-up lines for signed-out visitors, at moments they already want
// something (components/sign-up-nudge.tsx): after a download, on a return
// visit whose design came back from this browser, after a bulk run. Each
// can be waved off for good in this browser (localStorage). When storage is
// blocked the line still shows, and waving it off lasts until a reload.
// Client-safe; every read and write is wrapped, so private windows and
// blocked storage never break the page.

export const SIGN_UP_NUDGES = [
  "after_download",
  "keep_designs",
  "bulk_done",
] as const;

export type SignUpNudge = (typeof SIGN_UP_NUDGES)[number];

const DISMISSED_KEY = "qrdx:sign-up-nudges";
/** Nudges shown in this tab already (sessionStorage): once per visit is enough. */
const SHOWN_KEY = "qrdx:sign-up-nudges-shown";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function browserStorage(kind: "local" | "session"): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readSet(storage: StorageLike | null, key: string): Set<string> {
  try {
    const raw = storage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function addToSet(storage: StorageLike | null, key: string, id: string) {
  const ids = readSet(storage, key);
  ids.add(id);
  try {
    storage?.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Blocked or full: it just isn't remembered.
  }
}

// Kept for this page load too, for browsers that refuse storage.
const dismissedHere = new Set<string>();
const shownHere = new Set<string>();

export function isNudgeDismissed(
  id: SignUpNudge,
  storage: StorageLike | null = browserStorage("local"),
): boolean {
  return dismissedHere.has(id) || readSet(storage, DISMISSED_KEY).has(id);
}

/** Waves the line off for good in this browser. */
export function dismissNudge(
  id: SignUpNudge,
  storage: StorageLike | null = browserStorage("local"),
): void {
  dismissedHere.add(id);
  addToSet(storage, DISMISSED_KEY, id);
}

/** The line appeared in this tab already (it shows once per visit). */
export function wasNudgeShown(
  id: SignUpNudge,
  storage: StorageLike | null = browserStorage("session"),
): boolean {
  return shownHere.has(id) || readSet(storage, SHOWN_KEY).has(id);
}

export function markNudgeShown(
  id: SignUpNudge,
  storage: StorageLike | null = browserStorage("session"),
): void {
  shownHere.add(id);
  addToSet(storage, SHOWN_KEY, id);
}

// ── Returning visitors ─────────────────────────────────────────────────────
// The editor keeps the last design in this browser (store/editor-store.ts,
// "editor-storage"). A visit that starts with one there is a return visit:
// the design came back on its own. Worked out once per tab, before the
// store loads, and kept in sessionStorage so a reload in the same visit
// doesn't turn a first visit into a "return".

/** The editor store's localStorage key (zustand persist). */
export const EDITOR_STORAGE_KEY = "editor-storage";
const VISIT_KEY = "qrdx:editor-visit";

/**
 * Whether a persisted editor state holds a design someone made: a code's
 * content, an edit (undo history) or a preset other than the default.
 */
export function hasStoredDesign(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const state = parsed?.state;
    if (!state || typeof state !== "object") return false;
    if (typeof state.value === "string" && state.value.trim()) return true;
    if (Array.isArray(state.history) && state.history.length > 0) return true;
    const preset = (state.themeState as { preset?: unknown } | undefined)
      ?.preset;
    return typeof preset === "string" && preset !== "" && preset !== "default";
  } catch {
    return false;
  }
}

let visitStartedWithDesign: boolean | null = null;

/**
 * Notes, once per tab, whether this visit started with a stored design.
 * Call it before the editor store reads its storage (editor-store.ts does).
 */
export function noteEditorVisitStart(
  local: Pick<Storage, "getItem"> | null = browserStorage("local"),
  session: StorageLike | null = browserStorage("session"),
): boolean {
  if (visitStartedWithDesign !== null) return visitStartedWithDesign;
  // On the server there's no visit to note (nothing is cached there).
  if (!(local || session)) return false;
  let noted: string | null = null;
  try {
    noted = session?.getItem(VISIT_KEY) ?? null;
  } catch {
    noted = null;
  }
  if (noted === "restored" || noted === "fresh") {
    visitStartedWithDesign = noted === "restored";
    return visitStartedWithDesign;
  }
  let raw: string | null = null;
  try {
    raw = local?.getItem(EDITOR_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  visitStartedWithDesign = hasStoredDesign(raw);
  try {
    session?.setItem(VISIT_KEY, visitStartedWithDesign ? "restored" : "fresh");
  } catch {
    // Kept for this page load only.
  }
  return visitStartedWithDesign;
}

/** This visit's editor opened on a design kept from an earlier one. */
export function designRestoredThisVisit(): boolean {
  return visitStartedWithDesign ?? noteEditorVisitStart();
}

/** Test hook. */
export function __resetSignUpNudgesForTests() {
  dismissedHere.clear();
  shownHere.clear();
  visitStartedWithDesign = null;
}

// Picking "Dynamic" while signed out asks for sign-in and stores this intent
// as the post-login action (store/auth-store persists it across the OAuth
// redirect; the editor store keeps the design and content). After sign-in the
// URL form makes the code dynamic, but only for the same destination and only
// soon after the pick, so an abandoned sign-in never creates a code later.

/** Data of the "MAKE_DYNAMIC" post-login action. */
export interface MakeDynamicIntent {
  /** The normalized destination the visitor picked Dynamic for. */
  destination: string;
  /** When they picked it (ms since epoch). */
  at: number;
}

/** How long a pick stays good: long enough for any sign-in, OAuth included. */
export const MAKE_DYNAMIC_MAX_AGE_MS = 30 * 60 * 1000;

export function makeDynamicIntent(
  destination: string,
  now: number = Date.now(),
): MakeDynamicIntent {
  return { destination, at: now };
}

const RESUMED_KEY = "qrdx:make-dynamic-resumed";

/**
 * Marks a pick as run in this tab and says whether this is the first time.
 * A page restored from the back-forward cache after the sign-in round trip
 * still holds the pick in memory and would make a second code; the mark is
 * in sessionStorage, which the tab keeps across those navigations. Without
 * sessionStorage (private modes that block it) the pick runs.
 */
export function claimDynamicResume(
  intent: MakeDynamicIntent,
  storage: Pick<Storage, "getItem" | "setItem"> | null = sessionStorageOrNull(),
): boolean {
  if (!storage) return true;
  try {
    const done = storage.getItem(RESUMED_KEY)?.split(",") ?? [];
    const key = String(intent.at);
    if (done.includes(key)) return false;
    storage.setItem(RESUMED_KEY, [...done.slice(-9), key].join(","));
    return true;
  } catch {
    return true;
  }
}

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** What asking for sign-in needs: store/auth-store's openAuthDialog. */
type OpenAuthDialog = (
  reason: "make_dynamic",
  options: { action: "MAKE_DYNAMIC"; data: MakeDynamicIntent },
) => void;

/**
 * Signed out, "Dynamic" or "Create dynamic code" asks for sign-up with the
 * pick as the post-login action; the URL form makes the code right after.
 */
export function signInToMakeDynamic(
  openAuthDialog: OpenAuthDialog,
  destination: string,
  now: number = Date.now(),
): void {
  openAuthDialog("make_dynamic", {
    action: "MAKE_DYNAMIC",
    data: makeDynamicIntent(destination, now),
  });
}

/**
 * True when a stored intent should run now: it is well formed, recent, and
 * the editor still holds the destination it was made for.
 */
export function shouldResumeDynamic(
  intent: unknown,
  currentDestination: string | null,
  now: number = Date.now(),
): intent is MakeDynamicIntent {
  if (!intent || typeof intent !== "object") return false;
  const { destination, at } = intent as Partial<MakeDynamicIntent>;
  if (typeof destination !== "string" || typeof at !== "number") return false;
  if (!Number.isFinite(at) || at > now) return false;
  if (now - at > MAKE_DYNAMIC_MAX_AGE_MS) return false;
  return currentDestination !== null && destination === currentDestination;
}

// The shape of a capture job (jobs.ts) and of the manifest the pipeline
// writes (lib/shots-manifest.json, read by lib/shots.ts).

/** A box in CSS pixels of the page, as getBoundingClientRect() reports it. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The element's corner radius in CSS pixels, when measured from an element. */
  radius?: number;
}

export type Theme = "light" | "dark";

/**
 * The browser the steps drive: the page driver from apps/app/e2e/cdp.mjs,
 * plus the helpers in browser.ts. Steps find elements the way a person does
 * (role, label, visible text), never by CSS class.
 */
export interface Driver {
  /** Opens a route of the app and waits for it to settle. */
  open(route: string, options?: { wait?: number }): Promise<void>;
  /** Clicks the element with this role and accessible name; `within` narrows to a CSS selector ("main") or an open dialog's name. */
  click(
    role: string,
    name: string,
    options?: { exact?: boolean; within?: string },
  ): Promise<void>;
  /** Clicks the element whose visible text is exactly this. */
  clickText(text: string): Promise<void>;
  /** A real pointer click at the centre of the element the finder returns (menus, selects). */
  pointerClick(find: string, name: string): Promise<void>;
  /** Types into the field with this label (or aria-label). */
  fill(label: string, value: string): Promise<void>;
  /** Types the characters one by one into the focused element. */
  type(text: string): Promise<void>;
  /** Presses one key, such as "Escape" or "Enter". */
  press(key: string): Promise<void>;
  /** Waits until the page text contains `text`. */
  waitText(text: string, timeout?: number): Promise<void>;
  /** Waits until `fn` (evaluated in the page) returns a truthy value. */
  waitFor(fn: string, timeout?: number): Promise<void>;
  /** Waits this long (animations and data loads). */
  pause(ms: number): Promise<void>;
  /** Waits until nothing on the page says it is still loading or checking. */
  waitQuiet(timeout?: number): Promise<void>;
  /** Runs `fn` (a function source) in the page and returns its JSON result. */
  evaluate<T = unknown>(fn: string, ...args: unknown[]): Promise<T>;
  /** Moves the mouse over the element (hover states). */
  hover(role: string, name: string): Promise<void>;
  /** Scrolls so the element is in view, at the top of the viewport when possible. */
  scrollTo(role: string, name: string): Promise<void>;
  /** Scrolls the window to this offset. */
  scrollWindow(y: number): Promise<void>;
  /** The box of the first element the finder returns. */
  box(find: string, name: string): Promise<Box>;
  /** Dismisses the cookie banner if it is showing. */
  rejectCookies(): Promise<void>;
  /** The app's origin ("http://localhost:3103"). */
  readonly baseUrl: string;
  /** The seeded workspace's dashboard prefix ("/dashboard/harbor-lane-coffee"). */
  readonly ws: string;
}

/** Where the picture comes from. */
export type Capture =
  /** The whole viewport (the default). */
  | { kind: "viewport" }
  /** One element, found by role (or "text", "label", "css") and name, with room around it (`below` adds more under it: a heading and its card). */
  | {
      kind: "element";
      find: string;
      name: string;
      margin?: number;
      below?: number;
    }
  /** A fixed box in CSS pixels. */
  | { kind: "box"; box: Box };

export interface JobBase {
  /** Kebab-case; also the file name and the id in <Shot id="…" />. */
  id: string;
  /** What it shows, one line, for the manifest and the review list. */
  title: string;
  /** The alt text readers of the docs get. */
  alt: string;
  /** Docs pages that use it (their URLs), so a change to a screen can be traced to pages. */
  pages: string[];
  /** The app route to open, relative to the app origin ("/playground"). `{ws}` is the workspace prefix. */
  route: string;
  /** Signed in as the seeded owner (default true). */
  signedIn?: boolean;
  /** CSS viewport; default 1440 × 900 (phone jobs pass 390 × 844). */
  viewport?: { width: number; height: number; mobile?: boolean };
  /** Reaches the state to capture. */
  steps?: (page: Driver) => Promise<void>;
  /**
   * The HTML of a page the job writes itself, opened instead of `route`
   * (the React library's samples, rendered by the real package: library.tsx).
   */
  document?: () => Promise<string>;
  /** Skip this job and say why (a feature the local deployment can't show). */
  skip?: string;
}

export interface ShotJob extends JobBase {
  kind: "shot";
  /**
   * "window": the captured region on a quiet backdrop with a soft shadow.
   * "focus": the element named by `focus` stays crisp while the rest of the
   * captured region is softly blurred and dimmed behind it.
   */
  look: "window" | "focus";
  /** What to capture; default the viewport. */
  capture?: Capture;
  /** The control or dialog the step is about (focus look). */
  focus?: { find: string; name: string; margin?: number };
}

export interface ClipJob extends JobBase {
  kind: "clip";
  /**
   * The motion to record, run while the screencast is on. `steps` runs
   * first (off camera) to reach the starting state.
   */
  record: (page: Driver) => Promise<void>;
  /** Seconds to keep recording after `record` resolves (so the result is seen). */
  tail?: number;
}

export type Job = ShotJob | ClipJob;

// ─── The manifest ───────────────────────────────────────────────────────────

export interface ShotEntry {
  kind: "shot";
  look: "window" | "focus";
  /** Public paths of the light and dark WebP files (same size). */
  light: string;
  dark: string;
  /** Intrinsic size in pixels. */
  width: number;
  height: number;
  alt: string;
  title: string;
  pages: string[];
  /** The job (jobs.ts) that produced it. */
  job: string;
}

export interface ClipEntry {
  kind: "clip";
  /** Public paths of the poster stills (the Window look of the first frame). */
  poster: { light: string; dark: string };
  /** Media keys (lib/media-manifest.json), resolved by lib/shots.ts. */
  sources: { webm: string; mp4: string };
  width: number;
  height: number;
  /** Rounded duration in seconds. */
  seconds: number;
  alt: string;
  title: string;
  pages: string[];
  job: string;
}

export type ManifestEntry = ShotEntry | ClipEntry;

export type ShotsManifest = Record<string, ManifestEntry>;

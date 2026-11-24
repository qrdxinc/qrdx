// The funnel's client-side steps as pure decisions (no React, no browser
// globals), used by the hooks in ./react.tsx: when an editor opening, a QR
// code or a barcode counts. Client-safe.

import type { AnalyticsEvents, EditorSurface } from "@repo/analytics/events";
import { cleanPath } from "@repo/analytics/landing";
import { handoffSource } from "@/lib/playground-links";
import { isUntrackedAnalyticsPath } from "./privacy";

/** A page an editor can be opened at, and how the tab got there. */
interface EditorPage {
  href: string;
  referrer: string;
  /** The tab's previous pathname (lib/navigation-history.ts), if any */
  previousPath: string | null;
}

/**
 * The page before this one: the previous page of this tab's visit (an
 * in-app link doesn't change document.referrer) unless it was a customer
 * page, else the document's referrer.
 */
function pageBefore(page: EditorPage, origin: string): string {
  return page.previousPath && !isUntrackedAnalyticsPath(page.previousPath)
    ? new URL(page.previousPath, origin).href
    : page.referrer;
}

/**
 * Where an editor was opened from (editor_opened's `source`): the link's
 * `ref` tag, else the page before (pageBefore). A name, never an address:
 * "direct", "external", a site section or a tag.
 */
export function editorOpenSource(page: EditorPage): string {
  const url = new URL(page.href);
  return handoffSource(
    pageBefore(page, url.origin),
    url.origin,
    url.searchParams.get("ref"),
  );
}

/**
 * Areas of this origin that aren't public pages: the signed-in app, sign-in
 * and the account flows, checkout's return and the API. Customer pages are
 * left out by isUntrackedAnalyticsPath.
 */
const NOT_PUBLIC =
  /^\/(?:admin|api|dashboard|settings|invite|join|oauth|sign-in|sign-up|sign-out|session-check|success)(?:\/|$)/;
/** As docs_feedback's path: sanitizeProps drops longer strings. */
const MAX_FROM_PAGE = 64;

/**
 * from_page: the path of the page before when it's one of this origin's
 * public pages ("/blog/qr-codes-for-menus"), cut to 64 characters; else
 * nothing. Never a query, a fragment, another site's address, a customer
 * page or the signed-in app's.
 */
export function fromPage(referrer: string, origin: string): string | undefined {
  if (!referrer) return;
  try {
    const before = new URL(referrer);
    if (before.origin !== origin) return;
    const path = cleanPath(before.pathname);
    if (!path || NOT_PUBLIC.test(path) || isUntrackedAnalyticsPath(path)) {
      return;
    }
    return path.slice(0, MAX_FROM_PAGE);
  } catch {
    return;
  }
}

/** editor_opened's properties for `surface`, opened at `page`. */
export function editorOpenedProps(
  surface: EditorSurface,
  page: EditorPage,
): AnalyticsEvents["editor_opened"] {
  const origin = new URL(page.href).origin;
  const from = fromPage(pageBefore(page, origin), origin);
  return {
    surface,
    source: editorOpenSource(page),
    ...(from && { from_page: from }),
  };
}

/**
 * playground_handoff's properties: where the link came from (`source`, as
 * handoffSource names it, and `from_page`) and the parameters it applied.
 */
export function playgroundHandoffProps(input: {
  /** The page before the playground (the tab's previous page or referrer) */
  referrer: string;
  origin: string;
  /** The link's `ref` tag, if any */
  ref: string | null;
  applied: readonly string[];
}): AnalyticsEvents["playground_handoff"] {
  const from = fromPage(input.referrer, input.origin);
  return {
    source: handoffSource(input.referrer, input.origin, input.ref),
    target: input.applied.join("+"),
    ...(from && { from_page: from }),
  };
}

/**
 * Whether content typed into a live editor counts as a generated code
 * (qr_generated): it isn't empty, isn't what the page opened with, isn't a
 * value QRdx put there itself (a dynamic code's short link), and this
 * content type hasn't counted yet in this visit.
 */
export function countsAsGenerated(input: {
  content: string | null | undefined;
  initial: string | null | undefined;
  contentType: string;
  counted: ReadonlySet<string>;
  programmatic: ReadonlySet<string>;
}): boolean {
  const { content } = input;
  if (!content?.trim() || content === input.initial) return false;
  if (input.programmatic.has(content)) return false;
  return !input.counted.has(input.contentType);
}

/**
 * Whether a barcode counts as generated (barcode_generated): it rendered,
 * its value or symbology isn't what the page opened with, and this
 * symbology hasn't counted yet in this visit.
 */
export function countsAsBarcode(input: {
  rendered: boolean;
  symbology: string;
  value: string;
  initial: { symbology: string; value: string };
  counted: ReadonlySet<string>;
}): boolean {
  if (!(input.rendered && input.value.trim())) return false;
  if (
    input.symbology === input.initial.symbology &&
    input.value === input.initial.value
  ) {
    return false;
  }
  return !input.counted.has(input.symbology);
}

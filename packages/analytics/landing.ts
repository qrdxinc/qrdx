// How the visit a sign-up happens in started: the referring site's host
// name, the link's campaign tags and `ref` tag, and the first page of the
// visit. Client-safe, no server imports. The main app (apps/app, which
// records it: lib/analytics/acquisition.ts) and the marketing site (another
// app on the same origin, which only carries it) both use this module.
//
// Same visit only, like an affiliate's code (apps/app
// lib/affiliates/referral-client.ts): it's read on the tab's first page and
// kept in a variable in this module, never in a cookie or browser storage,
// so a reload or a new tab starts over. The sign-in panel sends it with a
// sign-up (LANDING_HEADER for email codes, the OAuth state for Google and
// GitHub), and the server sanitises every field again before recording it
// with the new account. A browser sending Do Not Track or Global Privacy
// Control sends nothing.
//
// qrdx.dev's pages come from two apps, so a link from one to the other
// loads a new page, and a new page starts with an empty module. Such a link
// carries the visit in its address instead (VISIT_PARAM, added as it's
// followed: installVisitForwarding), and the page it opens reads it back
// and takes it out of the address bar (captureLanding). A page takes it
// only from a page of its own origin (the referrer), so a shared link can't
// plant one.
//
// A friend's invite code (apps/app lib/invites, `?invite=<code>`) travels the
// same way, in its own field: it's never a `ref`, so an affiliate's code and
// an invite never stand in for each other, and a visit can carry both.
//
// What it can't see: an earlier visit. Someone who found QRdx on Google and
// comes back tomorrow by typing the address signs up "direct".
import { hasPrivacySignal, safeString, sanitizePath } from "./privacy";

/** What travels with a sign-up, as sent and as stored (snake_case). */
export interface SignUpLanding {
  /** An external referrer's host name, never its full address */
  referrer_host?: string;
  /** The first page of the visit */
  landing_path?: string;
  /** The page the sign-in panel opened on */
  signup_path?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  /** A `ref` tag (lib/analytics/handoff-tags.ts, or a campaign's own) */
  ref?: string;
}

const MAX_PATH = 120;
const MAX_HOST = 253;
/** A campaign tag's length, as lib/analytics/privacy.ts allows. */
const MAX_TAG = 64;
/** The encoded header's ceiling: the fields' own caps keep it far below. */
const MAX_HEADER = 2048;

const HOST_NAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const REF_TAG = /^[a-z0-9][a-z0-9_-]{0,31}$/;
/** Printable ASCII only: a pathname as the browser percent-encodes it. */
const PATH = /^\/[\x21-\x7e]*$/;
/** Signed-in areas whose deeper segments can name a workspace or a person. */
const PRIVATE_AREA = /^\/(dashboard|settings|admin|invite|oauth)(?=\/|$)/;

/** A host name, lower-case, or null. */
export function cleanHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  return host.length <= MAX_HOST && HOST_NAME.test(host) ? host : null;
}

/**
 * A page path without its query or fragment, invite ids and signed-in
 * areas' deeper segments, at most 120 characters; or null.
 */
export function cleanPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.split(/[?#]/, 1)[0] ?? "";
  if (!PATH.test(path)) return null;
  const area = PRIVATE_AREA.exec(path);
  const safe = area ? `/${area[1]}` : sanitizePath(path);
  return safe.slice(0, MAX_PATH);
}

/**
 * A campaign tag: short and free of emails, URLs and phone numbers
 * (lib/analytics/privacy.ts), except that a bare host name is kept
 * (utm_source=chatgpt.com names a site, not a person).
 */
export function cleanUtm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const safe = safeString(value);
  if (safe) return safe;
  const trimmed = value.trim();
  return trimmed.length <= MAX_TAG && cleanHost(trimmed) ? trimmed : null;
}

/** A `ref` tag, lower-case, or null. */
export function cleanRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().toLowerCase();
  return REF_TAG.test(tag) ? tag : null;
}

/** The query parameter an invite link's code arrives in: /playground?invite=<code>. */
export const INVITE_PARAM = "invite";

/**
 * An invite code's shape (apps/app lib/invites makes them: 10 letters and
 * digits). Only the shape: whether it's someone's code is the server's
 * question.
 */
const INVITE_CODE = /^[a-z0-9]{10}$/;

/** An invite code, lower-case, or null. */
export function cleanInviteCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return INVITE_CODE.test(code) ? code : null;
}

/**
 * The checked copy of a landing object, from the browser or (again) on the
 * server: each field cleaned, unknown keys and bad values dropped. `ownHost`
 * (the site's host) is never a referrer. Null when `raw` isn't an object.
 */
export function cleanLanding(
  raw: unknown,
  ownHost?: string | null
): SignUpLanding | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const clean: SignUpLanding = {};
  const host = cleanHost(input.referrer_host);
  if (host && !(ownHost && isSameSite(host, ownHost))) {
    clean.referrer_host = host;
  }
  const landing = cleanPath(input.landing_path);
  if (landing) clean.landing_path = landing;
  const signup = cleanPath(input.signup_path);
  if (signup) clean.signup_path = signup;
  for (const key of ["utm_source", "utm_medium"] as const) {
    const tag = cleanUtm(input[key]);
    if (tag) clean[key] = tag.toLowerCase();
  }
  const campaign = cleanUtm(input.utm_campaign);
  if (campaign) clean.utm_campaign = campaign;
  const ref = cleanRef(input.ref);
  if (ref) clean.ref = ref;
  return clean;
}

/** `host` is `site` or one of its subdomains (api.qrdx.dev for qrdx.dev). */
function isSameSite(host: string, site: string): boolean {
  const own = site.toLowerCase().replace(/^www\./, "");
  const bare = host.replace(/^www\./, "");
  return bare === own || bare.endsWith(`.${own}`);
}

/** How the page at `href` was reached, read from its address and referrer. */
export function readLanding(page: {
  href: string;
  referrer: string;
}): SignUpLanding {
  const url = new URL(page.href);
  let referrerHost: string | null = null;
  try {
    referrerHost = page.referrer ? new URL(page.referrer).hostname : null;
  } catch {
    referrerHost = null;
  }
  const params = url.searchParams;
  return (
    cleanLanding(
      {
        referrer_host: referrerHost,
        landing_path: url.pathname,
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        ref: params.get("ref"),
      },
      url.hostname
    ) ?? {}
  );
}

// ── Across page loads ────────────────────────────────────────────────────────

/** The query parameter a link carries the visit in (JSON), as it's followed. */
export const VISIT_PARAM = "visit";

/**
 * Where a carried visit never goes: the APIs, the short links and the other
 * redirects (/q, /p, /r, /m, /gs1), customer and shared pages, sign-in
 * flows that leave the site (OAuth), sign-out, the docs (the affiliate
 * terms end the visit there), files, and the zones' assets.
 */
const NOT_CARRIED =
  /^\/(?:api|q|p|r|m|gs1|og|zone|portal|oauth|invite|join|stats|admin|docs|sign-out|success|sample-codes|_next|site-static|console-static)(?:\/|$)/;
const FILE_PATH = /\/[^/]*\.[^/]*$/;

/**
 * The visit a link brought to this page (VISIT_PARAM), cleaned, or null:
 * also null unless the page before was one of this origin's (an address
 * someone shared, opened from elsewhere, carries nothing).
 */
export function carriedVisit(page: {
  href: string;
  referrer: string;
}): SignUpLanding | null {
  const carried = carriedObject(page);
  if (!carried) return null;
  const { signup_path: _signup, ...start } =
    cleanLanding(carried.value, carried.host) ?? {};
  return start;
}

/**
 * The invite code a link carried to this page with the visit (VISIT_PARAM),
 * under the same rule as carriedVisit; null without one.
 */
export function carriedInvite(page: {
  href: string;
  referrer: string;
}): string | null {
  const carried = carriedObject(page);
  if (!carried) return null;
  return cleanInviteCode(
    (carried.value as Record<string, unknown> | null)?.invite
  );
}

/** VISIT_PARAM's JSON, when the page before was one of this origin's. */
function carriedObject(page: {
  href: string;
  referrer: string;
}): { value: unknown; host: string } | null {
  try {
    const url = new URL(page.href);
    const value = url.searchParams.get(VISIT_PARAM);
    if (!value || value.length > MAX_HEADER) return null;
    if (!page.referrer || new URL(page.referrer).origin !== url.origin) {
      return null;
    }
    return { value: JSON.parse(value), host: url.hostname };
  } catch {
    return null;
  }
}

/**
 * `href` as a link on `from` should load it: with the visit added when it
 * opens another page of the same origin that might be the other app's, and
 * unchanged otherwise (another site, the same page, a path in NOT_CARRIED,
 * a file, or nothing to carry).
 */
export function withVisit(href: string, from: string): string {
  const visit = visitToCarry();
  if (!visit) return href;
  try {
    const page = new URL(from);
    const url = new URL(href, page);
    if (
      url.origin !== page.origin ||
      NOT_CARRIED.test(url.pathname) ||
      FILE_PATH.test(url.pathname) ||
      url.searchParams.has(VISIT_PARAM) ||
      (url.pathname === page.pathname && url.search === page.search)
    ) {
      return href;
    }
    url.searchParams.set(VISIT_PARAM, visit);
    return url.href;
  } catch {
    return href;
  }
}

/**
 * What a link carries: the visit's start, or only its `ref` and invite code
 * under Do Not Track or Global Privacy Control.
 */
function visitToCarry(): string | null {
  captureLanding();
  const { signup_path: _signup, ...start } = captured ?? {};
  const visit: SignUpLanding & { invite?: string } = {
    ...start,
    ...(visitRefTag ? { ref: visitRefTag } : {}),
    ...(visitInviteCode ? { invite: visitInviteCode } : {}),
  };
  return Object.keys(visit).length > 0 ? JSON.stringify(visit) : null;
}

let forwarding = false;

/**
 * Carries the visit along every link that loads a new page: a click the
 * page didn't handle itself (next/link handles links within its own app,
 * and calls preventDefault), in this tab or a new one (the main button,
 * with Cmd, Ctrl or Shift held or on a link with target="_blank"; the
 * middle button, which fires auxclick). Not Alt, which saves the link. The
 * link's address is changed for that one click and put back straight
 * after. Once per page; nothing on the server.
 */
export function installVisitForwarding(): void {
  if (forwarding || typeof document === "undefined") return;
  forwarding = true;
  document.addEventListener("click", carryOnClick);
  document.addEventListener("auxclick", carryOnClick);
}

/** A tab or window the link may open in: this one, or a new one. */
const OPENS_PAGE = new Set(["", "_self", "_blank"]);

function carryOnClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.altKey) return;
  // The main button's click, or the middle button's auxclick: never a
  // right-click, whose menu could copy the link with the visit in it.
  const button = event.type === "auxclick" ? 1 : 0;
  if (event.button !== button) return;
  const target = event.target as Element | null;
  const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || typeof anchor.href !== "string") return;
  if (anchor.hasAttribute("download")) return;
  if (!OPENS_PAGE.has(anchor.target)) return;
  const original = anchor.getAttribute("href");
  const carried = withVisit(anchor.href, window.location.href);
  if (original === null || carried === anchor.href) return;
  // The browser reads the address as the click ends.
  anchor.setAttribute("href", carried);
  setTimeout(() => anchor.setAttribute("href", original), 0);
}

/** Takes VISIT_PARAM out of the address bar, once the page has read it. */
function dropVisitParam(): void {
  try {
    if (!new URL(window.location.href).searchParams.has(VISIT_PARAM)) return;
  } catch {
    return;
  }
  // After this render's effects: Next's router follows a replaceState made
  // once it has started (app-router.js patches it then), and would put its
  // own address back over an earlier one.
  setTimeout(() => {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(VISIT_PARAM)) return;
      url.searchParams.delete(VISIT_PARAM);
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}${url.hash}`
      );
    } catch {
      // The address keeps it; nothing reads it twice.
    }
  }, 0);
}

// ── This tab's visit ─────────────────────────────────────────────────────────

let captured: SignUpLanding | null = null;
/** The visit's `ref`, kept under Do Not Track too (see visitRef). */
let visitRefTag: string | null = null;
/** The visit's invite code, kept under Do Not Track too (see visitInvite). */
let visitInviteCode: string | null = null;
let read = false;

/**
 * Reads the tab's first page, once (later pages of the visit change
 * nothing), or the visit a link carried to it from another page of this
 * origin. Nothing but the `ref` under Do Not Track or Global Privacy
 * Control.
 */
export function captureLanding(): void {
  if (read || typeof window === "undefined") return;
  read = true;
  try {
    const page = { href: window.location.href, referrer: document.referrer };
    const carried = carriedVisit(page);
    const params = new URL(page.href).searchParams;
    visitRefTag = carried ? (carried.ref ?? null) : cleanRef(params.get("ref"));
    visitInviteCode = carried
      ? carriedInvite(page)
      : cleanInviteCode(params.get(INVITE_PARAM));
    captured = hasPrivacySignal() ? null : (carried ?? readLanding(page));
  } catch {
    captured = null;
    visitRefTag = null;
    visitInviteCode = null;
  }
  dropVisitParam();
}

/**
 * The `ref` the visit started with: a QRdx link's tag or an affiliate's
 * code, from its first page's address or carried here. The caller decides
 * what counts (apps/app lib/affiliates/referral-client.ts takes affiliate
 * codes only). Kept under Do Not Track or Global Privacy Control, as an
 * affiliate's code always was: it goes nowhere but with a sign-up.
 */
export function visitRef(): string | null {
  if (typeof window === "undefined") return null;
  captureLanding();
  return visitRefTag;
}

/**
 * The invite code the visit started with (INVITE_PARAM), from its first
 * page's address or carried here; null without one. Like visitRef, kept
 * under Do Not Track or Global Privacy Control: it goes nowhere but with a
 * sign-up (apps/app lib/invites/invite-client.ts).
 */
export function visitInvite(): string | null {
  if (typeof window === "undefined") return null;
  captureLanding();
  return visitInviteCode;
}

/**
 * What a sign-up from this page carries: the visit's start plus the page
 * the sign-in panel is on. Null under Do Not Track or Global Privacy
 * Control.
 */
export function signUpLanding(): SignUpLanding | null {
  if (typeof window === "undefined") return null;
  captureLanding();
  if (!captured) return null;
  const signup = cleanPath(window.location.pathname);
  return { ...captured, ...(signup ? { signup_path: signup } : {}) };
}

/** Forgets the visit and stops carrying it (tests). */
export function forgetLanding(): void {
  captured = null;
  visitRefTag = null;
  visitInviteCode = null;
  read = false;
  if (forwarding && typeof document !== "undefined") {
    document.removeEventListener("click", carryOnClick);
  }
  forwarding = false;
}

// ── On the wire ──────────────────────────────────────────────────────────────

/** The LANDING_HEADER value: URI-encoded JSON, so it's plain ASCII. */
export function encodeLandingHeader(landing: SignUpLanding): string {
  return encodeURIComponent(JSON.stringify(landing));
}

/** A LANDING_HEADER value read back and cleaned, or null. */
export function decodeLandingHeader(
  value: string | null | undefined,
  ownHost?: string | null
): SignUpLanding | null {
  if (!value || value.length > MAX_HEADER) return null;
  try {
    return cleanLanding(JSON.parse(decodeURIComponent(value)), ownHost);
  } catch {
    return null;
  }
}

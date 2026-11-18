import type { EmailIntl } from "@/lib/i18n/email";
import type { Translator } from "@/lib/i18n/translator";
import { parseUserAgent } from "@/lib/user-agent";

/**
 * Settings → Account → Sessions: what the page shows for each signed-in
 * device. Pure (dates passed in) so the wording is testable; rows come from
 * the session table, tokens never leave the server.
 */

export interface SessionRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export type SessionDevice = "desktop" | "mobile" | "tablet" | "other";

export interface SessionView {
  id: string;
  device: SessionDevice;
  /** "Chrome on macOS" */
  label: string;
  /** Masked network address, e.g. "203.0.113.*"; null for local or unknown */
  network: string | null;
  /** Approximate location (this device only, from the platform's geo headers) */
  location: string | null;
  /** "Active now", "Active 3 hours ago" */
  lastActive: string;
  /** "Signed in Nov 1, 2026" */
  signedIn: string;
  current: boolean;
}

export interface ApproximateLocation {
  city: string | null;
  country: string | null;
}

/**
 * The words around browser, system and place names, in one language. Browser
 * and system names stay as they are ("Chrome", "macOS"); country names come
 * from Intl in `locale`. English by default: the stolen-session check and
 * new passkeys' names keep the English label (./session-origin.ts,
 * ./passkeys.ts). Other languages: deviceWords() below.
 */
export interface DeviceWords {
  locale: string;
  /** "Chrome on macOS" */
  browserOnOs: (browser: string, os: string) => string;
  /** "Windows device" */
  osDevice: (os: string) => string;
  unknownDevice: string;
  /** "Berlin, Germany" */
  cityCountry: (city: string, country: string) => string;
}

export const ENGLISH_DEVICE_WORDS: DeviceWords = {
  locale: "en",
  browserOnOs: (browser, os) => `${browser} on ${os}`,
  osDevice: (os) => `${os} device`,
  unknownDevice: "Unknown device",
  cityCountry: (city, country) => `${city}, ${country}`,
};

/**
 * The device and place words from emails.security in `intl`'s language. The
 * security emails' details (lib/security/request-details.ts) and Settings →
 * Sessions both use them, so they name a device and a place alike.
 */
export function deviceWords({ locale, t }: EmailIntl): DeviceWords {
  return {
    locale,
    browserOnOs: (browser, os) => t("security.browserOnOs", { browser, os }),
    osDevice: (os) => t("security.osDevice", { os }),
    unknownDevice: t("security.unknownDevice"),
    cityCountry: (city, country) =>
      t("security.cityCountry", { city, country }),
  };
}

/** What a session's row says around the times, in one language. */
export interface SessionWords {
  device: DeviceWords;
  activeNow: string;
  activeJustNow: string;
  /** "Active 3 hours ago", with Intl's relative time in `device.locale` */
  activeAgo: (relative: string) => string;
  /** "Active on Nov 1, 2026" */
  activeOn: (date: string) => string;
  /** "Signed in Nov 1, 2026" */
  signedIn: (date: string) => string;
}

export const ENGLISH_SESSION_WORDS: SessionWords = {
  device: ENGLISH_DEVICE_WORDS,
  activeNow: "Active now",
  activeJustNow: "Active just now",
  activeAgo: (relative) => `Active ${relative}`,
  activeOn: (date) => `Active on ${date}`,
  signedIn: (date) => `Signed in ${date}`,
};

/** Settings → Sessions' words (app.settings.account.sessionsSection). */
export function sessionWords(
  t: Translator<"app.settings.account.sessionsSection">,
  device: DeviceWords,
): SessionWords {
  return {
    device,
    activeNow: t("activeNow"),
    activeJustNow: t("activeJustNow"),
    activeAgo: (relative) => t("activeAgo", { relative }),
    activeOn: (date) => t("activeOn", { date }),
    signedIn: (date) => t("signedIn", { date }),
  };
}

// One formatter per language; the page renders in one language at a time.
const formatters = new Map<
  string,
  {
    date: Intl.DateTimeFormat;
    relative: Intl.RelativeTimeFormat;
    countries: Intl.DisplayNames;
  }
>();
function formattersFor(locale: string) {
  let found = formatters.get(locale);
  if (!found) {
    found = {
      date: new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }),
      relative: new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
      countries: new Intl.DisplayNames(locale, { type: "region" }),
    };
    formatters.set(locale, found);
  }
  return found;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Elapsed =
  | { kind: "justNow" }
  | { kind: "ago"; relative: string }
  | { kind: "on"; date: string };

function elapsedSince(date: Date, now: Date, locale: string): Elapsed {
  const { relative, date: dates } = formattersFor(locale);
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  if (elapsed < MINUTE) return { kind: "justNow" };
  if (elapsed < HOUR) {
    return {
      kind: "ago",
      relative: relative.format(-Math.floor(elapsed / MINUTE), "minute"),
    };
  }
  if (elapsed < DAY) {
    return {
      kind: "ago",
      relative: relative.format(-Math.floor(elapsed / HOUR), "hour"),
    };
  }
  if (elapsed < 30 * DAY) {
    return {
      kind: "ago",
      relative: relative.format(-Math.floor(elapsed / DAY), "day"),
    };
  }
  return { kind: "on", date: dates.format(date) };
}

/** "just now", "5 minutes ago", "yesterday", "12 days ago", else a date. */
export function formatRelative(date: Date, now: Date): string {
  const elapsed = elapsedSince(date, now, "en");
  if (elapsed.kind === "justNow") return "just now";
  return elapsed.kind === "ago" ? elapsed.relative : `on ${elapsed.date}`;
}

/** "Active 3 hours ago", in the words' language. */
function lastActive(date: Date, now: Date, words: SessionWords): string {
  const elapsed = elapsedSince(date, now, words.device.locale);
  if (elapsed.kind === "justNow") return words.activeJustNow;
  return elapsed.kind === "ago"
    ? words.activeAgo(elapsed.relative)
    : words.activeOn(elapsed.date);
}

/** "Chrome on macOS", "Safari", "curl", or "Unknown device". */
export function describeUserAgent(
  userAgent: string | null,
  words: DeviceWords = ENGLISH_DEVICE_WORDS,
): {
  device: SessionDevice;
  label: string;
} {
  const ua = userAgent?.trim() ?? "";
  if (!ua) return { device: "other", label: words.unknownDevice };
  const { deviceType, os, browser } = parseUserAgent(ua);
  if (browser && os)
    return { device: deviceType, label: words.browserOnOs(browser, os) };
  if (browser) return { device: deviceType, label: browser };
  if (os) return { device: deviceType, label: words.osDevice(os) };
  // Scripts and API clients ("curl/8.7.1", "node"): their product name.
  const product = /^([A-Za-z][\w.-]{0,39})(?:\/|\s|$)/.exec(ua)?.[1];
  return { device: deviceType, label: product ?? words.unknownDevice };
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * The network part of an address: "203.0.113.*" or "2001:db8:85a3:*".
 * Loopback, unspecified and private addresses say nothing useful: null.
 */
export function maskIpAddress(address: string | null): string | null {
  const ip = address?.trim().toLowerCase() ?? "";
  if (!ip) return null;
  const mapped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const v4 = IPV4.exec(mapped);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    const local =
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
    return local ? null : `${v4[1]}.${v4[2]}.${v4[3]}.*`;
  }
  if (!mapped.includes(":")) return null;
  const groups = mapped.split(":");
  // All zeros (::, 0000:…:0000) or ::1
  if (groups.every((group) => /^0*$/.test(group) || group === "1")) return null;
  // fc00::/7 (unique local) and fe80::/10 (link local)
  if (/^f[cd]/.test(groups[0]) || /^fe[89ab]/.test(groups[0])) return null;
  const prefix = groups
    .slice(0, 3)
    .map((group) => group.replace(/^0+(?=.)/, "") || "0");
  return `${prefix.join(":")}:*`;
}

/** "Berlin, Germany" / "Germany" from platform geo headers, or null. */
export function formatLocation(
  location: ApproximateLocation | null,
  words: DeviceWords = ENGLISH_DEVICE_WORDS,
): string | null {
  if (!location) return null;
  let country: string | null = null;
  if (location.country) {
    try {
      country =
        formattersFor(words.locale).countries.of(location.country) ??
        location.country;
    } catch {
      country = location.country;
    }
  }
  const { city } = location;
  if (city && country) return words.cityCountry(city, country);
  return city || country || null;
}

/** Live sessions, this device first, then the most recently active. */
export function toSessionViews(
  rows: SessionRow[],
  {
    currentSessionId,
    now,
    currentLocation = null,
    words = ENGLISH_SESSION_WORDS,
  }: {
    currentSessionId: string | null;
    now: Date;
    currentLocation?: ApproximateLocation | null;
    /** The page's language (English by default) */
    words?: SessionWords;
  },
): SessionView[] {
  const dates = formattersFor(words.device.locale).date;
  return rows
    .filter((row) => row.expiresAt.getTime() > now.getTime())
    .map((row) => {
      const current = row.id === currentSessionId;
      const { device, label } = describeUserAgent(row.userAgent, words.device);
      return {
        id: row.id,
        device,
        label,
        network: maskIpAddress(row.ipAddress),
        location: current
          ? formatLocation(currentLocation, words.device)
          : null,
        lastActive: current
          ? words.activeNow
          : lastActive(row.updatedAt, now, words),
        signedIn: words.signedIn(dates.format(row.createdAt)),
        current,
        sortKey: row.updatedAt.getTime(),
      };
    })
    .sort(
      (a, b) => Number(b.current) - Number(a.current) || b.sortKey - a.sortKey,
    )
    .map(({ sortKey: _sortKey, ...view }) => view);
}

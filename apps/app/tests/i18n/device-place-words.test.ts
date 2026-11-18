// The device and place a security email shows ("Chrome on macOS", "Berlin,
// Germany") and Settings → Sessions lists, in the reader's language: the
// joining words come from emails.security, country names from Intl, and
// browser and system names stay as they are. English stays the default and
// byte for byte what it was, and the stolen-session check keeps comparing
// the English label whatever the language.
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { browserFamily } from "@/lib/account/session-origin";
import {
  describeUserAgent,
  deviceWords,
  ENGLISH_DEVICE_WORDS,
  formatLocation,
  type SessionRow,
  sessionWords,
  toSessionViews,
} from "@/lib/account/sessions";
import { ENGLISH_EMAIL, emailIntl } from "@/lib/i18n/email";
import { loadMessages } from "@/lib/i18n/messages";
import type { Translator } from "@/lib/i18n/translator";
import {
  formatSecurityTime,
  requestDetails,
} from "@/lib/security/request-details";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const WINDOWS_ONLY = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const AGENTS = [
  null,
  "  ",
  CHROME_MAC,
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  WINDOWS_ONLY,
  "curl/8.7.1",
  "???",
];
const PLACES = [
  { city: "Berlin", country: "DE" },
  { city: null, country: "IN" },
  { city: "Somewhere", country: null },
  { city: null, country: "ZZZ" },
  { city: null, country: null },
];

const NOW = new Date("2026-11-18T12:00:00Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ROWS: SessionRow[] = [
  0,
  20_000,
  5 * MINUTE,
  26 * 60 * MINUTE,
  45 * DAY,
].map((elapsed, index) => ({
  id: `s${index}`,
  createdAt: new Date(NOW.getTime() - elapsed - 3 * DAY),
  updatedAt: new Date(NOW.getTime() - elapsed),
  expiresAt: new Date(NOW.getTime() + DAY),
  ipAddress: "203.0.113.9",
  userAgent: [CHROME_MAC, null, WINDOWS_ONLY, CHROME_MAC, "curl/8.7.1"][index],
}));

/** Settings → Sessions' translator, as getAppTranslations gives the page. */
async function sessionsTranslator(locale: "en" | "es") {
  return createTranslator({
    locale,
    messages: await loadMessages(locale),
    namespace: "app.settings.account.sessionsSection",
  }) as unknown as Translator<"app.settings.account.sessionsSection">;
}

describe("device and place words", () => {
  it("name a device and a place in Spanish", async () => {
    const words = deviceWords(await emailIntl("es"));
    expect(describeUserAgent(CHROME_MAC, words).label).toBe("Chrome en macOS");
    expect(describeUserAgent(WINDOWS_ONLY, words).label).toBe(
      "Dispositivo Windows",
    );
    expect(describeUserAgent(null, words).label).toBe(
      "Dispositivo desconocido",
    );
    // Product names stay as they are.
    expect(describeUserAgent("curl/8.7.1", words).label).toBe("curl");
    expect(formatLocation({ city: "Berlin", country: "DE" }, words)).toBe(
      "Berlin, Alemania",
    );
    expect(formatLocation({ city: null, country: "JP" }, words)).toBe("Japón");
  });

  it("let a language put the country first", async () => {
    const words = deviceWords(await emailIntl("ja"));
    expect(formatLocation({ city: "Tokyo", country: "JP" }, words)).toBe(
      "日本、Tokyo",
    );
    expect(describeUserAgent(CHROME_MAC, words).label).toBe("macOSのChrome");
  });

  it("read the same in English from the catalog as the built-in English", () => {
    const fromCatalog = deviceWords(ENGLISH_EMAIL);
    for (const agent of AGENTS) {
      expect(describeUserAgent(agent, fromCatalog)).toEqual(
        describeUserAgent(agent),
      );
      expect(describeUserAgent(agent, ENGLISH_DEVICE_WORDS)).toEqual(
        describeUserAgent(agent),
      );
    }
    for (const place of PLACES) {
      expect(formatLocation(place, fromCatalog)).toEqual(formatLocation(place));
    }
    expect(describeUserAgent(CHROME_MAC).label).toBe("Chrome on macOS");
    expect(describeUserAgent(WINDOWS_ONLY).label).toBe("Windows device");
    expect(describeUserAgent(null).label).toBe("Unknown device");
    expect(formatLocation({ city: "Berlin", country: "DE" })).toBe(
      "Berlin, Germany",
    );
  });

  it("leave the stolen-session check's browser family in English", () => {
    expect(browserFamily(CHROME_MAC)).toBe("Chrome on macOS");
    expect(browserFamily(null)).toBe("Unknown device");
  });
});

describe("a security email's details", () => {
  const headers = new Headers({
    "user-agent": CHROME_MAC,
    "cf-ipcountry": "BR",
  });

  it("follow the email's language", async () => {
    const details = requestDetails(headers, NOW, await emailIntl("es"));
    expect(details).toMatchObject({
      device: "Chrome en macOS",
      location: "Brasil",
      time: formatSecurityTime(NOW, "UTC", "es"),
    });
  });

  it("are unchanged in English", () => {
    expect(requestDetails(headers, NOW)).toEqual({
      device: "Chrome on macOS",
      location: "Brazil",
      ip: null,
      time: "Nov 18, 2026, 12:00 PM UTC",
      timeZone: "UTC",
    });
  });
});

describe("Settings → Sessions", () => {
  it("lists the sessions in the page's language", async () => {
    const views = toSessionViews(ROWS, {
      currentSessionId: "s0",
      now: NOW,
      currentLocation: { city: "Berlin", country: "DE" },
      words: sessionWords(
        await sessionsTranslator("es"),
        deviceWords(await emailIntl("es")),
      ),
    });
    expect(
      views.map((view) => [
        view.label,
        view.lastActive,
        view.signedIn,
        view.location,
      ]),
    ).toEqual([
      [
        "Chrome en macOS",
        "Activa ahora",
        "Inicio de sesión: 15 nov 2026",
        "Berlin, Alemania",
      ],
      [
        "Dispositivo desconocido",
        "Activa hace un momento",
        "Inicio de sesión: 15 nov 2026",
        null,
      ],
      [
        "Dispositivo Windows",
        "Activa hace 5 minutos",
        "Inicio de sesión: 15 nov 2026",
        null,
      ],
      ["Chrome en macOS", "Activa ayer", "Inicio de sesión: 14 nov 2026", null],
      ["curl", "Activa el 4 oct 2026", "Inicio de sesión: 1 oct 2026", null],
    ]);
  });

  it("reads the same in English from the catalog as before", async () => {
    const options = {
      currentSessionId: "s0",
      now: NOW,
      currentLocation: { city: "Berlin", country: "DE" },
    };
    const before = toSessionViews(ROWS, options);
    expect(
      toSessionViews(ROWS, {
        ...options,
        words: sessionWords(
          await sessionsTranslator("en"),
          deviceWords(ENGLISH_EMAIL),
        ),
      }),
    ).toEqual(before);
    expect(
      before.map((view) => [view.label, view.lastActive, view.signedIn]),
    ).toEqual([
      ["Chrome on macOS", "Active now", "Signed in Nov 15, 2026"],
      ["Unknown device", "Active just now", "Signed in Nov 15, 2026"],
      ["Windows device", "Active 5 minutes ago", "Signed in Nov 15, 2026"],
      ["Chrome on macOS", "Active yesterday", "Signed in Nov 14, 2026"],
      ["curl", "Active on Oct 4, 2026", "Signed in Oct 1, 2026"],
    ]);
  });
});

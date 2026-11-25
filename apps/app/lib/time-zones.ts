// Time zones by the names people know. Chrome (V8, with ICU's data) lists
// and reports some zones by names IANA retired: Asia/Calcutta for
// Asia/Kolkata, Europe/Kiev for Europe/Kyiv. Safari (JavaScriptCore) and
// Firefox (SpiderMonkey) use the current ones. Checked on 26 Nov 2026:
// Chrome 158 and Node 22 (ICU 76.1) list and report Asia/Calcutta; macOS
// JavaScriptCore and the Firefox 161 shell list and report Asia/Kolkata.
// Client-safe and pure.

/**
 * The renamed zones: each id CLDR's bcp47/timezone.xml (ICU's data) keeps as
 * canonical where it gives a different `iana` name, mapped to that name.
 * Each pair is a `Link` in IANA's `backward` file, or two spellings of one
 * link (Asmera and Asmara both point at Nairobi). Zones IANA merged into
 * another (Europe/Oslo into Europe/Berlin) aren't renames and keep their
 * names. Both names of a pair are the same zone, so they convert to UTC the
 * same way (tests/lib/time-zones.test.ts).
 */
export const CURRENT_TIME_ZONE_NAMES: Readonly<Record<string, string>> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Coral_Harbour": "America/Atikokan",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

/** "Asia/Calcutta" → "Asia/Kolkata"; any other id as it is. */
export function currentTimeZoneName(zone: string): string {
  return Object.hasOwn(CURRENT_TIME_ZONE_NAMES, zone)
    ? (CURRENT_TIME_ZONE_NAMES[zone] as string)
    : zone;
}

/** This device's time zone by its current name, or "UTC" when unknown. */
export function deviceTimeZone(): string {
  try {
    return currentTimeZoneName(
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
  } catch {
    return "UTC";
  }
}

/** Every zone this browser knows by its current name: UTC, then A to Z. */
export function timeZoneNames(): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  const names = new Set(zones.map(currentTimeZoneName));
  names.delete("UTC");
  return ["UTC", ...[...names].sort()];
}

const offsetFormats = new Map<string, Intl.DateTimeFormat | null>();

/**
 * The zone's offset at `date`, "UTC+05:30" or "UTC+00:00"; "" where the
 * browser can't name offsets.
 */
export function utcOffset(zone: string, date: Date = new Date()): string {
  let format = offsetFormats.get(zone);
  if (format === undefined) {
    try {
      format = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        timeZoneName: "longOffset",
      });
    } catch {
      format = null;
    }
    offsetFormats.set(zone, format);
  }
  const name = format
    ?.formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  if (!name?.startsWith("GMT")) return "";
  return name === "GMT" ? "UTC+00:00" : `UTC${name.slice(3)}`;
}

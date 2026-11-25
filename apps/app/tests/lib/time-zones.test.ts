// Time zones by their current names (lib/time-zones.ts): Chrome lists
// Asia/Calcutta where people know Asia/Kolkata. Each retired name and its
// current one are the same zone, so events, pages and codes made with
// either convert to UTC the same way.
import { afterEach, describe, expect, it, vi } from "vitest";
import { zonedTimeToUtc } from "@/lib/landing/blocks/event-calendar";
import { validateDesignContent } from "@/lib/qr-design/content";
import {
  CURRENT_TIME_ZONE_NAMES,
  currentTimeZoneName,
  deviceTimeZone,
  timeZoneNames,
  utcOffset,
} from "@/lib/time-zones";
import { encodeCalendarEvent } from "@/utils/calendar-event";

const PAIRS = Object.entries(CURRENT_TIME_ZONE_NAMES);

/** Local times through a year, DST changes included, and a few decades. */
const LOCAL_TIMES = [
  "1975-06-15T12:00",
  "2000-01-01T00:00",
  ...Array.from(
    { length: 12 },
    (_, month) => `2026-${String(month + 1).padStart(2, "0")}-14T09:30`,
  ),
  "2026-03-08T02:30",
  "2026-03-29T02:30",
  "2026-10-25T02:30",
  "2026-11-01T01:30",
  "2027-04-17T18:00",
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("currentTimeZoneName", () => {
  it("renames the retired names", () => {
    expect(currentTimeZoneName("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(currentTimeZoneName("Europe/Kiev")).toBe("Europe/Kyiv");
    expect(currentTimeZoneName("Asia/Saigon")).toBe("Asia/Ho_Chi_Minh");
    expect(currentTimeZoneName("America/Buenos_Aires")).toBe(
      "America/Argentina/Buenos_Aires",
    );
  });

  it("leaves current names, merged zones and unknown ids alone", () => {
    for (const zone of [
      "Asia/Kolkata",
      "UTC",
      "Europe/Oslo",
      "Europe/Amsterdam",
      "America/New_York",
      "Not/AZone",
      "toString",
    ]) {
      expect(currentTimeZoneName(zone)).toBe(zone);
    }
  });

  it("maps each retired name to a name that isn't retired itself", () => {
    for (const current of Object.values(CURRENT_TIME_ZONE_NAMES)) {
      expect(currentTimeZoneName(current)).toBe(current);
    }
  });
});

describe("each retired name and its current name", () => {
  it.each(PAIRS)("%s and %s are the same zone", (retired, current) => {
    // ICU resolves both to one id; the engine accepts both.
    const resolve = (zone: string) =>
      new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions()
        .timeZone;
    expect(resolve(retired)).toBe(resolve(current));
    for (const local of LOCAL_TIMES) {
      expect(zonedTimeToUtc(local, current).toISOString(), local).toBe(
        zonedTimeToUtc(local, retired).toISOString(),
      );
      const instant = new Date(`${local}:00Z`);
      expect(utcOffset(current, instant)).toBe(utcOffset(retired, instant));
    }
  });

  it("this browser lists one of the two", () => {
    const listed = new Set(Intl.supportedValuesOf("timeZone"));
    for (const [retired, current] of PAIRS) {
      expect(listed.has(retired) || listed.has(current), retired).toBe(true);
    }
  });
});

describe("timeZoneNames", () => {
  const names = timeZoneNames();

  it("lists every zone by its current name, UTC first, then A to Z", () => {
    expect(names[0]).toBe("UTC");
    expect(names.slice(1)).toEqual([...names.slice(1)].sort());
    expect(new Set(names).size).toBe(names.length);
    for (const retired of Object.keys(CURRENT_TIME_ZONE_NAMES)) {
      expect(names).not.toContain(retired);
    }
    for (const zone of [
      "Asia/Kolkata",
      "Europe/Kyiv",
      "Asia/Kathmandu",
      "Asia/Yangon",
      "Asia/Ho_Chi_Minh",
      "Europe/Oslo",
      "America/New_York",
    ]) {
      expect(names).toContain(zone);
    }
  });

  it("keeps every zone the browser lists", () => {
    expect(names.length).toBe(
      new Set([
        "UTC",
        ...Intl.supportedValuesOf("timeZone").map(currentTimeZoneName),
      ]).size,
    );
  });
});

describe("utcOffset", () => {
  it("names the offset on the given day, DST included", () => {
    const january = new Date("2027-01-15T12:00:00Z");
    const july = new Date("2027-07-15T12:00:00Z");
    expect(utcOffset("Asia/Kolkata", january)).toBe("UTC+05:30");
    expect(utcOffset("Asia/Kathmandu", january)).toBe("UTC+05:45");
    expect(utcOffset("Europe/Paris", january)).toBe("UTC+01:00");
    expect(utcOffset("Europe/Paris", july)).toBe("UTC+02:00");
    expect(utcOffset("America/St_Johns", january)).toBe("UTC-03:30");
    expect(utcOffset("UTC", july)).toBe("UTC+00:00");
    expect(utcOffset("Africa/Abidjan", july)).toBe("UTC+00:00");
  });

  it("is empty for a zone the browser doesn't know", () => {
    expect(utcOffset("Not/AZone")).toBe("");
  });
});

describe("deviceTimeZone", () => {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  const resolved = (timeZone: string) => {
    vi.spyOn(
      Intl.DateTimeFormat.prototype,
      "resolvedOptions",
    ).mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), timeZone };
    });
  };

  it("names this device's zone by its current name", () => {
    resolved("Asia/Calcutta");
    expect(deviceTimeZone()).toBe("Asia/Kolkata");
    resolved("Europe/Berlin");
    expect(deviceTimeZone()).toBe("Europe/Berlin");
  });

  it("falls back to UTC", () => {
    resolved("");
    expect(deviceTimeZone()).toBe("UTC");
    vi.spyOn(
      Intl.DateTimeFormat.prototype,
      "resolvedOptions",
    ).mockImplementation(() => {
      throw new Error("no Intl");
    });
    expect(deviceTimeZone()).toBe("UTC");
  });
});

describe("calendar event codes", () => {
  it.each(PAIRS)(
    "an event in %s is the same code as one in %s",
    (retired, current) => {
      for (const [startDate, startTime, endTime] of [
        ["2026-01-14", "09:30", "11:00"],
        ["2026-07-14", "19:00", "22:30"],
        ["2026-10-25", "01:30", "03:00"],
      ] as const) {
        const event = {
          type: "calendar-event" as const,
          title: "Launch party",
          startDate,
          startTime,
          endTime,
        };
        const payload = encodeCalendarEvent({ ...event, timeZone: current });
        expect(payload).toMatch(/^BEGIN:VEVENT\r\n/);
        expect(encodeCalendarEvent({ ...event, timeZone: retired })).toBe(
          payload,
        );
        // design_qr and the MCP take either name too.
        const viaApi = validateDesignContent({ ...event, timeZone: retired });
        expect(viaApi.ok && viaApi.value).toBe(payload);
      }
    },
  );
});

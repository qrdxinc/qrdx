// Calendar event codes (utils/calendar-event.ts): the VEVENT the encoder
// writes against RFC 5545 (UTC "Z" times, DATE values with an exclusive
// DTEND, TEXT escaping, CRLF), the form's checks, design_qr, and the whole
// trip through the renderer, a camera-like decode and the scanner's parser.
import { QRCodeSVG } from "qrdx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseScan } from "@/components/scanner/parse";
import { validateDesignContent } from "@/lib/qr-design/content";
import { calendarEventSchema } from "@/lib/validations/qr-content";
import type { CalendarEventContent } from "@/types/qr-content";
import {
  CALENDAR_EVENT_LONG_BYTES,
  calendarEventIssue,
  encodeCalendarEvent,
  normalizeTime,
} from "@/utils/calendar-event";
import { encodeQRContent, validateContent } from "@/utils/qr-content-encoder";
import {
  decodeQR,
  rasterizeSvg,
  simulateCamera,
} from "../../../../packages/qrdx/tests/support/raster";

const base: CalendarEventContent = {
  type: "calendar-event",
  title: "Launch party",
  startDate: "2026-11-14",
  startTime: "19:00",
  endTime: "22:00",
  timeZone: "Europe/Paris",
};
const encode = (patch: Partial<CalendarEventContent> = {}) =>
  encodeCalendarEvent({ ...base, ...patch });
const prop = (payload: string, name: string) =>
  payload
    .split("\r\n")
    .find((line) => line.startsWith(`${name}:`) || line.startsWith(`${name};`));

describe("the VEVENT", () => {
  it("stands alone, with CRLF line endings and only the fields filled in", () => {
    const payload = encode();
    expect(payload).toBe(
      [
        "BEGIN:VEVENT",
        "SUMMARY:Launch party",
        "DTSTART:20261114T180000Z",
        "DTEND:20261114T210000Z",
        "END:VEVENT",
        "",
      ].join("\r\n"),
    );
    expect(payload).not.toContain("VCALENDAR");
    expect(payload.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("writes the location and description, and the link as URL and at the end of the description", () => {
    const payload = encode({
      location: "Hall 3",
      description: "Doors at 7.",
      url: "example.com/launch",
    });
    expect(prop(payload, "LOCATION")).toBe("LOCATION:Hall 3");
    expect(prop(payload, "DESCRIPTION")).toBe(
      "DESCRIPTION:Doors at 7.\\n\\nhttps://example.com/launch",
    );
    expect(prop(payload, "URL")).toBe("URL:https://example.com/launch");
    expect(
      encode({ url: "https://example.com/launch" }).includes(
        "DESCRIPTION:https://example.com/launch\r\n",
      ),
    ).toBe(true);
  });

  it("doesn't fold long lines", () => {
    const description = "A long description. ".repeat(10).trim();
    const payload = encode({ description });
    expect(prop(payload, "DESCRIPTION")).toBe(`DESCRIPTION:${description}`);
    expect(payload).not.toMatch(/\r\n[ \t]/);
  });
});

describe("times", () => {
  it("are written in UTC from the time zone they were typed in", () => {
    // Paris is UTC+1 in November and UTC+2 in July.
    expect(prop(encode(), "DTSTART")).toBe("DTSTART:20261114T180000Z");
    const july = encode({ startDate: "2026-07-14", endDate: "2026-07-14" });
    expect(prop(july, "DTSTART")).toBe("DTSTART:20260714T170000Z");
    expect(prop(july, "DTEND")).toBe("DTEND:20260714T200000Z");
    const kolkata = encode({ timeZone: "Asia/Kolkata", startTime: "10:00" });
    expect(prop(kolkata, "DTSTART")).toBe("DTSTART:20261114T043000Z");
    const la = encode({ timeZone: "America/Los_Angeles" });
    expect(prop(la, "DTSTART")).toBe("DTSTART:20261115T030000Z");
    expect(prop(la, "DTEND")).toBe("DTEND:20261115T060000Z");
  });

  it("are UTC when no time zone is given", () => {
    const payload = encode({ timeZone: undefined });
    expect(prop(payload, "DTSTART")).toBe("DTSTART:20261114T190000Z");
    expect(prop(encode({ timeZone: " " }), "DTSTART")).toBe(
      "DTSTART:20261114T190000Z",
    );
  });

  it("read a time skipped by a DST change with the offset before it", () => {
    // 02:30 doesn't exist in New York on 8 March 2026: it means 03:30 EDT.
    const payload = encode({
      timeZone: "America/New_York",
      startDate: "2026-03-08",
      startTime: "02:30",
      endTime: "04:00",
    });
    expect(prop(payload, "DTSTART")).toBe("DTSTART:20260308T073000Z");
    expect(prop(payload, "DTEND")).toBe("DTEND:20260308T080000Z");
  });

  it("last an hour without an end time", () => {
    const payload = encode({ endTime: undefined });
    expect(prop(payload, "DTEND")).toBe("DTEND:20261114T190000Z");
  });

  it("end on a later day with an end date (past midnight)", () => {
    const payload = encode({
      startTime: "22:00",
      endDate: "2026-11-15",
      endTime: "02:00",
    });
    expect(prop(payload, "DTSTART")).toBe("DTSTART:20261114T210000Z");
    expect(prop(payload, "DTEND")).toBe("DTEND:20261115T010000Z");
  });

  it.each([
    ["9:05", "09:05"],
    ["09:05", "09:05"],
    [" 23:59 ", "23:59"],
    ["24:00", null],
    ["12:60", null],
    ["noon", null],
    ["12:00:00", null],
  ])("normalizeTime(%j) → %j", (raw, expected) => {
    expect(normalizeTime(raw)).toBe(expected);
  });
});

describe("all-day events", () => {
  it("are DATE values whose DTEND is the day after the last day", () => {
    const payload = encode({ allDay: true, startDate: "2026-12-31" });
    expect(prop(payload, "DTSTART")).toBe("DTSTART;VALUE=DATE:20261231");
    expect(prop(payload, "DTEND")).toBe("DTEND;VALUE=DATE:20270101");
  });

  it("span several days with an end date", () => {
    const payload = encode({
      allDay: true,
      startDate: "2026-12-30",
      endDate: "2027-01-01",
    });
    expect(prop(payload, "DTSTART")).toBe("DTSTART;VALUE=DATE:20261230");
    expect(prop(payload, "DTEND")).toBe("DTEND;VALUE=DATE:20270102");
  });

  it("ignore the times and the time zone", () => {
    const payload = encode({
      allDay: true,
      startTime: "",
      endTime: "nonsense",
      timeZone: "Not/AZone",
    });
    expect(prop(payload, "DTSTART")).toBe("DTSTART;VALUE=DATE:20261114");
    expect(prop(payload, "DTEND")).toBe("DTEND;VALUE=DATE:20261115");
  });

  it("handle 29 February", () => {
    const payload = encode({ allDay: true, startDate: "2028-02-29" });
    expect(prop(payload, "DTEND")).toBe("DTEND;VALUE=DATE:20280301");
  });
});

describe("TEXT escaping (RFC 5545 §3.3.11)", () => {
  it("escapes backslashes, semicolons, commas and newlines", () => {
    const payload = encode({
      title: "a\\b;c,d\ne",
      location: "Hall 3, Main St; Paris",
      description: "Bring:\r\n- snacks\\drinks",
    });
    expect(prop(payload, "SUMMARY")).toBe("SUMMARY:a\\\\b\\;c\\,d\\ne");
    expect(prop(payload, "LOCATION")).toBe(
      "LOCATION:Hall 3\\, Main St\\; Paris",
    );
    expect(prop(payload, "DESCRIPTION")).toBe(
      "DESCRIPTION:Bring:\\n- snacks\\\\drinks",
    );
  });

  it("can't add lines or events through a newline", () => {
    const payload = encode({
      title: "x\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:y",
      location: "z\nDTSTART:19700101T000000Z",
    });
    expect(payload.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
    expect(payload.match(/^DTSTART/gm)).toHaveLength(1);
    expect(payload.split("\r\n")).toHaveLength(7);
  });

  it("keeps the link as written in URL (a URI, not TEXT)", () => {
    const payload = encode({ url: "https://example.com/a,b;c" });
    expect(prop(payload, "URL")).toBe("URL:https://example.com/a,b;c");
    expect(prop(payload, "DESCRIPTION")).toBe(
      "DESCRIPTION:https://example.com/a\\,b\\;c",
    );
  });
});

describe("checks", () => {
  it.each<[string, Partial<CalendarEventContent>, string]>([
    ["no name", { title: "" }, "title"],
    ["a blank name", { title: "   " }, "title"],
    ["no start date", { startDate: "" }, "startDate"],
    ["a date that doesn't exist", { startDate: "2026-02-30" }, "startDate"],
    ["a date in another format", { startDate: "14/11/2026" }, "startDate"],
    ["no start time", { startTime: "" }, "startTime"],
    ["a start time that isn't one", { startTime: "25:00" }, "startTime"],
    ["an end time that isn't one", { endTime: "7pm" }, "endTime"],
    ["an end before the start", { endTime: "18:00" }, "endTime"],
    ["an end at the start", { endTime: "19:00" }, "endTime"],
    [
      "an end date without an end time",
      { endDate: "2026-11-15", endTime: "" },
      "endTime",
    ],
    ["an end date before the start", { endDate: "2026-11-13" }, "endTime"],
    ["an end date that doesn't exist", { endDate: "2026-11-31" }, "endDate"],
    [
      "a time zone that doesn't exist",
      { timeZone: "Mars/Olympus_Mons" },
      "timeZone",
    ],
    [
      "a last day before the first",
      { allDay: true, endDate: "2026-11-13" },
      "endDate",
    ],
    ["a link that isn't one", { url: "not a link" }, "url"],
    ["a link that isn't a web page", { url: "ftp://example.com/file" }, "url"],
    ["a link without a domain", { url: "https://localhost" }, "url"],
  ])("flag %s", (_, patch, field) => {
    const content = { ...base, ...patch };
    expect(calendarEventIssue(content)?.field).toBe(field);
    expect(encodeCalendarEvent(content)).toBe("");
    expect(validateContent(content).valid).toBe(false);
  });

  it("pass a complete event, a one-day all-day event and one without an end", () => {
    expect(calendarEventIssue(base)).toBeNull();
    expect(
      calendarEventIssue({
        type: "calendar-event",
        title: "Fair",
        allDay: true,
        startDate: "2026-11-14",
      }),
    ).toBeNull();
    expect(calendarEventIssue({ ...base, endTime: undefined })).toBeNull();
    expect(validateContent(base)).toEqual({ valid: true });
  });

  it("agree with the form's schema", () => {
    const { type: _type, ...fields } = base;
    expect(calendarEventSchema.safeParse(fields).success).toBe(true);
    const parsed = calendarEventSchema.safeParse({
      ...fields,
      endTime: "18:00",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["endTime"]);
    // The form sends every field, the empty ones as "".
    expect(
      calendarEventSchema.safeParse({
        title: "Fair",
        allDay: true,
        startDate: "2026-11-14",
        startTime: "",
        endDate: "",
        endTime: "",
        timeZone: "Europe/Paris",
        location: "",
        description: "",
        url: "",
      }).success,
    ).toBe(true);
  });
});

describe("design_qr", () => {
  it("takes the fields flat and encodes them as the form does", () => {
    const result = validateDesignContent({
      type: "calendar-event",
      title: "Launch party",
      startDate: "2026-11-14",
      startTime: "19:00",
      endTime: "22:00",
      timeZone: "Europe/Paris",
      allDay: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(encode());
  });

  it("names the field with a problem", () => {
    const result = validateDesignContent({
      type: "calendar-event",
      title: "Launch party",
      startDate: "2026-11-14",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.field).toBe("startTime");
  });
});

describe("long events", () => {
  it("a long description takes the code past the comfortable size", () => {
    const bytes = (payload: string) => new TextEncoder().encode(payload).length;
    expect(bytes(encode())).toBeLessThan(CALENDAR_EVENT_LONG_BYTES);
    expect(
      bytes(encode({ description: "Bring a friend. ".repeat(15) })),
    ).toBeGreaterThan(CALENDAR_EVENT_LONG_BYTES);
  });
});

/** Renders the payload like the playground does and reads it back. */
function scan(value: string): string | null {
  const svg = renderToStaticMarkup(
    createElement(QRCodeSVG, {
      value,
      level: "M",
      size: 512,
      margin: 4,
      bodyPattern: "square",
    }),
  );
  return decodeQR(
    simulateCamera(rasterizeSvg(svg, { width: 480, pad: 24 }), 4),
  );
}

describe("encode → render → decode → the scanner's parser", () => {
  it("keeps a timed event, in UTC", () => {
    const config: CalendarEventContent = {
      ...base,
      title: "Zoë's launch 👋; Q&A, live",
      location: "Café ☕, Straße 1; Berlin",
      description: "Doors at 7.\nBring a friend, or two.",
      url: "https://example.com/launch",
    };
    const payload = encodeQRContent(config);
    const decoded = scan(payload);
    expect(decoded).toBe(payload);
    const parsed = parseScan(decoded ?? "");
    expect(parsed.kind).toBe("event");
    if (parsed.kind !== "event") return;
    expect(parsed.event).toEqual({
      summary: config.title,
      start: "2026-11-14T18:00:00Z",
      end: "2026-11-14T21:00:00Z",
      location: config.location,
      description: `${config.description}\n\nhttps://example.com/launch`,
      allDay: false,
    });
    expect(parsed.ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
  });

  it("keeps an all-day event over several days, ending on its last day", () => {
    const config: CalendarEventContent = {
      type: "calendar-event",
      title: "Street fair",
      allDay: true,
      startDate: "2026-12-30",
      endDate: "2027-01-01",
    };
    const parsed = parseScan(scan(encodeQRContent(config)) ?? "");
    expect(parsed.kind).toBe("event");
    if (parsed.kind !== "event") return;
    expect(parsed.event.start).toBe("2026-12-30");
    expect(parsed.event.end).toBe("2027-01-01");
    expect(parsed.event.allDay).toBe(true);
  });

  it("shows no end for a one-day all-day event", () => {
    const parsed = parseScan(
      encodeQRContent({
        type: "calendar-event",
        title: "Open day",
        allDay: true,
        startDate: "2026-11-14",
      }),
    );
    expect(parsed.kind).toBe("event");
    if (parsed.kind === "event") {
      expect(parsed.event.start).toBe("2026-11-14");
      expect(parsed.event.end).toBeUndefined();
    }
  });
});

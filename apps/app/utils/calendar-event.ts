// Calendar event QR codes: an iCalendar (RFC 5545) VEVENT, which phone
// cameras offer to add to the calendar.
//
//   BEGIN:VEVENT
//   SUMMARY:Launch party
//   DTSTART:20261114T180000Z
//   DTEND:20261114T210000Z
//   LOCATION:Hall 3\, Main St
//   DESCRIPTION:Doors at 7.\n\nhttps://example.com/launch
//   URL:https://example.com/launch
//   END:VEVENT
//
// The VEVENT stands alone, without a VCALENDAR around it: that's the form QR
// generators write and readers look for (ZXing's calendar result starts at
// the BEGIN:VEVENT line), and it's about 65 bytes shorter. Timed events are
// written in UTC ("Z"), converted from the time zone they were typed in, so
// no VTIMEZONE is needed; all-day events are DATE values whose DTEND is the
// day after the last day. Lines end in CRLF and aren't folded at 75 octets:
// readers take long lines, and folding only adds bytes. The link goes in URL
// and at the end of DESCRIPTION: the calendar event Google's ML Kit reads,
// which many Android scanners use, has no URL field.
//
// The escaping and the time zone math are the hosted pages' event block's
// (lib/landing/blocks/event-calendar.tsx). Pure, so it runs in the browser,
// on the server and in tests.

import {
  type CalendarEvent,
  escapeIcsText,
  eventTimes,
  formatUtcStamp,
  isValidLocalDateTime,
  isValidTimeZone,
  zonedTimeToUtc,
} from "@/lib/landing/blocks/event-calendar";
import type { CalendarEventContent } from "@/types/qr-content";

/**
 * Bytes above which the code gets dense: the 300 characters the text type's
 * page gives as the most that stays easy to scan at normal print sizes.
 */
export const CALENDAR_EVENT_LONG_BYTES = 300;

export interface CalendarEventIssue {
  field?: string;
  message: string;
}

const issue = (field: string, message: string): CalendarEventIssue => ({
  field,
  message,
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (value: string) =>
  DATE.test(value) && isValidLocalDateTime(value);

/** "9:05" or "09:05" → "09:05"; null when it isn't a time of day. */
export function normalizeTime(raw: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

/** An http(s) address, "https://" added when typed without; else null. */
function webUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url || /\s/.test(url)) return null;
  const full = /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(full);
    return /^https?:$/.test(parsed.protocol) && parsed.hostname.includes(".")
      ? full
      : null;
  } catch {
    return null;
  }
}

const zoneOf = (content: Partial<CalendarEventContent>) =>
  content.timeZone?.trim() || "UTC";

export function calendarEventIssue(
  content: Partial<CalendarEventContent>,
): CalendarEventIssue | null {
  if (!content.title?.trim()) return issue("title", "Event name is required");
  const startDate = content.startDate?.trim() ?? "";
  if (!startDate) return issue("startDate", "Pick the day the event starts");
  if (!isDate(startDate)) {
    return issue("startDate", "Pick a date, written YYYY-MM-DD");
  }
  const endDate = content.endDate?.trim() ?? "";
  if (endDate && !isDate(endDate)) {
    return issue("endDate", "Pick a date, written YYYY-MM-DD");
  }

  if (content.allDay) {
    if (endDate && endDate < startDate) {
      return issue("endDate", "The last day is before the first day");
    }
  } else {
    const zone = zoneOf(content);
    if (!isValidTimeZone(zone)) {
      return issue("timeZone", `"${zone}" isn't a time zone`);
    }
    if (!content.startTime?.trim()) {
      return issue("startTime", "Pick the time the event starts");
    }
    const startTime = normalizeTime(content.startTime);
    if (!startTime) return issue("startTime", "Enter a time like 19:00");
    if (content.endTime?.trim()) {
      const endTime = normalizeTime(content.endTime);
      if (!endTime) return issue("endTime", "Enter a time like 21:00");
      const start = zonedTimeToUtc(`${startDate}T${startTime}`, zone);
      const end = zonedTimeToUtc(`${endDate || startDate}T${endTime}`, zone);
      if (end <= start) {
        return issue(
          "endTime",
          endDate
            ? "The event ends before it starts"
            : "The event ends before it starts. For one that goes past midnight, set the end date",
        );
      }
    } else if (endDate) {
      return issue("endTime", "Pick the time the event ends");
    }
  }

  if (content.url?.trim() && !webUrl(content.url)) {
    return issue("url", "Enter a web address, like https://example.com");
  }
  return null;
}

/** The event as the event block's calendar helpers take it. */
function toCalendarEvent(content: CalendarEventContent): CalendarEvent {
  const startDate = content.startDate.trim();
  const endDate = content.endDate?.trim() || undefined;
  if (content.allDay) {
    return {
      title: content.title,
      allDay: true,
      start: startDate,
      end: endDate,
      timeZone: "UTC",
    };
  }
  const startTime = normalizeTime(content.startTime ?? "") ?? "00:00";
  const endTime = content.endTime?.trim()
    ? normalizeTime(content.endTime)
    : null;
  return {
    title: content.title,
    allDay: false,
    start: `${startDate}T${startTime}`,
    end: endTime ? `${endDate ?? startDate}T${endTime}` : undefined,
    timeZone: zoneOf(content),
  };
}

/** "2026-11-14" → "20261114" */
const compactDate = (date: string) => date.replaceAll("-", "");

/** The VEVENT payload, CRLF line endings; "" while the content has a problem. */
export function encodeCalendarEvent(content: CalendarEventContent): string {
  if (calendarEventIssue(content)) return "";
  const times = eventTimes(toCalendarEvent(content));
  const url = content.url?.trim() ? webUrl(content.url) : null;
  const location = content.location?.trim();
  const description = [content.description?.trim(), url]
    .filter(Boolean)
    .join("\n\n");

  const lines = [
    "BEGIN:VEVENT",
    `SUMMARY:${escapeIcsText(content.title.trim())}`,
    ...(times.allDay
      ? [
          `DTSTART;VALUE=DATE:${compactDate(times.startDate)}`,
          `DTEND;VALUE=DATE:${compactDate(times.endDateExclusive)}`,
        ]
      : [
          `DTSTART:${formatUtcStamp(times.start)}`,
          `DTEND:${formatUtcStamp(times.end)}`,
        ]),
  ];
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (url) lines.push(`URL:${url}`);
  lines.push("END:VEVENT");
  return `${lines.join("\r\n")}\r\n`;
}

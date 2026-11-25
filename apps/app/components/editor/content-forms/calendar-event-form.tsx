"use client";

// A calendar event (an iCalendar VEVENT) that phones' cameras offer to add
// to the calendar. Times are typed in a time zone, this device's to start
// with, and written to the code in UTC (utils/calendar-event.ts).

import { Warning2 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useMemo, useSyncExternalStore } from "react";
import { calendarEventSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { CalendarEventContent } from "@/types/qr-content";
import { CALENDAR_EVENT_LONG_BYTES } from "@/utils/calendar-event";
import { type FormField, type FormOption, SchemaForm } from "./schema-form";

const timed = (values: Record<string, string | boolean>) =>
  values.allDay !== true;

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const noSubscribe = () => () => {};

/** Every zone the browser knows, UTC first, plus `extra` ones (aliases). */
function zoneOptions(extra: readonly (string | undefined)[]): FormOption[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  const all = new Set(["UTC", ...zones]);
  for (const zone of extra) if (zone) all.add(zone);
  return [...all].map((zone) => ({
    value: zone,
    label: zone.replaceAll("_", " "),
  }));
}

function eventFields(zone: string, options: FormOption[]): FormField[] {
  return [
    {
      name: "title",
      label: "Event name",
      required: true,
      placeholder: "Launch party",
    },
    {
      name: "allDay",
      label: "All-day event",
      kind: "switch",
      initial: false,
    },
    {
      name: "startDate",
      label: "Start date",
      kind: "date",
      required: true,
      row: "start",
    },
    {
      name: "startTime",
      label: "Start time",
      kind: "time",
      required: true,
      row: "start",
      when: timed,
    },
    {
      name: "endDate",
      label: "End date",
      kind: "date",
      hint: "For an event that ends on a later day.",
      row: "end",
    },
    {
      name: "endTime",
      label: "End time",
      kind: "time",
      hint: "Without one, it lasts an hour.",
      row: "end",
      when: timed,
    },
    {
      name: "timeZone",
      label: "Time zone",
      kind: "select",
      options,
      initial: zone,
      hint: "The times are in this time zone. The code holds them in UTC, so each phone shows them in its own time.",
      when: timed,
    },
    {
      name: "location",
      label: "Location",
      placeholder: "Hall 3, 1 Main St, Springfield",
    },
    {
      name: "description",
      label: "Description",
      kind: "textarea",
      placeholder: "Doors open at 7. Bring a friend.",
    },
    {
      name: "url",
      label: "Web page",
      placeholder: "https://example.com/launch",
      inputMode: "url",
    },
  ];
}

/** A note once the event makes a dense code (the payload is the editor's value). */
function LongEventNotice() {
  const t = useTranslations("editor.contentForms.calendarEventForm");
  const value = useQREditorStore((state) => state.value);
  const bytes = value.startsWith("BEGIN:VEVENT")
    ? new TextEncoder().encode(value).length
    : 0;
  if (bytes <= CALENDAR_EVENT_LONG_BYTES) return null;
  return (
    <p
      aria-live="polite"
      className="flex items-start gap-1.5 text-xs text-pretty text-amber-700 dark:text-amber-400"
    >
      <Warning2 className="mt-px size-3.5 shrink-0" />
      {t("longEvent")}
    </p>
  );
}

export function CalendarEventForm() {
  const t = useTranslations("editor.contentForms.calendarEventForm");
  // UTC in the server's HTML, this device's zone once hydrated: the form
  // starts again with it (the key), before anyone has typed.
  const zone = useSyncExternalStore(noSubscribe, deviceTimeZone, () => "UTC");
  const stored = useQREditorStore(
    (state) => state.contentConfigs["calendar-event"],
  ) as CalendarEventContent | undefined;
  const hasStored = stored !== undefined;
  const storedZone = stored?.timeZone;
  // An event stored without a time zone is in UTC, as the encoder reads it:
  // only a blank form starts in this device's zone.
  const fields = useMemo(
    () =>
      eventFields(hasStored ? "UTC" : zone, zoneOptions([zone, storedZone])),
    [hasStored, zone, storedZone],
  );
  return (
    <SchemaForm
      fields={fields}
      key={zone}
      note={t("note")}
      schema={calendarEventSchema}
      type="calendar-event"
    >
      <LongEventNotice />
    </SchemaForm>
  );
}

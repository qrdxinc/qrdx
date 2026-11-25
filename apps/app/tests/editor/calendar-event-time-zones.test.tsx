// @vitest-environment jsdom
// The calendar event form and the hosted event block's editor show time
// zones by their current names: Chrome reports India as Asia/Calcutta, and
// people know Asia/Kolkata (lib/time-zones.ts). A form or page saved under a
// retired name shows the current one and keeps the same times.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarEventForm } from "@/components/editor/content-forms/calendar-event-form";
import { EventEditor } from "@/lib/landing/blocks/event-editor";
import {
  type EventProps,
  eventSchema,
} from "@/lib/landing/blocks/event-schema";
import en from "@/messages/en.json";
import { useQREditorStore } from "@/store/editor-store";
import { DEFAULT_LANDING_THEME } from "@/types/landing";
import type { CalendarEventContent } from "@/types/qr-content";
import { encodeCalendarEvent } from "@/utils/calendar-event";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(node: ReactNode) {
  act(() => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {node}
      </NextIntlClientProvider>,
    );
  });
}

/** This device's zone, as Chrome reports it. */
function deviceZone(timeZone: string) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(
    function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), timeZone };
    },
  );
}

const zoneTrigger = () =>
  [...container.querySelectorAll("label")]
    .find((label) => label.textContent?.startsWith("Time zone"))
    ?.parentElement?.querySelector("button");

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  useQREditorStore.setState({
    contentType: "calendar-event",
    value: "",
    contentConfigs: {},
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("the calendar event form", () => {
  it("starts in this device's zone by its current name, with its offset", () => {
    deviceZone("Asia/Calcutta");
    render(<CalendarEventForm />);
    expect(zoneTrigger()?.textContent).toMatch(
      /^Asia\/Kolkata \(UTC\+05:30\)$/,
    );
  });

  it("shows an event saved as Asia/Calcutta as Asia/Kolkata, with the same code", () => {
    deviceZone("Europe/Berlin");
    const saved: CalendarEventContent = {
      type: "calendar-event",
      title: "Launch party",
      startDate: "2027-04-17",
      startTime: "18:00",
      endTime: "20:00",
      timeZone: "Asia/Calcutta",
    };
    const payload = encodeCalendarEvent(saved);
    useQREditorStore.setState({
      value: payload,
      contentConfigs: { "calendar-event": saved },
    });
    render(<CalendarEventForm />);
    const stored = useQREditorStore.getState().contentConfigs[
      "calendar-event"
    ] as CalendarEventContent;
    expect(stored.timeZone).toBe("Asia/Kolkata");
    expect(useQREditorStore.getState().value).toBe(payload);
    expect(payload).toContain("DTSTART:20270417T123000Z");
    expect(zoneTrigger()?.textContent).toBe("Asia/Kolkata (UTC+05:30)");
  });

  it("names offsets on the event's day (Paris in July is UTC+2)", () => {
    deviceZone("Europe/Berlin");
    useQREditorStore.setState({
      contentConfigs: {
        "calendar-event": {
          type: "calendar-event",
          title: "Summer fair",
          startDate: "2027-07-10",
          startTime: "10:00",
          timeZone: "Europe/Paris",
        },
      },
    });
    render(<CalendarEventForm />);
    expect(zoneTrigger()?.textContent).toBe("Europe/Paris (UTC+02:00)");
  });
});

describe("the hosted event block's editor", () => {
  const editor = {
    id: "block_1",
    context: {
      theme: DEFAULT_LANDING_THEME,
      pageId: null,
      storageEnabled: false,
    },
  };
  const props: EventProps = eventSchema.parse({
    title: "Launch party",
    start: "2027-04-17T18:00",
    timeZone: "Asia/Calcutta",
  });

  it("lists current names and shows a page saved as Asia/Calcutta as Asia/Kolkata", () => {
    deviceZone("Asia/Calcutta");
    render(<EventEditor {...editor} onChange={() => {}} value={props} />);
    const select = container.querySelector("select") as HTMLSelectElement;
    const options = [...select.options].map((option) => option.value);
    expect(select.value).toBe("Asia/Kolkata");
    expect(options).toContain("Asia/Kolkata");
    expect(options).not.toContain("Asia/Calcutta");
    expect(options).not.toContain("Europe/Kiev");
    expect(options[0]).toBe("UTC");
    // This device is in that zone already: no "Use mine".
    expect(container.textContent).not.toContain("Use mine");
  });

  it("offers this device's zone by its current name", () => {
    deviceZone("Asia/Calcutta");
    const onChange = vi.fn();
    render(
      <EventEditor
        {...editor}
        onChange={onChange}
        value={{ ...props, timeZone: "UTC" }}
      />,
    );
    const useMine = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Use mine",
    );
    act(() => useMine?.click());
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ timeZone: "Asia/Kolkata" }),
    );
  });
});

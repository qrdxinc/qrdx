// @vitest-environment jsdom
// The "New" tag on this round's official frames: every id in the batch is a
// real frame, the tag goes away the day after the batch's date, and a frame
// tile in the picker carries it top-right (beside the check when selected)
// and is named "<name>, new". The clock is fixed, so nothing here depends on
// the day the tests run.

import { NextIntlClientProvider } from "next-intl";
import { OFFICIAL_FRAMES } from "qrdx";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OptionTile } from "@/components/editor/control-sections/option-tiles";
import { useNewFrames } from "@/components/frames/use-new-frames";
import { isNewIn } from "@/lib/whats-new";
import { NEW_FRAMES } from "@/lib/whats-new/frames";
import en from "@/messages/en.json";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const DURING = () => new Date("2026-11-21T12:00:00Z");
const AFTER = () => new Date("2027-01-01T00:00:00Z");

const [BATCH] = NEW_FRAMES;
const NEW_ID = BATCH?.ids[0] ?? "";
const nameOf = (id: string) =>
  OFFICIAL_FRAMES.find((frame) => frame.id === id)?.name ?? "";

describe("the new frames batch", () => {
  it("names only frames the catalogue has, each once", () => {
    const ids = new Set(OFFICIAL_FRAMES.map((frame) => frame.id));
    const batch = NEW_FRAMES.flatMap((item) => item.ids);
    expect(batch.filter((id) => !ids.has(id))).toEqual([]);
    expect(batch).toHaveLength(101);
    expect(new Set(batch).size).toBe(batch.length);
    for (const item of NEW_FRAMES) {
      expect(item.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("is new until its date, and old the day after", () => {
    if (!BATCH) throw new Error("no batch");
    const last = `${BATCH.until}T23:59:59Z`;
    expect(isNewIn(NEW_FRAMES, NEW_ID, new Date(last))).toBe(true);
    expect(
      isNewIn(NEW_FRAMES, NEW_ID, new Date(`${BATCH.until}T00:00:00Z`)),
    ).toBe(true);
    const after = new Date(`${BATCH.until}T00:00:00Z`);
    after.setUTCDate(after.getUTCDate() + 1);
    expect(isNewIn(NEW_FRAMES, NEW_ID, after)).toBe(false);
    // The first frame the catalogue ever had is not new
    expect(isNewIn(NEW_FRAMES, "wifi-card", DURING())).toBe(false);
  });
});

/** A frame tile as the picker draws it (control-sections/frame-picker.tsx). */
function FrameTile({
  id,
  selected = false,
  clock,
}: {
  id: string;
  selected?: boolean;
  clock: () => Date;
}) {
  const isNewFrame = useNewFrames(clock);
  return (
    <OptionTile
      isNew={isNewFrame(id)}
      name={nameOf(id)}
      onSelect={() => undefined}
      selected={selected}
    >
      <span />
    </OptionTile>
  );
}

/** The hook with a clock written inline, a new function on every render. */
function InlineClockTile({ id }: { id: string }) {
  const isNewFrame = useNewFrames(() => new Date("2026-11-21T12:00:00Z"));
  return (
    <OptionTile
      isNew={isNewFrame(id)}
      name={nameOf(id)}
      onSelect={() => undefined}
      selected={false}
    >
      <span />
    </OptionTile>
  );
}

describe("a frame tile's tag", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (tile: Parameters<typeof FrameTile>[0]) =>
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={en}>
          <FrameTile {...tile} />
        </NextIntlClientProvider>,
      );
    });
  const button = () => container.querySelector("button");
  const pill = () =>
    [...container.querySelectorAll("span")].find(
      (span) => span.textContent === "New",
    );

  it("shows New on a frame from this round and names the tile '<name>, new'", () => {
    render({ id: NEW_ID, clock: DURING });
    expect(pill()).toBeDefined();
    expect(button()?.getAttribute("aria-label")).toBe(`${nameOf(NEW_ID)}, new`);
  });

  it("keeps New, beside the check, on the selected tile", () => {
    render({ id: NEW_ID, selected: true, clock: DURING });
    expect(button()?.getAttribute("aria-pressed")).toBe("true");
    expect(pill()?.className).toContain("right-6");
    expect(button()?.getAttribute("aria-label")).toBe(`${nameOf(NEW_ID)}, new`);
  });

  it("shows nothing on an older frame", () => {
    render({ id: "wifi-card", clock: DURING });
    expect(pill()).toBeUndefined();
    expect(button()?.hasAttribute("aria-label")).toBe(false);
  });

  it("drops the tag once the batch's date has passed", () => {
    render({ id: NEW_ID, clock: AFTER });
    expect(pill()).toBeUndefined();
  });

  it("reads an inline clock once, without rendering forever", () => {
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={en}>
          <InlineClockTile id={NEW_ID} />
        </NextIntlClientProvider>,
      );
    });
    expect(pill()).toBeDefined();
  });

  it("announces both on a new tile that may not scan", () => {
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={en}>
          <OptionTile
            isNew
            name="Hexagon"
            onSelect={() => undefined}
            risk="Thin modules"
            selected={false}
          >
            <span />
          </OptionTile>
        </NextIntlClientProvider>,
      );
    });
    expect(button()?.getAttribute("aria-label")).toBe(
      "Hexagon, new, may not scan",
    );
  });
});

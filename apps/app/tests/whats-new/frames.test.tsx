// @vitest-environment jsdom
// The "New" tag on this round's official frames: every id in the batch is a
// real frame, the tag goes away the day after the batch's date, and a frame
// tile shows it for a new frame and not for an old one.

import { NextIntlClientProvider } from "next-intl";
import { OFFICIAL_FRAMES } from "qrdx";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FrameNewTag } from "@/components/frames/frame-new-tag";
import { isNewIn } from "@/lib/whats-new";
import { NEW_FRAMES } from "@/lib/whats-new/frames";
import en from "@/messages/en.json";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("the new frames batch", () => {
  it("names only frames the catalogue has, and more than a hundred of them", () => {
    const ids = new Set(OFFICIAL_FRAMES.map((frame) => frame.id));
    const batch = NEW_FRAMES.flatMap((item) => item.ids);
    expect(batch.filter((id) => !ids.has(id))).toEqual([]);
    expect(batch.length).toBeGreaterThan(100);
    expect(new Set(batch).size).toBe(batch.length);
    for (const item of NEW_FRAMES) {
      expect(item.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("is new until its date, and old the day after", () => {
    const [batch] = NEW_FRAMES;
    if (!batch) throw new Error("no batch");
    const id = batch.ids[0] ?? "";
    expect(isNewIn(NEW_FRAMES, id, new Date(`${batch.until}T23:59:59Z`))).toBe(
      true,
    );
    expect(isNewIn(NEW_FRAMES, id, new Date(`${batch.until}T00:00:00Z`))).toBe(
      true,
    );
    const after = new Date(`${batch.until}T00:00:00Z`);
    after.setUTCDate(after.getUTCDate() + 1);
    expect(isNewIn(NEW_FRAMES, id, after)).toBe(false);
    // The first frame the catalogue ever had is not new
    expect(isNewIn(NEW_FRAMES, "wifi-card")).toBe(false);
  });
});

describe("the frame tile's tag", () => {
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

  const render = (id: string) =>
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={en}>
          <FrameNewTag id={id} />
        </NextIntlClientProvider>,
      );
    });

  it("shows New on a frame from this round, after mount", () => {
    const id = NEW_FRAMES[0]?.ids[0] ?? "";
    render(id);
    expect(container.textContent).toBe("New");
  });

  it("shows nothing on an older frame", () => {
    render("wifi-card");
    expect(container.textContent).toBe("");
  });
});

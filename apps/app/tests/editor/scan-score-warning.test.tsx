// @vitest-environment jsdom
// The scan score's quiet zone warning (owner, 23 Nov 2026): below 2 modules
// the score and grade stay as they are, the badge carries a warning mark so
// it's seen without opening the checks, the check list shows it as a warning
// (milder than a failure, above the passed checks) in plain words, and one
// click sets the margin to 2 where the badge can change the design.
import { NextIntlClientProvider } from "next-intl";
import type { ScanCheck, ScanScoreResult } from "qrdx";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const score = vi.hoisted(() => ({ next: null as ScanScoreResult | null }));

// The score itself is the engine's (packages/qrdx/tests/scan-score.test.ts);
// here it's a fixed result, so only the panel is tested.
vi.mock("@/lib/scan-score/off-page", () => ({
  getScanScoreOffPage: async () => {
    if (!score.next) throw new Error("no score set");
    return score.next;
  },
}));
vi.mock("@/lib/sound/emit", () => ({ soundEvent: () => undefined }));

const { ScanCheckList, ScanScoreBadge } = await import(
  "@/components/editor/scan-score"
);
const { defaultThemeState } = await import("@/config/qr");
const { SCAN_STUDY_URL } = await import("@/lib/scan-study");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const copy = en.editor.scanScore;

const WARNING: ScanCheck = {
  id: "quiet-zone",
  passed: false,
  severity: "warning",
  message: "No quiet zone around the code",
  fix: "Without a light border, the code may not scan on a dark or busy surface. Set the margin to 2 modules or more, or add a frame",
};
/** 1.5 to 2 modules: the check passes and costs nothing, and still warns. */
const PASSED_WARNING: ScanCheck = {
  ...WARNING,
  passed: true,
  message: "Quiet zone of only 1.5 modules",
};
const FAILED: ScanCheck = {
  id: "eye-shape",
  passed: false,
  message: "Circle eyes fail in some scanner apps",
  fix: "Use square or rounded eyes",
};
const PASSED: ScanCheck = {
  id: "contrast",
  passed: true,
  message: "Contrast 21:1",
};
const result = (checks: ScanCheck[]): ScanScoreResult => ({
  score: 95,
  grade: "great",
  checks,
});

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const render = (node: React.ReactNode) =>
  act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {node}
      </NextIntlClientProvider>,
    );
  });

/** Past the badge's debounce, with the score resolved. */
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });

const buttonNamed = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (button) => button.textContent === name,
  );

const addMargin = copy.addAMargin.replace("{modules, number}", "2");

describe("ScanCheckList", () => {
  it("lists failures, then warnings, then passed checks", async () => {
    await render(<ScanCheckList checks={[PASSED, WARNING, FAILED]} />);
    const items = [...container.querySelectorAll("li")].map(
      (item) => item.querySelector("p")?.textContent,
    );
    expect(items).toEqual([FAILED.message, WARNING.message, PASSED.message]);
  });

  it("marks a warning as one, with its fix in plain words", async () => {
    await render(<ScanCheckList checks={[WARNING]} />);
    expect(
      container.querySelector(`[aria-label="${copy.warning}"]`),
    ).not.toBeNull();
    expect(container.textContent).toContain(
      "may not scan on a dark or busy surface",
    );
    // No one-click fix without an action for it
    expect(buttonNamed(addMargin)).toBeUndefined();
  });

  it("shows a warning on a check that passed, with its fix and action", async () => {
    const onClick = vi.fn();
    await render(
      <ScanCheckList
        actions={{ "quiet-zone": { label: addMargin, onClick } }}
        checks={[PASSED, PASSED_WARNING]}
      />,
    );
    const first = container.querySelector("li");
    expect(first?.querySelector("p")?.textContent).toBe(PASSED_WARNING.message);
    expect(
      first?.querySelector(`[aria-label="${copy.warning}"]`),
    ).not.toBeNull();
    expect(first?.textContent).toContain("dark or busy surface");
    await act(async () => buttonNamed(addMargin)?.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("links the logo and contrast problems to the scan study, in a new tab", async () => {
    const logo: ScanCheck = {
      id: "logo",
      passed: false,
      message: "The logo covers too much of the code",
      fix: "Make the logo smaller",
    };
    const contrast: ScanCheck = {
      id: "contrast",
      passed: false,
      message: "Contrast 1.4:1",
      fix: "Darken the code or lighten the background",
    };
    await render(<ScanCheckList checks={[logo, contrast, WARNING, PASSED]} />);
    const links = [...container.querySelectorAll("a")].filter(
      (link) => link.textContent === copy.whyStudy,
    );
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe(SCAN_STUDY_URL);
      expect(link.getAttribute("target")).toBe("_blank");
    }
    // Not on the quiet zone warning, nor on a contrast check that passed.
    const items = [...container.querySelectorAll("li")];
    expect(items[2]?.querySelector("a")).toBeNull();
    expect(items[3]?.querySelector("a")).toBeNull();
  });

  it("offers a check's one-click fix and runs it", async () => {
    const onClick = vi.fn();
    await render(
      <ScanCheckList
        actions={{ "quiet-zone": { label: addMargin, onClick } }}
        checks={[WARNING, PASSED]}
      />,
    );
    const button = buttonNamed(addMargin);
    expect(button).toBeDefined();
    await act(async () => button?.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("ScanScoreBadge", () => {
  const style = { ...defaultThemeState.styles, margin: 0 };

  it("keeps the score and grade and adds a warning mark", async () => {
    score.next = result([WARNING, PASSED]);
    await render(<ScanScoreBadge style={style} value="https://qrdx.dev" />);
    await settle();
    const badge = container.querySelector("button[data-scan-score-badge]");
    expect(badge?.textContent).toBe("Scan score 95 · Great");
    expect(badge?.getAttribute("aria-label")).toBe(
      "Scan score 95, Great, with a warning. Show checks",
    );
    expect(badge?.querySelectorAll("svg")).toHaveLength(1);
  });

  it("marks a warning on a passed check too, score unchanged", async () => {
    score.next = { ...result([PASSED_WARNING, PASSED]), score: 100 };
    await render(
      <ScanScoreBadge
        style={{ ...style, margin: 1.5 }}
        value="https://qrdx.dev"
      />,
    );
    await settle();
    const badge = container.querySelector("button[data-scan-score-badge]");
    expect(badge?.textContent).toBe("Scan score 100 · Great");
    expect(badge?.getAttribute("aria-label")).toBe(
      "Scan score 100, Great, with a warning. Show checks",
    );
  });

  it("shows no mark without a warning", async () => {
    score.next = result([PASSED]);
    await render(
      <ScanScoreBadge
        style={{ ...style, margin: 2 }}
        value="https://qrdx.dev"
      />,
    );
    await settle();
    const badge = container.querySelector("button[data-scan-score-badge]");
    expect(badge?.getAttribute("aria-label")).toBe(
      "Scan score 95, Great. Show checks",
    );
    expect(badge?.querySelectorAll("svg")).toHaveLength(0);
  });

  it("sets the margin to 2 in one click", async () => {
    score.next = result([WARNING, PASSED]);
    const onStyleChange = vi.fn();
    await render(
      <ScanScoreBadge
        onStyleChange={onStyleChange}
        style={style}
        value="https://qrdx.dev"
      />,
    );
    await settle();
    const badge = container.querySelector<HTMLButtonElement>(
      "button[data-scan-score-badge]",
    );
    await act(async () => badge?.click());
    const fix = buttonNamed(addMargin);
    expect(fix).toBeDefined();
    await act(async () => fix?.click());
    expect(onStyleChange).toHaveBeenCalledWith({ margin: 2 });
  });
});

// getScanScore runs in the browser; here its canvas and Image are backed by
// the test rasterizer (tests/support/fake-dom.ts), so the real scoring code,
// camera simulation and jsQR decoding all run. Expectations come from what a
// user needs from a "will it scan" check, not from the current weights.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { h } from "../src/core";
import {
  drawScanFrames,
  getScanScore,
  getScanScoreFromFrames,
  QUIET_ZONE_MIN,
  type ScanCheck,
} from "../src/scan-score";
import { getTemplateCodeShare } from "../src/template-placement";
import type { QRProps, TemplateDefinition } from "../types";
import { installFakeDom } from "./support/fake-dom";
import { capture } from "./support/qr";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const PLAIN: QRProps = {
  value: VALUE,
  size: 256,
  margin: 4,
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
};

/** A custom template that draws the code at half its artwork's width. */
const HALF: TemplateDefinition = {
  id: "half",
  name: "Half",
  wrapper: (children, props) =>
    h(
      "svg",
      { viewBox: "0 0 300 300", xmlns: "http://www.w3.org/2000/svg" },
      h("circle", {
        cx: 150,
        cy: 150,
        r: 140,
        fill: "none",
        stroke: props?.fgColor ?? "#000000",
        strokeWidth: 8,
      }),
      h("g", { transform: "translate(75, 75) scale(0.5)" }, children)
    ),
};

/**
 * A ring like Flam's: a 593-unit drawing with the code's 300 × 300 drawing
 * in a nested <svg> in the middle.
 */
const RING: TemplateDefinition = {
  id: "ring",
  name: "Ring",
  wrapper: (children) =>
    h(
      "svg",
      { viewBox: "0 0 593 593", xmlns: "http://www.w3.org/2000/svg" },
      h("circle", {
        cx: 296.5,
        cy: 296.5,
        r: 270,
        fill: "none",
        stroke: "#111827",
        strokeWidth: 40,
      }),
      h(
        "svg",
        { x: 146.5, y: 146.5, width: 300, height: 300, viewBox: "0 0 300 300" },
        children
      )
    ),
};

describe("getScanScore outside a browser", () => {
  it("rejects with a clear error when there is no DOM", async () => {
    await expect(getScanScore(PLAIN)).rejects.toThrow(/needs a browser/);
    await expect(drawScanFrames(PLAIN)).rejects.toThrow(/needs a browser/);
  });
});

describe("getScanScore", () => {
  let uninstall: () => void;
  beforeAll(() => {
    uninstall = installFakeDom();
  });
  afterAll(() => uninstall());

  it("grades a plain black-on-white code with a quiet zone as great", async () => {
    const result = await getScanScore(PLAIN);
    expect(result.grade).toBe("great");
    expect(result.score).toBeGreaterThanOrEqual(85);
    const passed = (id: string) =>
      result.checks.find((c) => c.id === id)?.passed;
    expect(passed("contrast")).toBe(true);
    expect(passed("polarity")).toBe(true);
    expect(passed("quiet-zone")).toBe(true);
    expect(passed("decode-320")).toBe(true);
  });

  it("returns a score between 0 and 100 and a fix for every failed check", async () => {
    const result = await getScanScore({
      ...PLAIN,
      fgColor: "#9a9a9a",
      bgColor: "#b0b0b0",
      cornerEyePattern: "curly",
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    for (const check of result.checks.filter((c) => !c.passed)) {
      expect(check.fix, check.id).toBeTruthy();
    }
  });

  it("scores low contrast lower than high contrast for the same design", async () => {
    const high = await getScanScore(PLAIN);
    const low = await getScanScore({
      ...PLAIN,
      fgColor: "#8a8a8a",
      bgColor: "#c8c8c8",
    });
    expect(low.score).toBeLessThan(high.score);
    expect(low.checks.find((check) => check.id === "contrast")?.passed).toBe(
      false
    );
  });

  it.each<[string, QRProps]>([
    ["plain", PLAIN],
    [
      "dotted with gear eyes",
      { ...PLAIN, bodyPattern: "circle", cornerEyePattern: "gear" },
    ],
    [
      "mid-grey on light grey",
      { ...PLAIN, fgColor: "#666666", bgColor: "#dddddd" },
    ],
    ["inverted", { ...PLAIN, fgColor: "#ffffff", bgColor: "#111111" }],
    ["no quiet zone", { ...PLAIN, margin: 0 }],
  ])(
    "never grades a code that reads at the largest size as fails (%s)",
    async (_name, props) => {
      const result = await getScanScore(props);
      const readsLarge = result.checks.find(
        (c) => c.id === "decode-320"
      )?.passed;
      // Cross-check with an independent capture at a typical phone distance.
      if (
        readsLarge &&
        capture(props, { modulePx: 6, page: props.bgColor as string }) === VALUE
      ) {
        expect(result.grade).not.toBe("fails");
      }
    }
  );

  it("grades a code that cannot be read as fails", async () => {
    const result = await getScanScore({
      ...PLAIN,
      fgColor: "#ffffff",
      bgColor: "#ffffff",
    });
    expect(result.grade).toBe("fails");
    expect(result.score).toBeLessThanOrEqual(30);
  });

  it("is deterministic for the same props", async () => {
    const props: QRProps = {
      ...PLAIN,
      bodyPattern: "circle",
      cornerEyePattern: "gear",
    };
    const first = await getScanScore(props);
    const second = await getScanScore(props);
    expect(second).toEqual(first);
  });

  it("flags light-on-dark codes as a polarity risk", async () => {
    const result = await getScanScore({
      ...PLAIN,
      fgColor: "#ffffff",
      bgColor: "#000000",
    });
    expect(result.checks.find((check) => check.id === "polarity")?.passed).toBe(
      false
    );
  });

  it("tests a code in a custom template at the size the template draws it", async () => {
    // A template draws the code at a share of its artwork
    expect(getTemplateCodeShare({ value: VALUE })).toBe(1);
    expect(getTemplateCodeShare({ value: VALUE, customTemplate: HALF })).toBe(
      0.5
    );
    expect(
      getTemplateCodeShare({ value: VALUE, customTemplate: RING })
    ).toBeCloseTo(300 / 593, 6);
    // A wrapper that doesn't place the code, or throws, counts as the whole
    const unplaced: TemplateDefinition = {
      id: "unplaced",
      name: "Unplaced",
      wrapper: () => h("svg", { viewBox: "0 0 300 300" }),
    };
    const throwing: TemplateDefinition = {
      id: "throwing",
      name: "Throwing",
      wrapper: () => {
        throw new Error("no");
      },
    };
    expect(
      getTemplateCodeShare({ value: VALUE, customTemplate: unplaced })
    ).toBe(1);
    expect(
      getTemplateCodeShare({ value: VALUE, customTemplate: throwing })
    ).toBe(1);
    // So a code that scans well on its own scores well in a template too
    for (const customTemplate of [HALF, RING]) {
      const result = await getScanScore({ ...PLAIN, customTemplate });
      const passed = (id: string) =>
        result.checks.find((c) => c.id === id)?.passed;
      expect(result.grade, customTemplate.id).toBe("great");
      expect(passed("decode-160"), customTemplate.id).toBe(true);
      expect(passed("decode-320"), customTemplate.id).toBe(true);
    }
  });

  it("scores a code in a former template's frame at the code's own size", async () => {
    // The frames add their artwork around the code, which keeps its size
    for (const style of ["arrow", "pumpkin", "dot-ring"] as const) {
      const result = await getScanScore({ ...PLAIN, frame: { style } });
      const passed = (id: string) =>
        result.checks.find((c) => c.id === id)?.passed;
      expect(result.grade, style).toBe("great");
      expect(passed("decode-160"), style).toBe(true);
      expect(passed("decode-320"), style).toBe(true);
    }
  });

  it("flags a missing quiet zone", async () => {
    const result = await getScanScore({ ...PLAIN, margin: 0 });
    expect(
      result.checks.find((check) => check.id === "quiet-zone")?.passed
    ).toBe(false);
  });

  describe("quiet zone warning", () => {
    const quietZone = (result: { checks: ScanCheck[] }) =>
      result.checks.find((check) => check.id === "quiet-zone");

    it("warns below QUIET_ZONE_MIN modules, in plain words with a fix", async () => {
      expect(QUIET_ZONE_MIN).toBe(2);
      for (const margin of [0, 1, 1.5]) {
        const check = quietZone(await getScanScore({ ...PLAIN, margin }));
        expect(check?.severity, `margin ${margin}`).toBe("warning");
        expect(check?.fix).toMatch(/dark or busy surface/);
        expect(check?.fix).toMatch(/margin to 2 modules/);
      }
      const none = quietZone(await getScanScore({ ...PLAIN, margin: 0 }));
      expect(none?.message).toBe("No quiet zone around the code");
      const one = quietZone(await getScanScore({ ...PLAIN, margin: 1 }));
      expect(one?.message).toBe("Quiet zone of only 1 module");
    });

    it("passes from QUIET_ZONE_MIN modules up, with no warning", async () => {
      for (const margin of [2, 3, 4, 8]) {
        const check = quietZone(await getScanScore({ ...PLAIN, margin }));
        expect(check?.passed, `margin ${margin}`).toBe(true);
        expect(check?.severity, `margin ${margin}`).toBeUndefined();
      }
    });

    it("counts a frame's light gap towards it", async () => {
      // One module of margin warns on its own; the banner's plate keeps a
      // light gap of 7% of the code's width around it, about 2 modules more.
      const check = quietZone(
        await getScanScore({
          ...PLAIN,
          margin: 1,
          frame: { style: "banner-bottom", text: "Scan me", color: "#000000" },
        })
      );
      expect(check?.passed).toBe(true);
      expect(check?.severity).toBeUndefined();
    });

    // The warning is display-only (owner, 23 Nov 2026): for every margin the
    // score, the grade and the check's `passed` are what staging's scorer
    // gave before the warning existed. Expected values: origin/staging
    // 2d73ef02a's scan-score.ts run side by side with this one on these
    // designs (24 Nov 2026), identical for every row. `passed` drives the
    // repairs (lib/qr-design/repair.ts) and MCP design_qr's stillFailing, so
    // those don't change either.
    const EDITOR_LOOK: QRProps = {
      ...PLAIN,
      bodyPattern: "circle",
      cornerEyePattern: "gear",
      cornerEyeDotPattern: "circle",
      level: "Q",
    };
    const BEFORE: Record<
      string,
      { props: QRProps; rows: [number, number, boolean][] }
    > = {
      "square modules": {
        props: PLAIN,
        rows: [
          [0, 95, false],
          [0.5, 95, false],
          [1, 95, false],
          [1.5, 100, true],
          [1.75, 100, true],
          [2, 100, true],
          [3, 100, true],
          [4, 92, true],
        ],
      },
      "the editor's default look": {
        props: EDITOR_LOOK,
        rows: [
          [0, 95, false],
          [0.5, 95, false],
          [1, 95, false],
          [1.5, 92, true],
          [1.75, 100, true],
          [2, 100, true],
          [3, 92, true],
          [4, 92, true],
        ],
      },
    };
    for (const [look, { props, rows }] of Object.entries(BEFORE)) {
      it(`keeps the score, grade and pass of every margin in ${look}`, async () => {
        for (const [margin, score, passed] of rows) {
          const result = await getScanScore({ ...props, margin });
          const check = quietZone(result);
          expect(result.score, `margin ${margin}`).toBe(score);
          expect(result.grade, `margin ${margin}`).toBe("great");
          expect(check?.passed, `margin ${margin}`).toBe(passed);
          expect(check?.severity, `margin ${margin}`).toBe(
            margin < QUIET_ZONE_MIN ? "warning" : undefined
          );
        }
      });
    }
  });

  it("flags a logo that covers more than the error correction can recover", async () => {
    const logo = `data:image/svg+xml,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#e11d48"/></svg>'
    )}`;
    const result = await getScanScore({
      ...PLAIN,
      level: "L",
      imageSettings: { src: logo, width: 90, height: 90, excavate: true },
    });
    const check = result.checks.find((c) => c.id === "logo");
    expect(check?.passed).toBe(false);
    expect(check?.fix).toMatch(/level|smaller/i);
  });

  it("honors an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      getScanScore(PLAIN, { signal: controller.signal })
    ).rejects.toThrow(/aborted/i);
  });
});

// The editor draws the frames on the page and scores them in a Web Worker
// (apps/app/components/editor/scan-score-worker.ts): the result must be
// getScanScore's, check for check.
describe("drawScanFrames and getScanScoreFromFrames", () => {
  let uninstall: () => void;
  beforeAll(() => {
    uninstall = installFakeDom();
  });
  afterAll(() => uninstall());

  const DESIGNS: [string, QRProps][] = [
    ["plain", PLAIN],
    [
      "coloured dots",
      {
        ...PLAIN,
        bodyPattern: "circle",
        cornerEyePattern: "rounded",
        cornerEyeDotPattern: "circle",
        fgColor: "#1e3a8a",
      },
    ],
    ["low contrast", { ...PLAIN, fgColor: "#9a9a9a", bgColor: "#b0b0b0" }],
    ["light on dark", { ...PLAIN, fgColor: "#ffffff", bgColor: "#111111" }],
    ["no quiet zone", { ...PLAIN, margin: 0 }],
    ["in a former template's frame", { ...PLAIN, frame: { style: "arrow" } }],
    ["in a custom template", { ...PLAIN, customTemplate: HALF }],
    [
      "framed",
      { ...PLAIN, frame: { style: "banner-bottom", text: "Scan me" } },
    ],
  ];

  for (const [name, props] of DESIGNS) {
    it(`scores ${name} exactly as getScanScore does`, async () => {
      const frames = await drawScanFrames(props);
      expect(await getScanScoreFromFrames(props, frames)).toEqual(
        await getScanScore(props)
      );
    });
  }

  it("draws every frame the score may decode, at the sizes asked for", async () => {
    const frames = await drawScanFrames(PLAIN, { sizes: [320, 96] });
    expect(frames.sizes).toEqual([96, 320]);
    expect(frames.frames.map((frame) => frame.codeWidth)).toEqual([
      96 * 0.9,
      96,
      96 * 1.1,
      320 * 0.9,
      320,
      320 * 1.1,
    ]);
    for (const frame of frames.frames) {
      expect(frame.data).toHaveLength(frame.width * frame.height * 4);
    }
  });

  it("scores frames that crossed to a worker, and leaves them as they were", async () => {
    const props = DESIGNS[1]?.[1] as QRProps;
    // postMessage hands a worker a structured clone
    const posted = structuredClone(await drawScanFrames(props));
    const before = posted.frames.map((frame) => frame.data.slice());
    const first = await getScanScoreFromFrames(props, posted);
    expect(posted.frames.map((frame) => frame.data)).toEqual(before);
    expect(await getScanScoreFromFrames(props, posted)).toEqual(first);
  });

  it("says which frame is missing when the sizes don't match", async () => {
    const frames = await drawScanFrames(PLAIN, { sizes: [96] });
    await expect(
      getScanScoreFromFrames(PLAIN, { ...frames, sizes: [96, 160] })
    ).rejects.toThrow(/No scan frame with the code 144 px wide/);
  });

  it("honors an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const frames = await drawScanFrames(PLAIN);
    await expect(
      getScanScoreFromFrames(PLAIN, frames, { signal: controller.signal })
    ).rejects.toThrow(/aborted/i);
  });
});

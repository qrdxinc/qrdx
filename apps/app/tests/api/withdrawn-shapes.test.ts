// Shapes that preview builds offered and that were withdrawn before release
// (qrdx WITHDRAWN_*): an image API call, a playground link or a saved design
// that still names one gets the shape it maps to, never an error.
import {
  WITHDRAWN_BODY_PATTERNS,
  WITHDRAWN_CORNER_EYE_DOT_PATTERNS,
  WITHDRAWN_CORNER_EYE_PATTERNS,
} from "qrdx/types";
import { describe, expect, it } from "vitest";
import { qrImageQuerySchema } from "@/app/api/v1/qr/_lib/query";
import { decodeStyleParam } from "@/lib/playground-style";
import {
  type LinkableStyle,
  packStyleParam,
} from "@/lib/playground-style-pack";
import { qrOptionsSchema } from "@/lib/qr-render";
import { themeStylePropsSchema } from "@/types/theme";

const bodies = Object.entries(WITHDRAWN_BODY_PATTERNS);
const eyes = Object.entries(WITHDRAWN_CORNER_EYE_PATTERNS);
const dots = Object.entries(WITHDRAWN_CORNER_EYE_DOT_PATTERNS);

describe("the image API", () => {
  it.each(bodies)("body=%s renders as %s", (id, fallback) => {
    expect(qrOptionsSchema.parse({ data: "x", body: id }).body).toBe(fallback);
    expect(qrImageQuerySchema.parse({ data: "x", body: id }).body).toBe(
      fallback,
    );
  });
  it.each(eyes)("eye=%s renders as %s", (id, fallback) => {
    expect(qrOptionsSchema.parse({ data: "x", eye: id }).eye).toBe(fallback);
    expect(qrImageQuerySchema.parse({ data: "x", eye: id }).eye).toBe(fallback);
  });
  it.each(dots)("dot=%s renders as %s", (id, fallback) => {
    expect(qrOptionsSchema.parse({ data: "x", dot: id }).dot).toBe(fallback);
    expect(qrImageQuerySchema.parse({ data: "x", dot: id }).dot).toBe(fallback);
  });
  it("keeps its defaults", () => {
    const parsed = qrOptionsSchema.parse({ data: "x" });
    expect([parsed.body, parsed.eye, parsed.dot]).toEqual([
      "square",
      "square",
      "square",
    ]);
  });
});

describe("a playground link from a preview build", () => {
  it("opens with the shapes the withdrawn ones map to", () => {
    // Packed unchecked, as the encoder of a preview build wrote it
    const link = packStyleParam({
      bodyPattern: "bubble",
      cornerEyePattern: "tag",
      cornerEyeDotPattern: "notch",
    } as unknown as LinkableStyle);
    expect(decodeStyleParam(link)?.styles).toMatchObject({
      bodyPattern: "circle",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "square",
    });
  });
});

describe("a saved design", () => {
  it.each([
    ...bodies.map(([id, fallback]) => ["bodyPattern", id, fallback]),
    ...eyes.map(([id, fallback]) => ["cornerEyePattern", id, fallback]),
    ...dots.map(([id, fallback]) => ["cornerEyeDotPattern", id, fallback]),
  ])("%s %s loads as %s", (key, id, fallback) => {
    const parsed = themeStylePropsSchema.parse({ [key]: id }) as Record<
      string,
      unknown
    >;
    expect(parsed[key]).toBe(fallback);
  });
});

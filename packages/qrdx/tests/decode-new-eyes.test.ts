// The eye frames added after 0.0.57, with body + centre partners: each reads
// every render that gear and octagon eyes (whose round or cut corners they
// share) read with the same partners (tests/support/new-shapes.ts).
//
// Sample: 8 of the pickable body + centre pairings that warn for none of the
// eyes (a stride over the catalogue order), plus the default circle body
// with a rounded centre, the pairing the editor's eye presets use most.
import { describe, expect, it, it as test } from "vitest";
import type { CornerEyeDotPattern } from "../types/corner-dot";
import { CORNER_EYE_DOT_PATTERNS } from "../types/corner-dot";
import {
  CORNER_EYE_PATTERNS,
  type CornerEyePattern,
} from "../types/corner-eye";
import { BODY_PATTERN } from "../types/image-pattern";
import { newValues } from "./support/catalog";
import {
  missesOf,
  missesOfItsOwn,
  type Style,
  stride,
  unflagged,
} from "./support/new-shapes";

const NEW_EYES = newValues(CORNER_EYE_PATTERNS, "porthole");
const REFERENCES: CornerEyePattern[] = ["gear", "octagon"];

const pairings = BODY_PATTERN.flatMap((body) =>
  CORNER_EYE_DOT_PATTERNS.map((dot) => ({ body, dot }))
).filter(({ body, dot }) =>
  [...NEW_EYES, ...REFERENCES].every((eye) =>
    unflagged({
      bodyPattern: body,
      cornerEyePattern: eye,
      cornerEyeDotPattern: dot,
    })
  )
);
const PARTNERS = [
  { body: "circle", dot: "rounded" } as const,
  ...stride(pairings, 8),
];

test("the new eyes are the ones added after 0.0.57", () => {
  expect(NEW_EYES).toEqual([
    "porthole",
    "doodle",
    "notch",
    "plus",
    "stamp",
    "bud",
    "bowl",
  ]);
});

describe.each(NEW_EYES)("%s eyes", (eye) => {
  test.each(PARTNERS)(
    "with a $body body and $dot centres: read wherever gear and octagon eyes do",
    async ({ body, dot }) => {
      const style = (cornerEyePattern: CornerEyePattern): Style => ({
        bodyPattern: body,
        cornerEyePattern,
        cornerEyeDotPattern: dot,
      });
      expect(await missesOfItsOwn(style(eye), REFERENCES.map(style))).toEqual(
        []
      );
    },
    300_000
  );
});

// Why the editor pairs these eyes with round centres: a square centre in a
// ring with cut or round corners is missed by jsQR in some sharp renders,
// the mirror image of a circle centre in square-cornered eyes. Gear and
// octagon eyes, whose corners the new ones share, do the same; the docs say
// so (features/patterns.mdx).
describe("a square centre in round- or cut-cornered eyes", () => {
  const sharpJsqr = (missed: string[]) =>
    missed.filter(
      (render) => render.startsWith("sharp") && render.includes("jsQR")
    );
  it.each([...REFERENCES, ...NEW_EYES])(
    "%s eyes: missed in some sharp renders with the default body",
    async (eye) => {
      const square: CornerEyeDotPattern = "square";
      const missed = await missesOf({
        bodyPattern: "circle",
        cornerEyePattern: eye,
        cornerEyeDotPattern: square,
      });
      expect(sharpJsqr(missed).length).toBeGreaterThan(0);
    },
    300_000
  );
});

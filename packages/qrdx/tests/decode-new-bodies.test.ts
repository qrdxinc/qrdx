// The body patterns added after 0.0.57, with eye + centre partners: each
// reads every render that the circle, square and rounded bodies read with
// the same partners (tests/support/new-shapes.ts).
//
// Sample: 10 of the pickable eye + centre pairings that warn for none of
// the bodies (a stride over the catalogue order), plus the defaults (gear
// eyes, circle centre).
import { describe, expect, it as test } from "vitest";
import { CORNER_EYE_DOT_PATTERNS } from "../types/corner-dot";
import { CORNER_EYE_PATTERNS } from "../types/corner-eye";
import { BODY_PATTERN, type BodyPattern } from "../types/image-pattern";
import { newValues } from "./support/catalog";
import {
  missesOfItsOwn,
  type Style,
  stride,
  unflagged,
} from "./support/new-shapes";

const NEW_BODIES = newValues(BODY_PATTERN, "pebble");
const REFERENCES: BodyPattern[] = ["circle", "square", "rounded"];

const pairings = CORNER_EYE_PATTERNS.flatMap((eye) =>
  CORNER_EYE_DOT_PATTERNS.map((dot) => ({ eye, dot }))
).filter(({ eye, dot }) =>
  [...NEW_BODIES, ...REFERENCES].every((body) =>
    unflagged({
      bodyPattern: body,
      cornerEyePattern: eye,
      cornerEyeDotPattern: dot,
    })
  )
);
const PARTNERS = [
  { eye: "gear", dot: "circle" } as const,
  ...stride(pairings, 10),
];

test("the new bodies are the ones added after 0.0.57", () => {
  expect(NEW_BODIES).toEqual(["pebble"]);
});

describe.each(NEW_BODIES)("%s body", (body) => {
  test.each(PARTNERS)(
    "with $eye eyes and $dot centres: reads wherever circle, square and rounded do",
    async ({ eye, dot }) => {
      const style = (bodyPattern: BodyPattern): Style => ({
        bodyPattern,
        cornerEyePattern: eye,
        cornerEyeDotPattern: dot,
      });
      expect(await missesOfItsOwn(style(body), REFERENCES.map(style))).toEqual(
        []
      );
    },
    300_000
  );
});

// The eye centre added after 0.0.57, with body + eye partners: it reads
// every render that square and rounded centres read with the same partners
// (tests/support/new-shapes.ts).
//
// Sample: 12 of the pickable body + eye pairings that warn for none of the
// centres (a stride over the catalogue order), plus the defaults (circle
// body, gear eyes).
import { describe, expect, it as test } from "vitest";
import {
  CORNER_EYE_DOT_PATTERNS,
  type CornerEyeDotPattern,
} from "../types/corner-dot";
import { CORNER_EYE_PATTERNS } from "../types/corner-eye";
import { BODY_PATTERN } from "../types/image-pattern";
import { newValues } from "./support/catalog";
import {
  missesOfItsOwn,
  type Style,
  stride,
  unflagged,
} from "./support/new-shapes";

const NEW_CENTRES = newValues(CORNER_EYE_DOT_PATTERNS, "cushion");
const REFERENCES: CornerEyeDotPattern[] = ["square", "rounded"];

const pairings = BODY_PATTERN.flatMap((body) =>
  CORNER_EYE_PATTERNS.map((eye) => ({ body, eye }))
).filter(({ body, eye }) =>
  [...NEW_CENTRES, ...REFERENCES].every((dot) =>
    unflagged({
      bodyPattern: body,
      cornerEyePattern: eye,
      cornerEyeDotPattern: dot,
    })
  )
);
const PARTNERS = [
  { body: "circle", eye: "gear" } as const,
  ...stride(pairings, 12),
];

test("the new centre is the one added after 0.0.57", () => {
  expect(NEW_CENTRES).toEqual(["cushion"]);
});

describe.each(NEW_CENTRES)("%s centre", (centre) => {
  test.each(PARTNERS)(
    "with a $body body and $eye eyes: reads wherever square and rounded centres do",
    async ({ body, eye }) => {
      const style = (cornerEyeDotPattern: CornerEyeDotPattern): Style => ({
        bodyPattern: body,
        cornerEyePattern: eye,
        cornerEyeDotPattern,
      });
      expect(
        await missesOfItsOwn(style(centre), REFERENCES.map(style))
      ).toEqual([]);
    },
    300_000
  );
});

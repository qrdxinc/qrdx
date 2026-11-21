// Compiled by tests/id-options.test.ts (tsc --noEmit), never run. Each
// prompt list must be checked against its catalogue's type: if idOptions
// were cast to what the prompt expects, the @ts-expect-error lines would be
// unused and tsc would fail.
import type * as p from "@clack/prompts";
import {
  BODY_PATTERN,
  type BodyPattern,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  type CornerEyeDotPattern,
  type CornerEyePattern,
} from "qrdx";
import { idOptions } from "../../../src/lib/id-options";

type Options<Value> = Parameters<typeof p.select<Value>>[0]["options"];

export const body: Options<BodyPattern> = idOptions(BODY_PATTERN);
export const eye: Options<CornerEyePattern> = idOptions(CORNER_EYE_PATTERNS);
export const centre: Options<CornerEyeDotPattern> = idOptions(
  CORNER_EYE_DOT_PATTERNS
);

// @ts-expect-error body patterns are not eye centres
export const wrongCentre: Options<CornerEyeDotPattern> =
  idOptions(BODY_PATTERN);
// @ts-expect-error eye centres are not eye frames
export const wrongEye: Options<CornerEyePattern> = idOptions(
  CORNER_EYE_DOT_PATTERNS
);

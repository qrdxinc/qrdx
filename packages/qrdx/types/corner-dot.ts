import { z } from "zod";
import {
  CORNER_EYE_DOT_PATTERNS,
  RETIRED_CORNER_EYE_DOT_PATTERNS,
  WITHDRAWN_CORNER_EYE_DOT_PATTERNS,
  withdrawnFallback,
} from "./constants";

export {
  CORNER_EYE_DOT_PATTERNS,
  RETIRED_CORNER_EYE_DOT_PATTERNS,
  WITHDRAWN_CORNER_EYE_DOT_PATTERNS,
} from "./constants";

const fallback = (value: unknown) =>
  withdrawnFallback(WITHDRAWN_CORNER_EYE_DOT_PATTERNS, value);

/**
 * Accepts current and retired values, so saved designs still validate; a
 * withdrawn id parses as the shape it maps to.
 */
export const cornerEyeDotPatternSchema = z.preprocess(
  fallback,
  z.enum([...CORNER_EYE_DOT_PATTERNS, ...RETIRED_CORNER_EYE_DOT_PATTERNS])
);

/** Current values only: for anything that offers a choice (UI, AI, MCP). */
export const pickableCornerEyeDotPatternSchema = z.preprocess(
  fallback,
  z.enum(CORNER_EYE_DOT_PATTERNS)
);

// Inferred types
export type CornerEyeDotPattern = z.infer<typeof cornerEyeDotPatternSchema>;
export type PickableCornerEyeDotPattern =
  (typeof CORNER_EYE_DOT_PATTERNS)[number];

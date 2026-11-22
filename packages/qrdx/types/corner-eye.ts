import { z } from "zod";
import {
  CORNER_EYE_PATTERNS,
  RETIRED_CORNER_EYE_PATTERNS,
  WITHDRAWN_CORNER_EYE_PATTERNS,
  withdrawnFallback,
} from "./constants";

export {
  CORNER_EYE_PATTERNS,
  RETIRED_CORNER_EYE_PATTERNS,
  WITHDRAWN_CORNER_EYE_PATTERNS,
} from "./constants";

const fallback = (value: unknown) =>
  withdrawnFallback(WITHDRAWN_CORNER_EYE_PATTERNS, value);

/**
 * Accepts current and retired values, so saved designs still validate; a
 * withdrawn id parses as the shape it maps to.
 */
export const cornerEyePatternSchema = z.preprocess(
  fallback,
  z.enum([...CORNER_EYE_PATTERNS, ...RETIRED_CORNER_EYE_PATTERNS])
);

/** Current values only: for anything that offers a choice (UI, AI, MCP). */
export const pickableCornerEyePatternSchema = z.preprocess(
  fallback,
  z.enum(CORNER_EYE_PATTERNS)
);

// Inferred types
export type CornerEyePattern = z.infer<typeof cornerEyePatternSchema>;
export type PickableCornerEyePattern = (typeof CORNER_EYE_PATTERNS)[number];

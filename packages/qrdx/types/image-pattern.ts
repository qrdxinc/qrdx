import { z } from "zod";
import {
  BODY_PATTERN,
  WITHDRAWN_BODY_PATTERNS,
  withdrawnFallback,
} from "./constants";

export { BODY_PATTERN, WITHDRAWN_BODY_PATTERNS } from "./constants";

// Zod schema: a withdrawn id parses as the shape it maps to
export const bodyPatternSchema = z.preprocess(
  (value) => withdrawnFallback(WITHDRAWN_BODY_PATTERNS, value),
  z.enum(BODY_PATTERN)
);

// Inferred type
export type BodyPattern = z.infer<typeof bodyPatternSchema>;

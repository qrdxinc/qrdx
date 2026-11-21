// The shapes added in the November 2026 patterns round (qrdx after 0.0.57):
// the pickers tag them "New" until the batch's date passes.
import type { NewBatch } from "./index";

export const NEW_BODY_PATTERNS: NewBatch[] = [
  {
    ids: ["pebble"],
    until: "2026-12-31",
  },
];

export const NEW_EYE_FRAMES: NewBatch[] = [
  {
    ids: ["porthole", "doodle", "notch", "plus", "stamp", "bud", "bowl"],
    until: "2026-12-31",
  },
];

export const NEW_EYE_CENTRES: NewBatch[] = [
  { ids: ["cushion"], until: "2026-12-31" },
];

// The shapes added in the November 2026 patterns round (qrdx after 0.0.57):
// the pickers tag them "New" until the batch's date passes.
import type { NewBatch } from "./index";

export const NEW_BODY_PATTERNS: NewBatch[] = [
  {
    ids: [
      "x",
      "flower",
      "pebble",
      "bubble",
      "petal",
      "squircle",
      "drop",
      "beads",
      "chain",
    ],
    until: "2026-12-31",
  },
];

export const NEW_EYE_FRAMES: NewBatch[] = [
  {
    ids: [
      "pebble",
      "porthole",
      "doodle",
      "notch",
      "plus",
      "stamp",
      "bud",
      "tag",
      "bowl",
      "crest",
    ],
    until: "2026-12-31",
  },
];

export const NEW_EYE_CENTRES: NewBatch[] = [
  { ids: ["cushion", "bevel", "notch"], until: "2026-12-31" },
];

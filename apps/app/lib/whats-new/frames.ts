// The official frames added recently, tagged "New" in the frame picker and
// the community gallery until the batch's date passes. The ids come from the
// frame generator (packages/qrdx/scripts/official-frames/write.mjs writes
// catalogue/batches.ts from each catalogue section's batch), never by hand.
import { OFFICIAL_FRAME_BATCHES } from "../../../../packages/qrdx/src/frames/catalogue/batches";
import type { NewBatch } from "./index";

export const NEW_FRAMES: readonly NewBatch[] = [
  { ids: OFFICIAL_FRAME_BATCHES["2026-11"] ?? [], until: "2026-12-31" },
];

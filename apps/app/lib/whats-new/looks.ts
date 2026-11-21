// The looks around the code's shapes added in November 2026 (qrdx looks.ts):
// the Design tab's new sections and the eyes' gradient switch. One id per
// new control: the four sections by their DESIGN_SECTIONS id, the switch by
// EYE_GRADIENT_CONTROL (components/editor/control-sections/eye-colors.ts).
import type { NewBatch } from "./index";

export const NEW_LOOKS: readonly NewBatch[] = [
  {
    ids: ["eye-shapes", "eye-gradient", "corners", "halo", "shadow"],
    until: "2026-12-31",
  },
];

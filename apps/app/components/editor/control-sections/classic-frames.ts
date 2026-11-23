// The Classic frames: no frame and the engine's built-in frames, in the
// picker's order (frame-controls.tsx), for the playground's cycle shortcut.
// Picking one replaces a shaped code, and a built-in frame keeps the text and
// colors chosen so far.
import { type AnyQRFrame, BUILT_IN_FRAMES } from "qrdx";
import type { QRStyle } from "@/types/theme";
import { carryFrameSettings } from "./frame-specs";

/** None, then the built-in frames (picker ids). */
export const CLASSIC_FRAME_IDS: string[] = [
  "none",
  ...BUILT_IN_FRAMES.map((frame) => frame.style),
];

/** The Classic tile a style shows (null for other frames and shapes). */
export function classicFrameOf(style: Partial<QRStyle>): string | null {
  if (style.shape || style.silhouette) return null;
  const frame = style.frame;
  if (frame && frame.style !== "none") {
    return frame.style === "custom" ? null : frame.style;
  }
  return "none";
}

/**
 * `style` with the Classic tile `id` instead of its frame or shaped code. A
 * built-in frame keeps the text and colors chosen so far.
 */
export function withClassicFrame<T extends Partial<QRStyle>>(
  style: T,
  id: string,
): T {
  const { frame, shape: _shape, silhouette: _silhouette, ...rest } = style;
  if (id === "none") return { ...rest, frame: { style: "none" } } as T;
  return {
    ...rest,
    frame: {
      ...(frame ? carryFrameSettings(frame) : {}),
      style: id,
    } as AnyQRFrame,
  } as T;
}

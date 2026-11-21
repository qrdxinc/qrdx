// The halo rule in the editor (qrdx getHaloRisk): on a see-through
// background a halo is never drawn with the dot shapes it makes unreadable
// on a grey surface, so the Halo section blocks the switch with the reason,
// and the Dots picker blocks those shapes while a halo is on.
import { getHaloRisk, type HaloRisk } from "qrdx";
import type { QRStyle } from "@/types/theme";

/** Why a halo can't be drawn on `style` (with one switched on), or null. */
export function haloRisk(style: Partial<QRStyle>): HaloRisk | null {
  return getHaloRisk({
    halo: style.halo ?? {},
    bodyPattern: style.bodyPattern,
    bgColor: style.bgColor,
  });
}

/** True when `style` has a halo on that the engine refuses to draw. */
export function haloBlocked(style: Partial<QRStyle>): boolean {
  return style.halo !== undefined && haloRisk(style) !== null;
}

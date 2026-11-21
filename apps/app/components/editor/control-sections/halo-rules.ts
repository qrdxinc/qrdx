// The halo rule in the editor (qrdx getHaloRisk): a halo is drawn only on
// an opaque background at least light grey, and any rim color can be
// picked: one outside the range decoders read (at least as light as
// HALO_LIGHT_MIN and no lighter than the background) is drawn in the
// closest color inside it, which the Halo section shows next to the picked
// one. No dot or eye shape decides it, so no shape picker blocks for it.
// The Halo section says why a halo isn't drawn (its switch always turns
// off), and while a halo is on the background picker offers no
// see-through or picture fill, the two choices that always refuse it.
import {
  getHaloRisk,
  getSolidColor,
  type HaloRefusal,
  haloTints,
} from "qrdx";
import { HALO_LIGHT_MIN } from "qrdx/types";
import type { PaintKind } from "@/components/editor/paint-picker/paint-panel";
import type { QRStyle } from "@/types/theme";

/**
 * The halo the switch turns on: the default rim, or the darkest one the
 * engine draws as it is where the default is lighter than the background.
 */
export function haloToTurnOn(
  style: Partial<QRStyle>,
): NonNullable<QRStyle["halo"]> {
  return getHaloRisk({ halo: {}, bgColor: style.bgColor })?.reason ===
    "adjusted"
    ? { color: HALO_LIGHT_MIN }
    : {};
}

/** Why a halo can't be drawn on `style` (with one switched on), or null. */
export function haloRisk(style: Partial<QRStyle>): HaloRefusal | null {
  const risk = getHaloRisk({
    halo: style.halo ?? haloToTurnOn(style),
    bgColor: style.bgColor,
  });
  return risk && risk.reason !== "adjusted" ? risk : null;
}

/**
 * The color the rim is drawn in where the engine moved the picked one to
 * keep the code readable, or null (no halo, drawn as picked, or not drawn).
 */
export function haloDrawnAs(style: Partial<QRStyle>): string | null {
  if (style.halo === undefined) return null;
  const risk = getHaloRisk({ halo: style.halo, bgColor: style.bgColor });
  return risk?.reason === "adjusted" ? risk.color : null;
}

/** Tints of the dots' color that the halo draws as they are here. */
export function haloDotTints(style: Partial<QRStyle>): string[] {
  return haloTints(getSolidColor(style.fgColor, "#000000"), style.bgColor);
}

/**
 * The Halo switch: on while the style has a halo, drawn or not, and only
 * disabled when it is off and a halo couldn't be drawn here. Turning a
 * halo off is always one click away.
 */
export function haloSwitch(style: Partial<QRStyle>): {
  checked: boolean;
  disabled: boolean;
} {
  const checked = style.halo !== undefined;
  return { checked, disabled: !checked && haloRisk(style) !== null };
}

/** The background picker while a halo is on: opaque fills, no picture. */
export function backgroundPickerFor(
  style: Partial<QRStyle>,
  kinds: PaintKind[],
): { alpha: boolean; kinds: PaintKind[] } {
  if (style.halo === undefined) return { alpha: true, kinds };
  return { alpha: false, kinds: kinds.filter((kind) => kind !== "image") };
}

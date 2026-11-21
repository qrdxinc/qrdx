// The halo rule in the editor (qrdx getHaloRisk): a halo is drawn only on
// an opaque background, in a rim at least as light as HALO_LIGHT_MIN and no
// lighter than the background. No dot or eye shape decides it, so no shape picker
// blocks for it. The Halo section says why a halo isn't drawn (its switch
// always turns off), and while a halo is on the background picker offers
// no see-through or picture fill, the two choices that always refuse it.
import { getHaloRisk, type HaloRisk } from "qrdx";
import { HALO_LIGHT_MIN } from "qrdx/types";
import type { PaintKind } from "@/components/editor/paint-picker/paint-panel";
import type { QRStyle } from "@/types/theme";

/**
 * The halo the switch turns on: the default rim, or the darkest one the
 * engine takes where the default is lighter than the background.
 */
export function haloToTurnOn(
  style: Partial<QRStyle>,
): NonNullable<QRStyle["halo"]> {
  const darkest = { color: HALO_LIGHT_MIN };
  return getHaloRisk({ halo: {}, bgColor: style.bgColor }) &&
    !getHaloRisk({ halo: darkest, bgColor: style.bgColor })
    ? darkest
    : {};
}

/** Why a halo can't be drawn on `style` (with one switched on), or null. */
export function haloRisk(style: Partial<QRStyle>): HaloRisk | null {
  return getHaloRisk({
    halo: style.halo ?? haloToTurnOn(style),
    bgColor: style.bgColor,
  });
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

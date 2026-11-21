// Shared setup for the tests of the shapes added after 0.0.57
// (decode-new-*.test.ts). A new shape must read wherever the shapes it is
// measured against read: each render of a three-way combination (sharp at
// 4 to 20 px per module and through the camera model at 4, 6 and 9 px, read
// by jsQR and by ZXing) that every reference shape reads, the new shape
// reads too. Partners come from a fixed stride over the pickable catalogue,
// chosen without looking at the results.
import { getStylePairRisk } from "../../src/scan-risk";
import type { QRProps } from "../../types";
import { missedRenders, type RenderSizes } from "./sharp-capture";

export const VALUES = [
  "https://qrdx.dev/?ref=research",
  "https://qrdx.dev/q/Ab3dE9x?utm=campaign",
] as const;

export const SIZES: RenderSizes = {
  sharp: [4, 6, 9, 14, 20],
  camera: [4, 6, 9],
};

export type Style = Required<
  Pick<QRProps, "bodyPattern" | "cornerEyePattern" | "cornerEyeDotPattern">
>;

/** `count` items spread evenly over `items`, the first one included. */
export function stride<T>(items: readonly T[], count: number): T[] {
  const step = items.length / count;
  return Array.from(
    { length: Math.min(count, items.length) },
    (_, index) => items[Math.floor(index * step)] as T
  );
}

/** True when the editor offers the combination without a warning. */
export const unflagged = (style: Style) => getStylePairRisk(style) === null;

const cache = new Map<string, Promise<string[]>>();

/** The renders of `style` a decoder misses (level M), computed once. */
export function missesOf(style: Style): Promise<string[]> {
  const key = JSON.stringify(style);
  let found = cache.get(key);
  if (!found) {
    found = missedRenders({ ...style, level: "M", size: 256 }, VALUES, SIZES);
    cache.set(key, found);
  }
  return found;
}

/**
 * The renders `style` misses that every one of `references` reads: what the
 * new shape alone is to blame for.
 */
export async function missesOfItsOwn(
  style: Style,
  references: readonly Style[]
): Promise<string[]> {
  const [own, ...others] = await Promise.all([
    missesOf(style),
    ...references.map(missesOf),
  ]);
  return (own ?? []).filter((render) =>
    others.every((missed) => !missed.includes(render))
  );
}

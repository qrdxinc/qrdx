// Helpers for the dot ring frame's pixel checks (png-sharp-path.test.ts).
import { decodePng } from "../../src/utils/png";

/**
 * Light pixels in the ring's band over the top of a 593-pixel dot ring PNG: the
 * ring is black there, so only white letters are light.
 */
export async function lightOnTopOfRing(png: Uint8Array): Promise<number> {
  const image = await decodePng(png);
  if (!image) throw new Error("the PNG doesn't decode");
  let light = 0;
  for (let y = 30; y < 60; y++) {
    for (let x = 200; x < 393; x++) {
      if ((image.data[(y * image.width + x) * 4] as number) > 200) light++;
    }
  }
  return light;
}

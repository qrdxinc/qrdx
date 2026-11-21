// Which dot and eye shapes scan together, for the shape pickers and the
// preview's Random buttons. Pure: the engine's known-weak style pairs
// (qrdx scan-risk) against the style a change would make, judged on every
// eye's effective shapes (per-eye shapes included, qrdx getEyeStyleRisk).
//
// A halo never blocks a shape: whether it is drawn depends on the
// background and the rim only (qrdx getHaloRisk, halo-rules.ts).
import { getEyeStyleRisk } from "qrdx";
import type { QRStyle } from "@/types/theme";

/** ENGINE's known-weak style pairs (qrdx scan-risk), as a short reason. */
export function pairRisk(
  style: Partial<QRStyle>,
  change: Partial<QRStyle>,
): string | null {
  const next = { ...style, ...change };
  const risk = getEyeStyleRisk(next);
  return risk ? `${risk.message}. ${risk.fix}.` : null;
}

/**
 * Pairs that fail our decode tests (body × eye, centre × eye) can't be
 * picked together: the tile is disabled instead of hiding either shape.
 */
export function pairBlocked(
  style: Partial<QRStyle>,
  change: Partial<QRStyle>,
): boolean {
  const next = { ...style, ...change };
  // Every eye's effective frame and centre (per-eye shapes included)
  const kind = getEyeStyleRisk(next)?.kind;
  return kind === "body-eye" || kind === "dot-eye";
}

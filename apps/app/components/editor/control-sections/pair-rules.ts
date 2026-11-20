// Which dot and eye shapes scan together, for the shape pickers and the
// preview's Random buttons. Pure: the engine's known-weak style pairs
// (qrdx scan-risk) against the style a change would make, judged on every
// eye's effective shapes (per-eye shapes included, qrdx getEyeStyleRisk).
import { getEyeStyleRisk } from "qrdx";
import type { QRStyle } from "@/types/theme";
import { haloBlocked, haloRisk } from "./halo-rules";

/** ENGINE's known-weak style pairs (qrdx scan-risk), as a short reason. */
export function pairRisk(
  style: Partial<QRStyle>,
  change: Partial<QRStyle>,
): string | null {
  const next = { ...style, ...change };
  const risk = getEyeStyleRisk(next);
  if (risk) return `${risk.message}. ${risk.fix}.`;
  // A halo that's on can't be drawn with this shape (qrdx getHaloRisk)
  const halo = haloBlocked(next) ? haloRisk(next) : null;
  return halo ? `${halo.message}. ${halo.fix}.` : null;
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
  return kind === "body-eye" || kind === "dot-eye" || haloBlocked(next);
}

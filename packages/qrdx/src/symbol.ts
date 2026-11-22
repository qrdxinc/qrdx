import type { ErrorLevel } from "../types";
import qrcodegen from "./codegen";
import { ERROR_LEVEL_MAP } from "./constants";

/**
 * The QR symbol for `value` at `level`, in the smallest version that holds
 * it. Every renderer, the logo budget, the scan score and the print layout
 * encode through here, so they all draw and judge the same symbol.
 *
 * The encoder raises the level to Q or H when the data still fits that
 * version (more error correction for free); `exactLevel` keeps `level`, as
 * a Swiss QR-bill needs (M). Without it this is QrCode.encodeText.
 */
export function encodeSymbol(
  value: string,
  level: ErrorLevel,
  exactLevel?: boolean
): qrcodegen.QrCode {
  return qrcodegen.QrCode.encodeSegments(
    qrcodegen.QrSegment.makeSegments(value),
    ERROR_LEVEL_MAP[level],
    qrcodegen.QrCode.MIN_VERSION,
    qrcodegen.QrCode.MAX_VERSION,
    -1,
    !exactLevel
  );
}

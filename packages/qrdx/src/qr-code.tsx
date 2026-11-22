// memo/useMemo are available in React Server Components, so QRCode can render
// on the server; only QRCodeCanvas needs a client boundary. createElement
// rather than JSX: compiled JSX would import react/jsx-runtime, which React
// has had only since 16.14.
import { createElement, memo, useMemo } from "react";
import type { QRCodePropsSVG, ReactQRElement } from "../types/react";
import {
  getQRCodeData,
  getQRCodeSVGProps,
  QR_CODE_DATA_KEYS,
} from "./qr-code-props";
import { QRCodeSVG } from "./qr-code-svg";

/**
 * `QRCodeSVG` with the simpler logo API (`logo`, `logoOptions`, `hideLogo`,
 * `scale`). Any other prop (`className`, `aria-label`, `role`, `data-*`…)
 * goes on the `<svg>`, as with `QRCodeSVG`.
 */
export const QRCode = memo((props: QRCodePropsSVG): ReactQRElement => {
  const qrData = useMemo(
    () => getQRCodeData(props),
    // biome-ignore lint/correctness/useExhaustiveDependencies: the layout reads exactly these props (QR_CODE_DATA_KEYS, the list getQRCodeData lays out from)
    QR_CODE_DATA_KEYS.map((key) => props[key])
  );

  return createElement(QRCodeSVG, getQRCodeSVGProps(props, qrData));
});

QRCode.displayName = "QRCode";

// memo/useMemo are available in React Server Components, so QRCode can render
// on the server; only QRCodeCanvas needs a client boundary.
import { memo, useMemo } from "react";
import type { QRCodePropsSVG } from "../types/react";
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
export const QRCode = memo((props: QRCodePropsSVG) => {
  const qrData = useMemo(
    () => getQRCodeData(props),
    // biome-ignore lint/correctness/useExhaustiveDependencies: the layout reads exactly these props (QR_CODE_DATA_KEYS, the list getQRCodeData lays out from)
    QR_CODE_DATA_KEYS.map((key) => props[key])
  );

  return <QRCodeSVG {...getQRCodeSVGProps(props, qrData)} />;
});

QRCode.displayName = "QRCode";

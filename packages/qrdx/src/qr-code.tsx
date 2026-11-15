// memo/useMemo are available in React Server Components, so QRCode can render
// on the server; only QRCodeCanvas needs a client boundary.
import { memo, useMemo } from "react";
import type { QRCodePropsSVG } from "../types/react";
import { DEFAULT_MARGIN } from "./constants";
import { getQRCodeData, getQRCodeSVGProps } from "./qr-code-props";
import { QRCodeSVG } from "./qr-code-svg";

/**
 * `QRCodeSVG` with the simpler logo API (`logo`, `logoOptions`, `hideLogo`,
 * `scale`). Any other prop (`className`, `aria-label`, `role`, `data-*`…)
 * goes on the `<svg>`, as with `QRCodeSVG`.
 */
export const QRCode = memo((props: QRCodePropsSVG) => {
  const {
    value,
    fgColor,
    hideLogo,
    logo,
    logoOptions,
    bgColor,
    eyeColor,
    dotColor,
    bodyPattern,
    cornerEyePattern,
    cornerEyeDotPattern,
    level,
    margin = DEFAULT_MARGIN,
    templateId,
    autoLevel,
    shape,
  } = props;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the layout depends on exactly these props
  const qrData = useMemo(
    () => getQRCodeData(props),
    [
      value,
      fgColor,
      hideLogo,
      logo,
      logoOptions,
      margin,
      autoLevel,
      shape,
      bgColor,
      eyeColor,
      dotColor,
      bodyPattern,
      cornerEyePattern,
      cornerEyeDotPattern,
      level,
      templateId,
    ]
  );

  return <QRCodeSVG {...getQRCodeSVGProps(props, qrData)} />;
});

QRCode.displayName = "QRCode";

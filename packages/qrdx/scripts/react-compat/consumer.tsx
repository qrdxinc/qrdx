// A small app written against the published types, type-checked by
// scripts/react-compat.mjs with every @types/react it tests (skipLibCheck
// off, so qrdx's own .d.ts files are checked too). It is never run.

import {
  getQRAsSVG,
  QRCode,
  QRCodeCanvas,
  type QRCodePropsSVG,
  QRCodeSVG,
  QRFrameSVG,
  type QRFrameSVGProps,
  type QRPropsCanvas,
  type QRPropsSVG,
} from "qrdx";
import { toSVGString } from "qrdx/core";
import type { QRProps } from "qrdx/types";
import * as React from "react";

const design: QRProps = {
  value: "https://qrdx.dev",
  fgColor: {
    type: "linear",
    angle: 45,
    stops: [
      { color: "#1d4ed8", offset: 0 },
      { color: "#0f172a", offset: 100 },
    ],
  },
  bodyPattern: "circle",
};

const svgProps: QRPropsSVG = { ...design, className: "qr", role: "img" };
const codeProps: QRCodePropsSVG = {
  value: "https://qrdx.dev",
  logo: "https://qrdx.dev/logo.png",
  "aria-label": "QRdx",
};
const canvasProps: QRPropsCanvas = { value: "https://qrdx.dev", id: "c" };
const frameProps: QRFrameSVGProps = {
  frame: { style: "banner-bottom", text: "Scan me" },
  size: 200,
  slot: <QRCodeSVG value="https://qrdx.dev" size={200} />,
};

export function App(): React.ReactElement {
  const [value, setValue] = React.useState("https://qrdx.dev");
  return (
    <div>
      <button onClick={() => setValue(`${value}/`)} type="button">
        Next
      </button>
      <QRCode {...codeProps} />
      <QRCode
        frame={{ style: "banner-bottom", text: "Menu" }}
        logo="https://qrdx.dev/logo.png"
        logoOptions={{ size: 0.2 }}
        value={value}
      />
      <QRCodeSVG {...svgProps} />
      <QRCodeSVG
        cornerEyePattern="rounded"
        style={{ width: 120 }}
        value={value}
      />
      <QRCodeCanvas {...canvasProps} />
      <QRCodeCanvas size={160} style={{ borderRadius: 8 }} value={value} />
      <QRFrameSVG {...frameProps} />
    </div>
  );
}

export const element: React.ReactElement = QRCodeSVG(svgProps);
export const markup: string = toSVGString(design);
export async function plain(): Promise<React.ReactElement> {
  const svg = await getQRAsSVG(svgProps);
  return React.cloneElement(svg, { width: 200 });
}

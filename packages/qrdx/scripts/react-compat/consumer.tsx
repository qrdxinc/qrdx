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
  type TemplateDefinition,
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

// Artwork drawn in code around the code, with its own props
const labelled: TemplateDefinition<{ label?: string }> = {
  id: "labelled",
  name: "Labelled",
  wrapper: (children, props, config) => (
    <svg viewBox="0 0 300 340" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(20, 20) scale(0.87)">{children}</g>
      <text
        data-url={config?.url}
        fill={props?.fgColor}
        textAnchor="middle"
        x="150"
        y="325"
      >
        {props?.label}
      </text>
    </svg>
  ),
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
      <QRCode
        customProps={{ label: "Scan me" }}
        customTemplate={labelled}
        value={value}
      />
    </div>
  );
}

export const element: React.ReactElement = QRCodeSVG(svgProps);
export const markup: string = toSVGString(design);
export async function plain(): Promise<React.ReactElement> {
  const svg = await getQRAsSVG(svgProps);
  return React.cloneElement(svg, { width: 200 });
}

// An ES module written against the published types, type-checked by
// scripts/legacy-compat.mjs with TypeScript 5.0 and 5.3 under
// `module: node16`, where each entry's "import" condition applies (skipLibCheck
// off, so qrdx's and zod's .d.ts files are checked too). It is never run.

import { toSVGString } from "qrdx/core";
import { defineQRdxCode, type QRdxCodeOptions } from "qrdx/element/define";
import { type QRCodeActionReturn, qrcode } from "qrdx/svelte";
import { frameSpecSchema, type QRProps, qrPropsSchema } from "qrdx/types";
import { createQRCode } from "qrdx/vanilla";

const design: QRProps = {
  value: "https://qrdx.dev",
  size: 200,
  frame: { style: "banner-bottom", text: "Scan me" },
};

const parsed = qrPropsSchema.safeParse(design);
const checked: QRProps | undefined = parsed.success ? parsed.data : undefined;
const spec = frameSpecSchema.safeParse({});
const markup: string = toSVGString(design);

const element: QRdxCodeOptions = { value: design.value, size: design.size };
defineQRdxCode("my-qr-code");
const code = createQRCode(document.body, design);
code.update({ fgColor: "#1d4ed8" });
const action: QRCodeActionReturn = qrcode(document.body, design);
action.update({ ...design, fgColor: "#1d4ed8" });

export { checked, element, markup, spec };

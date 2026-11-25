// The pictures on the React library's pages: what the page's own code sample
// draws. The React samples are the example files the docs tests keep
// byte-identical to the pages (apps/app/tests/docs-examples), rendered here
// by the real `qrdx` package. The other frameworks' entries draw with the
// same engine, so their pictures are that engine's output (qrdx/core) for
// the props the page's sample passes. Nothing is drawn by hand: no browser
// chrome, no inspector, only the code on a plain surface.
//
// Each job writes a small page (the `document` of a job, types.ts) that the
// runner opens in Chrome and captures in both themes like any other still.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createQRArtImage,
  QR_ART_SAMPLE_SIZES,
  type QRProps,
  toSVGString,
} from "qrdx/core";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import type { ShotJob } from "./types";

// The example files are compiled with the classic JSX runtime by tsx.
(globalThis as { React?: typeof React }).React = React;

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "..", "..", "app");
const EXAMPLES = join(appDir, "tests", "docs-examples");
/** The sample logo and photo the editor's Art tab offers (invented, QRdx's own). */
const ART_SAMPLES = join(appDir, "public", "images", "art-samples");

/** The markup a React example component renders. */
async function example(
  file: string,
  name: string,
  props: Record<string, unknown> = {},
): Promise<string> {
  const module = (await import(join(EXAMPLES, file))) as Record<
    string,
    React.ComponentType<Record<string, unknown>>
  >;
  const Component = module[name];
  if (!Component) throw new Error(`${file} has no export "${name}"`);
  return renderToStaticMarkup(React.createElement(Component, props));
}

/** The markup the engine draws for these props (what every framework entry renders). */
const core = (props: QRProps & Record<string, unknown>) =>
  toSVGString(props as QRProps);

/** A sample image as a PNG data URL, for a sample's `logo="/logo.png"`. */
async function sampleDataUrl(path: string): Promise<string> {
  const png = await sharp(join(ART_SAMPLES, path))
    .resize(256, 256, { fit: "contain", background: "#00000000" })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * A sample image as the RGBA samples an `art` prop takes, decoded the way
 * features/art-qr shows for a server ("lib/sample-photo.ts").
 */
async function artImage(path: string, mode: "logo" | "halftone") {
  const { data, info } = await sharp(join(ART_SAMPLES, path))
    .resize(640, 640, { fit: "contain", background: "#00000000" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return createQRArtImage(
    { data, width: info.width, height: info.height },
    { maxSize: QR_ART_SAMPLE_SIZES[mode], square: mode === "halftone" },
  );
}

/**
 * The page: the codes in a row on a plain surface, light or dark with the
 * reader's theme. `show` is the width each code is shown at.
 */
function page(codes: string[], show = 256): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>qrdx sample</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; background: #eef0f3; }
  #stage {
    box-sizing: border-box; width: 900px; margin: 120px auto; padding: 56px 40px;
    display: flex; align-items: center; justify-content: center; gap: 48px;
    background: #ffffff; border-radius: 12px;
  }
  #stage > div { flex: none; width: ${show}px; }
  #stage svg { display: block; width: 100%; height: auto; }
  @media (prefers-color-scheme: dark) {
    body { background: #111318; }
    #stage { background: #1b1d23; }
  }
</style>
</head>
<body>
<main id="stage">${codes.map((code) => `<div>${code}</div>`).join("")}</main>
</body>
</html>
`;
}

const job = (
  spec: Pick<ShotJob, "id" | "title" | "alt" | "pages"> & {
    document: () => Promise<string>;
  },
): ShotJob => ({
  kind: "shot",
  look: "window",
  route: "",
  signedIn: false,
  capture: { kind: "element", find: "css", name: "#stage", margin: 0 },
  ...spec,
});

/** The Solid and Svelte samples' code, in the color their Blue button sets. */
const recoloredMenuCode = (fgColor: string) =>
  core({
    value: "https://example.com/menu",
    size: 256,
    margin: 4,
    fgColor,
    frame: { style: "banner-bottom", text: "Scan me" },
    "aria-label": "QR code for the menu",
  });

/** vue.mdx (src/App.vue) and vanilla-js.mdx (main.js) pass the same options. */
const FRAMED_MENU_CODE = {
  value: "https://example.com/menu",
  size: 256,
  margin: 4,
  bodyPattern: "rounded",
  frame: { style: "banner-bottom", text: "Scan for the menu" },
  "aria-label": "QR code for the menu",
} as const;

export const LIBRARY_JOBS: ShotJob[] = [
  job({
    id: "lib-first-code",
    title: "The default QRCode",
    alt: "The code components/first-qr-code.tsx draws: a black QR code on white in the library's default look, with round modules and gear-shaped corner eyes.",
    pages: ["/docs/getting-started"],
    document: async () =>
      page([await example("getting-started/first-qr-code.tsx", "FirstQrCode")]),
  }),
  job({
    id: "lib-styled-code",
    title: "The styled code of the quickstart",
    alt: "The code components/styled-qr-code.tsx draws: blue rounded modules, extra-rounded corner eyes, and a banner under the code that reads Scan for the menu.",
    pages: ["/docs/getting-started"],
    document: async () =>
      page([
        await example("getting-started/styled-qr-code.tsx", "StyledQrCode"),
      ]),
  }),
  job({
    id: "lib-nextjs-server-code",
    title: "The code a Server Component renders",
    alt: "The code app/page.tsx renders: a black QR code for example.com with a quiet zone of four modules around it.",
    pages: ["/docs/nextjs"],
    document: async () =>
      page([await example("nextjs/server-page.tsx", "default")]),
  }),
  job({
    id: "lib-framed-menu-code",
    title: "A framed code from a framework entry",
    alt: "The code the sample draws: a black QR code with rounded modules and a black banner under it that reads Scan for the menu.",
    pages: ["/docs/vue", "/docs/vanilla-js"],
    document: async () => page([core(FRAMED_MENU_CODE)]),
  }),
  job({
    id: "lib-angular-code",
    title: "The gradient code of the Angular sample",
    alt: "The code src/app/app.ts draws: rounded modules in a gradient from blue at the top left to navy at the bottom right, with a Scan me banner under the code.",
    pages: ["/docs/angular"],
    document: async () =>
      page([
        core({
          value: "https://example.com",
          size: 240,
          margin: 4,
          level: "Q",
          bodyPattern: "rounded",
          fgColor: {
            type: "linear",
            angle: 45,
            stops: [
              { color: "#1d4ed8", offset: 0 },
              { color: "#0f172a", offset: 100 },
            ],
          },
          frame: { style: "banner-bottom", text: "Scan me" },
          "aria-label": "QR code for example.com",
        }),
      ]),
  }),
  job({
    id: "lib-preact-code",
    title: "The framed code of the Preact sample",
    alt: "The code menu-code.tsx draws: a black QR code with rounded modules and a Scan me banner under it.",
    pages: ["/docs/preact"],
    document: async () =>
      page([
        core({
          value: "https://example.com/menu",
          size: 256,
          margin: 4,
          bodyPattern: "rounded",
          frame: { style: "banner-bottom", text: "Scan me" },
          "aria-label": "QR code for the menu",
        }),
      ]),
  }),
  job({
    id: "lib-solid-signal-code",
    title: "The Solid sample before and after the signal changes",
    alt: "The code menu-code.tsx draws, twice: on the left as it first appears, dark navy with a Scan me banner, and on the right after Blue is clicked, the same code redrawn in blue.",
    pages: ["/docs/solid"],
    document: async () =>
      page([recoloredMenuCode("#0f172a"), recoloredMenuCode("#1d4ed8")]),
  }),
  job({
    id: "lib-svelte-state-code",
    title: "The Svelte sample before and after the state changes",
    alt: "The code MenuCode.svelte draws, twice: on the left as it first appears, dark navy with a Scan me banner, and on the right after Blue is clicked, the same code redrawn in blue.",
    pages: ["/docs/svelte"],
    document: async () =>
      page([recoloredMenuCode("#0f172a"), recoloredMenuCode("#1d4ed8")]),
  }),
  job({
    id: "lib-element-code",
    title: "The code the qrdx-code element draws",
    alt: "The code the qrdx-code element draws for the attributes in step 2: a black QR code with rounded modules and a quiet zone around it.",
    pages: ["/docs/web-component"],
    document: async () =>
      page([
        core({
          value: "https://example.com/menu",
          size: 256,
          margin: 4,
          bodyPattern: "rounded",
          "aria-label": "QR code for the menu",
        }),
      ]),
  }),
  job({
    id: "lib-gradient-codes",
    title: "Linear, radial and angular gradients",
    alt: "Three codes with gradient colors: a linear gradient from indigo to pink, a radial gradient from teal in the middle to dark blue at the edges, and an angular gradient that sweeps from blue through violet and back.",
    pages: ["/docs/features/colors-gradients"],
    document: async () =>
      page(
        [
          await example("colors/gradient-code.tsx", "GradientCode"),
          await example("colors/radial-code.tsx", "RadialCode"),
          await example("colors/angular-code.tsx", "AngularCode"),
        ],
        230,
      ),
  }),
  job({
    id: "lib-logo-code",
    title: "A code with a logo in the middle",
    alt: "The code components/logo-code.tsx draws: a black QR code with a small coffee cup logo in the middle and the modules behind the logo cleared.",
    pages: ["/docs/features/logos"],
    document: async () =>
      page([
        (await example("logos/logo-code.tsx", "LogoCode")).replaceAll(
          '"/logo.png"',
          `"${await sampleDataUrl("logos/cafe.svg")}"`,
        ),
      ]),
  }),
  job({
    id: "lib-circle-code",
    title: "A circle code and a heart code",
    alt: "Two shaped codes with rounded modules: on the left a circle code, the QR code in the middle of a disc filled with decorative modules, and on the right a heart code, the same inside a heart outline.",
    pages: ["/docs/features/patterns"],
    document: async () =>
      page([
        await example("patterns/circle-code.tsx", "CircleCode"),
        await example("patterns/heart-code.tsx", "HeartCode"),
      ]),
  }),
  job({
    id: "lib-frame-banner",
    title: "A code with and without a frame",
    alt: "The code components/menu-frame-code.tsx draws, with a navy banner under it that reads Scan for the menu, next to the same code without the frame prop: the framed one is wider and taller, and the code inside is the same size.",
    pages: ["/docs/features/frames"],
    document: async () => {
      const framed = await example(
        "frames/menu-frame-code.tsx",
        "MenuFrameCode",
      );
      const plain = core({ value: "https://example.com/menu", size: 256 });
      // Each at its own pixel size, bottoms aligned, so the growth shows.
      const width = (svg: string) => Number(/ width="([\d.]+)"/.exec(svg)?.[1]);
      return page([
        `<div style="width:${width(framed)}px">${framed}</div>`,
        `<div style="width:${width(plain)}px">${plain}</div>`,
      ]).replace(
        "#stage > div { flex: none; width: 256px; }",
        "#stage > div { flex: none; width: auto; }",
      );
    },
  }),
  job({
    id: "lib-download-result",
    title: "The image downloadQRCode saves",
    alt: "What menu.png holds: the code from the snippet, blue with rounded modules, and a Scan me banner under it.",
    pages: ["/docs/features/downloads"],
    document: async () =>
      page([
        // lib/download.ts's props; the file is this drawing at 1024 px.
        core({
          value: "https://example.com",
          fgColor: "#1d4ed8",
          bodyPattern: "rounded",
          frame: { style: "banner-bottom", text: "Scan me" },
          size: 256,
        }),
      ]),
  }),
  job({
    id: "lib-art-codes",
    title: "A Logo QR code and an Image QR code",
    alt: "Two art codes: on the left a Logo QR, where the modules inside a coffee cup logo take the logo's browns, and on the right an Image QR, where every module shows part of a photo of a latte.",
    pages: ["/docs/features/art-qr"],
    document: async () =>
      page([
        // components/logo-art-code.tsx's props, with the sample logo.
        core({
          value: "https://example.com",
          size: 512,
          level: "H",
          art: {
            mode: "logo",
            image: await artImage("logos/cafe.svg", "logo"),
            intensity: 0.7,
          },
        }),
        // lib/sample-photo.ts's props, with the sample photo.
        core({
          value: "https://example.com",
          size: 512,
          level: "H",
          art: {
            mode: "halftone",
            image: await artImage("photos/latte.webp", "halftone"),
            intensity: 0.8,
          },
        }),
      ]),
  }),
];

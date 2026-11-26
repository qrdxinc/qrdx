# Changelog

Release notes for earlier versions are at [qrdx.dev/changelog](https://qrdx.dev/changelog).

## 0.0.67: Svelte

- **`qrdx/svelte`**, a Svelte action that draws the code into an element: `<div use:qrcode={options}></div>` (#328). It takes `QRCodeSVG`'s props, puts root attributes (`class`, `aria-label`…) on the `<svg>`, and redraws when the options change; options that draw the same markup leave the `<svg>` alone. It removes the code on destroy. It's a plain function on `qrdx/core`: the entry has no `.svelte` files and imports nothing from Svelte, so it needs no Svelte compiler or preprocessor and adds no peer dependency. Checked in production builds of SvelteKit 3 with Svelte 5 and SvelteKit 2 with Svelte 4.
- **Server rendering.** Actions don't run on a server, so a server-rendered page writes the code with `{@html toSVGString(options)}` inside the element. When the page hydrates, the action keeps that `<svg>` if it is the code it would draw (it compares the DOM it would build with `isEqualNode`) and replaces it otherwise, so the code isn't drawn twice.
- Everything in `qrdx/core` is re-exported from `qrdx/svelte`, as it is from `qrdx/vue`. `QRCodeActionReturn` types what the action returns. The entry is in the webpack 4 build too (`svelte/package.json`, `dist/legacy/svelte.js`) and has TypeScript 5.0 to 5.3 type entries.

## 0.0.66: webpack 4 and TypeScript 5.0 to 5.3

### qrdx builds with webpack 4

- **A build for bundlers that don't read `exports`.** webpack 4, which Create React App 4 (`react-scripts` 4) and Vue CLI 4 use, couldn't build qrdx: it skips the package's `exports`, so `qrdx/vanilla` and the other entries weren't found; its parser stops at `??` and `?.`; and it reads `.mjs` files as strict ES modules, which can't take named imports from CommonJS `react` (#853). The `module` field now names `dist/legacy/index.js`, and a folder for each entry (`vanilla/package.json`, `element/define/package.json`…) names its file there: ES2019, ending in `.js`, with zod built in, since zod's own files use `??` too. Bundlers that read `exports` get the same files as before.
- **Every entry works there except `qrdx/types`**, whose schemas and types `qrdx` also exports.
- **PDF export in a webpack 4 build loads `jspdf` in the browser.** webpack 4 fails the build of an app without `jspdf` at the `import()` of it, so the webpack 4 files leave that `import()` to the browser, as the no-bundler files do: a page that exports PDFs maps `jspdf` in an import map.
- **webpack 5 only warns about a missing `jspdf` again when Babel lowers async functions.** An app whose Babel turns async functions into generators for older browsers moved the `import()` of `jspdf` out of the `try` block webpack 5 looks for, so a build without `jspdf` failed rather than warned. The `import()` now has a function of its own that isn't async. The error PDF export throws without `jspdf` also mentions the import map.

### Types for TypeScript 5.0 to 5.3

- **The types check on TypeScript 5.0 to 5.3**, with `skipLibCheck` off and any `moduleResolution` (#852). zod's declarations use `NoInfer`, which TypeScript added in 5.4, so on those versions an app got `Cannot find name 'NoInfer'`. Each entry now has a `types@<5.4` condition (and a typesVersions `<5.4` path for `moduleResolution: node`) pointing at an entry in `dist/ts5.0` that brings a stand-in for `NoInfer` and re-exports the same declarations. TypeScript 5.4 and later read the same files as before. TypeScript 4.9 and older can't read zod 4's declarations at all.

### The scan score warns about a thin quiet zone

- **`QUIET_ZONE_MIN` (2)** is a new export of `qrdx`, `qrdx/core` and `qrdx/vanilla`: the quiet zone, in modules and with a frame's gap included, below which the scan score's `quiet-zone` check warns. In QRdx's scan study, codes with no margin printed straight onto a dark surface or a busy pattern were read in 0 to 70% of captures, and one module of light margin brought every decoder to 98% or more.
- **Checks can be warnings.** `ScanCheck` has a new optional `severity`, `"warning"` for a caution rather than a problem with the design: the code reads as drawn, but may not where it's placed. Only the `quiet-zone` check sets it, below `QUIET_ZONE_MIN`. Its message gives the margin ("Quiet zone of only 1 module", or "No quiet zone around the code" at 0) and its `fix` says to set the margin to 2 modules or more, or add a frame. Show it milder than a failure.
- **Scores don't change.** `severity` never changes `passed` or the penalty: from 1.5 modules the check still passes and costs nothing, and below 1.5 it still fails and costs 5 points. Between 2 and 4 modules it passes as before, with "(4 is ideal)" in its message.
- `DEFAULT_MARGIN` stays 0, so components keep filling their box. Set `margin` to 2 or more, or give the container light padding, when the code may sit on anything but a plain light background.

## 0.0.65: customTemplate and customProps are back

- **`customTemplate` and `customProps` are back**, as they worked in 0.0.63: draw your own artwork around the code, in code. 0.0.64 removed them along with the built-in templates. A template is a `TemplateDefinition` whose `wrapper` gets the drawn code (a 300 × 300 drawing), `{ fgColor, bgColor, ...customProps }` and `{ url, pixelSize }`, and returns the whole picture, drawn at `size` with the code inside it. Use one for artwork a frame can't draw, such as dots that change from link to link; fixed artwork is simpler as a frame.
- **Everywhere they were:** the React components, `qrdx/core`, `qrdx/vanilla`, `<qrdx-code>` (as properties; `toQRdxCodeHTML` keeps `customProps` in `props` and leaves the function out), the Angular inputs and the Vue, Preact and Solid components. `QRCodeCanvas` ignores them, as before. A `frame` is drawn around the template's artwork, and the scan score tests the code at the size the template draws it.
- **Exported again:** the types `TemplateDefinition`, `TemplateConfig`, `TemplateNode` and `BaseTemplateProps`, `qrPropsSchema`'s `customProps`, and the schemas `baseTemplatePropsSchema`, `templateConfigSchema` and `templateDefinitionBaseSchema`. `TemplateDefinition` has no `spec`, which only the built-in templates had.
- **The built-in templates stay frames.** `templateId` is still ignored, also when `customTemplate` is set, and `TEMPLATES`, `getTemplate`, `getAllTemplates`, `getTemplateIds`, the built-in definitions and `DotRingProps` stay removed. See 0.0.64 for the frames they became.
- `@qrdx/cli` 0.0.20 fixes its help: the Halloween example uses `--frame pumpkin` (0.0.19's `--frame halloween` was refused), `qrdx batch --format` lists every format it writes (svg, png, webp, gif, bmp, ico, tiff, tiff-cmyk or eps; the help said svg, png or eps), and `--size` names TIFF among the pixel formats. Output is unchanged.

## 0.0.64

### Templates are frames now

- **The six templates are built-in frames.** Each one is a `FRAME_STYLES` value and a `BUILT_IN_FRAMES` entry, drawn from the frame spec the template was drawn from, so it looks the same:

  | Template (`templateId`) | Frame (`frame.style`) | Name |
  | --- | --- | --- |
  | `Arrow` | `arrow` | Arrow |
  | `StandardBox` | `standard-box` | Standard box |
  | `SquareBorder` | `square-border` | Square border |
  | `StrikedBox` | `striked-box` | Striked box |
  | `Halloween` | `pumpkin` | Pumpkin |
  | `DotRing` (and its earlier id `FlamQR`) | `dot-ring` | Dot ring |

  `default` drew no artwork and has no frame.
- **They draw like every other frame.** The code keeps the size you ask for and the artwork is added around it, so the image is larger than `size` (a template drew the whole artwork at `size`, with the code smaller inside it). `getFrameDimensions(size, frame)` gives the output size. A template took the code's dark color for its artwork; a frame takes `color` (default black), so pass `color: fgColor` to keep the same look. Arrow, Standard box, Square border, Striked box and Pumpkin are artwork without a label, so `text` doesn't show on them.
- **Dot ring** keeps the template's ring, its 593-unit drawing and dots from its own table, with `text` over the top and `secondaryText` along the bottom (both "Scan the QR code" by default; `""` hides one). Two things a frame can't do: its dots are the same for every code (the template picked a set per link and cleared the ones next to a code over 49 modules across), and the text options of `DotRingProps` (`textFill`, `textPosition`, `textRotation`, fonts, strokes) are gone. `color` sets the ring and the dots, `textColor` the text.
- **Removed:** the `templateId`, `customTemplate` and `customProps` props (on every component, `<qrdx-code>`'s `template-id` attribute and properties, the Angular inputs and the Vue props), `qrPropsSchema`'s `templateId` and `customProps`, and the exports `TEMPLATES`, `getTemplate`, `getAllTemplates`, `getTemplateIds`, `Arrow`, `StandardBox`, `SquareBorder`, `StrikedBox`, `Halloween`, `DotRing`, `defaultTemplate`, the types `TemplateDefinition`, `TemplateConfig`, `TemplateNode`, `BaseTemplateProps` and `DotRingProps`, and the schemas `baseTemplatePropsSchema`, `templateConfigSchema` and `templateDefinitionBaseSchema`.
- **Passing one is ignored.** Code and saved props that still pass `templateId`, `customTemplate` or `customProps` keep working: the prop is dropped without an error, never reaches the `<svg>` as an attribute (so React logs no unknown-prop warning), and the code is drawn without it. To keep the artwork, pass the frame instead: `templateId="Arrow"` becomes `frame={{ style: "arrow" }}`.
- `@qrdx/cli` 0.0.19: `--frame` takes the six new styles, and `--template` is read and ignored, with one line on stderr naming `--frame`.

## 0.0.63

- **TIFF export.** `"tiff"` and `"tiff-cmyk"` are new `DownloadFormat`s, so `downloadQRCode`, `getQRCodeDataUrl` and the adapters' `toDataURL` and `download` can write a TIFF for print shops that ask for one. No browser encodes TIFF from a canvas (`toBlob("image/tiff")` returns a PNG), so the engine writes the file itself, the same way in every browser and in Node: one strip of 8-bit samples, Deflate with the horizontal predictor through Compression Streams (uncompressed where those are missing), at 300 dpi.
- **`"tiff"` keeps transparency** (RGBA, unassociated alpha). **`"tiff-cmyk"` is CMYK for print** by `rgbToCmyk`, the conversion the print PDF and EPS already use: pure black is K only, white is no ink, a transparent background comes out white, and no ICC profile is embedded. Both are saved as `.tif`; the CMYK one is named with `-cmyk` (`DownloadFormatInfo` has a new optional `nameSuffix`).
- **New TIFF exports** from `qrdx`, `qrdx/core` and `qrdx/vanilla`: `getQRAsTIFF(props, { colorMode?, dpi? })` returns the code, with its frame, as a TIFF `Blob`, and `canvasToTIFF(canvas, options?)` turns a canvas into one. `encodeTIFF(rgba, width, height, options?)` does it for RGBA pixels without a DOM, and `isTIFFFile(bytes)` checks a file. `TIFF_MIME`, `TIFF_DPI` (300), `TIFF_DPI_RANGE` (1 to 10,000) and `TIFF_MAX_DIMENSION` (16,384) are the limits. `getQRAsCanvas(props, "image/tiff")` returns an RGBA TIFF data URL.
- `@qrdx/cli` 0.0.18 writes TIFF too: `-o qr.tif` (or `.tiff`) for RGBA, and `--format tiff-cmyk -o qr.tif` for CMYK. `qrdx batch --format tiff-cmyk` saves `.tif` files.

## 0.0.62

### Exact error correction (`exactLevel`)

- **`exactLevel` encodes at exactly the level the code is drawn at.** `level` has been a minimum: when the data still fits the same version at a higher level, the encoder uses the higher one, so a code asked for at `M` could come out at `Q` or `H`. With `exactLevel: true` it stays at the level asked for (or the one `autoLevel` raises it to). It's off by default, and without it every code is byte for byte what 0.0.61 drew (tests/exact-level.test.ts pins a code the encoder raises from `M` to `Q`).
- **One symbol everywhere.** Every path that builds the matrix encodes through one function now (`encodeSymbol` in `src/symbol.ts`), so the SVG tree, the plain renderer (`getQRAsSVG`), the canvas, `getQRAsSVGDataUri` and the PNG, JPG, WebP, PDF and EPS built on it, `getQRData`'s logo layout, the logo budget (`getLogoBlockDamage`, `getLogoSizeLimit`), `getBgRadiusLimit`, `getQRModuleCount` and the scan score all see the same symbol. With `exactLevel` a logo is held to the budget of the level drawn, not the raised one.
- Swiss QR-bills need it: SIX's Swiss Implementation Guidelines for the QR-bill ask for error correction `M` (section 6.1). The encoder only raises `M` for data of 46 bytes or less (versions 1 to 4), and the shortest valid Swiss QR-bill is about 74 bytes, so no bill came out above `M`; `exactLevel` makes that a guarantee rather than a property of the capacity tables.
- The option is a prop of every component (`exactLevel`), an attribute of `<qrdx-code>` (`exact-level`), an input of the Angular component and a flag of the Vue one, and is part of `qrPropsSchema`. `getQRData` and `resolveQRCodeProps` pass it on.

## 0.0.61

### React 16.8 and 17

- **The React components work from React 16.8.** The peer range is `react >=16.8.0` (it was `>=18.0.0`), so an app on React 16.8, 17 or 18 installs qrdx without peer warnings or `--legacy-peer-deps`. Nothing else changes for React 18 and 19: every design draws the same markup in each of them.
- **No `react/jsx-runtime`.** The React entry and its `"use client"` canvas file build their elements with `createElement`, since `react/jsx-runtime` only exists from React 16.14. Children go in as `createElement`'s arguments, the way `jsx` and `jsxs` check them, so React asks for keys exactly where it did before. The React entry grows by 77 bytes gzipped (`index.mjs`, 115,595 bytes; 202 more minified) and the canvas file shrinks by 40 (`qr-code-canvas.mjs`, 28,782); every other entry is byte for byte the same.
- **`react-dom` is no longer a peer dependency.** Nothing in qrdx imports it: SVG strings, data URLs and downloads go through the core since 0.0.51.
- **Types for @types/react 16 and 17.** The components returned `JSX.Element` imported from `react`, which the `react` module of @types/react 16 and early 17 doesn't have. They now return `ReactElement<any, any>`, the same type. The `ref` of `QRPropsSVG` and `QRCodePropsSVG` is a ref object or callback: under @types/react 16 to 18 it also took a string, and a typed set of these props spread into `QRCode` didn't type-check.
- `scripts/react-compat.mjs` (`bun run --filter qrdx check:react`) installs the packed package next to React 16.8, 17, 18 and 19 and checks that each draws 11 designs to the same static markup and DOM as React 19, logs nothing, links every import, and type-checks a small app against @types/react 16.9, 17.0, 18.3 and 19.3. CI runs it on every pull request that changes qrdx.

## 0.0.60

### Halo colors are adjusted, not refused

- **Any halo color draws.** A `halo.color` used to be drawn only when it fell between `HALO_LIGHT_MIN` (`#d1d5db`) and the background, so most colors a person picks drew no rim at all. Now `fitHaloColor(color, bgColor)` keeps the color's hue (in OKLab) and as much of its chroma as fits, and moves only its lightness until both decoders' greys (Rec. 709 for jsQR, Rec. 601 for ZXing) read it in that range. A grey stays a grey. `#881337` on white is drawn as `#ffc9cf`, `#2563eb` as `#c1d7ff`. SVG, canvas, PDF and EPS all draw the adjusted color.
- `getHaloRisk` returns a `HaloRisk`, which is `HaloRefusal | HaloAdjustment`. It still refuses what no color can fix (`see-through`, `picture` and `dark-background`), and reports `reason: "adjusted"` with the drawn `color` when it moved the color. The `rim` reason is gone: code that checked for it should check for `adjusted`.
- The scan score passes an adjusted halo with no penalty, and judges contrast against the color that is drawn.
- `haloTints(color, bgColor, count = 4)` returns tints of a color that are drawn as they are, darkest first.
- The range is now checked against each decoder's grey instead of the darker of the two, so a saturated rim can't read lighter than the background to one of them. `#ffff00` on `#e5e7eb` was drawn as it is, although jsQR reads it lighter than the background; it is now drawn as `#f9f800`.
- tests/halo-colors-decode.test.ts draws adjusted rims for every body pattern at halo widths 0.1, 0.3 and 0.5 and at 4, 6 and 9 px per module, and decodes them with jsQR and ZXing: each reads wherever the code reads without a halo.

### Patterns: new eye frames and an eye centre

- **5 new eye frames** (`cornerEyePattern`): `porthole`, `notch`, `plus`, `bud` and `bowl`. `bud` turns to face its corner of the code. Each keeps the finder's 1:1:3:1:1 runs on its rows and columns and cuts or rounds every corner; with the default body a `circle` or `rounded` centre reads inside it in sharp renders (tests/decode-sharp-centre.test.ts), and none joins `WEAK_SHARP_DOT_EYES`. `square`, `diya` and `rounded-triangle` centres are missed by jsQR in many sharp renders inside them and `heart` in some, as in `gear` and `octagon` eyes (tests/decode-new-eyes.test.ts checks the square case).
- **A new eye centre** (`cornerEyeDotPattern`): `cushion`, a square with gently pinched sides.
- Each new shape reads every render its reference shapes read (gear and octagon eyes; square and rounded centres) with a fixed sample of partners from the catalogue, in sharp renders (resvg, 4 to 20 px per module) and through the phone-camera model (4, 6 and 9 px), decoded by jsQR and by ZXing (tests/decode-new-*.test.ts). Through the camera model, jsQR also reads each one next to every eye or body and centre, at every error correction level, light-on-dark, with brand colors and with a centre logo (tests/catalog-*.test.ts).
- `WITHDRAWN_BODY_PATTERNS`, `WITHDRAWN_CORNER_EYE_PATTERNS` and `WITHDRAWN_CORNER_EYE_DOT_PATTERNS` map the shapes that preview builds offered and that were dropped before this release (bodies `x`, `flower`, `pebble`, `beads`, `bubble`, `chain`, `petal`, `drop` and `squircle`; eyes `pebble`, `tag`, `crest`, `doodle` and `stamp`; centres `bevel` and `notch`) to existing ones: the schemas parse such an id as its replacement and the renderer draws it, so no design that names one fails (tests/withdrawn-shapes.test.ts).
- New geometry helpers in `shapes.ts` (`scoopedRectPath`, `notchedRectPath`, `cushionPath`, `shieldPath`, `octagonPoints`). These are internal.
- `@qrdx/cli` 0.0.16 offers the new eye frames and centre in its prompts and takes them as `--eye` and `--dot`.

## 0.0.59

- **The looks redraw in React.** A mounted `QRCode` now redraws when `eyeShapes`, `eyeGradient`, `bgRadius`, `backdrop`, `halo` or `shadow` changes. In 0.0.58 its layout was kept until another prop changed, so turning one of these on showed nothing.

## 0.0.58

- **GIF export.** `"gif"` is a new `DownloadFormat`, so `downloadQRCode`, `getQRCodeDataUrl` and the adapters' `toDataURL` and `download` can write a GIF, for older tools and email builders that only take it. No browser encodes GIF from a canvas (`toBlob("image/gif")` returns a PNG), so the engine writes the file itself, the same way in every browser.
- **At most 256 colors, and never a GIF that stops scanning.** A code in flat colors fits as it is, so the GIF has exactly the PNG's pixels. A gradient, an image fill or a photo logo is reduced to a 256-color palette by median cut, with no dithering. A pixel under half opaque becomes GIF's one transparent color, so the soft edge of a code on a transparent background comes out hard-edged. After a reduction the original and the GIF are both decoded: if the original reads and the GIF would not, a `GIFScanError` is thrown and nothing is saved. The check loads `jsqr` on demand (already a dependency); if it can't be loaded, a reduced GIF is refused rather than passed on unchecked.
- **New GIF exports** from `qrdx`, `qrdx/core` and `qrdx/vanilla`: `getQRAsGIF(props)` returns the code, with its frame, as a GIF `Blob`, and `canvasToGIF(canvas, expected?)` turns a canvas into one. `pixelsToGIF(pixels, expected?)` does it for RGBA pixels without a DOM, so it also runs in Node; `quantizeRGBA`, `encodeGIF`, `encodeGIFFromRGBA` and `indexedToRGBA` are the steps underneath, `assertGIFStillScans` is the scan check, and `isGIFFile(bytes)` checks a file. `GIF_MIME`, `GIF_MAX_COLORS` (256), `GIF_MAX_DIMENSION` (16,384) and `GIF_ALPHA_THRESHOLD` (128) are the limits. `getQRAsCanvas(props, "image/gif")` returns a GIF data URL.
- **ICO export.** `"ico"` is a new `DownloadFormat`: one favicon file holding the code at 16, 32, 48 and 256 px, each an embedded PNG that keeps a transparent background. The size doesn't apply and a frame is left out. `getQRAsICO(props, sizes?)` returns it as a `Blob`; `canvasesToICO(canvases)`, `canvasToICO(canvas)`, `canvasToPNGBytes(canvas)`, `encodeICO(images)` and `isICOFile(bytes)` are the parts, with `ICO_MIME`, `ICO_SIZES` and `ICO_MAX_DIMENSION` (256). `getQRAsCanvas(props, "image/vnd.microsoft.icon")` returns an ICO data URL of one canvas.
- **A frame on its own.** `createFrameTree(options)` draws a frame's artwork and labels around the empty slot a code of `size` pixels would fill, or around an element you pass as `slot`, for showing a frame without a code. React's `QRFrameSVG` (from `qrdx`) is the same as a component, and renders in React Server Components.
- The standalone `<qrdx-code>` file loads `jsqr` on demand, as well as `jspdf`: a page without a bundler maps it in its import map to export a GIF of a design with more than 256 colors.
- `@qrdx/cli` 0.0.15 writes ICO and GIF too: `-o qr.ico` or `--format ico`, and `-o qr.gif` or `--format gif`.

### Five new looks

- `eyeShapes` gives each corner eye its own frame and center shape; `eyeGradient: "code"` lays the eyes' gradient over the whole code; `bgRadius` rounds the background, with `backdrop` as the color outside its corners; `halo` draws a rim around every dot and eye; `shadow` draws a see-through copy of the dark shapes under them. A halo is drawn only on an opaque, light background, in a rim no lighter than it, so it never costs a read.

### Frame library: shapes, everyday objects and playful scenes

- **101 more official frames**, 1,114 in all. 29 join `call-to-action`: hexagons, octagons, hearts, a scroll, swallowtail flags, pattern borders, raised cards, corner tabs, a text frame, bottom badges, top ribbons, plain borders in three weights, a circle viewfinder, a sketched circle, starbursts and spinning rays. Each decodes at phone distances, scores Great and reads with zbar, like every official frame.
- **Two new collections:** `objects` ("Everyday objects", 28 frames: tablets, laptops, monitors, mugs, parcels, bottles, billboards, open books, map pins, a globe and more) and `playful` ("Playful & surprising", 44 frames: a TV set, a record sleeve, a fish tank, a robot, a cat holding the code, a snow globe, a flying saucer and more). `OfficialFrameCollection` and `OFFICIAL_FRAME_COLLECTIONS` include them, so code with a case or a `Record` for every collection needs the new ids.
- The generator now also writes `src/frames/catalogue/batches.ts`, the official frame ids by the round that added them, so the app can mark the latest ones as new. It isn't exported.

## 0.0.57

- **BMP export.** `"bmp"` is a new `DownloadFormat`, so `downloadQRCode`, `getQRCodeDataUrl` and the adapters' `toDataURL` and `download` can write an uncompressed 24-bit BMP, for legacy systems and embedded tools that only take BMP. No browser encodes BMP from a canvas (`toBlob("image/bmp")` returns a PNG), so the engine writes the file itself, the same way in every browser.
- **A transparent background comes out white.** 24-bit BMP has no alpha channel, so see-through pixels are laid over white.
- **New exports** from `qrdx`, `qrdx/core` and `qrdx/vanilla`: `getQRAsBMP(props)` returns the code, with its frame, as a BMP `Blob`, and `canvasToBMP(canvas)` turns a canvas into one. `encodeBMP(rgba, width, height)` writes RGBA pixels as a BMP file without a DOM, so it also runs in Node. `isBMPFile(bytes)` checks a file's header, and `BMP_MAX_DIMENSION` (16,384) is the largest side `encodeBMP` writes. `getQRAsCanvas(props, "image/bmp")` returns a BMP data URL.
- `@qrdx/cli` 0.0.14 writes BMP too: `-o qr.bmp`, or `--format bmp`.

## 0.0.56

- **`QRCode` forwards other props to the `<svg>`.** React's `QRCode`, and the Preact and Solid `QRCode`, used to drop every prop that isn't one of the code's own. `aria-label`, `className` (`class`), `role`, `id`, `title` and `data-*` now land on the `<svg>`, or on the frame's outer `<svg>` when there is a frame, as they always have with `QRCodeSVG`, the Vue `QRCode` and `createQRCode`. Nothing is renamed or removed, and codes that pass no such props draw the same markup as before.
- **New types.** `QRCodePropsSVG` (`QRCodeProps` plus React's SVG attributes) types the React component, and `QRCodeOptions` (`QRCodeProps` plus root attributes) the Preact and Solid ones. `QRCodeProps` is unchanged.
- **The scan score is faster.** Its camera model does less work for the same scores.

## 0.0.55

### Rendering without zod

- **Drawing a code no longer loads zod.** `createQRCodeTree`, `toSVGString`, the React components and every adapter (`qrdx/vanilla`, `qrdx/element`, `qrdx/vue`, `qrdx/preact`, `qrdx/solid`, `qrdx/angular`) draw without it, custom frame specs included. A Vite app that draws one code with `createQRCode` from `qrdx/vanilla` ships 216 KB of JavaScript instead of 312 KB (78 KB gzipped instead of 105 KB), and one with `<QRCode>` 391 KB instead of 487 KB (129 KB instead of 156 KB). With esbuild, an app that draws a code shrinks from 619 KB to 165 KB.
- **The zod schemas are unchanged.** `qrPropsSchema`, `frameStyleSchema`, `frameSpecSchema` and the rest are still exported from `qrdx`, `qrdx/core`, the adapters and `qrdx/types`. They now come from `dist/schemas.mjs`, which the core re-exports, so a bundler includes zod only when an app uses a schema or `getFrameSpecIssues`.
- **Frame specs are checked as before.** The engine checks specs with its own parser, which accepts and rejects exactly what `frameSpecSchema` does, with the same messages and paths. A test compares the two on every built-in, template and official frame and on more than 20,000 broken specs. An invalid custom frame still throws a `FrameSpecError` with the same issues, and `importFrameSvg` still returns the same errors.
- Every export of every entry is unchanged. The no-bundler `dist/vanilla.browser.mjs` still includes zod, because it exports the schemas. `dist/element.browser.mjs` exports none, so it drops zod and shrinks from 414 KB to 220 KB.

### Dot Ring text that fits the ring

- **Long text no longer runs into its own start.** Text that doesn't fit the ring with a word space to spare first gets tighter letter spacing, then a smaller font, down to half the default size (16 units, the smallest size frame labels get). It then closes the ring with a word space. Past that, text that repeats a phrase keeps as many whole copies as fit, spaced like `textFill: "repeat"`. Other text is cut after the last whole word that fits and ends with "…", which EPS prints as "...".
- **`textFill: "repeat"`** (in `customProps`) repeats the text as many times as fit and evens out the spacing, so the ring closes with the same gap as between the copies. Give the phrase once (`"Read the docs *"`). Text that already repeats a phrase (`"Make your own * Make your own *"`) counts as that phrase.
- Text that fits is drawn exactly as before. The default ring is byte for byte the same.

## 0.0.54

- The repository moved to [qrdxinc/qrdx](https://github.com/qrdxinc/qrdx). The package's `repository`, `homepage` and `bugs` links point there, and this release is published with provenance from it. No code changes. `@qrdx/cli` 0.0.11 is the same move.

## 0.0.53

### Templates are frames

- **The built-in templates draw from frame specs.** Arrow, StandardBox, SquareBorder, StrikedBox and Halloween are now JSON frame specs in `src/template/specs`, drawn by the frame engine. Their hand-written SVG is gone, and `getTemplate(id).spec` returns each one (`TemplateDefinition` gains an optional `spec`). A parity test renders each against the old templates in SVG, PDF and EPS: alone, with brand colors, on a see-through background and inside a frame. `default`, which draws no artwork, is unchanged.
- **Nothing changes for template users.** `templateId`, `customTemplate`, `TemplateDefinition`, `getTemplate`, `getAllTemplates` and `getTemplateIds` work as before. A template still draws its whole artwork at `size` with the code smaller inside it, and takes `fgColor` for its artwork (Striked Box and Halloween keep their own colors).
- **Use a template's artwork as a frame:** `{ style: "custom", spec: getTemplate("Arrow").spec }` draws it with frame sizing. The code keeps its size and the artwork grows around it.
- **New spec fields**, both optional:
  - `qr.plate: "none"` paints no plate. The code's own background and margin are its light space, so `qr.padding` may be under 4%.
  - `stroke: { color, width }` on rects, circles, ellipses, polygons and paths outlines the shape after its fill, with mitered corners, at most 10% of the artboard's shorter side. SVG, canvas, PDF and EPS all draw it. `FrameShape` gains `stroke` and `strokeWidth`.
  - qrdx 0.0.51 and older reject specs that use these.

## 0.0.52

### Web component (`qrdx/element`)

- **`<qrdx-code>`**, a custom element on `qrdx/core`, for plain HTML and frameworks that render DOM elements (tested in React 19 and Vue 3). Simple options are attributes (`value`, `size`, `level`, `fg-color`, `bg-color`, `eye-color`, `dot-color`, `body-pattern`, `corner-eye-pattern`, `corner-eye-dot-pattern`, `margin`, `template-id`, `module-scale`, `auto-level`, `shape`); object options are properties (`frame`, gradients, `imageSettings`, `eyeColors`, `art`, `customTemplate`, `customProps`), or all at once in `props`, which also reads JSON from its attribute. Changes are batched into one redraw per microtask, and a redraw that changes nothing leaves the page alone.
- The code is drawn in an open shadow root, styled from outside with `::part(svg)`. The `<svg>` has `role="img"` and an `aria-label` from the `label` attribute, or "QR code": never the value, which can be private.
- `toSVGString()`, `toDataURL(format, { size, quality })` and `download({ format, filename, size, quality })` export the code. A code that can't be drawn fires a cancelable `qrdx-error` event.
- `defineQRdxCode(tagName = "qrdx-code")` registers it, and importing `qrdx/element` registers nothing. `qrdx/element/define` registers `<qrdx-code>` on import (listed in `sideEffects`, so bundlers keep it). On a server, importing it and calling `defineQRdxCode` are safe.
- `toQRdxCodeHTML(options, { tagName, label })` writes server markup: the element with the code already drawn in a declarative shadow root, so it shows before any script runs.
- `dist/element-define.browser.mjs` registers the element from a CDN with no bundler; it loads `dist/element.browser.mjs`, one module with the engine inside (the official frame library's data stays in `dist/frames-official.mjs`).
- Types: `QRdxCodeElement`, `QRdxCodeOptions`, `QRdxCodeProperties`, `QRdxCodeAttributes`, `QRdxCodeJSXProps` (for a React or Preact JSX declaration) and an `HTMLElementTagNameMap` entry for `qrdx-code`.

### Preact and SolidJS

- **`qrdx/preact`** has `QRCodeSVG` and `QRCode` (with the `logo` shortcut) as Preact components, with the React components' props. They draw with Preact's own `h` through `toHyperscript`, so `preact/compat` isn't needed, and skip a render when no prop changed. `preact-render-to-string` writes `toSVGString`'s markup (Preact leaves `>` and `'` unescaped in text), and `hydrate` keeps the server's `<svg>`. `preact` 10 or later is an optional peer dependency (#330).
- **`qrdx/solid`** has the same two components for SolidJS, written without JSX, so the package needs no Solid compiler. In the browser a component returns the `<svg>` element itself (built with `renderToDOM`) from a memo: Solid inserts it, swaps in a new one when a prop change alters the markup, and removes it on unmount. On a server it returns `toSVGString`'s markup with Solid's `data-hk` hydration key on the root, and `hydrate` adopts that element instead of drawing it again. `solid-js` 1.8 or later (1.x) is an optional peer dependency (#329).
- Both entries import the engine from `qrdx/core`, so an app that also uses `qrdx/core` loads it once, and neither imports React.

### Angular

- **`qrdx/angular`** is a standalone Angular component, `<qrdx-qr-code>`, for Angular 20 and newer. It takes `QRCode`'s props as signal inputs (`value` is required; `style` is `svgStyle`, so the element's own `style` attribute still styles the element), draws the same SVG as `<QRCode>`, byte for byte, and redraws when an input changes the markup. No NgModule is needed.
- It renders on the server with `@angular/ssr`, and the app hydrates the server's HTML without errors and without `ngSkipHydration`.
- `download(options)` and `toDataURL(format, options)` export the code; `markup()`, `options()` and `svg` give its markup, its resolved props and the `<svg>` element. Everything in `qrdx/core` is exported from `qrdx/angular` too.
- It ships compiled in Angular's partial mode, which the Angular CLI links when it builds an app. `@angular/core` is an optional peer dependency.

### Frame library: holidays, seasons, events and places

- **292 more official frames** in the holidays, seasons, events and places collections, and one in Cars & parking. `OFFICIAL_FRAMES` grows from 721 to 1,013. No existing frame or id changes.
- **Holidays** (115 to 283) adds festivals and national days from regions the library covered thinly:
  - South Asia: Pongal, Lohri, Makar Sankranti, Vaisakhi, Onam, Navratri, Durga Puja and Dussehra, Ganesh Chaturthi, Raksha Bandhan, Janmashtami, Ugadi and Gudi Padwa, Pohela Boishakh, the Sinhala and Tamil New Year, and Republic Day in India.
  - Southeast and East Asia: Songkran, Loy Krathong, Vesak, Hari Raya, Tết, Seollal, the Mid-Autumn Festival, Chuseok, the Dragon Boat and Lantern festivals, Tanabata, Obon and Children's Day.
  - The Middle East, Africa and the Americas: Nowruz, Yalda, the Islamic New Year, Rosh Hashanah, Purim, Enkutatash, Kwanzaa, Juneteenth, Africa Day, Sham el-Nessim, Tabaski, the Day of the Dead, Carnival and Mardi Gras, Three Kings Day, Las Posadas, Festa Junina and Inti Raymi.
  - Europe: Orthodox Easter and Christmas, Maslenitsa, Pancake Day and King's Day.
  - National days for 18 more countries, and awareness days and months such as International Women's Day, Earth Day, Pride Month, World Mental Health Day and World Blood Donor Day.
- **Seasons** (28 to 60) adds monsoon, harvest and cherry blossom season, with more frames for summer, winter, spring, autumn and back to school.
- **Events** (32 to 77) adds graduations, conferences, workshops, concerts, festivals and fairs, birthdays, baby showers, a quinceañera, sports matches, charity runs, quiz and game nights, galas, reunions and memorials.
- **Places** (25 to 71) adds museums, libraries, transit, parks, beaches, campsites, coworking spaces, hostels, visitor centers, marinas, zoos and aquariums, plus guest Wi-Fi frames for cafés, offices, rentals, waiting rooms, libraries, venues and hostels.
- 96 new motifs, from kites and krathongs to buses and lifebuoys. Every new frame passes the same checks as the rest: it decodes at phone distances, scores Great and reads with zbar.

### One frame system

- **Every built-in frame is a frame spec.** The 19 styles in `FRAME_STYLES` (all but `none`) are now JSON specs in `src/frames/builtin`, drawn by the same code as official and custom frames. The hand-written layouts in `frame.tsx` and `frame-styles.ts` are gone. A parity test renders every built-in against the old layouts in SVG, canvas, PDF and EPS, with and without labels, with brand colors and at `fontScale` 0.5 and 1.5; sizes, code boxes and labels match to 0.02 px.
- **Nothing changes for frame options.** `{ style: "banner-bottom", text, color, textColor, secondaryText, secondaryColor, fontScale }` is accepted for good and draws the same frame. `FRAME_STYLES`, `frameStyleSchema` and `QRFrame` stay as they are.
- **New exports:** `BUILT_IN_FRAMES` (each built-in frame's `style`, `name`, `tags`, `labelOn` and `spec`), `getBuiltInFrame(style)`, `frameSpecOf(frame)` (the spec any frame draws), `getFrameColors(frame)` and `getFrameSpecColors(spec, frame)` (the frame, text and accent colors it paints with). `BUILT_IN_FRAME_SPECS` now has every built-in style, not four. `GRADIENT_FRAME_DEFAULTS` (now read from the gradient border's spec), `mixFrameColors` and `FRAME_GAP_RATIO` are still exported. `getFrameGapRatio` returns each frame's spec padding.
- **New spec fields**, all optional (specs without them draw as before):
  - `labels[].collapse: { y, height }` cuts a band out of the artwork when the label shows no text. Rows below it move up and shapes wholly inside it are left out. The borders use it to drop their label row.
  - `qr.plate: "opaque" | "background"`. With `"background"`, a see-through background stays see-through and the plate is left out. It's allowed only when nothing but `background` fills, or a ring whose hole holds the plate, lies under the plate.
  - `colors.text` can be a mix of `frame`, `accent`, `background` and hex colors, such as `{ mix: ["frame", "accent"], amount: 0.5 }`.
  - A text label's row may reach into the plate's padding, as long as it stays off the code and its capitals stay out of the padding at `fontScale` 1.5.
  - qrdx 0.0.51 and older reject specs that use these.
- **Fix: see-through backgrounds under ticket, polaroid, phone, chat-bubble, tag, sticker and envelope.** These frames lie under the code, and with a transparent background the code used to sit on the frame color. They now paint a white plate under the code, like every custom frame. Banners, borders, bubbles, circle, badge, focus, menu-card and gradient-border stay see-through.
- The gradient border's left inner edge is no longer 0.6 px thicker than its right one (its old color strips overlapped into the light area). The circle frame's two dots are two shapes in the SVG instead of one path.
- The engine bundles are about 5.6 KB larger minified (`dist/index.mjs` 273,981 to 279,617 bytes, `dist/core.mjs` 273,192 to 278,828) and at most 0.3 KB larger gzipped: the 19 specs are a little more data than the code they replace.

### Dot ring template

- **`templateId="DotRing"`** ("Dot Ring") is a round code: the code in a disc of dots inside a dark ring, with a line of text along the ring. A hash of the code's content picks which dots show, so every link gets a ring of its own and the same link always gets the same one.
- Its settings go in `customProps`, typed as **`DotRingProps`**: `customText`, `textPosition` (`"top"` or `"bottom"`), `textRotation`, `textColor`, `fontFamily`, `fontWeight`, `fontSize`, `fontLetterSpacing`, `outerCircleColor` and `strokeWidth`/`strokeColor` (with `inner…`/`outer…` versions for one edge of the ring). The default text, "Scan the QR code" four times round, closes the ring with an even gap.
- The text is SVG text, one letter per `<text>`, in the system font stack by default, so it shows in SVG, PNG, PDF and EPS (PDF and EPS print Helvetica Bold). `getQRAsPNG` needs a font on the machine, as frame labels do.
- Codes more than 49 modules across keep a band of six modules clear of dots, so long links still scan when printed small. Tested at every level for short, typical and long links with jsQR and zbar.

### Scan score

- The scan score (`getScanScore`, `getScanScoreFromPixels`) now tests a code in a template at the size the template draws it. It used to treat the whole template artwork as the code, so every template scored low; the code inside a template is often half the artwork or less.

## 0.0.51

### Vue (`qrdx/vue`)

- **`qrdx/vue`** has Vue 3 versions of `QRCode` and `QRCodeSVG`, with the React components' props and the same SVG. They're render functions over the core (`createQRCodeTree`, then `toHyperscript` into Vue's `h`), so they render on the server with `vue/server-renderer` and hydrate without a mismatch, in Nuxt too. `class`, `style`, other attributes and listeners go on the `<svg>`, and Vue updates it in place when a prop changes.
- **`useQRCode(props)`** takes `QRCode`'s props as an object, a ref, a reactive object or a getter, and returns the SVG markup as a computed ref (it works in SSR), the resolved `options`, `toDataURL` and `download`.
- Everything in `qrdx/core` is re-exported. The entry imports the engine from `qrdx/core`, so it adds under 1 KB gzipped of its own.
- `vue` 3.3 or newer is an optional peer dependency, so installing `qrdx` never installs Vue. TypeScript checks the components' props with Vue 3.4.20 or newer.

### React-free core and plain JavaScript

- **`qrdx/core`** is the whole engine without React: everything the main entry exports except the React components (`QRCode`, `QRCodeSVG`, `QRCodeCanvas`, and `getQRAsSVG`, which returns a React element). `toSVGString(props)` returns exactly the markup `<QRCodeSVG>` renders, in Node or a browser. `createQRCodeTree(props)` builds the code as plain `{ type, props, key }` nodes, which `renderToString`, `renderToDOM` (built with `createElementNS`) and `toHyperscript` (another framework's elements, with DOM attribute names) turn into markup, DOM nodes or virtual DOM. `toSVGElement(props)` returns an `<svg>` element, `resolveQRCodeProps(props)` resolves `QRCode`'s logo API, and `getQRAsSVGNode(props)` is `getQRAsSVG` without React.
- **`qrdx/vanilla`** adds `createQRCode(element, options)` to the core: it draws a code into an element or CSS selector and returns `update`, `toSVGString`, `toDataURL`, `download` and `destroy`. `dist/vanilla.browser.mjs` is the same API as one ES module for `<script type="module">` without a bundler (the official frame library's data ships next to it in `dist/frames-official.mjs`).
- `react` and `react-dom` are now optional peer dependencies. The React components still need them; `qrdx/core`, `qrdx/vanilla` and `qrdx/node` don't import either.
- The React components draw through the same renderer, building React elements directly, so their markup is unchanged byte for byte (a parity test compares over 500 prop combinations, every official frame among them). `getQRAsSVGDataUri`, and the downloads, print PDF and EPS, the scan score and `qrdx/node`'s PNG built on it, no longer load `react-dom/server`.
- `qrdx/node` now imports the engine from `qrdx/core`, so it's a few kilobytes on its own and needs neither `react` nor `react-dom`.
- `h(type, props, ...children)` writes a custom template without JSX. A template `wrapper` gets React elements in the React components and the core's nodes elsewhere (`TemplateNode`).
- Types: `QRSVGOptions` (props plus root `<svg>` attributes) and `QRStyle` (the same type as React's `CSSProperties`, from `csstype`) are new. `QRPropsSVG` and `QRPropsCanvas` are unchanged and still exported from `qrdx` and `qrdx/types`.

### Frame library: industries and everyday uses

- **303 more official frames** for the places people print codes: more calls to action (FAQ, translations, large print, waitlists, checklists, transcripts), restaurants and cafes, shops and packaging, clinics and schools, and business (portfolios, reports, visitor sign-in, quotes, insurance claims, staff rotas and more). Each has its own purpose, label and look, and decodes at phone distances, scores Great and reads with zbar, like every official frame.
- **Five new collections:** `beauty-wellness`, `real-estate`, `automotive` ("Cars & parking"), `sports-fitness` and `nonprofit` ("Nonprofits & community"). `OfficialFrameCollection` and `OFFICIAL_FRAME_COLLECTIONS` include them, so code with a case or a `Record` for every collection needs the new ids.
- The property frames and `sign-rider` move from `places` to `real-estate`, and the gym frames from `health-learning` to `sports-fitness`. Their ids, names and specs are unchanged.
- New shapes: yard signs with a rider, signs on posts, sidewalk A-frame boards, shelf talkers, clipboards, team shirts, vinyl banners with eyelets, bone-shaped pet tags, collection jars, EV chargers, folded-corner and stacked cards, a cloud bubble and a big side arrow, plus about a hundred new drawings (food, shop goods, sports gear, cars, salon tools, community symbols).

## 0.0.50

### PNG in Node

- **`getQRAsPNG(props, { size, loadExternalLogos })`** from the new **`qrdx/node`** entry returns PNG bytes in plain Node, with no DOM. It needs one of two optional peers, loaded only when it runs: `@resvg/resvg-js`, which draws embedded logos the way browsers do, or `sharp`, whose renderer skips embedded images, so the logo is composited onto the pixels afterwards. With neither installed, the error says what to install. Thanks to @AndreIsraelAO (#405).
- The browser entry never mentions either package, so apps that bundle `qrdx` for the browser don't try to load a native module.
- Logos: a data URL always works. An http(s) URL is fetched, and a local path read, only with `loadExternalLogos: true`, capped at 1 MB, with no redirects and a timeout, so a server that passes a caller's `imageSettings.src` through can't be made to fetch internal URLs or read its own files.
- `@qrdx/cli` 0.0.8 renders PNG through `getQRAsPNG` and encodes WebP from those PNG bytes, so the two formats match pixel for pixel.

### Part markers

- **`partMarkers`** on `QRCode` and `QRCodeSVG` marks each drawn part of the code for an editor's live preview: every finder eye's outer ring and centre (`data-qrdx-part="eye-outer"` / `"eye-centre"`, with `data-qrdx-eye` saying `"top-left"`, `"top-right"` or `"bottom-left"`), the dots (`"body"`), the logo (`"logo"`) and the background (`"background"`). `QR_PART_ATTRIBUTE`, `QR_EYE_ATTRIBUTE` and `QR_PARTS` name them. Like `frameLabelMarkers`, it is off by default, the markup without it is unchanged, and every export drops it.

## 0.0.49

### Frame library

- **Hundreds of official frames.** `OFFICIAL_FRAMES` grows from 24 to a library of call-to-action styles, holidays and seasons from around the world (Christmas, New Year, Lunar New Year, Diwali, Holi, Ramadan, the two Eids, Hanukkah, Passover, Easter, Halloween, Thanksgiving, Valentine's Day, independence days, Black Friday and more) and frames for restaurants, shops, packaging, events, weddings, hotels, travel, real estate, health, fitness, education, reviews, payments, social follows, app downloads and business cards. Every frame decodes at phone distances, scores Great and reads with zbar, as before. The 24 existing frames and their ids are unchanged.
- Each frame has a `collection` (`OFFICIAL_FRAME_COLLECTIONS`) and seasonal ones an `occasion`. `OFFICIAL_FRAME_COUNT` and `OFFICIAL_FRAME_COUNTS` count them.
- `OFFICIAL_FRAME_INDEX` lists every frame without its spec, and `frameSpecHash(spec)` fingerprints a spec (key order doesn't matter), so pickers can search the library and recognise an official frame before loading specs.

### Docs

- The README on npm no longer says that npm is a version behind. That note was written for 0.0.46.

## 0.0.48

### WebP export

- **`format: "webp"`** in `downloadQRCode` and `getQRCodeDataUrl`, and `getQRAsWebP(props, options)` for a `Blob`. It is lossless by default, so module edges stay exact, and a transparent background stays transparent. `quality` (0 to 1) asks for a smaller lossy file instead.
- **Every browser gets real WebP.** The canvas encodes it where it can. Safari can't, and hands back a PNG for `image/webp`, so the file's bytes are checked and QRdx's own lossless encoder takes over; a browser that would only write lossy WebP when lossless was asked for is handled the same way. `getQRAsCanvas(props, "image/webp")` goes through the same path.
- `DOWNLOAD_FORMATS` lists every download format with its MIME type and file extension.
- `canvasToWebP(canvas, options)` does this for any canvas. `encodeWebPLossless(rgba, width, height)` encodes RGBA pixels with no DOM (it also runs in Node); `isWebPFile` and `getWebPCompression` read a file's header.

## 0.0.47

### Custom frames

- **Frame specs.** `frame: { style: "custom", spec }` draws a frame from a JSON spec: rects, circles, ellipses, polygons, paths, dashed lines and built-in icons, straight and curved labels, and colors bound to the theme (`color`, `textColor`, `secondaryColor`) or fixed. A spec compiles to the same shapes as the built-in frames, so SVG, canvas, PDF and EPS draw the same artwork. Validate one with `frameSpecSchema` or `getFrameSpecIssues`; the hard limits are in `FRAME_SPEC_LIMITS`. Drawing an invalid spec throws a `FrameSpecError`.
- **The quiet zone stays clear.** Custom frames always paint an opaque plate (the code's background, or white when it is transparent) under the code and its padding, and labels may not overlap them.
- **SVG import.** `importFrameSvg(svg)` converts SVG artwork into a spec on a server. Only filled shapes survive, rewritten from parsed numbers. Script, style, images, `use`, text, filters, links and external references are removed and reported as warnings. DOCTYPE and entity declarations, oversized or malformed files are refused.
- **Official frames.** `OFFICIAL_FRAMES` holds 24 specs (20 use cases and 4 seasonal frames, CC0 1.0), and `getOfficialFrame(id)` returns one. Each decodes with a link, a Wi-Fi network and a contact card at phone distances, scores Great, and reads with zbar.
- **Built-ins as specs.** `BUILT_IN_FRAME_SPECS` has `banner-bottom`, `rounded-border`, `circle` and `ticket` as specs. They match the built-in styles in SVG, PDF and EPS.
- `FrameLabel` has optional `align` and `fontWeight`; `getFrameGapRatio(frame)` returns the light gap a frame keeps around the code.
- **Frame label markers.** `FrameLabel.field` says which frame text a label draws: `"text"`, `"secondaryText"` or a custom spec's label id (every letter of curved text carries it). With `frameLabelMarkers`, `QRCode` and `QRCodeSVG` add it to each frame `<text>` as `data-qrdx-frame-label` (`FRAME_LABEL_ATTRIBUTE`), so an editor's preview can find and edit each label. It is off by default, and `getQRAsSVGDataUri` drops it, so SVG, PNG, JPG, PDF and EPS exports are byte-identical with or without it.

### Angular gradients and alpha

- **Angular gradients.** `{ type: "angular", stops, angle }` sweeps the colors clockwise around the centre of what it fills (the code, or each eye), like CSS `conic-gradient(from <angle>deg, …)`. SVG has no conic gradient, so it is drawn as a fan of thin wedges in a `<pattern>`, about two color levels apart; PDF and EPS paint the same wedges inside each shape.
- **Alpha everywhere.** Colors and gradient stops keep alpha (`#1d4ed8cc`, `rgba(…)`). SVG writes it as `fill-opacity` and `stop-opacity`. PDF keeps it as a fill opacity; a gradient whose stops differ in alpha, and a see-through angular gradient, are mixed with the background instead. EPS has no transparency, so see-through colors are mixed with the background (the background itself with white).
- `getScanContrast(props)` is the scan score's contrast check on its own, and judges see-through colors as they look. `SCAN_CONTRAST_MIN`, `SCAN_CONTRAST_LOW` and `SCAN_CONTRAST_FAIL` are its thresholds.
- `getNormalizedColor` previews a linear gradient at the angle the code draws it (it was a quarter turn off) and an angular one as a CSS conic gradient.

### Image fills

- **`{ type: "image", src, fit, scale, position, opacity, underlay }`** paints a picture through the background, the dots or the eyes. It is laid over the whole code, so dots and eyes that share a picture show one picture, embedded once. `fit` is `cover`, `contain` or `tile`; `underlay` is a solid color under the picture that its opacity lets through. `src` is held like a logo: a PNG or JPEG data URL embeds everywhere, and servers never fetch a remote address.
- SVG draws it as a `<pattern>` with an `<image>`. PDF embeds the picture once and paints it inside each shape, at its opacity. **EPS refuses image fills** (`EPS_IMAGE_FILL_REASON`, `hasImageFill`): PostScript has no transparency and would repeat the picture for every dot.
- The contrast check judges a picture by its tones (`getImageTones`, `getImageTonesFromPixels`: its lightest and darkest tenth) and asks more of it (`SCAN_IMAGE_CONTRAST_MIN`: 7:1 in the code, 12:1 behind it), since its detail reads as noise. `getScanContrast` reports the `required` ratio. `getScanScore` inlines image fills and samples their tones.

### Code shapes

- **Circle and heart codes.** `shape: "circle"` or `"heart"` puts the symbol in the middle of a disc or a heart and fills the rest with decorative modules in the body's dot shape, on the same grid. The symbol keeps a light ring of `margin` modules (at least `QR_CIRCLE_QUIET_MIN`, 3) that no decoration or edge enters, so decoders only see the real code. Outside the outline the image is transparent. `getLayoutMargin` gives the margin a code is drawn with; logos, print sizes (`getQRModuleCount`) and the scan score follow it. SVG, `QRCodeCanvas`, PNG, PDF and EPS draw the outline, image fills and angular gradients included.
- **Custom shapes.** `shape` also takes a `QRSilhouette`: a grid of at most 64 × 64 cells (`qrSilhouetteSchema`) traced from a picture's transparency or darkness by `loadQRSilhouette` (browser) or `createQRSilhouette` (pixels). The picture itself is never kept. The symbol sits in the middle of the shape's roomiest square. `getQRSilhouetteFit` says whether a silhouette is roomy enough (the symbol and its ring must take at least `QR_SILHOUETTE_MIN_SHARE` of the width) and why not; one that isn't draws as a square code. `getQRShapePath` gives a shape's outline for previews.
- Heart and silhouette codes decode with solid dot shapes and `square`, `rounded` and `gear` eyes at phone distances and in sharp renders (jsQR), and with zbar.

### Fixes

- The SVG reader behind PDF and EPS export no longer throws on character references outside Unicode (such as `&#x110000;`).
- The same reader now runs in linear time. Its regular expressions backtracked on hostile markup: 8 KB of unclosed `<!--` took over 30 seconds. It reads every input exactly as before.

### Unchanged

- `FRAME_STYLES`, `FrameStyle`, `QRFrame` and `frameSchema` still describe the built-in frames only, and every built-in frame draws exactly as before. `QRProps.frame` (and `qrPropsSchema`) now accept either kind: `AnyQRFrame` / `anyFrameSchema`.

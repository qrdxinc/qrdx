# QR code scan study

A reproducible test of what stops a QR code from scanning: logo size and error correction, contrast and colour, light-on-dark codes, the quiet zone, dot and eye shapes, how many pixels each module gets, and blur, noise, JPEG compression and tilt. It renders codes with the QRdx engine, photographs them in software, and reads every image with three open-source decoders. The results and the charts are committed next to the code.

## Rerun it

From the repository root, with Node 22, Bun and zbar installed (`brew install zbar`, or `apt-get install zbar-tools`):

```bash
bun install && bun run --filter qrdx build:inplace   # once: the engine and the decoders
node scripts/scan-study/run.mjs                       # the study (about 5 minutes on 8 cores)
node scripts/scan-study/charts.mjs                    # the charts, from results/summary.json
```

`--smoke` runs five variants on two codes to check the setup in a few seconds; `--only logo:H,contrast:` runs the variants whose id starts with those prefixes; `--jobs <n>` sets the number of worker processes; `SCAN_STUDY_KEEP=<dir>` keeps every captured image so you can look at it. Partial runs write to `results-partial/` (not committed).

Everything is seeded, so a rerun with the same decoder versions gives the same results. Different versions, or zbar built for another system, can give different ones: Homebrew's zbar 0.23.93 on macOS and Ubuntu's 0.23.93 build have been seen to read the same image differently.

## What it does

**The baseline code** holds a 33-character URL (`https://example.com/p/` and an 11-character slug) at error correction level M, with square modules and eyes, black on white, a 4-module quiet zone, no logo, on a white page. The level is set with `exactLevel`, so L is really L (the engine otherwise raises the level when the data still fits). The URL makes a version 3 code (29 × 29 modules) at L and M and a version 4 code (33 × 33) at Q and H.

**One factor changes at a time** (`study.mjs`):

| Factor | Variants |
| --- | --- |
| Shape | each of the engine's 23 dot patterns, 22 eye frames and 22 eye centres, plus the retired ones (curly eye frame; diamond, star and banner centres), and QRdx's default look (circle dots, gear eye frames, circle centres) at M and at Q |
| Logo | a centred square cleared to the background and filled with a two-colour logo, one module wider at a time up to about 42% of the code's width (12 modules at L and M, 14 at Q and H) |
| Contrast | grey on white from 21:1 down to 1.3:1 (WCAG contrast ratio), and 18 colour pairs, five of them light on dark |
| Quiet zone | 0 to 4 modules of light margin, on white, on a dark surface and on a busy pattern of module-sized squares |
| Module size | 1 to 10 pixels per module, crisp and with a fixed sensor blur (σ 0.7 px), contrast loss and noise |
| Degradation | Gaussian blur, sensor noise, JPEG quality (at 6 and 3 px per module) and tilt up to 75°, one at a time |

**Captures.** Each shape, logo, contrast and quiet-zone variant is encoded with 12 different URLs of the same length (12 module layouts) and captured 5 ways, so 60 images per variant:

- crisp at 8 px per module, like a screenshot or a flatbed scan;
- the camera model of QRdx's scan score (contrast down to 70% and a blur about a quarter module wide) at 4, 6 and 9 px per module;
- a rough phone shot: 5 px per module, turned 25° away, blurred (σ 0.35 module), contrast down to 80%, noise (σ 6 of 255) and saved as a quality-50 JPEG.

The module-size and degradation sweeps use the baseline design with 24 URLs. Each code sits at a different sub-pixel offset, so module edges fall between pixels differently. 12,108 images in all, 36,324 decodes.

**Decoders**, each with its library defaults except that all three look for QR codes only:

- [jsQR](https://github.com/cozmo/jsQR) 1.4.0, which many web-based scanners use (it tries light-on-dark codes too, its default);
- [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp) through [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) 3.1.6 (zxing-cpp commit 2c3dcfef);
- [zbar](https://github.com/mchehab/zbar)'s `zbarimg` 0.23.93 (Homebrew 0.23.93_4 on macOS), which by default doesn't try light-on-dark codes.

A read counts only when the decoded text is exactly the URL. No decoder returned wrong text in this run.

**Two checks that don't decode anything**, for comparison:

- *Module-centre check:* the design is drawn crisp and sampled once in the middle of every module, the way an ideal reader would, and the wrong modules are counted per Reed–Solomon block. The data is readable in principle when no block has more wrong codewords than it can repair (ISO/IEC 18004).
- *QRdx scan score:* `getScanScoreFromPixels` from the engine on the first URL's design, which is what the editor shows (jsQR through its camera model at 96, 160 and 320 px, plus contrast, logo, quiet-zone and eye-shape checks). It assumes the code is printed on white.

## What it found (23 November 2026 run)

- **Logo:** the largest centred logo all three decoders read in 80% or more of captures was 17%, 24%, 33% and 39% of the code's width at L, M, Q and H (3%, 6%, 11% and 15.5% of its area). One module wider, reads fell to 38%, 58%, 20% and 37%. At every level that largest logo was also the largest one the module-centre check said was readable for all 12 URLs.
- **Contrast:** jsQR read 97% of grey-on-white captures at 4.5:1, 33% at 3:1 and none at 2:1; ZXing-C++ and zbar read 98% or more down to 2:1.
- **Light on dark:** jsQR 98–100%, ZXing-C++ 100%, zbar (defaults) 0 of 300.
- **Quiet zone:** with none, on a dark surface jsQR and ZXing-C++ read 0% and zbar 70%; on a busy pattern 10%, 2% and 38%. One module of light margin: 98% or more for all three.
- **Pixels per module:** 2 was enough on clean pixels (100%), 2.25 with sensor blur and noise.
- **Damage:** JPEG quality made almost no difference (down to 1); blur read fully at σ 0.3 module and not at all at 0.6; tilt read to 65°.
- **Shapes:** every dot pattern read in 98% or more by all three. Circle, gear, shield and message eye frames with square centres were read by all three in 63–75% of captures, mostly lost on the rough shot (ZXing-C++ 0 of 12). QRdx's default look (circle dots, gear frames, circle centres) was read by all three in 56 of 60 captures at M and 55 of 60 at Q.

## Output

| File | What's in it |
| --- | --- |
| `results/captures.csv` | one row per image: factor, variant, URL index, capture, pixels per module, image size, and `read`, `none` or `wrong` for each decoder |
| `results/variants.csv` | one row per design variant: its settings, the share of its 60 images each decoder read, all three, any of them, the module-centre check and the scan score |
| `results/sweeps.csv` | one row per module size and degradation level: the share of 24 codes each decoder read |
| `results/summary.json` | all of the above with each variant's results per capture condition, the URLs and the environment (versions, platform, date) |
| `charts/*.svg` | the charts, drawn from `summary.json` by `charts.mjs` (light and dark colours) |

## What it isn't

- The captures are simulated. A phone camera adds autofocus hunting, motion blur, glare, uneven light, lens distortion and its own processing, and scanner apps read many frames a second and keep the best one.
- The decoders are open-source libraries, not the scanners built into phones. The camera apps on iPhones and Android phones use their own detectors, which this test doesn't run.
- One URL length, so one or two code versions. Bigger codes have more, smaller modules, and a central alignment pattern from version 7 up, which a large logo can cover.
- Colours are read from sRGB pixels; printing changes them. The contrast ratios are computed, not measured off paper.

## Files

- `run.mjs`: builds the jobs, runs the workers in parallel and writes the results.
- `worker.mjs`: renders, captures and decodes one chunk (a short-lived process, because resvg keeps each render's memory until its process exits).
- `study.mjs`: the URLs, the capture conditions and every variant.
- `charts.mjs`: the charts.
- `lib/`: the decoders, the pixel operations (camera model, blur, noise, tilt, JPEG) and the dependency loader. The study imports the engine's build and its dependencies (`@resvg/resvg-js`, `jsqr`, `zxing-wasm`, `sharp`) from `packages/qrdx`, so it adds no dependencies of its own.

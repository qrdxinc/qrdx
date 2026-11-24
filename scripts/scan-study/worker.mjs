// Renders, captures and decodes one chunk of the study (run.mjs starts
// these as short-lived child processes: resvg keeps each render's native
// memory until its process exits). Input: a JSON file named by the first
// argument, { jobs, tmpDir }; output: JSON written to the second argument.
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  readJsQR,
  readZbarFiles,
  readZXing,
  zbarVerdict,
} from "./lib/decoders.mjs";
import { loadDeps } from "./lib/deps.mjs";
import {
  addNoise,
  cameraModel,
  flatten,
  gaussianBlur,
  jpeg,
  luminance,
  seeded,
  seedOf,
  tilt,
  writePng,
} from "./lib/image.mjs";

/** Units per module in the engine's SVG (its `size` is modules × UNIT). */
const UNIT = 10;
/** Page around the code (beyond its own quiet zone), in modules. */
const PAGE_BORDER = 6;
const LOGO_FILL = "#1d4ed8";
const LOGO_MARK = "#fbbf24";

const deps = await loadDeps();
const { engine, Resvg, sharp } = deps;

const symbolCache = new Map();

/** Modules per side and the module matrix (true = dark) for value + level. */
function symbolOf(value, level) {
  const key = `${level}|${value}`;
  const cached = symbolCache.get(key);
  if (cached) return cached;
  const probe = engine.toSVGString({
    value,
    level,
    exactLevel: true,
    margin: 0,
    size: 1000,
    bodyPattern: "square",
    cornerEyePattern: "square",
    cornerEyeDotPattern: "square",
  });
  const width = Number.parseFloat(
    /<g fill="#000000"><rect height="([\d.]+)"/.exec(probe)?.[1] ?? "0"
  );
  const n = Math.round(1000 / width);
  if (!(n >= 21 && (n - 17) % 4 === 0)) {
    throw new Error(`Couldn't read the symbol size for ${value} at ${level}`);
  }
  const svg = engine.toSVGString({
    value,
    level,
    exactLevel: true,
    margin: 0,
    size: n * UNIT,
    bodyPattern: "square",
    cornerEyePattern: "square",
    cornerEyeDotPattern: "square",
  });
  const img = new Resvg(svg).render();
  const pixels = img.pixels;
  const cells = [];
  for (let y = 0; y < n; y++) {
    const row = [];
    for (let x = 0; x < n; x++) {
      const i = ((y * UNIT + UNIT / 2) * img.width + x * UNIT + UNIT / 2) * 4;
      row.push(pixels[i] < 128);
    }
    cells.push(row);
  }
  const symbol = { n, version: (n - 17) / 4, cells };
  symbolCache.set(key, symbol);
  return symbol;
}

/** The engine's SVG for the design, plus the logo, as a nested <svg>. */
function codeMarkup(variant, value, n) {
  const { design, logoModules: k } = variant;
  const total = n + 2 * design.margin;
  const svg = engine.toSVGString({
    ...design,
    value,
    exactLevel: true,
    size: total * UNIT,
  });
  let inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  if (k > 0) {
    const start = (design.margin + Math.floor((n - k) / 2)) * UNIT;
    const side = k * UNIT;
    const inset = Math.min(UNIT / 2, side * 0.15);
    const mark = side - 2 * inset;
    inner += `<rect x="${start}" y="${start}" width="${side}" height="${side}" fill="${design.bgColor}"/>`;
    if (mark > 0) {
      inner += `<rect x="${start + inset}" y="${start + inset}" width="${mark}" height="${mark}" rx="${mark * 0.2}" fill="${LOGO_FILL}"/><circle cx="${start + side / 2}" cy="${start + side / 2}" r="${mark * 0.28}" fill="${LOGO_MARK}"/>`;
    }
  }
  return { inner, size: total * UNIT, total };
}

/** The code on its page, `modulePx` per module, offset by `phase` px. */
function compose(variant, value, n, modulePx, phase, pageSeed) {
  const { inner, size, total } = codeMarkup(variant, value, n);
  const codeW = total * modulePx;
  const border = PAGE_BORDER * modulePx;
  const width = Math.ceil(codeW + 2 * border + 1);
  const ox = border + phase[0];
  const oy = border + phase[1];
  let page = `<rect width="${width}" height="${width}" fill="${variant.page === "dark" ? "#1a1a1a" : "#ffffff"}"/>`;
  if (variant.page === "busy") {
    // Module-sized dark and light cells on the code's own grid: the worst
    // kind of pattern to print a code onto.
    const random = seeded(pageSeed);
    const cells = Math.ceil(width / modulePx) + 2;
    let rects = "";
    for (let gy = -PAGE_BORDER - 1; gy < cells; gy++) {
      for (let gx = -PAGE_BORDER - 1; gx < cells; gx++) {
        if (random() < 0.5) {
          rects += `<rect x="${(ox + gx * modulePx).toFixed(3)}" y="${(oy + gy * modulePx).toFixed(3)}" width="${modulePx}" height="${modulePx}"/>`;
        }
      }
    }
    page += `<g fill="#000000">${rects}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}">${page}<svg x="${ox}" y="${oy}" width="${codeW}" height="${codeW}" viewBox="0 0 ${size} ${size}">${inner}</svg></svg>`;
}

function rasterize(svg) {
  const img = new Resvg(svg).render();
  return {
    data: new Uint8ClampedArray(img.pixels),
    width: img.width,
    height: img.height,
  };
}

async function capture(image, condition, seed) {
  let out = image;
  for (const step of condition.ops) {
    if (step.op === "camera") out = cameraModel(out, condition.modulePx);
    else if (step.op === "blur")
      out = gaussianBlur(out, step.sigmaModules * condition.modulePx);
    else if (step.op === "blurPx") out = gaussianBlur(out, step.sigma);
    else if (step.op === "flatten") out = flatten(out, step.factor);
    else if (step.op === "noise") out = addNoise(out, step.sigma, seeded(seed));
    else if (step.op === "jpeg") out = await jpeg(sharp, out, step.quality);
    else if (step.op === "tilt") out = tilt(out, step.degrees);
    else throw new Error(`Unknown capture step ${step.op}`);
  }
  return out;
}

/**
 * The module-centre check: the design drawn crisp at 10 px per module and
 * read the way an ideal decoder samples it, one point in the middle of each
 * module, coloured by whichever of the code's two colours it's nearer to.
 * Wrong modules are counted per Reed–Solomon block; the data is readable in
 * principle when no block has more wrong codewords than it can repair.
 * Modules outside the data (finders, timing, alignment) that sample wrong
 * are counted on their own: decoders find the finders by the ratio of their
 * light and dark runs, not by module centres, so a shaped eye can sample
 * "wrong" here and still be found.
 */
function centreCheck(variant, value, symbol) {
  const { n, version, cells } = symbol;
  const plain = { ...variant, page: "white" };
  const px = 10;
  const svg = compose(plain, value, n, px, [0, 0], 0);
  const image = rasterize(svg);
  const lumFg = luminance(variant.design.fgColor);
  const lumBg = luminance(variant.design.bgColor);
  const origin = PAGE_BORDER * px + variant.design.margin * px;
  const map = engine.getCodewordMap(version, variant.design.level);
  const wrong = [];
  let functionWrong = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i =
        ((origin + y * px + px / 2) * image.width + origin + x * px + px / 2) *
        4;
      const hex = `#${[0, 1, 2].map((c) => image.data[i + c].toString(16).padStart(2, "0")).join("")}`;
      const l = luminance(hex);
      const dark = Math.abs(l - lumFg) < Math.abs(l - lumBg);
      if (dark !== cells[y][x]) {
        if (map.block[y * n + x] >= 0) wrong.push(y * n + x);
        else functionWrong++;
      }
    }
  }
  const perBlock = engine.damagedCodewords(map, wrong);
  const worst = Math.max(0, ...perBlock);
  // Codewords a centred logo touches at all (the usual, cautious budget)
  let touchedWorst = null;
  if (variant.logoModules > 0) {
    const k = variant.logoModules;
    const s = Math.floor((n - k) / 2);
    const touched = [];
    for (let y = s; y < s + k; y++) {
      for (let x = s; x < s + k; x++) touched.push(y * n + x);
    }
    touchedWorst = Math.max(0, ...engine.damagedCodewords(map, touched));
  }
  return {
    worstBlockErrors: worst,
    correctable: map.correctable,
    functionModulesWrong: functionWrong,
    readableInPrinciple: worst <= map.correctable,
    touchedWorst,
  };
}

async function scanScore(variant, value, symbol) {
  const total = symbol.n + 2 * variant.design.margin;
  const px = Math.ceil(640 / total) + 1;
  const { inner, size } = codeMarkup(variant, value, symbol.n);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total * px}" height="${total * px}" viewBox="0 0 ${size} ${size}">${inner}</svg>`;
  const pixels = rasterize(svg);
  const k = variant.logoModules;
  const props = {
    ...variant.design,
    value,
    exactLevel: true,
    size: total * px,
    ...(k > 0 && {
      imageSettings: {
        src: "data:,",
        width: k * px,
        height: k * px,
        excavate: true,
      },
    }),
  };
  const result = await engine.getScanScoreFromPixels(props, pixels);
  return {
    score: result.score,
    grade: result.grade,
    failedChecks: result.checks.filter((c) => !c.passed).map((c) => c.id),
  };
}

const [input, output] = process.argv.slice(2);
const { jobs, tmpDir } = JSON.parse(readFileSync(input, "utf8"));
mkdirSync(tmpDir, { recursive: true });

const renders = [];
const captures = [];
const zbarFiles = [];
for (const [j, job] of jobs.entries()) {
  const { variant, payloadIndex, value } = job;
  const symbol = symbolOf(value, variant.design.level);
  const render = {
    variant: variant.id,
    payload: payloadIndex,
    version: symbol.version,
    modules: symbol.n,
  };
  if (job.centre) render.centre = centreCheck(variant, value, symbol);
  if (job.score) render.scanScore = await scanScore(variant, value, symbol);
  renders.push(render);

  // A different sub-pixel offset per content, so module edges fall
  // between pixels differently in each of the eight layouts.
  const phase = [(payloadIndex * 0.382) % 1, (payloadIndex * 0.618) % 1];
  for (const condition of job.conditions) {
    const seed = seedOf(`${variant.id}|${payloadIndex}|${condition.id}`);
    const svg = compose(
      variant,
      value,
      symbol.n,
      condition.modulePx,
      phase,
      seedOf(`${variant.id}|${payloadIndex}|page`)
    );
    const image = await capture(rasterize(svg), condition, seed);
    const file = join(tmpDir, `${j}-${captures.length}.png`);
    await writePng(sharp, image, file);
    zbarFiles.push(file);
    captures.push({
      variant: variant.id,
      payload: payloadIndex,
      condition: condition.id,
      modulePx: condition.modulePx,
      width: image.width,
      height: image.height,
      jsqr: readJsQR(deps, image, value),
      zxing: await readZXing(deps, image, value),
      file,
      value,
    });
  }
}

const zbarTexts = readZbarFiles(zbarFiles);
// SCAN_STUDY_KEEP=<dir> keeps every captured image, named by variant,
// content and condition, to look at.
const keep = process.env.SCAN_STUDY_KEEP;
if (keep) mkdirSync(keep, { recursive: true });
for (const c of captures) {
  c.zbar = zbarVerdict(zbarTexts.get(c.file), c.value);
  if (keep) {
    const name = `${c.variant}-${c.payload}-${c.condition}`.replace(
      /[^\w.-]+/g,
      "_"
    );
    renameSync(c.file, join(keep, `${name}.png`));
  }
  c.file = undefined;
  c.value = undefined;
}
rmSync(tmpDir, { recursive: true, force: true });
writeFileSync(output, JSON.stringify({ renders, captures }));

// Runs the scan study and writes its results (see README.md):
//
//   node scripts/scan-study/run.mjs            the whole study (~10 minutes)
//   node scripts/scan-study/run.mjs --smoke    a few variants, to check the setup
//   --only <id,id…>                            only the variants whose id starts with one of these
//   --jobs <n>                                 worker processes (default: half the CPUs)
//   --out <dir>                                where results go (default results/)
//   SCAN_STUDY_KEEP=<dir>                      also keep every captured image there
import { execFileSync, spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, cpus, platform, release, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { zbarVersion } from "./lib/decoders.mjs";
import { loadDeps } from "./lib/deps.mjs";
import { formatFiles } from "./lib/format.mjs";
import {
  captureVariants,
  DESIGN_PAYLOADS,
  designVariants,
  PAYLOADS,
  STANDARD_CONDITIONS,
} from "./study.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const smoke = flag("--smoke");
const only = option("--only", "").split(",").filter(Boolean);
const workers = Number(
  option("--jobs", Math.max(2, Math.floor(availableParallelism() / 2)))
);
const outDir = option(
  "--out",
  join(HERE, smoke || only.length > 0 ? "results-partial" : "results")
);

const zbar = zbarVersion();
if (!zbar) {
  console.error(
    "zbarimg isn't installed. Install zbar (brew install zbar, or apt-get install zbar-tools) and run again."
  );
  process.exit(1);
}

const deps = await loadDeps();
let variants = [...designVariants(deps.engine), ...captureVariants()];
let payloads = PAYLOADS.map((value, index) => ({ value, index }));
if (smoke) {
  const keep = new Set([
    "body:square",
    "eye:gear",
    "logo:H:10",
    "contrast:grey:2",
    "quiet:busy:0",
  ]);
  variants = variants.filter((v) => keep.has(v.id));
  payloads = payloads.slice(0, 2);
}
if (only.length > 0) {
  variants = variants.filter((v) => only.some((id) => v.id.startsWith(id)));
}

// One job per variant and content; the first content also gets the scan
// score (it decodes three sizes of its own) and every design job the
// module-centre check.
const jobs = variants.flatMap((variant) =>
  payloads
    .slice(0, variant.conditions === "standard" ? DESIGN_PAYLOADS : undefined)
    .map(({ value, index }) => ({
      variant: { ...variant, conditions: undefined },
      payloadIndex: index,
      value,
      conditions:
        variant.conditions === "standard"
          ? STANDARD_CONDITIONS
          : variant.conditions,
      centre: variant.conditions === "standard",
      score: variant.score && index === 0,
    }))
);

// Chunks of about 150 captures each, run as short-lived processes
const chunks = [];
let current = [];
let size = 0;
for (const job of jobs) {
  current.push(job);
  size += job.conditions.length;
  if (size >= 150) {
    chunks.push(current);
    current = [];
    size = 0;
  }
}
if (current.length > 0) chunks.push(current);

const work = mkdtempSync(join(tmpdir(), "qrdx-scan-study-"));
const started = Date.now();
let done = 0;

function runChunk(chunk, index) {
  const input = join(work, `in-${index}.json`);
  const output = join(work, `out-${index}.json`);
  writeFileSync(
    input,
    JSON.stringify({ jobs: chunk, tmpDir: join(work, `png-${index}`) })
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(HERE, "worker.mjs"), input, output],
      { stdio: ["ignore", "inherit", "inherit"] }
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker for chunk ${index} exited with ${code}`));
        return;
      }
      done++;
      const seconds = Math.round((Date.now() - started) / 1000);
      process.stdout.write(`\r${done}/${chunks.length} chunks, ${seconds}s`);
      resolve(JSON.parse(readFileSync(output, "utf8")));
    });
  });
}

const results = new Array(chunks.length);
let next = 0;
async function pool() {
  while (next < chunks.length) {
    const index = next++;
    results[index] = await runChunk(chunks[index], index);
  }
}
try {
  await Promise.all(Array.from({ length: workers }, pool));
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.stdout.write("\n");

const renders = results.flatMap((r) => r.renders);
const captures = results.flatMap((r) => r.captures);

// --- Aggregate ----------------------------------------------------------------

const DECODERS = ["jsqr", "zxing", "zbar"];

function rates(list) {
  const n = list.length;
  const rate = (pick) =>
    n === 0 ? null : Number((list.filter(pick).length / n).toFixed(4));
  return {
    images: n,
    jsqr: rate((c) => c.jsqr === "read"),
    zxing: rate((c) => c.zxing === "read"),
    zbar: rate((c) => c.zbar === "read"),
    allThree: rate((c) => DECODERS.every((d) => c[d] === "read")),
    any: rate((c) => DECODERS.some((d) => c[d] === "read")),
    wrongReads: list.reduce(
      (sum, c) => sum + DECODERS.filter((d) => c[d] === "wrong").length,
      0
    ),
  };
}

const byVariant = new Map();
for (const c of captures) {
  const list = byVariant.get(c.variant) ?? [];
  list.push(c);
  byVariant.set(c.variant, list);
}
const rendersOf = new Map();
for (const r of renders) {
  const list = rendersOf.get(r.variant) ?? [];
  list.push(r);
  rendersOf.set(r.variant, list);
}

const META_KEYS = [
  "retired",
  "widthPct",
  "areaPct",
  "ratio",
  "inverted",
  "quietModules",
];

const variantSummaries = variants
  .filter((v) => v.conditions === "standard")
  .map((v) => {
    const list = byVariant.get(v.id) ?? [];
    const conditions = Object.fromEntries(
      STANDARD_CONDITIONS.map((cond) => [
        cond.id,
        rates(list.filter((c) => c.condition === cond.id)),
      ])
    );
    const own = rendersOf.get(v.id) ?? [];
    const centre = own.map((r) => r.centre).filter(Boolean);
    const score = own.find((r) => r.scanScore)?.scanScore ?? null;
    return {
      factor: v.factor,
      group: v.group,
      id: v.id,
      label: v.label,
      level: v.design.level,
      logoModules: v.logoModules,
      page: v.page,
      design: v.design,
      ...Object.fromEntries(
        META_KEYS.filter((k) => v[k] !== undefined).map((k) => [k, v[k]])
      ),
      versions: [...new Set(own.map((r) => r.version))],
      overall: rates(list),
      conditions,
      centre: {
        readableInPrinciple: centre.filter((c) => c.readableInPrinciple).length,
        of: centre.length,
        worstBlockErrors: Math.max(0, ...centre.map((c) => c.worstBlockErrors)),
        correctable: centre[0]?.correctable ?? null,
        functionModulesWrong: Math.max(
          0,
          ...centre.map((c) => c.functionModulesWrong)
        ),
        touchedWorst:
          v.logoModules > 0
            ? Math.max(...centre.map((c) => c.touchedWorst ?? 0))
            : null,
      },
      scanScore: score,
    };
  });

const sweepSummaries = variants
  .filter((v) => v.conditions !== "standard")
  .flatMap((v) => {
    const list = byVariant.get(v.id) ?? [];
    return v.conditions.map((cond) => ({
      factor: v.factor,
      series: cond.series,
      x: cond.x,
      condition: cond.id,
      label: cond.label,
      modulePx: cond.modulePx,
      ...rates(list.filter((c) => c.condition === cond.id)),
    }));
  });

// --- Write ------------------------------------------------------------------

const environment = {
  generated: new Date().toISOString().slice(0, 10),
  command: `node scripts/scan-study/run.mjs${smoke ? " --smoke" : ""}`,
  node: process.version,
  platform: `${platform()} ${release()} (${process.arch})`,
  cpu: cpus()[0]?.model ?? "unknown",
  decoders: {
    jsqr: `jsQR ${deps.versions.jsqr} (inversionAttempts: attemptBoth, its default)`,
    zxing: `ZXing-C++ commit ${deps.versions["zxing-cpp commit"]} via zxing-wasm ${deps.versions["zxing-wasm"]} (library defaults, QR only)`,
    zbar: `zbarimg ${zbar} (${zbarBuild()}; defaults, QR only)`,
  },
  tools: {
    qrdx: deps.versions.qrdx,
    "@resvg/resvg-js": deps.versions["@resvg/resvg-js"],
    sharp: `${deps.versions.sharp} (libvips ${deps.versions.libvips})`,
  },
};

function zbarBuild() {
  try {
    const brew = execFileSync("brew", ["list", "--versions", "zbar"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (brew) return `Homebrew ${brew.replace("zbar ", "")}, ${platform()}`;
  } catch {
    // Not Homebrew
  }
  return `${platform()} build`;
}

mkdirSync(outDir, { recursive: true });

const variantIndex = new Map(variants.map((v, i) => [v.id, i]));
const factorOf = new Map(variants.map((v) => [v.id, [v.factor, v.group]]));
captures.sort(
  (a, b) =>
    variantIndex.get(a.variant) - variantIndex.get(b.variant) ||
    a.payload - b.payload
);
const csv = (rows) =>
  `${rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell == null ? "" : String(cell);
          return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
        })
        .join(",")
    )
    .join("\n")}\n`;

writeFileSync(
  join(outDir, "captures.csv"),
  csv([
    [
      "factor",
      "group",
      "variant",
      "payload",
      "condition",
      "module_px",
      "image_width",
      "image_height",
      "jsqr",
      "zxing",
      "zbar",
    ],
    ...captures.map((c) => [
      ...factorOf.get(c.variant),
      c.variant,
      c.payload,
      c.condition,
      c.modulePx,
      c.width,
      c.height,
      c.jsqr,
      c.zxing,
      c.zbar,
    ]),
  ])
);

writeFileSync(
  join(outDir, "variants.csv"),
  csv([
    [
      "factor",
      "group",
      "variant",
      "label",
      "level",
      "versions",
      "retired",
      "logo_modules",
      "logo_width_pct",
      "logo_area_pct",
      "contrast_ratio",
      "inverted",
      "quiet_modules",
      "page",
      "images",
      "jsqr",
      "zxing",
      "zbar",
      "all_three",
      "any",
      "wrong_reads",
      "centre_check_readable",
      "scan_score",
      "scan_grade",
      "scan_failed_checks",
    ],
    ...variantSummaries.map((v) => [
      v.factor,
      v.group,
      v.id,
      v.label,
      v.level,
      v.versions.join(" "),
      v.retired ? "yes" : "",
      v.logoModules,
      v.widthPct?.toFixed(1),
      v.areaPct?.toFixed(1),
      v.ratio?.toFixed(2),
      v.inverted === undefined ? "" : v.inverted ? "yes" : "no",
      v.quietModules,
      v.page,
      v.overall.images,
      v.overall.jsqr,
      v.overall.zxing,
      v.overall.zbar,
      v.overall.allThree,
      v.overall.any,
      v.overall.wrongReads,
      `${v.centre.readableInPrinciple}/${v.centre.of}`,
      v.scanScore?.score,
      v.scanScore?.grade,
      v.scanScore?.failedChecks.join(" "),
    ]),
  ])
);

writeFileSync(
  join(outDir, "sweeps.csv"),
  csv([
    [
      "factor",
      "series",
      "x",
      "condition",
      "module_px",
      "images",
      "jsqr",
      "zxing",
      "zbar",
      "all_three",
      "any",
      "wrong_reads",
    ],
    ...sweepSummaries.map((s) => [
      s.factor,
      s.series,
      s.x,
      s.condition,
      s.modulePx,
      s.images,
      s.jsqr,
      s.zxing,
      s.zbar,
      s.allThree,
      s.any,
      s.wrongReads,
    ]),
  ])
);

writeFileSync(
  join(outDir, "summary.json"),
  `${JSON.stringify(
    {
      environment,
      payloads: payloads.map((p) => p.value),
      conditions: STANDARD_CONDITIONS,
      totals: { images: captures.length, decodes: captures.length * 3 },
      variants: variantSummaries,
      sweeps: sweepSummaries,
    },
    null,
    2
  )}\n`
);

formatFiles([join(outDir, "summary.json")]);

console.log(
  `${captures.length} images, ${captures.length * 3} decodes in ${Math.round((Date.now() - started) / 1000)}s → ${outDir}`
);

// Draws the study's charts as SVG from results/summary.json:
//
//   node scripts/scan-study/charts.mjs [--out <dir>]   (default charts/)
//
// Each chart paints its own surface and switches to dark colours under
// prefers-color-scheme, so it reads on a light or a dark page. Decoders keep
// one colour each in every chart (jsQR blue, ZXing orange, zbar aqua), with
// a different line style and marker too, so colour is never the only cue.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatFiles } from "./lib/format.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const OUT = outAt === -1 ? join(HERE, "charts") : args[outAt + 1];
const inAt = args.indexOf("--in");
const SUMMARY =
  inAt === -1 ? join(HERE, "results", "summary.json") : args[inAt + 1];
const summary = JSON.parse(readFileSync(SUMMARY, "utf8"));

const STYLE = `<style>
svg{--bg:#f7f7f8;--ink:#0b0b0b;--ink2:#52514e;--muted:#6f6e69;--grid:#e1e0d9;--axis:#c3c2b7;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--o1:#86b6ef;--o2:#3987e5;--o3:#1c5cab;--o4:#0d366b;--band:rgba(11,11,11,.05)}
@media (prefers-color-scheme:dark){svg{--bg:#111113;--ink:#f0efec;--ink2:#c3c2b7;--muted:#9a9890;--grid:#2c2c2a;--axis:#45453f;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--o1:#184f95;--o2:#2a78d6;--o3:#6da7ec;--o4:#b7d3f6;--band:rgba(255,255,255,.06)}}
text{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;fill:var(--ink2)}
.t{font-size:22px;font-weight:600;fill:var(--ink)}
.st{font-size:15px;fill:var(--ink2)}
.pt{font-size:15px;font-weight:600;fill:var(--ink)}
.tick{font-size:13px;fill:var(--muted)}
.ax{font-size:13px;fill:var(--ink2)}
.lab{font-size:13px;font-weight:600}
.note{font-size:12px;fill:var(--muted)}
.grid{stroke:var(--grid);stroke-width:1}
.base{stroke:var(--axis);stroke-width:1.5}
.ln{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
</style>`;

/** The three decoders, in a fixed order with fixed styles. */
const DECODERS = [
  { key: "jsqr", name: "jsQR", color: "var(--s1)", dash: "", marker: "circle" },
  {
    key: "zxing",
    name: "ZXing-C++",
    color: "var(--s2)",
    dash: "7 4",
    marker: "square",
  },
  {
    key: "zbar",
    name: "zbar",
    color: "var(--s3)",
    dash: "2 4",
    marker: "diamond",
  },
];

const r1 = (n) => Math.round(n * 10) / 10;
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

function marker(kind, x, y, color) {
  const fill = `fill="${color}" stroke="var(--bg)" stroke-width="2"`;
  if (kind === "square") {
    return `<rect x="${r1(x - 4.5)}" y="${r1(y - 4.5)}" width="9" height="9" rx="1.5" ${fill}/>`;
  }
  if (kind === "diamond") {
    return `<path d="M${r1(x)} ${r1(y - 6)}L${r1(x + 6)} ${r1(y)}L${r1(x)} ${r1(y + 6)}L${r1(x - 6)} ${r1(y)}Z" ${fill}/>`;
  }
  return `<circle cx="${r1(x)}" cy="${r1(y)}" r="5" ${fill}/>`;
}

/**
 * One plot: x and y axes, gridlines, and lines with markers. `series` is
 * [{ name, color, dash, marker, points: [[x, y]] }] with y from 0 to 1.
 */
function panel({
  x0,
  y0,
  w,
  h,
  title,
  xLabel,
  xTicks,
  xDomain,
  log = false,
  reverse = false,
  series,
  yLabel = true,
  labels = "end",
  band,
}) {
  const [d0, d1] = xDomain;
  const tx = (v) => {
    const t = log
      ? (Math.log(v) - Math.log(d0)) / (Math.log(d1) - Math.log(d0))
      : (v - d0) / (d1 - d0);
    return x0 + (reverse ? 1 - t : t) * w;
  };
  const ty = (v) => y0 + h - v * h;
  let out = "";
  if (title)
    out += `<text class="pt" x="${x0}" y="${y0 - 16}">${esc(title)}</text>`;
  if (band) {
    const a = tx(band[0]);
    const b = tx(band[1]);
    out += `<rect x="${r1(Math.min(a, b))}" y="${y0}" width="${r1(Math.abs(b - a))}" height="${h}" fill="var(--band)"/>`;
    if (band[2]) {
      out += `<text class="note" x="${r1(Math.min(a, b) + 6)}" y="${y0 + 16}">${esc(band[2])}</text>`;
    }
  }
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    out += `<line class="${v === 0 ? "base" : "grid"}" x1="${x0}" x2="${x0 + w}" y1="${r1(ty(v))}" y2="${r1(ty(v))}"/>`;
    if (yLabel) {
      out += `<text class="tick" x="${x0 - 10}" y="${r1(ty(v) + 4)}" text-anchor="end">${Math.round(v * 100)}%</text>`;
    }
  }
  for (const t of xTicks) {
    const [value, text] = Array.isArray(t) ? t : [t, String(t)];
    out += `<text class="tick" x="${r1(tx(value))}" y="${y0 + h + 22}" text-anchor="middle">${esc(text)}</text>`;
  }
  if (xLabel) {
    out += `<text class="ax" x="${r1(x0 + w / 2)}" y="${y0 + h + 46}" text-anchor="middle">${esc(xLabel)}</text>`;
  }
  // Lines first, markers on top
  for (const s of series) {
    const d = s.points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${r1(tx(x))} ${r1(ty(y))}`)
      .join("");
    out += `<path class="ln" d="${d}" stroke="${s.color}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`;
  }
  for (const s of series) {
    for (const [x, y] of s.points)
      out += marker(s.marker, tx(x), ty(y), s.color);
  }
  if (labels === "cross") {
    // Each line's label where it falls through 50%, just left of the line
    for (const s of series) {
      const at = s.points.findIndex(([, y], i) => i > 0 && y < 0.5);
      if (at < 1) continue;
      const [xa, ya] = s.points[at - 1];
      const [xb, yb] = s.points[at];
      const x = xa + ((ya - 0.5) / (ya - yb)) * (xb - xa);
      out += `<text class="lab" x="${r1(tx(x) - 10)}" y="${r1(ty(0.5) + 4)}" text-anchor="end" style="fill:${s.color}">${esc(s.label ?? s.name)}</text>`;
    }
  }
  if (labels === "end") {
    // Direct labels at the right end, nudged apart when lines end together
    const ends = series
      .map((s) => {
        const [x, y] = s.points.at(-1);
        return { s, x: tx(x), y: ty(y) };
      })
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) {
      if (ends[i].y - ends[i - 1].y < 16) ends[i].y = ends[i - 1].y + 16;
    }
    for (const e of ends) {
      out += `<text class="lab" x="${r1(e.x + 12)}" y="${r1(e.y + 4)}" style="fill:${e.s.color}">${esc(e.s.label ?? e.s.name)}</text>`;
    }
  }
  return out;
}

function legend(x, y, items) {
  let out = "";
  let cx = x;
  for (const item of items) {
    out += `<line x1="${cx}" x2="${cx + 30}" y1="${y}" y2="${y}" class="ln" stroke="${item.color}"${item.dash ? ` stroke-dasharray="${item.dash}"` : ""}/>${marker(item.marker, cx + 15, y, item.color)}<text class="ax" x="${cx + 38}" y="${y + 4.5}">${esc(item.name)}</text>`;
    cx += 48 + item.name.length * 8.2;
  }
  return out;
}

function figure(width, height, title, subtitle, body, foot) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title)}">${STYLE}<rect width="${width}" height="${height}" rx="12" fill="var(--bg)"/><text class="t" x="40" y="48">${esc(title)}</text><text class="st" x="40" y="74">${esc(subtitle)}</text>${body}${foot ? `<text class="note" x="40" y="${height - 18}">${esc(foot)}</text>` : ""}</svg>\n`;
}

const decoderSeries = (points) =>
  DECODERS.map((d) => ({ ...d, points: points(d.key) }));
const FOOT = `QRdx scan study, ${summary.environment.generated} · jsQR ${summary.environment.decoders.jsqr.split(" ")[1]}, ZXing-C++, zbar ${summary.environment.decoders.zbar.split(" ")[1]} (Homebrew) · github.com/qrdxinc/qrdx/tree/main/scripts/scan-study`;

// --- Logo size × error correction ------------------------------------------------

function logoChart() {
  const levels = [
    ["L", "var(--o1)", "circle"],
    ["M", "var(--o2)", "square"],
    ["Q", "var(--o3)", "diamond"],
    ["H", "var(--o4)", "circle"],
  ];
  const series = levels.map(([level, color, mark]) => ({
    name: `Level ${level}`,
    label: level,
    color,
    marker: mark,
    points: summary.variants
      .filter((v) => v.factor === "logo" && v.level === level)
      .map((v) => [v.widthPct, v.overall.allThree]),
  }));
  const body =
    panel({
      x0: 90,
      y0: 130,
      w: 800,
      h: 340,
      xLabel: "Logo width, % of the code's width (area is this squared)",
      xTicks: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45].map((v) => [v, `${v}%`]),
      xDomain: [0, 45],
      labels: "cross",
      series,
    }) +
    legend(
      90,
      104,
      series.map((s) => ({ ...s, dash: "" }))
    );
  return figure(
    960,
    560,
    "How big can a centre logo be?",
    "Share of 60 captures read by all three decoders, by error correction level",
    body,
    FOOT
  );
}

// --- Contrast -------------------------------------------------------------------

function contrastChart() {
  const grey = summary.variants
    .filter((v) => v.factor === "contrast" && v.group === "grey")
    .sort((a, b) => a.ratio - b.ratio);
  const series = decoderSeries((key) =>
    grey.map((v) => [v.ratio, v.overall[key]])
  );
  const body =
    panel({
      x0: 90,
      y0: 130,
      w: 780,
      h: 340,
      xLabel: "Contrast ratio of the grey modules on white (WCAG, log scale)",
      xTicks: [1.3, 1.5, 2, 3, 4.5, 7, 12, 21].map((v) => [v, `${v}:1`]),
      xDomain: [1.25, 21],
      log: true,
      series,
    }) + legend(90, 104, DECODERS);
  return figure(
    960,
    560,
    "How much contrast does a QR code need?",
    "Share of 60 captures read, grey modules on white, by decoder",
    body,
    FOOT
  );
}

// --- Quiet zone ---------------------------------------------------------------------

function quietChart() {
  const pages = [
    ["white", "White surroundings"],
    ["dark", "Dark surroundings"],
    ["busy", "Busy pattern around it"],
  ];
  let body = legend(90, 104, DECODERS);
  pages.forEach(([page, title], i) => {
    const rows = summary.variants
      .filter((v) => v.factor === "quiet-zone" && v.page === page)
      .sort((a, b) => a.quietModules - b.quietModules);
    body += panel({
      x0: 90 + i * 290,
      y0: 160,
      w: 230,
      h: 300,
      title,
      xLabel: "Quiet zone, modules",
      xTicks: [0, 1, 2, 3, 4],
      xDomain: [0, 4],
      yLabel: i === 0,
      labels: "none",
      series: decoderSeries((key) =>
        rows.map((v) => [v.quietModules, v.overall[key]])
      ),
    });
  });
  return figure(
    960,
    570,
    "How much blank margin does a QR code need?",
    "Share of 60 captures read, by the light margin printed around the code",
    body,
    FOOT
  );
}

// --- Module size ----------------------------------------------------------------------

function sizeChart() {
  const rows = summary.sweeps.filter((s) => s.factor === "module-size");
  let body = legend(90, 104, DECODERS);
  [
    ["crisp", "Clean pixels"],
    ["soft", "With a fixed sensor blur and noise"],
  ].forEach(([series, title], i) => {
    const own = rows
      .filter((s) => s.series === series)
      .sort((a, b) => a.x - b.x);
    body += panel({
      x0: 90 + i * 440,
      y0: 160,
      w: 360,
      h: 300,
      title,
      xLabel: "Pixels per module in the photo (log scale)",
      xTicks: [1, 1.5, 2, 3, 4, 6, 10],
      xDomain: [1, 10],
      log: true,
      yLabel: i === 0,
      labels: "none",
      series: decoderSeries((key) => own.map((s) => [s.x, s[key]])),
    });
  });
  return figure(
    960,
    570,
    "How many pixels does each module need?",
    "Share of 24 codes read, by how many camera pixels each module covers",
    body,
    FOOT
  );
}

// --- Degradation -------------------------------------------------------------------------

function degradeChart() {
  const rows = summary.sweeps.filter((s) => s.factor === "degradation");
  const panels = [
    ["blur", "Blur", "σ, in modules", [0, 0.2, 0.4, 0.6, 0.8, 1], [0, 1]],
    ["noise", "Noise", "σ, grey levels of 255", [0, 32, 64, 96, 128], [0, 128]],
    [
      "tilt",
      "Tilt",
      "Degrees from straight on",
      [0, 15, 30, 45, 60, 75],
      [0, 75],
    ],
    [
      "jpeg-3px",
      "JPEG, 3 px/module",
      "Quality (lower = smaller file)",
      [95, 75, 50, 25, 1],
      [1, 95],
    ],
  ];
  let body = legend(90, 104, DECODERS);
  panels.forEach(([series, title, xLabel, ticks, domain], i) => {
    const own = rows
      .filter((s) => s.series === series)
      .sort((a, b) => a.x - b.x);
    body += panel({
      x0: 90 + i * 215,
      y0: 160,
      w: 165,
      h: 280,
      title,
      xLabel,
      xTicks: ticks,
      xDomain: domain,
      reverse: series.startsWith("jpeg"),
      yLabel: i === 0,
      labels: "none",
      series: decoderSeries((key) => own.map((s) => [s.x, s[key]])),
    });
  });
  return figure(
    960,
    550,
    "What a rough photo does to a QR code",
    "Share of 24 codes read at 6 px per module (JPEG at 3), one kind of damage at a time",
    body,
    FOOT
  );
}

// --- Shapes ------------------------------------------------------------------------------

function shapesChart() {
  const shapes = summary.variants
    .filter((v) => v.factor === "shape")
    .sort(
      (a, b) =>
        a.overall.allThree - b.overall.allThree ||
        a.overall.any - b.overall.any ||
        a.id.localeCompare(b.id)
    )
    .filter((v) => v.overall.allThree < 0.95);
  const rowH = 26;
  const top = 140;
  const x0 = 330;
  const w = 560;
  const height = top + shapes.length * rowH + 90;
  const tx = (v) => x0 + v * w;
  let body = legend(90, 104, DECODERS);
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    body += `<line class="grid" x1="${r1(tx(v))}" x2="${r1(tx(v))}" y1="${top - 8}" y2="${top + shapes.length * rowH}"/><text class="tick" x="${r1(tx(v))}" y="${top + shapes.length * rowH + 22}" text-anchor="middle">${v * 100}%</text>`;
  }
  shapes.forEach((v, i) => {
    const y = top + i * rowH + rowH / 2;
    const part =
      v.group === "body"
        ? "dots"
        : v.group === "eye"
          ? "eye frame"
          : v.group === "centre"
            ? "eye centre"
            : "";
    const name =
      v.group === "qrdx-default"
        ? v.id === "qrdx-default:Q"
          ? "QRdx default look (level Q)"
          : "QRdx default look (level M)"
        : `${v.label} ${part}${v.retired ? " (retired)" : ""}`;
    body += `<text class="ax" x="${x0 - 14}" y="${y + 4.5}" text-anchor="end">${esc(name)}</text><line class="grid" x1="${x0}" x2="${x0 + w}" y1="${y}" y2="${y}" stroke-dasharray="1 4"/>`;
    // A few pixels apart, so decoders on the same value stay visible
    DECODERS.forEach((d, k) => {
      body += marker(d.marker, tx(v.overall[d.key]), y + (k - 1) * 5, d.color);
    });
  });
  return figure(
    960,
    height,
    "Eye and dot shapes that decoders missed",
    `Share of 60 captures read, one shape changed at a time; the other ${summary.variants.filter((v) => v.factor === "shape").length - shapes.length} shapes read in 95% or more by all three`,
    body,
    FOOT
  );
}

mkdirSync(OUT, { recursive: true });
const charts = {
  "logo-size.svg": logoChart(),
  "contrast.svg": contrastChart(),
  "quiet-zone.svg": quietChart(),
  "module-size.svg": sizeChart(),
  "degradation.svg": degradeChart(),
  "shapes.svg": shapesChart(),
};
const written = Object.entries(charts).map(([name, svg]) => {
  writeFileSync(join(OUT, name), svg);
  return join(OUT, name);
});
formatFiles(written);
console.log(written.join("\n"));

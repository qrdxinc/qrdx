// The official designs the community seed publishes (apps/app/scripts/
// community-seed/designs, through packages/database/scripts/
// community-seed-designs.json), as the seed script builds them, and the
// decoders the repo's tests read codes with: the publish gate's jsQR
// through the camera model (lib/community/scan-gate.ts), the scanner's
// own ZXing reader (barcode-detector, as tests/barcode/decode.test.ts) and
// zbar when `zbarimg` is installed (as packages/qrdx/tests/support/
// official-frames.ts). Nothing connects to a database.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import type { ThemePayload } from "@/lib/community/payloads";
import { toPublicStyle } from "@/lib/community/public-style-server";
import { GATE_SAMPLES } from "@/lib/community/scan-samples";
import { renderDesignPng } from "@/lib/qr-design/score";
import type { ThemeStyles } from "@/types/theme";
import * as seed from "../../../../packages/database/scripts/seed-community.mjs";

export interface SeededDesign {
  id: string;
  ref: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  payload: ThemePayload;
  facets: { design: string; pairedFrame?: string };
  /** The gate score the seed stores (scan_score) */
  scanScore: number | null;
}

/** The seeded designs, in seed order. */
export function seededDesigns(): SeededDesign[] {
  return (seed.buildSeedItems() as SeededDesign[]).filter(
    (item) => item.facets?.design !== undefined,
  );
}

/** The style a design is shown and gated as (its quick icon drawn in). */
export const shownStyle = (item: SeededDesign): ThemeStyles =>
  toPublicStyle(item.payload.style, item.payload.logoIcon);

/** The code width every design is rendered at for the extra decoders. */
export const DECODE_CODE_WIDTH = 320;

// The ponyfill builds a DOMRectReadOnly for each result's bounding box; Node
// has none. Decoding doesn't touch it.
(globalThis as { DOMRectReadOnly?: unknown }).DOMRectReadOnly ??= class {
  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly width = 0,
    readonly height = 0,
  ) {}
};

let detector: BarcodeDetector | null = null;

/** The scanner's ZXing reader, loaded from the local package. */
function zxing(): BarcodeDetector {
  if (detector) return detector;
  const require = createRequire(import.meta.url);
  const fromDetector = createRequire(
    require.resolve("barcode-detector/ponyfill"),
  );
  const wasm = readFileSync(
    fromDetector.resolve("zxing-wasm/reader/zxing_reader.wasm"),
  );
  prepareZXingModule({
    overrides: {
      wasmBinary: wasm.buffer.slice(
        wasm.byteOffset,
        wasm.byteOffset + wasm.byteLength,
      ) as ArrayBuffer,
    },
    fireImmediately: true,
  });
  detector = new BarcodeDetector({ formats: ["qr_code"] });
  return detector;
}

/**
 * Whether `zbarimg` is installed. Without it the zbar check is skipped on
 * a developer's machine; in the frame-scan workflow (QRDX_REQUIRE_ZBAR=1,
 * which installs zbar) a missing zbar fails the gate instead.
 */
export const ZBAR_INSTALLED = (() => {
  const probe = spawnSync("zbarimg", ["--version"], { encoding: "utf8" });
  return probe.status === 0;
})();
if (
  !ZBAR_INSTALLED &&
  process.env.CI === "true" &&
  process.env.QRDX_REQUIRE_ZBAR === "1"
) {
  throw new Error(
    "zbarimg is not installed, and this workflow requires it (apt-get install zbar-tools): the design gate can't read with zbar",
  );
}

/** The decoders a design is read with here, for test names. */
export const DECODERS = ZBAR_INSTALLED
  ? "ZXing and zbar"
  : "ZXing (zbar isn't installed)";

/** How to rewrite the gate scores the seed stores when one is stale. */
export const SCORES_UPDATE =
  "The stored gate score is stale: run `UPDATE_COMMUNITY_SEED_SCORES=1 bun x vitest run tests/database/seed-community.test.ts` in apps/app";

let zbarDir: string | null = null;
function zbarWorkDir(): string {
  zbarDir ??= mkdtempSync(join(tmpdir(), "qrdx-designs-"));
  return zbarDir;
}

/** Removes the zbar scratch files (call from afterAll). */
export function cleanupDecoders() {
  if (zbarDir) rmSync(zbarDir, { recursive: true, force: true });
  zbarDir = null;
}

async function readWithZxing(png: Uint8Array, value: string) {
  const found = await zxing().detect(
    new Blob([new Uint8Array(png)], { type: "image/png" }),
  );
  return found.some((code) => code.rawValue === value);
}

function readWithZbar(png: Uint8Array, value: string, name: string) {
  const file = join(zbarWorkDir(), `${name}.png`);
  writeFileSync(file, png);
  const result = spawnSync("zbarimg", ["--raw", "-q", file], {
    encoding: "utf8",
  });
  return result.stdout.replace(/\n$/, "") === value;
}

/**
 * Renders the design with each gate sample at DECODE_CODE_WIDTH and reads
 * it with ZXing and zbar. Returns what failed ("wifi: zbar"), empty when
 * every decoder read every sample.
 */
export async function decodeFailures(
  style: ThemeStyles,
  name: string,
): Promise<string[]> {
  const failures: string[] = [];
  for (const sample of GATE_SAMPLES) {
    const png = await renderDesignPng(
      sample.value,
      style,
      DECODE_CODE_WIDTH,
      style.customLogo,
    );
    if (!(await readWithZxing(png, sample.value))) {
      failures.push(`${sample.id}: zxing`);
    }
    if (
      ZBAR_INSTALLED &&
      !readWithZbar(png, sample.value, `${name}-${sample.id}`)
    ) {
      failures.push(`${sample.id}: zbar`);
    }
  }
  return failures;
}

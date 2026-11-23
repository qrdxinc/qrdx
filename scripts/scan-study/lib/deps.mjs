// The study runs on the engine package's own dependencies: the built engine
// (packages/qrdx/dist), the rasteriser its frames tooling uses (resvg), and
// the decoders and image tools its tests already install (jsQR, ZXing-C++
// through zxing-wasm, sharp). The repository root doesn't list them, and
// packages are installed isolated, so they're resolved from the engine's
// package.json rather than imported by name here.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENGINE_DIR = fileURLToPath(
  new URL("../../../packages/qrdx/", import.meta.url)
);
const engineRequire = createRequire(`${ENGINE_DIR}package.json`);

const load = (specifier) =>
  import(pathToFileURL(engineRequire.resolve(specifier)).href);

/** The version in a package's package.json, read from disk. */
function versionOf(name) {
  // Some packages don't export ./package.json; find it next to the entry.
  const entry = engineRequire.resolve(name);
  const marker = `node_modules/${name}/`;
  const root = entry.slice(0, entry.indexOf(marker) + marker.length);
  return JSON.parse(readFileSync(`${root}package.json`, "utf8")).version;
}

export async function loadDeps() {
  let engine;
  try {
    engine = await import(pathToFileURL(`${ENGINE_DIR}dist/core.mjs`).href);
  } catch (error) {
    throw new Error(
      `The engine isn't built (${error.message}). Run: bun install && bun run --filter qrdx build:inplace`
    );
  }
  const [{ Resvg }, jsqr, zxing, sharp] = await Promise.all([
    load("@resvg/resvg-js"),
    load("jsqr"),
    load("zxing-wasm/reader"),
    load("sharp"),
  ]);
  const wasm = readFileSync(
    engineRequire.resolve("zxing-wasm/reader/zxing_reader.wasm")
  );
  await zxing.prepareZXingModule({
    overrides: {
      wasmBinary: wasm.buffer.slice(
        wasm.byteOffset,
        wasm.byteOffset + wasm.byteLength
      ),
    },
    fireImmediately: true,
  });
  return {
    engine,
    Resvg,
    jsQR: jsqr.default,
    zxing,
    sharp: sharp.default,
    versions: {
      qrdx: JSON.parse(readFileSync(`${ENGINE_DIR}package.json`, "utf8"))
        .version,
      jsqr: versionOf("jsqr"),
      "zxing-wasm": zxing.ZXING_WASM_VERSION,
      "zxing-cpp commit": zxing.ZXING_CPP_COMMIT,
      "@resvg/resvg-js": versionOf("@resvg/resvg-js"),
      sharp: sharp.default.versions.sharp,
      libvips: sharp.default.versions.vips,
    },
  };
}

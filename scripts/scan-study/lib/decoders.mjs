// The three decoders, each with its library defaults except that every one
// looks for QR codes only:
// - jsQR (JavaScript, many web scanners): inversionAttempts "attemptBoth",
//   its default, so it also tries light-on-dark.
// - ZXing-C++ through zxing-wasm: defaults (tryHarder, tryRotate,
//   tryInvert, tryDownscale on; LocalAverage binarizer).
// - zbar's zbarimg: defaults, which don't try light-on-dark codes. It runs
//   on PNG files, many per process (batched by the worker).
// A read counts only when the text is exactly the encoded value; a decoder
// that returns other text is recorded as "wrong", not as a read.
import { spawnSync } from "node:child_process";

/** "read", "none" or "wrong". */
const verdict = (text, value) =>
  text == null ? "none" : text === value ? "read" : "wrong";

export function readJsQR(deps, image, value) {
  const result = deps.jsQR(image.data, image.width, image.height);
  if (!result) return "none";
  let text = result.data;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(result.binaryData)
    );
  } catch {
    // Not UTF-8: keep jsQR's own text
  }
  return verdict(text, value);
}

export async function readZXing(deps, image, value) {
  const results = await deps.zxing.readBarcodes(
    { data: image.data, width: image.width, height: image.height },
    { formats: ["QRCode"] }
  );
  const valid = results.filter((r) => r.isValid);
  if (valid.length === 0) return "none";
  return valid.some((r) => r.text === value) ? "read" : "wrong";
}

/** zbarimg's version, or null when it isn't installed. */
export function zbarVersion() {
  const probe = spawnSync("zbarimg", ["--version"], { encoding: "utf8" });
  return probe.status === 0 ? probe.stdout.trim() : null;
}

const SOURCE = /<source href='([^']*)'>([\s\S]*?)<\/source>/g;
const DATA = /<data(?: format='base64')?><!\[CDATA\[([\s\S]*?)\]\]><\/data>/g;

/**
 * Reads PNG files with zbarimg (QR codes only) and returns, per file, the
 * texts it decoded. Files are passed in batches to keep the command short.
 */
export function readZbarFiles(files) {
  const texts = new Map(files.map((file) => [file, []]));
  for (let i = 0; i < files.length; i += 200) {
    const batch = files.slice(i, i + 200);
    const run = spawnSync(
      "zbarimg",
      ["--xml", "-q", "-Sdisable", "-Sqrcode.enable", ...batch],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
    // Exit status 4 means some file had no code; the XML still lists all.
    if (run.status !== 0 && run.status !== 4) {
      throw new Error(`zbarimg failed (${run.status}): ${run.stderr}`);
    }
    for (const [, href, body] of run.stdout.matchAll(SOURCE)) {
      const found = [...body.matchAll(DATA)].map((m) => m[1]);
      texts.get(href)?.push(...found);
    }
  }
  return texts;
}

export function zbarVerdict(texts, value) {
  if (!texts || texts.length === 0) return "none";
  return texts.includes(value) ? "read" : "wrong";
}

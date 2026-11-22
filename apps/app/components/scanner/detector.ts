// Barcode detection: the browser's BarcodeDetector where it exists (Chrome on
// Android and macOS), otherwise the `barcode-detector` ponyfill (ZXing
// compiled to WebAssembly), loaded on first use. The browser's own reader
// doesn't read every format in SCAN_FORMATS (no Micro QR, rMQR, GS1 DataBar
// or MaxiCode, and on macOS no Codabar), so where it's used the WebAssembly
// reader reads the rest: in every uploaded image, and in camera frames once
// the browser's reader has found nothing for a moment (createFrameReader).

export const SCAN_FORMATS = [
  "qr_code",
  "micro_qr_code",
  "rm_qr_code",
  "data_matrix",
  "aztec",
  "pdf417",
  "maxi_code",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "itf",
  "databar_omni",
  "databar_limited",
  "databar_expanded",
  "databar_stacked",
  "databar_expanded_stacked",
] as const;

export type ScanFormat = (typeof SCAN_FORMATS)[number];

export const FORMAT_LABELS: Record<string, string> = {
  qr_code: "QR code",
  micro_qr_code: "Micro QR",
  rm_qr_code: "rMQR",
  data_matrix: "Data Matrix",
  aztec: "Aztec",
  pdf417: "PDF417",
  maxi_code: "MaxiCode",
  ean_13: "EAN-13",
  ean_8: "EAN-8",
  upc_a: "UPC-A",
  upc_e: "UPC-E",
  code_128: "Code 128",
  code_39: "Code 39",
  code_93: "Code 93",
  codabar: "Codabar",
  itf: "ITF",
  databar_omni: "GS1 DataBar",
  databar_limited: "GS1 DataBar Limited",
  databar_expanded: "GS1 DataBar Expanded",
  databar_stacked: "GS1 DataBar Stacked",
  databar_stacked_omni: "GS1 DataBar Stacked Omnidirectional",
  databar_expanded_stacked: "GS1 DataBar Expanded Stacked",
};

export function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format.replace(/_/g, " ");
}

export interface DetectedCode {
  rawValue: string;
  format: string;
  cornerPoints: { x: number; y: number }[];
}

interface Detector {
  detect(source: ImageBitmapSource): Promise<
    {
      rawValue: string;
      format: string;
      cornerPoints: readonly { x: number; y: number }[];
    }[]
  >;
}

// A type alias, not an interface: Biome 2.3 crashes on interface construct signatures.
type DetectorConstructor = (new (options?: {
  formats?: string[];
}) => Detector) & {
  getSupportedFormats(): Promise<readonly string[]>;
};

export type DetectorEngine = "native" | "wasm";

interface Readers {
  detector: Detector;
  engine: DetectorEngine;
  /** SCAN_FORMATS the detector doesn't read, left to the WebAssembly reader. */
  missing: ScanFormat[];
}

let detectorPromise: Promise<Readers> | null = null;

/**
 * SCAN_FORMATS a browser reader that lists `supported` leaves to the
 * WebAssembly reader. UPC-A is an EAN-13 with a leading 0, so a reader that
 * lists EAN-13 and not UPC-A (Chrome on macOS) reads it anyway, as EAN-13,
 * and it isn't asked for again.
 */
export function missingFormats(supported: readonly string[]): ScanFormat[] {
  return SCAN_FORMATS.filter(
    (format) =>
      !(
        supported.includes(format) ||
        (format === "upc_a" && supported.includes("ean_13"))
      ),
  );
}

async function createDetector(): Promise<Readers> {
  const Native = (globalThis as { BarcodeDetector?: DetectorConstructor })
    .BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      const formats = SCAN_FORMATS.filter((format) =>
        supported.includes(format),
      );
      if (formats.includes("qr_code")) {
        return {
          detector: new Native({ formats }),
          engine: "native",
          missing: missingFormats(formats),
        };
      }
    } catch {
      // Fall through to the WebAssembly reader.
    }
  }
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return {
    detector: new BarcodeDetector({ formats: [...SCAN_FORMATS] }),
    engine: "wasm",
    missing: [],
  };
}

/** Shared detector, created once per page. */
export function getDetector(): Promise<Readers> {
  if (!detectorPromise) {
    detectorPromise = createDetector().catch((error) => {
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
}

let fallbackPromise: Promise<Detector> | null = null;

/** The WebAssembly reader for the formats the browser's own reader lacks. */
function getFallbackDetector(
  formats: readonly ScanFormat[],
): Promise<Detector> {
  if (!fallbackPromise) {
    fallbackPromise = import("barcode-detector/ponyfill")
      .then(
        ({ BarcodeDetector }) =>
          new BarcodeDetector({ formats: [...formats] }) as Detector,
      )
      .catch((error) => {
        fallbackPromise = null;
        throw error;
      });
  }
  return fallbackPromise;
}

/** Drops empty values and repeats of the same value in the same format. */
function uniqueCodes(
  found: Awaited<ReturnType<Detector["detect"]>>,
): DetectedCode[] {
  const seen = new Set<string>();
  const codes: DetectedCode[] = [];
  for (const code of found) {
    const key = `${code.format}\u0000${code.rawValue}`;
    if (!code.rawValue || seen.has(key)) continue;
    seen.add(key);
    codes.push({
      rawValue: code.rawValue,
      format: code.format,
      cornerPoints: code.cornerPoints.map(({ x, y }) => ({ x, y })),
    });
  }
  return codes;
}

/**
 * Codes in an uploaded, dropped or pasted image (EXIF rotation applied).
 * Where the browser's own reader is used, the WebAssembly reader always
 * reads the image too, for the formats the browser's lacks: a parcel label
 * or a coupon can carry one of each.
 */
export async function detectCodesInImage(blob: Blob): Promise<DetectedCode[]> {
  const bitmap = await createImageBitmap(blob);
  try {
    const { detector, missing } = await getDetector();
    const found = await detector.detect(bitmap);
    if (missing.length === 0) return uniqueCodes(found);
    try {
      const fallback = await getFallbackDetector(missing);
      return uniqueCodes([...found, ...(await fallback.detect(bitmap))]);
    } catch (error) {
      // Without the WebAssembly reader, what the browser's found still counts.
      if (found.length === 0) throw error;
      console.error("WebAssembly barcode reader failed:", error);
      return uniqueCodes(found);
    }
  } finally {
    bitmap.close();
  }
}

/** Camera: how long the browser's reader finds nothing before the WebAssembly reader tries. */
export const FALLBACK_IDLE_MS = 1000;
/** Camera: the least time between two frames read by the WebAssembly reader. */
export const FALLBACK_EVERY_MS = 500;
/** Camera: failed WebAssembly reads after which it isn't tried again. */
const FALLBACK_MAX_FAILURES = 3;

/**
 * Reads camera frames, one at a time. The shared detector reads every frame.
 * Where that's the browser's own reader, the WebAssembly reader also reads a
 * frame for the formats it lacks, once the browser's has found nothing for
 * FALLBACK_IDLE_MS and then at most every FALLBACK_EVERY_MS, so a frame
 * costs no more than before while a QR code or a product barcode is in view.
 * The WebAssembly reader starts loading the first time it's wanted, and frames
 * keep being read meanwhile.
 */
export function createFrameReader(now: () => number = () => performance.now()) {
  let lastFound = now();
  let lastFallback = Number.NEGATIVE_INFINITY;
  let fallback: Detector | null = null;
  let loading = false;
  let failures = 0;

  return async function readFrame(
    source: ImageBitmapSource,
  ): Promise<DetectedCode[]> {
    const { detector, missing } = await getDetector();
    const codes = uniqueCodes(await detector.detect(source));
    const time = now();
    if (codes.length > 0) {
      lastFound = time;
      return codes;
    }
    if (
      missing.length === 0 ||
      failures >= FALLBACK_MAX_FAILURES ||
      time - lastFound < FALLBACK_IDLE_MS ||
      time - lastFallback < FALLBACK_EVERY_MS
    ) {
      return codes;
    }
    lastFallback = time;
    if (!fallback) {
      if (!loading) {
        loading = true;
        getFallbackDetector(missing).then(
          (loaded) => {
            fallback = loaded;
          },
          (error) => {
            loading = false;
            failures++;
            console.error("WebAssembly barcode reader failed to load:", error);
          },
        );
      }
      return codes;
    }
    try {
      return uniqueCodes(await fallback.detect(source));
    } catch (error) {
      failures++;
      console.error("WebAssembly barcode reader failed:", error);
      return codes;
    }
  };
}

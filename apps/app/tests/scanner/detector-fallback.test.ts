// components/scanner/detector.ts with fake readers: the browser's own
// BarcodeDetector (a global) and the WebAssembly ponyfill (mocked). Where the
// browser's reader is used, the WebAssembly one reads the formats it lacks:
// in every uploaded image, and in camera frames once the browser's reader has
// found nothing for a while, throttled. It isn't loaded until then.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Found = { rawValue: string; format: string; cornerPoints: [] };

const fake = vi.hoisted(() => ({
  wasm: [] as { formats: string[]; detect: ReturnType<typeof vi.fn> }[],
  wasmFound: [] as Found[],
  wasmError: null as Error | null,
}));

vi.mock("barcode-detector/ponyfill", () => ({
  BarcodeDetector: class {
    formats: string[];
    detect = vi.fn(async () => {
      if (fake.wasmError) throw fake.wasmError;
      return fake.wasmFound;
    });
    constructor({ formats }: { formats: string[] }) {
      this.formats = formats;
      fake.wasm.push(this);
    }
  },
}));

/** What Chrome's own BarcodeDetector listed on macOS (Chrome 157, headless). */
const CHROME_NATIVE = [
  "aztec",
  "code_128",
  "code_39",
  "code_93",
  "data_matrix",
  "ean_13",
  "ean_8",
  "itf",
  "pdf417",
  "qr_code",
  "upc_e",
];
/** Chrome on Android lists Codabar and UPC-A too. */
const ANDROID_NATIVE = [...CHROME_NATIVE, "codabar", "upc_a"];

const code = (format: string, rawValue: string): Found => ({
  format,
  rawValue,
  cornerPoints: [],
});

let nativeFound: Found[] = [];
let nativeFormats: string[] | null = null;

function installNative(supported: string[]) {
  (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
    static getSupportedFormats = async () => supported;
    constructor({ formats }: { formats: string[] }) {
      nativeFormats = formats;
    }
    detect = async () => nativeFound;
  };
}

async function load() {
  vi.resetModules();
  return import("@/components/scanner/detector");
}

beforeEach(() => {
  fake.wasm.length = 0;
  fake.wasmFound = [];
  fake.wasmError = null;
  nativeFound = [];
  nativeFormats = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  (globalThis as { createImageBitmap?: unknown }).createImageBitmap = vi.fn(
    async () => ({ close: vi.fn() }),
  );
});

afterEach(() => {
  delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
  delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
  vi.restoreAllMocks();
});

describe("choosing the reader", () => {
  it("uses the browser's reader for what it lists and leaves the rest to WebAssembly, unloaded", async () => {
    installNative(CHROME_NATIVE);
    const { getDetector, SCAN_FORMATS } = await load();
    const readers = await getDetector();
    expect(readers.engine).toBe("native");
    expect(nativeFormats).toEqual(
      SCAN_FORMATS.filter((format) => CHROME_NATIVE.includes(format)),
    );
    // UPC-A comes back from it as EAN-13; Codabar it doesn't read at all.
    expect(readers.missing).toEqual([
      "micro_qr_code",
      "rm_qr_code",
      "maxi_code",
      "codabar",
      "databar_omni",
      "databar_limited",
      "databar_expanded",
      "databar_stacked",
      "databar_expanded_stacked",
    ]);
    expect(fake.wasm).toHaveLength(0);
  });

  it("leaves only the formats no browser reader has where it lists them all", async () => {
    const { missingFormats } = await load();
    expect(missingFormats(ANDROID_NATIVE)).toEqual([
      "micro_qr_code",
      "rm_qr_code",
      "maxi_code",
      "databar_omni",
      "databar_limited",
      "databar_expanded",
      "databar_stacked",
      "databar_expanded_stacked",
    ]);
    expect(missingFormats(["qr_code", "upc_a"])).toContain("ean_13");
    expect(missingFormats(["qr_code"])).toContain("upc_a");
  });

  it("uses WebAssembly for everything without a browser reader, or one without QR codes", async () => {
    for (const install of [() => {}, () => installNative(["ean_13"])]) {
      fake.wasm.length = 0;
      install();
      const { getDetector, SCAN_FORMATS } = await load();
      const readers = await getDetector();
      expect(readers.engine).toBe("wasm");
      expect(readers.missing).toEqual([]);
      expect(fake.wasm.map((reader) => reader.formats)).toEqual([
        [...SCAN_FORMATS],
      ]);
    }
  });
});

describe("uploaded images", () => {
  it("reads with both, the WebAssembly reader for the missing formats only, without repeats", async () => {
    installNative(CHROME_NATIVE);
    nativeFound = [code("code_128", "1Z999"), code("code_128", "1Z999")];
    fake.wasmFound = [code("maxi_code", "[)>\u001e01")];
    const { detectCodesInImage, getDetector } = await load();
    const codes = await detectCodesInImage(new Blob());
    expect(codes.map((found) => [found.format, found.rawValue])).toEqual([
      ["code_128", "1Z999"],
      ["maxi_code", "[)>\u001e01"],
    ]);
    expect(fake.wasm).toHaveLength(1);
    expect(fake.wasm[0]?.formats).toEqual((await getDetector()).missing);
  });

  it("reads once with WebAssembly where there's no browser reader", async () => {
    fake.wasmFound = [code("databar_omni", "0109521234543213")];
    const { detectCodesInImage } = await load();
    const codes = await detectCodesInImage(new Blob());
    expect(codes).toHaveLength(1);
    expect(fake.wasm).toHaveLength(1);
    expect(fake.wasm[0]?.detect).toHaveBeenCalledTimes(1);
  });

  it("keeps the browser's results when WebAssembly fails, and fails without any", async () => {
    installNative(CHROME_NATIVE);
    fake.wasmError = new Error("offline");
    nativeFound = [code("qr_code", "https://qrdx.dev")];
    const { detectCodesInImage } = await load();
    expect(await detectCodesInImage(new Blob())).toHaveLength(1);
    nativeFound = [];
    await expect(detectCodesInImage(new Blob())).rejects.toThrow("offline");
  });
});

describe("camera frames", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("tries WebAssembly only after the browser's reader finds nothing for a while, then throttled", async () => {
    installNative(CHROME_NATIVE);
    const { createFrameReader, FALLBACK_EVERY_MS, FALLBACK_IDLE_MS } =
      await load();
    let time = 0;
    const readFrame = createFrameReader(() => time);
    const frame = {} as ImageBitmapSource;
    const wasmReads = () => fake.wasm[0]?.detect.mock.calls.length ?? 0;

    // Nothing in view: no WebAssembly before FALLBACK_IDLE_MS.
    for (time = 0; time < FALLBACK_IDLE_MS; time += 120) {
      expect(await readFrame(frame)).toEqual([]);
    }
    expect(fake.wasm).toHaveLength(0);

    // Then it loads without holding up the frame...
    time = FALLBACK_IDLE_MS;
    expect(await readFrame(frame)).toEqual([]);
    await flush();
    expect(fake.wasm).toHaveLength(1);
    expect(wasmReads()).toBe(0);

    // ...and reads a frame at most every FALLBACK_EVERY_MS.
    fake.wasmFound = [code("databar_omni", "0109521234543213")];
    time += FALLBACK_EVERY_MS - 1;
    expect(await readFrame(frame)).toEqual([]);
    time += 1;
    expect(await readFrame(frame)).toEqual([
      {
        format: "databar_omni",
        rawValue: "0109521234543213",
        cornerPoints: [],
      },
    ]);
    time += 120;
    await readFrame(frame);
    expect(wasmReads()).toBe(1);
    time += FALLBACK_EVERY_MS;
    await readFrame(frame);
    expect(wasmReads()).toBe(2);

    // A code the browser reads starts the wait again.
    nativeFound = [code("qr_code", "https://qrdx.dev")];
    time += FALLBACK_EVERY_MS;
    expect(await readFrame(frame)).toHaveLength(1);
    nativeFound = [];
    time += FALLBACK_IDLE_MS - 1;
    await readFrame(frame);
    expect(wasmReads()).toBe(2);
    time += 1;
    await readFrame(frame);
    expect(wasmReads()).toBe(3);
  });

  it("never adds a second reader on the WebAssembly engine", async () => {
    const { createFrameReader } = await load();
    let time = 0;
    const readFrame = createFrameReader(() => time);
    for (; time < 5000; time += 120) await readFrame({} as ImageBitmapSource);
    await flush();
    expect(fake.wasm).toHaveLength(1);
  });

  it("stops trying WebAssembly after three failed reads", async () => {
    installNative(CHROME_NATIVE);
    fake.wasmError = new Error("offline");
    const { createFrameReader } = await load();
    let time = 0;
    const readFrame = createFrameReader(() => time);
    for (; time < 10_000; time += 100) {
      await readFrame({} as ImageBitmapSource);
      await flush();
    }
    expect(fake.wasm[0]?.detect).toHaveBeenCalledTimes(3);
  });
});

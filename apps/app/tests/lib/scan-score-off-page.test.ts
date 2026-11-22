// getScanScoreOffPage (lib/scan-score/off-page.ts): the page draws the scan
// frames and a Web Worker decodes them; without a working worker it scores
// on the page, as getScanScore always did. The worker here is a stand-in
// that records what it's sent; qrdx's drawing and scoring are fakes.
import type { QRProps, ScanFrames, ScanScoreResult } from "qrdx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const drawScanFrames = vi.fn();
const getScanScore = vi.fn();
vi.mock("qrdx", () => ({ drawScanFrames, getScanScore }));

const PROPS: QRProps = { value: "https://qrdx.dev/q/Ab3dE9x" };
const PAGE: ScanScoreResult = { score: 70, grade: "ok", checks: [] };
const OFF_PAGE: ScanScoreResult = { score: 95, grade: "great", checks: [] };

const frameOf = (codeWidth: number) => ({
  codeWidth,
  width: 2,
  height: 2,
  data: new Uint8ClampedArray(16),
});
const FRAMES: ScanFrames = {
  sizes: [96],
  frames: [frameOf(96 * 0.9), frameOf(96)],
  imageTones: {},
};

interface Posted {
  message: { type: string; id: number; props?: QRProps; frames?: ScanFrames };
  transfer: Transferable[];
}

class FakeWorker extends EventTarget {
  static started: FakeWorker[] = [];
  static failPost = false;
  posted: Posted[] = [];
  terminated = false;
  readonly url: URL;
  readonly options: WorkerOptions;
  constructor(url: URL, options: WorkerOptions) {
    super();
    this.url = url;
    this.options = options;
    FakeWorker.started.push(this);
  }
  postMessage(message: Posted["message"], transfer: Transferable[] = []) {
    if (FakeWorker.failPost) {
      throw new DOMException("could not be cloned", "DataCloneError");
    }
    this.posted.push({ message, transfer });
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

async function load() {
  vi.resetModules();
  return await import("@/lib/scan-score/off-page");
}

/** Lets the call draw its frames and post them. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  FakeWorker.started = [];
  FakeWorker.failPost = false;
  drawScanFrames.mockReset().mockResolvedValue(FRAMES);
  getScanScore.mockReset().mockResolvedValue(PAGE);
});

afterEach(() => vi.unstubAllGlobals());

describe("getScanScoreOffPage", () => {
  it("scores on the page where there is no Worker", async () => {
    vi.stubGlobal("Worker", undefined);
    const { getScanScoreOffPage } = await load();
    const options = { sizes: [96] };
    await expect(getScanScoreOffPage(PROPS, options)).resolves.toBe(PAGE);
    expect(getScanScore).toHaveBeenCalledWith(PROPS, options);
    expect(drawScanFrames).not.toHaveBeenCalled();
  });

  it("posts the frames drawn on the page, hands over their pixels, and returns the worker's score", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { getScanScoreOffPage } = await load();
    const scoring = getScanScoreOffPage(PROPS);
    await settle();
    const [worker] = FakeWorker.started;
    expect(worker?.url.pathname).toMatch(/lib\/scan-score\/worker\.ts$/);
    expect(worker?.options.type).toBe("module");
    const [posted] = worker?.posted ?? [];
    expect(posted?.message).toMatchObject({
      type: "score",
      props: PROPS,
      frames: FRAMES,
    });
    expect(posted?.transfer).toEqual(FRAMES.frames.map((f) => f.data.buffer));
    worker?.reply({ id: posted?.message.id, result: OFF_PAGE });
    await expect(scoring).resolves.toBe(OFF_PAGE);
    expect(getScanScore).not.toHaveBeenCalled();
  });

  it("starts one worker and keeps each answer with its own request", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { getScanScoreOffPage } = await load();
    const first = getScanScoreOffPage(PROPS);
    const second = getScanScoreOffPage({ ...PROPS, fgColor: "#123456" });
    await settle();
    expect(FakeWorker.started).toHaveLength(1);
    const [worker] = FakeWorker.started;
    const [a, b] = worker?.posted.map((p) => p.message.id) ?? [];
    worker?.reply({ id: b, result: OFF_PAGE });
    worker?.reply({ id: a, result: PAGE });
    await expect(first).resolves.toBe(PAGE);
    await expect(second).resolves.toBe(OFF_PAGE);
  });

  it("rejects with the error the worker sends back", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { getScanScoreOffPage } = await load();
    const scoring = getScanScoreOffPage(PROPS);
    await settle();
    const [worker] = FakeWorker.started;
    worker?.reply({
      id: worker.posted[0]?.message.id,
      error: { name: "RangeError", message: "Data too long" },
    });
    await expect(scoring).rejects.toMatchObject({
      name: "RangeError",
      message: "Data too long",
    });
  });

  it("stops the worker's job when the signal aborts", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { getScanScoreOffPage } = await load();
    const controller = new AbortController();
    const scoring = getScanScoreOffPage(PROPS, { signal: controller.signal });
    await settle();
    controller.abort();
    await expect(scoring).rejects.toThrow(/abort/i);
    const [worker] = FakeWorker.started;
    const [score, cancel] = worker?.posted.map((p) => p.message) ?? [];
    expect(cancel).toEqual({ type: "cancel", id: score?.id });
    // A late answer for it is dropped
    worker?.reply({ id: score?.id, result: OFF_PAGE });
  });

  it("scores on the page from then on when the worker fails", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { getScanScoreOffPage } = await load();
    const pending = getScanScoreOffPage(PROPS);
    await settle();
    const [worker] = FakeWorker.started;
    worker?.dispatchEvent(new Event("error", { cancelable: true }));
    await expect(pending).resolves.toBe(PAGE);
    expect(worker?.terminated).toBe(true);
    await expect(getScanScoreOffPage(PROPS)).resolves.toBe(PAGE);
    expect(FakeWorker.started).toHaveLength(1);
    expect(getScanScore).toHaveBeenCalledTimes(2);
  });

  it("scores on the page when the props can't be posted", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.failPost = true;
    const { getScanScoreOffPage } = await load();
    await expect(getScanScoreOffPage(PROPS)).resolves.toBe(PAGE);
    expect(getScanScore).toHaveBeenCalledWith(PROPS, {});
  });
});

// getScanScore with its decoding in a Web Worker (./worker.ts): the page
// draws the frames, the worker blurs and decodes them, and the result is
// getScanScore's, check for check. Where a worker can't run (no Worker, it
// fails to load, or the props can't be posted), it scores on the page as
// before.
import {
  drawScanFrames,
  getScanScore,
  type QRProps,
  type ScanScoreOptions,
  type ScanScoreResult,
} from "qrdx";
import type { ScanRequest, ScanResponse } from "./worker";

interface Job {
  props: QRProps;
  options: ScanScoreOptions;
  resolve: (result: ScanScoreResult) => void;
  reject: (error: unknown) => void;
}

/** Undefined until first used; null once it can't be used. */
let worker: Worker | null | undefined;
let nextId = 1;
const jobs = new Map<number, Job>();

function errorOf({ name, message }: { name: string; message: string }) {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** Scores the worker's jobs on the page from now on, these ones included. */
function giveUp(failed: Worker) {
  if (worker === failed) worker = null;
  failed.terminate();
  for (const [id, job] of jobs) {
    jobs.delete(id);
    getScanScore(job.props, job.options).then(job.resolve, job.reject);
  }
}

function startWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === "undefined") {
    worker = null;
    return worker;
  }
  try {
    const started = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
      name: "qrdx-scan-score",
    });
    started.addEventListener("message", (event: MessageEvent<ScanResponse>) => {
      const response = event.data;
      const job = jobs.get(response.id);
      if (!job) return;
      jobs.delete(response.id);
      if ("result" in response) job.resolve(response.result);
      else job.reject(errorOf(response.error));
    });
    // A worker that didn't load (or broke) is replaced by the page
    started.addEventListener("error", (event) => {
      event.preventDefault();
      giveUp(started);
    });
    started.addEventListener("messageerror", () => giveUp(started));
    worker = started;
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * `getScanScore(props, options)`, decoded off the page where the browser
 * can. Rejects when `options.signal` aborts, and stops the worker's job.
 */
export async function getScanScoreOffPage(
  props: QRProps,
  options: ScanScoreOptions = {},
): Promise<ScanScoreResult> {
  const target = startWorker();
  if (!target) return await getScanScore(props, options);
  const frames = await drawScanFrames(props, options);
  const { signal } = options;
  signal?.throwIfAborted();
  return await new Promise<ScanScoreResult>((resolve, reject) => {
    const id = nextId++;
    const onAbort = () => {
      if (!jobs.delete(id)) return;
      target.postMessage({ type: "cancel", id } satisfies ScanRequest);
      reject(signal?.reason);
    };
    const settle =
      <T>(done: (value: T) => void) =>
      (value: T) => {
        signal?.removeEventListener("abort", onAbort);
        done(value);
      };
    jobs.set(id, {
      props,
      options,
      resolve: settle(resolve),
      reject: settle(reject),
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      target.postMessage(
        { type: "score", id, props, frames } satisfies ScanRequest,
        frames.frames.map((frame) => frame.data.buffer),
      );
    } catch {
      // Props a worker can't receive: score this one on the page
      jobs.delete(id);
      signal?.removeEventListener("abort", onAbort);
      getScanScore(props, options).then(resolve, reject);
    }
  });
}

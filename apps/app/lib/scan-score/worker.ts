// The scan score's decoding, off the page. The page draws the frames
// (qrdx's drawScanFrames, quick native canvas work) and posts them here
// (./off-page.ts); this runs the camera model and jsQR on them, the part
// that used to keep the page from responding while a score ran.
import {
  getScanScoreFromFrames,
  type QRProps,
  type ScanFrames,
  type ScanScoreResult,
} from "qrdx/core";

export type ScanRequest =
  | { type: "score"; id: number; props: QRProps; frames: ScanFrames }
  | { type: "cancel"; id: number };

export type ScanResponse =
  | { id: number; result: ScanScoreResult }
  | { id: number; error: { name: string; message: string } };

const running = new Map<number, AbortController>();

const reply = (response: ScanResponse) => postMessage(response);

addEventListener("message", (event: MessageEvent<ScanRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    running.get(request.id)?.abort();
    return;
  }
  const { id, props, frames } = request;
  const controller = new AbortController();
  running.set(id, controller);
  getScanScoreFromFrames(props, frames, { signal: controller.signal })
    .then((result) => reply({ id, result }))
    .catch((error: unknown) =>
      reply({
        id,
        error: {
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
        },
      }),
    )
    .finally(() => running.delete(id));
});

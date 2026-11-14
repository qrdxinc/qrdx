// Short clips: the DevTools screencast of the viewport while a job's
// `record` step runs, turned into an mp4 and a webm with ffmpeg (no audio,
// meant to loop), plus the first frame for the poster.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "./browser";

export interface Recording {
  /** Stops the screencast and returns the frames in order. */
  stop(): Promise<Frame[]>;
}

export interface Frame {
  path: string;
  /** Seconds since the first frame. */
  at: number;
}

export function hasFfmpeg(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

/** Starts recording the viewport into `dir` (one JPEG per frame). */
export async function startRecording(
  browser: Browser,
  dir: string,
  maxWidth = 1920,
): Promise<Recording> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames: { data: string; timestamp: number }[] = [];
  const listener = (message: {
    method?: string;
    params?: {
      data: string;
      sessionId: number;
      metadata: { timestamp: number };
    };
  }) => {
    if (message.method !== "Page.screencastFrame" || !message.params) return;
    frames.push({
      data: message.params.data,
      timestamp: message.params.metadata.timestamp,
    });
    browser.page.cdp
      .send("Page.screencastFrameAck", { sessionId: message.params.sessionId })
      .catch(() => undefined);
  };
  browser.page.cdp.on(listener);
  await browser.page.cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 88,
    maxWidth,
    maxHeight: Math.round(maxWidth * 1.25),
    everyNthFrame: 1,
  });
  return {
    async stop() {
      await browser.page.cdp.send("Page.stopScreencast");
      browser.page.cdp.off(listener);
      const first = frames[0]?.timestamp ?? 0;
      return frames.map((frame, index) => {
        const path = join(dir, `frame-${String(index).padStart(5, "0")}.jpg`);
        writeFileSync(path, Buffer.from(frame.data, "base64"));
        return { path, at: frame.timestamp - first };
      });
    },
  };
}

export interface Encoded {
  seconds: number;
  width: number;
  height: number;
}

/**
 * Encodes the frames at their real timing into `<outBase>.mp4` (H.264) and
 * `<outBase>.webm` (VP9). Even dimensions are required by yuv420p, so odd
 * frames lose one pixel line.
 */
export function encode(
  frames: Frame[],
  outBase: string,
  holdLast = 1.2,
): Encoded {
  if (frames.length < 2) throw new Error("encode: not enough frames");
  const list = join(outBase + ".frames.txt");
  const lines: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const duration =
      i < frames.length - 1 ? frames[i + 1].at - frames[i].at : holdLast;
    lines.push(
      `file '${frames[i].path}'`,
      `duration ${Math.max(0.016, duration).toFixed(4)}`,
    );
  }
  // The concat demuxer wants the last file listed again without a duration.
  lines.push(`file '${frames[frames.length - 1].path}'`);
  writeFileSync(list, `${lines.join("\n")}\n`);

  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      frames[0].path,
    ],
    {
      encoding: "utf8",
    },
  );
  const [w, h] = probe.stdout.trim().split(",").map(Number);
  const width = w - (w % 2);
  const height = h - (h % 2);
  const common = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-vf",
    `fps=30,crop=${width}:${height}:0:0,format=yuv420p`,
    "-an",
  ];
  const mp4 = spawnSync(
    "ffmpeg",
    [
      ...common,
      "-c:v",
      "libx264",
      "-crf",
      "21",
      "-preset",
      "slow",
      "-movflags",
      "+faststart",
      `${outBase}.mp4`,
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
    },
  );
  if (mp4.status !== 0)
    throw new Error(`ffmpeg mp4 failed: ${mp4.stderr?.slice(-400)}`);
  const webm = spawnSync(
    "ffmpeg",
    [
      ...common,
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      "34",
      "-row-mt",
      "1",
      "-deadline",
      "good",
      "-cpu-used",
      "2",
      `${outBase}.webm`,
    ],
    { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" },
  );
  if (webm.status !== 0)
    throw new Error(`ffmpeg webm failed: ${webm.stderr?.slice(-400)}`);
  rmSync(list, { force: true });
  const seconds = frames[frames.length - 1].at + holdLast;
  return { seconds: Math.round(seconds * 10) / 10, width, height };
}

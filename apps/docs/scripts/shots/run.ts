#!/usr/bin/env node
// Captures the docs' screenshots and clips from the real app and writes
// lib/shots-manifest.json. How to run it is in apps/docs/README.md
// ("Screenshots and clips"); in short:
//
//   bun run --filter docs shots:db up        # throwaway Postgres + Neon-HTTP proxy + seed
//   # start the app on :3103 against it (README), its log in .shots/app.log
//   bun run --filter docs shots              # every job
//   bun run --filter docs shots -- --only codes-list,new-code   # some jobs
//   bun run --filter docs shots -- --list    # the jobs and the pages they serve
//
// Env: SHOTS_APP_URL (http://localhost:3103), SHOTS_DEV_LOG (.shots/app.log,
// where the sign-in code is read from), SHOTS_WORKSPACE (harbor-lane-coffee),
// SHOTS_EMAIL (noor@harborlane.example), SHOTS_RAW_DIR (keeps the raw PNGs).
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findChrome, serverIsUp } from "../../../app/e2e/cdp.mjs";
import { Browser } from "./browser";
import { encode, hasFfmpeg, startRecording } from "./clips";
import { JOBS } from "./jobs";
import {
  focusLook,
  posterLook,
  type Styled,
  scaled,
  windowLook,
} from "./style";
import type {
  Box,
  ClipEntry,
  Job,
  ManifestEntry,
  ShotEntry,
  ShotJob,
  ShotsManifest,
  Theme,
} from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const docsApp = join(here, "..", "..");
const PUBLIC_DIR = join(docsApp, "public", "docs-static", "shots");
const MEDIA_DIR = join(docsApp, "media", "videos", "docs");
const MANIFEST = join(docsApp, "lib", "shots-manifest.json");
/** The public path of the stills (proxied by the main app as /docs-static/*). */
const PUBLIC_PATH = "/docs-static/shots";
/** Media keys of the clips (lib/media-manifest.json after `shots:upload`). */
const MEDIA_PATH = "/videos/docs";

const APP_URL = (process.env.SHOTS_APP_URL ?? "http://localhost:3103").replace(
  /\/$/,
  "",
);
const DEV_LOG = process.env.SHOTS_DEV_LOG ?? join(docsApp, ".shots", "app.log");
const WORKSPACE = process.env.SHOTS_WORKSPACE ?? "harbor-lane-coffee";
const EMAIL = process.env.SHOTS_EMAIL ?? "noor@harborlane.example";
const RAW_DIR = process.env.SHOTS_RAW_DIR;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  if (index !== -1) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
};

const THEMES: Theme[] = ["light", "dark"];
/** A job that takes longer than this is stuck. */
const JOB_TIMEOUT = 420_000;

function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  what: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${what} took more than ${ms / 1000} s`)),
        ms,
      ).unref(),
    ),
  ]);
}

function readManifest(): ShotsManifest {
  return existsSync(MANIFEST)
    ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as ShotsManifest)
    : {};
}

function writeManifest(manifest: ShotsManifest) {
  const sorted = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
}

function listJobs(jobs: Job[]) {
  for (const job of jobs) {
    const note = job.skip ? `  (skipped: ${job.skip})` : "";
    console.log(
      `${job.kind.padEnd(4)} ${job.id.padEnd(34)} ${job.pages.join(", ")}${note}`,
    );
  }
}

/** The capture box (capture pixels) of a shot job, after its steps ran. */
async function regionOf(
  browser: Browser,
  job: ShotJob,
): Promise<Box | undefined> {
  const capture = job.capture ?? { kind: "viewport" };
  if (capture.kind === "viewport") return undefined;
  if (capture.kind === "box") return scaled(capture.box);
  const box = await browser.driver.box(capture.find, capture.name);
  const margin = capture.margin ?? 24;
  const below = capture.below ?? 0;
  return scaled({
    x: box.x - margin,
    y: box.y - margin,
    width: box.width + margin * 2,
    height: box.height + margin * 2 + below,
  });
}

async function runShot(browser: Browser, job: ShotJob): Promise<ShotEntry> {
  const styled: Partial<Record<Theme, Styled>> = {};
  const region = await regionOf(browser, job);
  const focus =
    job.look === "focus" && job.focus
      ? scaled(await browser.driver.box(job.focus.find, job.focus.name))
      : undefined;
  if (job.look === "focus" && !focus)
    throw new Error(`${job.id}: a focus job needs a focus element`);

  for (const theme of THEMES) {
    await browser.setTheme(theme);
    await browser.settle(theme === "dark" ? 500 : 150);
    const png = await browser.screenshot();
    if (RAW_DIR) {
      mkdirSync(RAW_DIR, { recursive: true });
      writeFileSync(join(RAW_DIR, `${job.id}.${theme}.png`), png);
    }
    styled[theme] =
      job.look === "focus" && focus
        ? await focusLook(png, theme, focus, { margin: job.focus?.margin })
        : await windowLook(png, theme, region);
  }
  await browser.setTheme("light");

  const light = styled.light as Styled;
  const dark = styled.dark as Styled;
  if (light.width !== dark.width || light.height !== dark.height) {
    throw new Error(
      `${job.id}: light and dark sizes differ (${light.width}×${light.height} vs ${dark.width}×${dark.height})`,
    );
  }
  mkdirSync(PUBLIC_DIR, { recursive: true });
  writeFileSync(join(PUBLIC_DIR, `${job.id}.light.webp`), light.webp);
  writeFileSync(join(PUBLIC_DIR, `${job.id}.dark.webp`), dark.webp);
  return {
    kind: "shot",
    look: job.look,
    light: `${PUBLIC_PATH}/${job.id}.light.webp`,
    dark: `${PUBLIC_PATH}/${job.id}.dark.webp`,
    width: light.width,
    height: light.height,
    alt: job.alt,
    title: job.title,
    pages: job.pages,
    job: job.id,
  };
}

async function runClip(
  browser: Browser,
  job: Extract<Job, { kind: "clip" }>,
  scratch: string,
): Promise<ClipEntry> {
  mkdirSync(MEDIA_DIR, { recursive: true });
  let result: Omit<ClipEntry, "poster"> & {
    poster: Partial<ClipEntry["poster"]>;
  } = {
    kind: "clip",
    poster: {},
    sources: { webm: "", mp4: "" },
    width: 0,
    height: 0,
    seconds: 0,
    alt: job.alt,
    title: job.title,
    pages: job.pages,
    job: job.id,
  };
  for (const theme of THEMES) {
    await browser.setTheme(theme);
    await browser.setMotion(true);
    await browser.driver.open(job.route);
    await job.steps?.(browser.driver);
    await browser.settle(400);
    const recording = await startRecording(
      browser,
      join(scratch, `${job.id}-${theme}`),
    );
    await browser.driver.pause(600);
    await job.record(browser.driver);
    await browser.driver.pause((job.tail ?? 1.5) * 1000);
    const frames = await recording.stop();
    await browser.setMotion(false);
    const base = join(MEDIA_DIR, `${job.id}.${theme}`);
    const encoded = encode(frames, base);
    const poster = await posterLook(readFileSync(frames[0].path), theme);
    mkdirSync(PUBLIC_DIR, { recursive: true });
    writeFileSync(
      join(PUBLIC_DIR, `${job.id}.poster.${theme}.webp`),
      poster.webp,
    );
    result = {
      ...result,
      poster: {
        ...result.poster,
        [theme]: `${PUBLIC_PATH}/${job.id}.poster.${theme}.webp`,
      },
      sources: {
        webm: `${MEDIA_PATH}/${job.id}.{theme}.webm`,
        mp4: `${MEDIA_PATH}/${job.id}.{theme}.mp4`,
      },
      width: encoded.width,
      height: encoded.height,
      seconds: Math.max(result.seconds, encoded.seconds),
    };
    rmSync(join(scratch, `${job.id}-${theme}`), {
      recursive: true,
      force: true,
    });
  }
  await browser.setTheme("light");
  return result as ClipEntry;
}

async function main() {
  const only = option("only")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  let jobs = only ? JOBS.filter((job) => only.includes(job.id)) : [...JOBS];
  if (only) {
    const missing = only.filter((id) => !JOBS.some((job) => job.id === id));
    if (missing.length)
      throw new Error(`Unknown job ids: ${missing.join(", ")}`);
  }
  if (flag("stills")) jobs = jobs.filter((job) => job.kind === "shot");
  if (flag("clips")) jobs = jobs.filter((job) => job.kind === "clip");
  if (flag("list")) {
    listJobs(jobs);
    return;
  }
  const duplicate = JOBS.map((job) => job.id).find(
    (id, index, all) => all.indexOf(id) !== index,
  );
  if (duplicate) throw new Error(`Duplicate job id: ${duplicate}`);

  if (!findChrome()) throw new Error("Chrome not found (set CHROME_PATH)");
  if (!(await serverIsUp(APP_URL)))
    throw new Error(
      `The app isn't running at ${APP_URL} (README: Screenshots and clips)`,
    );
  const needsSignIn = jobs.some((job) => job.signedIn !== false && !job.skip);
  if (needsSignIn && !existsSync(DEV_LOG))
    throw new Error(
      `No dev server log at ${DEV_LOG}: set SHOTS_DEV_LOG to where the app's output goes`,
    );
  if (jobs.some((job) => job.kind === "clip" && !job.skip) && !hasFfmpeg()) {
    throw new Error(
      "ffmpeg is not installed (brew install ffmpeg); run with --stills for the pictures only",
    );
  }

  const scratch = join(docsApp, ".shots", "scratch");
  mkdirSync(scratch, { recursive: true });
  const manifest = readManifest();
  const results: {
    job: Job;
    ok: boolean;
    note?: string;
    entry?: ManifestEntry;
  }[] = [];

  let browser = await Browser.open({
    baseUrl: APP_URL,
    workspace: WORKSPACE,
  });
  let signedIn = false;
  let viewport = { width: 1440, height: 900, mobile: false };
  try {
    for (const job of jobs) {
      if (job.skip) {
        results.push({ job, ok: true, note: `skipped: ${job.skip}` });
        continue;
      }
      const started = Date.now();
      try {
        if (job.signedIn !== false && !signedIn) {
          await browser.signIn(EMAIL, DEV_LOG);
          signedIn = true;
        }
        const wanted = {
          width: job.viewport?.width ?? 1440,
          height: job.viewport?.height ?? 900,
          mobile: job.viewport?.mobile ?? false,
        };
        if (
          wanted.width !== viewport.width ||
          wanted.height !== viewport.height ||
          wanted.mobile !== viewport.mobile
        ) {
          await browser.setViewport(
            wanted.width,
            wanted.height,
            2,
            wanted.mobile,
          );
          viewport = wanted;
        }
        const capture = async (): Promise<ManifestEntry> => {
          if (job.kind === "shot") {
            await browser.setMotion(false);
            await browser.driver.open(job.route);
            await job.steps?.(browser.driver);
            await browser.driver.waitQuiet();
            await browser.settle(300);
            return runShot(browser, job);
          }
          return runClip(browser, job, scratch);
        };
        const entry = await withDeadline(
          capture(),
          job.kind === "clip" ? JOB_TIMEOUT * 2 : JOB_TIMEOUT,
          job.id,
        );
        manifest[job.id] = entry;
        writeManifest(manifest);
        results.push({ job, ok: true, entry });
        const size =
          entry.kind === "shot"
            ? `${entry.width}×${entry.height}, ${Math.round(statSync(join(PUBLIC_DIR, `${job.id}.light.webp`)).size / 1024)} KB`
            : `${entry.width}×${entry.height}, ${entry.seconds}s`;
        console.log(
          `  ✓ ${job.id} (${size}, ${((Date.now() - started) / 1000).toFixed(1)}s)`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message.split("\n")[0] : String(error);
        results.push({ job, ok: false, note: message });
        console.log(`  ✗ ${job.id}: ${message}`);
        // Whatever the failed job left behind (a dialog, a page that won't
        // navigate, a stuck DevTools call): a fresh browser for the next job.
        await browser.close().catch(() => undefined);
        browser = await Browser.open({
          baseUrl: APP_URL,
          workspace: WORKSPACE,
        });
        signedIn = false;
        viewport = { width: 1440, height: 900, mobile: false };
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  const failed = results.filter((result) => !result.ok);
  const skipped = results.filter((result) =>
    result.note?.startsWith("skipped"),
  );
  console.log(
    `\n${results.length - failed.length - skipped.length} captured, ${skipped.length} skipped, ${failed.length} failed. Manifest: ${MANIFEST}`,
  );
  for (const result of skipped)
    console.log(`  - ${result.job.id}: ${result.note}`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

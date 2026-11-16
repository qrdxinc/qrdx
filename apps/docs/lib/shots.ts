// The docs' pictures and clips: lib/shots-manifest.json, written by
// `bun run --filter docs shots` (scripts/shots), looked up by id from
// <Shot id="…" /> and <Clip id="…" /> (components/mdx/shot.tsx) and from the
// Markdown copies of the pages (lib/agents/llm-markdown.ts). Pure: the tests
// pass their own manifests.
import mediaManifest from "./media-manifest.json";
import manifest from "./shots-manifest.json";

export type Theme = "light" | "dark";

export interface ShotEntry {
  kind: "shot";
  look: "window" | "focus";
  /** Public paths (/docs-static/shots/…), served by the docs site and proxied by the main app. */
  light: string;
  dark: string;
  width: number;
  height: number;
  alt: string;
  title: string;
  pages: string[];
  job: string;
}

export interface ClipEntry {
  kind: "clip";
  poster: { light: string; dark: string };
  /** Media keys with `{theme}` in them, resolved by clipSources(). */
  sources: { webm: string; mp4: string };
  width: number;
  height: number;
  seconds: number;
  alt: string;
  title: string;
  pages: string[];
  job: string;
}

export type ShotsManifest = Record<string, ShotEntry | ClipEntry>;

const SHOTS = manifest as ShotsManifest;

const HOW_TO_FIX =
  "Run `bun run --filter docs shots -- --list` for the ids, or add a job in apps/docs/scripts/shots/jobs.ts and run `bun run --filter docs shots`.";

/** A manifest entry by id; throws (and so fails the build) for an id nobody captured. */
export function getShot(id: string, from: ShotsManifest = SHOTS): ShotEntry {
  const entry = from[id];
  if (!entry) {
    throw new Error(
      `<Shot id="${id}" />: no picture with this id in lib/shots-manifest.json. ${HOW_TO_FIX}`,
    );
  }
  if (entry.kind !== "shot") {
    throw new Error(
      `<Shot id="${id}" />: "${id}" is a clip, not a picture. Use <Clip id="${id}" />.`,
    );
  }
  return entry;
}

export function getClip(id: string, from: ShotsManifest = SHOTS): ClipEntry {
  const entry = from[id];
  if (!entry) {
    throw new Error(
      `<Clip id="${id}" />: no clip with this id in lib/shots-manifest.json. ${HOW_TO_FIX}`,
    );
  }
  if (entry.kind !== "clip") {
    throw new Error(
      `<Clip id="${id}" />: "${id}" is a picture, not a clip. Use <Shot id="${id}" />.`,
    );
  }
  return entry;
}

export function listShots(from: ShotsManifest = SHOTS): string[] {
  return Object.keys(from);
}

/**
 * Where a clip's video files are: the R2 copy when `scripts/shots/upload-media.mjs`
 * has put them in lib/media-manifest.json, else the local path (a 404 in the
 * network panel rather than a silently wrong URL).
 */
export function clipSources(
  entry: ClipEntry,
  theme: Theme,
  media: { origin: string; files: Record<string, string> } = mediaManifest,
): { webm: string; mp4: string } {
  const resolve = (key: string) => {
    const path = key.replaceAll("{theme}", theme);
    const uploaded = media.files[path];
    return uploaded ? `${media.origin.replace(/\/+$/, "")}/${uploaded}` : path;
  };
  return { webm: resolve(entry.sources.webm), mp4: resolve(entry.sources.mp4) };
}

/** The Markdown copy of a picture or clip, for the .md pages and llms-full.txt. */
export function shotMarkdown(
  attributes: { id?: string; alt?: string; caption?: string },
  origin: string,
  from: ShotsManifest = SHOTS,
): string {
  const entry = attributes.id ? from[attributes.id] : undefined;
  if (!entry) return "";
  const base = origin.replace(/\/+$/, "");
  const alt = (attributes.alt ?? entry.alt).replace(/[[\]]/g, "");
  const caption = attributes.caption ? `\n\n*${attributes.caption}*` : "";
  if (entry.kind === "shot") {
    return `\n\n![${alt}](${base}${entry.light})${caption}\n\n`;
  }
  const { mp4 } = clipSources(entry, "light");
  const video = mp4.startsWith("http") ? mp4 : `${base}${mp4}`;
  return `\n\n![${alt}](${base}${entry.poster.light})\n\n[Watch the clip (${entry.seconds}s, no sound)](${video})${caption}\n\n`;
}

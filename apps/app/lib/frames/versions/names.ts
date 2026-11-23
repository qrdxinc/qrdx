// Names of QRdx's official frames in image URLs and playground links. Every
// name but one draws one version of a frame for good, so an image someone
// embeds never changes when QRdx redesigns the frame:
//
// - autumn-maple.v2: that version.
// - autumn-maple: version 1, the frame as it was first published (image
//   URLs copied before versions existed name frames this way).
// - autumn-maple.latest: the newest version, which changes with the frame.
//   Only for those who ask for it.
//
// The editor copies the explicit current version (autumn-maple.v1 today).
// Every version ever published stays in ./record.json, which only the
// image API reads (./record.ts). This module holds no specs, so the
// browser can use it: the newest versions come from ./latest.ts.
import { LATEST_FRAME_VERSIONS } from "./latest";

/**
 * An official frame's name: its id (kebab-case, as qrdx OFFICIAL_FRAMES),
 * optionally with a version or `.latest`. `.` stays as it is in a URL, so a
 * name needs no percent-encoding.
 */
export const OFFICIAL_FRAME_NAME =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.v[1-9]\d{0,5}|\.latest)?$/;

const SUFFIX = /^(.+)\.(?:v(\d+)|(latest))$/;

/** Ask for the newest version: autumn-maple.latest. */
export const LATEST_SUFFIX = "latest";

export interface OfficialFrameName {
  id: string;
  /** The version it draws: a number (1 for a bare id), or the newest */
  version: number | typeof LATEST_SUFFIX;
}

/** A frame name as its id and version; null for anything else. */
export function parseFrameName(name: string): OfficialFrameName | null {
  if (!OFFICIAL_FRAME_NAME.test(name)) return null;
  const match = SUFFIX.exec(name);
  if (!match?.[1]) return { id: name, version: 1 };
  return {
    id: match[1],
    version: match[3] ? LATEST_SUFFIX : Number(match[2]),
  };
}

/** The newest version of an official frame: v1 until QRdx redesigns it. */
export const latestFrameVersion = (id: string): number =>
  (Object.hasOwn(LATEST_FRAME_VERSIONS, id) && LATEST_FRAME_VERSIONS[id]) || 1;

/** The name that keeps drawing `id` as it is now: autumn-maple.v1. */
export const pinFrameName = (id: string): string =>
  `${id}.v${latestFrameVersion(id)}`;

/**
 * The id whose current spec stands in for `name` where only each frame's
 * newest design is at hand (the browser's frame library, the server's
 * catalogue, both reading playground links): `.latest` and any version up
 * to the newest, a bare id (v1) included, so a link made before a redesign
 * still opens with its frame, as links did before versions. A version past
 * the newest is unknown. The image API draws exact versions instead
 * (./record.ts).
 */
export function currentIdOf(name: string): string | undefined {
  const parsed = parseFrameName(name);
  if (!parsed) return undefined;
  if (parsed.version === LATEST_SUFFIX) return parsed.id;
  return parsed.version <= latestFrameVersion(parsed.id)
    ? parsed.id
    : undefined;
}

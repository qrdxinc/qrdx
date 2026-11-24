// Every version of QRdx's official frames ever published, for the image
// API: a URL that names a frame's version (autumn-maple.v1, as the editor's
// Get code copies it) draws exactly that version for as long as it's used,
// whatever QRdx changes about the frame later. A bare id (autumn-maple) is
// version 1 for good; autumn-maple.latest asks for the newest version
// (./names.ts).
//
// ./record.json is written by scripts/frame-versions.ts (`bun run --filter
// app frames:versions`), which only ever appends; tests/frames/
// frame-versions.test.ts fails when a frame's current spec isn't its latest
// recorded version, and when a recorded version changes or disappears.
// Server only: the browser pins names with ./latest.ts and never holds an
// older spec.
import "server-only";
import type { FrameSpec } from "qrdx/types";
import {
  findOfficialFrame,
  OFFICIAL_FRAME_RESOLVER,
} from "@/lib/community/catalog";
import type { OfficialFrameResolver } from "@/lib/playground-style";
import { LATEST_SUFFIX, parseFrameName } from "./names";
import RECORD from "./record.json";

const versionsOf = (id: string) =>
  Object.hasOwn(RECORD, id) ? (RECORD[id] ?? []) : [];

/** The spec a frame name draws, if there is one. */
function specOfName(name: string): FrameSpec | undefined {
  const parsed = parseFrameName(name);
  if (!parsed) return undefined;
  const versions = versionsOf(parsed.id);
  if (parsed.version === LATEST_SUFFIX) {
    // The catalogue's spec, which is the newest recorded version (the test
    // checks); for a frame QRdx has withdrawn, its last version.
    return findOfficialFrame(parsed.id)?.spec ?? versions.at(-1)?.spec;
  }
  // Versions are numbered 1, 2, … in order (the test checks).
  return versions[parsed.version - 1]?.spec;
}

/**
 * Official frames by name, every published version included: what the
 * image API draws `frame`, a frame's `style` and a playground link's
 * official frame with.
 */
export const FRAME_VERSION_RESOLVER: OfficialFrameResolver = {
  idOfSpec: OFFICIAL_FRAME_RESOLVER.idOfSpec,
  specOf: specOfName,
  versionCount: (id) => versionsOf(id).length,
};

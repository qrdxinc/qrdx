// The record of every official frame version the image API draws
// (lib/frames/versions/record.json): image URLs copied from the editor name
// a frame's version (frame=autumn-maple.v1) and must draw exactly that for
// as long as they're used. So the record has to hold every frame's current
// spec as its latest version, and keep every version it has ever held as
// it was. Forgetting `bun run --filter app frames:versions` after changing
// a frame fails here.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { frameSpecHash, OFFICIAL_FRAMES } from "qrdx";
import { describe, expect, it } from "vitest";
import { LATEST_FRAME_VERSIONS } from "@/lib/frames/versions/latest";
import RECORD from "@/lib/frames/versions/record.json";

const FIX =
  "Run `bun run --filter app frames:versions` to record it, and commit apps/app/lib/frames/versions";
const RECORD_PATH = "apps/app/lib/frames/versions/record.json";
const REPO = path.resolve(import.meta.dirname, "../../../..");

type VersionRecord = typeof RECORD;

/** The record as it is on `ref`, or null without git, the ref or the file. */
function recordAt(ref: string): VersionRecord | null {
  try {
    const text = execFileSync("git", ["show", `${ref}:${RECORD_PATH}`], {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(text) as VersionRecord;
  } catch {
    return null;
  }
}

describe("Official frame versions", () => {
  it("records every official frame's current spec as its latest version", () => {
    const unrecorded = OFFICIAL_FRAMES.filter((frame) => {
      const latest = RECORD[frame.id]?.at(-1);
      return !(
        latest &&
        latest.hash === frameSpecHash(frame.spec) &&
        isDeepStrictEqual(latest.spec, frame.spec)
      );
    }).map((frame) => frame.id);
    expect(
      unrecorded,
      `These official frames are new or their spec changed, and that spec isn't a recorded version yet, so an image URL the editor copies for one would draw an older design, or nothing. ${FIX}`,
    ).toEqual([]);
  });

  it("keeps every recorded version numbered and as it was published", () => {
    const broken: string[] = [];
    for (const [id, versions] of Object.entries(RECORD)) {
      expect(versions.length, id).toBeGreaterThan(0);
      versions.forEach((version, index) => {
        if (version.v !== index + 1) {
          broken.push(`${id}: version ${index + 1} is numbered ${version.v}`);
        } else if (frameSpecHash(version.spec) !== version.hash) {
          broken.push(`${id}.v${version.v}: spec doesn't match its hash`);
        }
      });
    }
    expect(
      broken,
      "Recorded frame versions are never edited: restore apps/app/lib/frames/versions/record.json from git, then run `bun run --filter app frames:versions`",
    ).toEqual([]);
  });

  it("gives the browser each frame's latest version", () => {
    const latest = Object.fromEntries(
      Object.entries(RECORD)
        .filter(([, versions]) => versions.length > 1)
        .map(([id, versions]) => [id, versions.length]),
    );
    expect(LATEST_FRAME_VERSIONS, FIX).toEqual(latest);
  });

  // In CI (a full clone) the branches are there; without git or them, there
  // is nothing to compare against.
  for (const ref of ["origin/main", "origin/staging"]) {
    it(`still draws every version published on ${ref}`, () => {
      const published = recordAt(ref);
      if (!published) return;
      const missing: string[] = [];
      for (const [id, versions] of Object.entries(published)) {
        for (const version of versions) {
          const kept = RECORD[id]?.[version.v - 1];
          if (
            !(
              kept &&
              kept.v === version.v &&
              kept.hash === version.hash &&
              isDeepStrictEqual(kept.spec, version.spec)
            )
          ) {
            missing.push(`${id}.v${version.v}`);
          }
        }
      }
      expect(
        missing,
        `These frame versions are on ${ref} but missing or changed here, so image URLs naming them would change. Versions are never removed or renumbered: merge ${ref}, take its record (git checkout ${ref} -- ${RECORD_PATH} apps/app/lib/frames/versions/latest.ts), then run \`bun run --filter app frames:versions\` to add your changes after its versions`,
      ).toEqual([]);
    });
  }
});

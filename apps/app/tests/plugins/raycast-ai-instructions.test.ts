// The Raycast extension's AI instructions (plugins/raycast/ai.yaml) tell the
// model which shapes it may ask for. The extension draws with the qrdx it
// pins from npm, not the workspace engine, and an id that version doesn't
// know renders as its default shape without an error. So every id listed
// there must be one the pinned version has.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const plugin = join(import.meta.dirname, "../../../../plugins/raycast");
const instructions = readFileSync(join(plugin, "ai.yaml"), "utf8");
const pinned = createRequire(join(plugin, "package.json"))("qrdx") as {
  BODY_PATTERN: readonly string[];
  CORNER_EYE_PATTERNS: readonly string[];
  CORNER_EYE_DOT_PATTERNS: readonly string[];
};

/** The comma-separated ids after `label:` in the instructions. */
function listed(label: string): string[] {
  const line = instructions
    .split("\n")
    .find((text) => text.trim().startsWith(`${label}:`));
  if (!line) throw new Error(`No "${label}" line in ai.yaml`);
  return line
    .slice(line.indexOf(":") + 1)
    .split(",")
    .map((id) => id.trim());
}

describe("Raycast AI instructions", () => {
  it.each([
    ["Supported body patterns", pinned.BODY_PATTERN],
    ["Supported corner eye patterns", pinned.CORNER_EYE_PATTERNS],
    ["Supported corner dot patterns", pinned.CORNER_EYE_DOT_PATTERNS],
  ])("%s: only ids the pinned qrdx draws", (label, catalogue) => {
    const ids = listed(label);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !catalogue.includes(id))).toEqual([]);
  });
});

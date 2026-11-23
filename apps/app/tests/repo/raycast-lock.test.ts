// The Raycast Store builds plugins/raycast with npm, so the extension keeps a
// package-lock.json beside its package.json, written by
// scripts/raycast-lock.mjs (bun run raycast:lock). This fails when a
// dependency changes in package.json and the lockfile isn't rewritten.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const EXTENSION = join(REPO, "plugins", "raycast");

describe("plugins/raycast", () => {
  it("has a package-lock.json that matches its package.json", () => {
    const out = execFileSync(
      process.execPath,
      [join(REPO, "scripts", "raycast-lock.mjs"), "--check"],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(out).toContain("matches package.json");
  });

  it("installs with npm alone, outside this repository", () => {
    const manifest = JSON.parse(
      readFileSync(join(EXTENSION, "package.json"), "utf8"),
    );
    const ranges = Object.values({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }) as string[];
    expect(ranges.filter((range) => range.startsWith("workspace:"))).toEqual(
      [],
    );
    const tsconfig = readFileSync(join(EXTENSION, "tsconfig.json"), "utf8");
    expect(tsconfig).not.toContain("@repo/");
  });
});

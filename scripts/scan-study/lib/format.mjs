// Formats generated files the way the repository's formatter (Biome) writes
// them, so a rerun leaves only real changes in the diff and the lint check
// stays green. Skipped when Biome isn't installed, or for files outside the
// repository, which Biome won't touch.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BIOME = fileURLToPath(
  new URL("../../../node_modules/@biomejs/biome/bin/biome", import.meta.url)
);

export function formatFiles(files) {
  if (!existsSync(BIOME) || files.length === 0) return;
  spawnSync(process.execPath, [BIOME, "format", "--write", ...files], {
    stdio: "ignore",
  });
}

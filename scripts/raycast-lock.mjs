#!/usr/bin/env node
// Writes plugins/raycast/package-lock.json. The Raycast Store builds
// extensions with npm and asks for a package-lock.json next to package.json,
// while this repository installs the extension with Bun. npm can't run inside
// the repository: it climbs to the root package.json and fails on its Bun
// workspace setup. So this resolves the extension's package.json in a
// temporary folder and copies the lockfile back. Run it after every change to
// the extension's dependencies:
//
//   bun run raycast:lock                     write the lockfile (needs npm)
//   node scripts/raycast-lock.mjs --check    exit 1 if it lists other ranges
//
// apps/app/tests/repo/raycast-lock.test.ts runs --check, which reads the two
// files only and needs no network.
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extension = join(root, "plugins", "raycast");
const manifestPath = join(extension, "package.json");
const lockPath = join(extension, "package-lock.json");

/** The dependency fields npm copies from package.json into the lockfile. */
const FIELDS = ["dependencies", "devDependencies"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Differences between package.json and the lockfile's root entry. */
function differences() {
  if (!existsSync(lockPath)) {
    return ["plugins/raycast/package-lock.json is missing"];
  }
  const manifest = readJson(manifestPath);
  const lockRoot = readJson(lockPath).packages?.[""] ?? {};
  const found = [];
  if (lockRoot.name !== manifest.name) {
    found.push(`name: ${lockRoot.name} in the lockfile, ${manifest.name}`);
  }
  for (const field of FIELDS) {
    const wanted = manifest[field] ?? {};
    const locked = lockRoot[field] ?? {};
    for (const name of new Set([
      ...Object.keys(wanted),
      ...Object.keys(locked),
    ])) {
      if (wanted[name] !== locked[name]) {
        found.push(
          `${field}.${name}: ${locked[name] ?? "missing"} in the lockfile, ${wanted[name] ?? "missing"} in package.json`
        );
      }
    }
  }
  return found;
}

if (process.argv.includes("--check")) {
  const found = differences();
  if (found.length > 0) {
    console.error(
      `plugins/raycast/package-lock.json is out of date. Run bun run raycast:lock.\n${found.join("\n")}`
    );
    process.exit(1);
  }
  console.log("plugins/raycast/package-lock.json matches package.json");
} else {
  const temporary = mkdtempSync(join(tmpdir(), "qrdx-raycast-lock-"));
  try {
    copyFileSync(manifestPath, join(temporary, "package.json"));
    execFileSync(
      "npm",
      [
        "install",
        "--package-lock-only",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
      ],
      { cwd: temporary, stdio: "inherit" }
    );
    copyFileSync(join(temporary, "package-lock.json"), lockPath);
    console.log("Wrote plugins/raycast/package-lock.json");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

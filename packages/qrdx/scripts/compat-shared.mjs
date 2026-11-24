// What scripts/react-compat.mjs and scripts/legacy-compat.mjs share: packing
// qrdx as the Publish workflow does, and running npm and node in a folder of
// their own.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));

// npm gets the environment without what a package manager sets for the
// script running this: npm_config_local_prefix, which Bun and npm set,
// would point npm's install at this package. Other npm_config_* settings (a
// registry, a cache) still apply.
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !/^npm_/i.test(key) ||
      (/^npm_config_/i.test(key) &&
        !/^npm_config_(local_prefix|user_agent)$/i.test(key))
  )
);

// No command runs longer than this (npm on a slow network included), so a
// command that hangs fails the check instead of the CI job's timeout.
const COMMAND_TIMEOUT_MS = 180_000;

/** Runs a command; resolves with its output, rejects with it on failure. */
export function run(
  command,
  args,
  cwd,
  extraEnv = {},
  timeout = COMMAND_TIMEOUT_MS
) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...env, ...extraEnv },
      killSignal: "SIGKILL",
      timeout,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", fail);
    child.on("close", (status, signal) => {
      if (status === 0) {
        done(stdout);
      } else {
        const output =
          `${signal === "SIGKILL" ? `stopped after ${timeout / 1000} s\n` : ""}${stdout}${stderr}`.trim();
        fail(
          new Error(
            `${command} ${args.join(" ")} exited with ${status}\n${output}`
          )
        );
      }
    });
  });
}

/** `npm install`s the package.json in `cwd`, scripts off. */
export const npmInstall = (cwd) =>
  run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--ignore-scripts",
      "--loglevel=error",
    ],
    cwd
  );

/** Packs dist/ as it is into `folder`; returns the tarball's name. */
export async function pack(folder) {
  if (!existsSync(join(root, "dist"))) {
    throw new Error(
      "No dist/ to pack. Build qrdx first: bun run --filter qrdx build:inplace"
    );
  }
  await run("bun", ["pm", "pack", "--destination", folder, "--quiet"], root);
  const tarball = readdirSync(folder).find((file) => file.endsWith(".tgz"));
  if (!tarball) {
    throw new Error("bun pm pack wrote no tarball");
  }
  return tarball;
}

export const seconds = (since) =>
  `${((performance.now() - since) / 1000).toFixed(1)} s`;

/** Indents `text`, keeping its first `lines` lines. */
export const indent = (text, lines = 10) =>
  text
    .split("\n")
    .slice(0, lines)
    .map((line) => `    ${line}`)
    .join("\n");

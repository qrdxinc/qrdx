// Checks the package the way npm ships it: packs it with `bun pm pack`, as
// the Publish workflow does, into a temporary folder, then runs publint and
// are-the-types-wrong (attw) on the tarball. It fails on any publint message
// (error, warning or suggestion) except the one allowed below, and on any
// problem attw finds in an entry under node10, node16 (from CommonJS and
// from ESM) or bundler resolution.
//
//   node scripts/check-package.mjs
//
// It packs dist/ as it is, so build qrdx first.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publint } from "publint";
import { formatMessage } from "publint/utils";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

// publint suggests declaring "type". The package leaves it out on purpose
// (#521): "type": "commonjs" would change how webpack parses the package's
// .js files (javascript/dynamic instead of javascript/auto), and nothing
// here tests what that does to the bundlers that consume them.
const isAllowed = (message) =>
  message.code === "USE_TYPE" && message.type === "suggestion";

if (!existsSync(join(root, "dist"))) {
  throw new Error(
    "No dist/ to pack. Build qrdx first: bun run --filter qrdx build:inplace"
  );
}

const attwManifest = require.resolve("@arethetypeswrong/cli/package.json");
const attwBin = join(
  dirname(attwManifest),
  JSON.parse(readFileSync(attwManifest, "utf8")).bin.attw
);

const packDir = mkdtempSync(join(tmpdir(), "qrdx-check-package-"));
let failed = false;
try {
  const pack = spawnSync(
    "bun",
    ["pm", "pack", "--destination", packDir, "--quiet"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] }
  );
  if (pack.error) {
    throw pack.error;
  }
  if (pack.status !== 0) {
    throw new Error(`bun pm pack exited with ${pack.status}`);
  }
  const tarballs = readdirSync(packDir).filter((file) => file.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    throw new Error(
      `Expected one tarball from bun pm pack, found ${tarballs.length}`
    );
  }
  const tarball = join(packDir, tarballs[0]);
  const megabytes = (statSync(tarball).size / 1e6).toFixed(1);
  console.log(`Packed ${tarballs[0]} (${megabytes} MB)\n`);

  const data = readFileSync(tarball);
  const { messages, pkg } = await publint({
    pack: {
      tarball: data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength
      ),
    },
  });
  const problems = messages.filter((message) => !isAllowed(message));
  console.log(
    `publint: ${problems.length === 0 ? "no" : problems.length} problem${problems.length === 1 ? "" : "s"}`
  );
  for (const message of messages) {
    const label = isAllowed(message) ? `allowed ${message.type}` : message.type;
    console.log(`  ${label}: ${formatMessage(message, pkg)}`);
  }
  failed = problems.length > 0;

  console.log("\nare-the-types-wrong:");
  const attw = spawnSync(
    process.execPath,
    [attwBin, tarball, "--format", "table-flipped"],
    { stdio: "inherit" }
  );
  if (attw.error) {
    throw attw.error;
  }
  failed = failed || attw.status !== 0;
} finally {
  rmSync(packDir, { recursive: true, force: true });
}

if (failed) {
  console.error("\nThe packed qrdx package has problems (above).");
  process.exitCode = 1;
} else {
  console.log("\nThe packed qrdx package passes publint and attw.");
}

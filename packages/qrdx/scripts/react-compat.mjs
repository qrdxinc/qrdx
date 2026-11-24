// Checks the React components on every React line the package supports, the
// way an app gets them. It packs the package with `bun pm pack` (as the
// Publish workflow does) and installs the tarball with npm next to React
// 16.8, 17, 18 and the React 19 the package's own tests use, each in a
// folder of its own, so every react-dom finds its own React. Then, for each:
//
// 1. react-compat/render.cjs renders a set of designs through the built
//    CommonJS entry, to static markup with that React's react-dom/server
//    and in a DOM (jsdom) with its react-dom. Both must be React 19's,
//    character for character (the DOM's attributes in name order), with
//    nothing logged by React (invalid props, missing keys…);
// 2. every name the built ES module entries import from "react" must be one
//    that React exports (what a bundler links them to), and no built file
//    may import anything else of React's (react/jsx-runtime, react-dom);
// 3. react-compat/consumer.tsx, a small app, must type-check against that
//    React's @types/react with skipLibCheck off, so qrdx's own .d.ts files
//    are checked too (with the TypeScript this repo uses).
//
// npm refuses to install a React outside the package's peer range, so the
// range is checked along the way.
//
//   node scripts/react-compat.mjs           build qrdx first; needs the network
//   node scripts/react-compat.mjs --keep    keeps the install folders
//
// The folders are kept when a check fails, and the script says where.
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { indent, npmInstall, pack, run, seconds } from "./compat-shared.mjs";

const fixtures = fileURLToPath(new URL("./react-compat/", import.meta.url));
const require = createRequire(import.meta.url);
const versionOf = (name) =>
  JSON.parse(readFileSync(require.resolve(`${name}/package.json`), "utf8"))
    .version;

// The last entry is the baseline the others are compared with: the React
// and @types/react this package is developed and tested with. React 16.8 is
// the oldest the peer range allows. The @types/react for 16 and 17 are early
// ones on purpose: their "react" module has no `JSX` (later 17.0.x types
// added one), so a published .d.ts that imports it fails here.
const MATRIX = [
  { react: "16.8.0", types: "16.9.56" },
  { react: "17.0.2", types: "17.0.0" },
  { react: "18.3.1", types: "18.3.31" },
  { react: versionOf("react"), types: versionOf("@types/react") },
];
const baseline = MATRIX.at(-1);
const keep = process.argv.includes("--keep");

// render.cjs mounts the designs in a DOM with this package's jsdom
const jsdom = require.resolve("jsdom");
const tsManifest = require.resolve("typescript/package.json");
const tsc = join(
  dirname(tsManifest),
  JSON.parse(readFileSync(tsManifest, "utf8")).bin.tsc
);

/** The names an ES module imports from "react" (`import{a,b as c}from"react"`). */
function namedReactImports(code) {
  const names = new Set();
  for (const match of code.matchAll(
    /\bimport\s*\{([^}]*)\}\s*from\s*["']react["']/g
  )) {
    for (const part of (match[1] ?? "").split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (name) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

/** Every module of React's a built file imports other than "react" itself. */
function otherReactModules(code) {
  const found = new Set();
  for (const match of code.matchAll(
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["'](react[^"']*)["']/g
  )) {
    const specifier = match[1] ?? "";
    if (/^react(-dom)?(\/|$)/.test(specifier) && specifier !== "react") {
      found.add(specifier);
    }
  }
  return [...found];
}

/** Where two strings first differ, with some context from each. */
function firstDifference(actual, expected) {
  let index = 0;
  while (index < actual.length && actual[index] === expected[index]) {
    index += 1;
  }
  const from = Math.max(0, index - 60);
  return [
    `  first difference at character ${index}:`,
    `  this React: …${actual.slice(from, index + 60)}…`,
    `  React ${baseline.react}: …${expected.slice(from, index + 60)}…`,
  ].join("\n");
}

const started = performance.now();
const work = mkdtempSync(join(tmpdir(), "qrdx-react-compat-"));
const problems = [];

try {
  const tarball = await pack(work);
  console.log(`Packed ${tarball}`);

  const installStarted = performance.now();
  await Promise.all(
    MATRIX.map(async (entry) => {
      entry.problems = [];
      entry.installed = true;
      entry.dir = join(work, `react-${entry.react}`);
      mkdirSync(entry.dir);
      writeFileSync(
        join(entry.dir, "package.json"),
        `${JSON.stringify(
          {
            private: true,
            dependencies: {
              qrdx: `file:${join(work, tarball)}`,
              react: entry.react,
              "react-dom": entry.react,
              "@types/react": entry.types,
            },
          },
          null,
          2
        )}\n`
      );
      for (const file of ["render.cjs", "consumer.tsx"]) {
        copyFileSync(join(fixtures, file), join(entry.dir, file));
      }
      writeFileSync(
        join(entry.dir, "tsconfig.json"),
        `${JSON.stringify(
          {
            compilerOptions: {
              strict: true,
              noEmit: true,
              skipLibCheck: false,
              jsx: "react",
              target: "es2022",
              module: "esnext",
              moduleResolution: "bundler",
              lib: ["dom", "es2022"],
              types: [],
            },
            files: ["consumer.tsx"],
          },
          null,
          2
        )}\n`
      );
      await npmInstall(entry.dir).catch((error) => {
        entry.problems.push(
          `npm couldn't install it:\n${indent(error.message)}`
        );
        entry.installed = false;
      });
    })
  );
  console.log(
    `Installed it with React ${MATRIX.map((entry) => entry.react).join(", ")} (${seconds(installStarted)})\n`
  );

  // The built files every version installed (the same tarball), the
  // legacy build's ES modules (dist/legacy/*.js) included
  await run("tar", ["-xzf", tarball], work);
  const dist = join(work, "package/dist");
  const esmImports = new Map();
  const builtFiles = [
    ...readdirSync(dist),
    ...readdirSync(join(dist, "legacy")).map((name) => `legacy/${name}`),
  ].filter((name) => /\.m?js$/.test(name));
  for (const file of builtFiles) {
    const code = readFileSync(join(dist, file), "utf8");
    for (const specifier of otherReactModules(code)) {
      problems.push(`dist/${file} imports ${specifier}`);
    }
    const esm = file.endsWith(".mjs") || file.startsWith("legacy/");
    const names = esm ? namedReactImports(code) : [];
    if (names.length > 0) {
      esmImports.set(file, names);
    }
  }

  await Promise.all(
    MATRIX.filter((entry) => entry.installed).map(async (entry) => {
      // 1. The markup (compared with the baseline's below)
      try {
        entry.rendered = JSON.parse(
          await run(process.execPath, ["render.cjs"], entry.dir, {
            QRDX_JSDOM: jsdom,
          })
        );
        if (entry.rendered.react !== entry.react) {
          entry.problems.push(`render.cjs ran React ${entry.rendered.react}`);
        }
        for (const message of entry.rendered.logged) {
          entry.problems.push(`React logged ${message.split("\n")[0]}`);
        }
      } catch (error) {
        entry.problems.push(`render.cjs failed:\n${indent(error.message)}`);
      }
      // 2. What the ES module entries import from "react"
      const React = createRequire(join(entry.dir, "package.json"))("react");
      for (const [file, names] of esmImports) {
        for (const name of names.filter((imported) => !(imported in React))) {
          entry.problems.push(`React has no export ${name} (dist/${file})`);
        }
      }
      // 3. The types
      await run(
        process.execPath,
        [tsc, "-p", "tsconfig.json"],
        entry.dir
      ).catch((error) => {
        const output = error.message.split("\n").slice(1).join("\n");
        entry.problems.push(
          `consumer.tsx doesn't type-check:\n${indent(output)}`
        );
      });
    })
  );

  const expected = baseline.rendered ?? { markup: {}, dom: {} };
  const designs = Object.keys(expected.markup);
  console.log(
    `${designs.length} designs, rendered with each React to static markup and in a DOM:`
  );
  for (const name of designs) {
    console.log(
      `  ${name} (${(expected.markup[name] ?? "").length} characters)`
    );
  }
  console.log();

  for (const entry of MATRIX) {
    const label = `React ${entry.react}, @types/react ${entry.types}`;
    if (entry.rendered && entry !== baseline) {
      if (designs.length === 0) {
        entry.problems.push(
          `no markup from React ${baseline.react} to compare with`
        );
      }
      for (const name of designs) {
        for (const [output, what] of [
          ["markup", "static markup"],
          ["dom", "DOM"],
        ]) {
          const actual = entry.rendered[output][name] ?? "";
          const wanted = expected[output][name] ?? "";
          if (actual !== wanted) {
            entry.problems.push(
              `"${name}": the ${what} differs from React ${baseline.react}'s\n${firstDifference(actual, wanted)}`
            );
          }
        }
      }
    }
    if (entry.problems.length === 0) {
      const markup =
        entry === baseline
          ? "the baseline markup and DOM"
          : `React ${baseline.react}'s markup and DOM`;
      console.log(
        `ok    ${label}: ${markup}, nothing logged, every ESM import found, types check`
      );
    } else {
      const details = entry.problems.map((problem) => indent(problem, 12));
      console.log(`FAIL  ${label}\n${details.join("\n")}`);
      problems.push(label);
    }
  }
} catch (error) {
  problems.push(error instanceof Error ? error.message : String(error));
} finally {
  if (problems.length > 0 || keep) {
    console.log(`\nThe install folders are in ${work}`);
  } else {
    rmSync(work, { recursive: true, force: true });
  }
}

if (problems.length > 0) {
  console.error(
    `\nqrdx's React components fail on some React versions:\n  ${problems.join("\n  ")}`
  );
  process.exitCode = 1;
} else {
  console.log(
    `\nqrdx's React components draw the same markup and DOM and type-check on React ${MATRIX.map((entry) => entry.react).join(", ")} (${seconds(started)}).`
  );
}

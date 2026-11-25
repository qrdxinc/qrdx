// Checks qrdx where an app's tools are older than the package: bundlers
// that don't read "exports" (webpack 4, as in react-scripts 4) and
// TypeScript before 5.4 (whose lib lacks the NoInfer zod's types use). It
// packs the package with `bun pm pack` (as the Publish workflow does) and
// installs the tarball with npm next to webpack 4 and the Babel setup that
// react-scripts 4.0.3 pins, React 17, Preact 10, Vue 3 and TypeScript 5.0
// and 5.3. Then:
//
// 1. legacy-compat/build.cjs builds every app in legacy-compat/app (the
//    React entry, qrdx/core, qrdx/vanilla, qrdx/element/define, qrdx/preact,
//    qrdx/svelte, qrdx/vue) with react-scripts 4's production webpack
//    config, twice: for "ie 11", where Babel lowers every syntax and turns
//    async functions into generators, and for "last 1 chrome version",
//    where it lowers nothing and webpack 4's own parser reads qrdx's files.
//    Neither build may have an error or a warning, though the app didn't
//    install the optional jspdf;
// 2. it runs each bundle in a DOM (jsdom): every app must draw an <svg>,
//    the same for both browser lists, and qrdx/core's markup must be the
//    modern build's (dist/core.js), character for character;
// 3. it type-checks react-compat/consumer.tsx (with @types/react 17) and
//    legacy-compat/consumer.mts with TypeScript 5.0 and 5.3, under
//    `moduleResolution` node, node16 and bundler, skipLibCheck off.
//
//   node scripts/legacy-compat.mjs           build qrdx first; needs the network
//   node scripts/legacy-compat.mjs --keep    keeps the install folder
//
// The folder is kept when a check fails, and the script says where.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { indent, npmInstall, pack, run, seconds } from "./compat-shared.mjs";

const fixtures = fileURLToPath(new URL("./legacy-compat/", import.meta.url));
const consumerTsx = fileURLToPath(
  new URL("./react-compat/consumer.tsx", import.meta.url)
);
const require = createRequire(import.meta.url);
const keep = process.argv.includes("--keep");

// The versions react-scripts 4.0.3 pins (its package.json), and the
// babel-preset-react-app of its range in the lockfile of an app that
// reported #853. Babel's own packages are left to the preset's ranges, as
// in a fresh install.
const TOOLS = {
  webpack: "4.44.2",
  "babel-loader": "8.1.0",
  "@babel/core": "7.12.3",
  "babel-preset-react-app": "10.0.1",
  "terser-webpack-plugin": "4.2.3",
  react: "17.0.2",
  "react-dom": "17.0.2",
  "@types/react": "17.0.0",
  preact: "10.29.8",
  vue: "3.5.46",
};
const TYPESCRIPTS = ["5.0.4", "5.3.3"];
const BROWSERS = {
  "ie 11": "every syntax lowered, async functions as generators",
  "last 1 chrome version": "nothing lowered",
};
const RESOLUTIONS = {
  node: { module: "esnext", files: ["consumer.tsx"] },
  bundler: { module: "esnext", files: ["consumer.tsx"] },
  node16: { module: "node16", files: ["consumer.tsx", "consumer.mts"] },
};

const started = performance.now();
const work = mkdtempSync(join(tmpdir(), "qrdx-legacy-compat-"));
const problems = [];

try {
  const tarball = await pack(work);
  console.log(`Packed ${tarball}`);

  const dir = join(work, "app");
  mkdirSync(dir);
  const typescripts = Object.fromEntries(
    TYPESCRIPTS.map((version) => [
      `typescript-${version}`,
      `npm:typescript@${version}`,
    ])
  );
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        dependencies: {
          qrdx: `file:${join(work, tarball)}`,
          ...TOOLS,
          ...typescripts,
        },
      },
      null,
      2
    )}\n`
  );
  cpSync(fixtures, dir, { recursive: true });
  cpSync(consumerTsx, join(dir, "consumer.tsx"));

  const installStarted = performance.now();
  await npmInstall(dir);
  console.log(
    `Installed it with webpack ${TOOLS.webpack}, babel-preset-react-app ${TOOLS["babel-preset-react-app"]}, TypeScript ${TYPESCRIPTS.join(" and ")} (${seconds(installStarted)})\n`
  );

  // 1 and 2: the builds and their bundles
  const buildsStarted = performance.now();
  const builds = await Promise.all(
    Object.keys(BROWSERS).map(async (browsers, index) => {
      const output = await run(
        process.execPath,
        ["--openssl-legacy-provider", "build.cjs"],
        dir,
        {
          BROWSERSLIST: browsers,
          BABEL_ENV: "production",
          NODE_ENV: "production",
          QRDX_JSDOM: require.resolve("jsdom"),
          QRDX_MODE: `mode-${index}`,
        },
        300_000
      );
      return { browsers, ...JSON.parse(output.trim().split("\n").at(-1)) };
    })
  );
  // qrdx/core's markup from the modern build (dist/core.js) of the same
  // tarball, so a change to the engine never fails this check by itself
  const modern = JSON.parse(
    await run(
      process.execPath,
      [
        "-e",
        'console.log(JSON.stringify(require("qrdx/core").toSVGString(require("./app/design.json"))))',
      ],
      dir
    )
  );
  console.log(
    `Built and ran every app with react-scripts 4's webpack config (${seconds(buildsStarted)}):`
  );

  const apps = new Set(builds.flatMap((build) => Object.keys(build.results)));
  for (const build of builds) {
    const label = `${build.browsers} (${BROWSERS[build.browsers]})`;
    const found = [
      ...(build.errors ?? []).map((error) => `error: ${error}`),
      ...(build.warnings ?? []).map((warning) => `warning: ${warning}`),
      ...Object.entries(build.failed ?? {}).map(
        ([app, message]) => `${app} failed in the DOM: ${message}`
      ),
    ];
    const lowers = build.browsers === "ie 11";
    if (build.lowered !== lowers) {
      found.push(
        lowers
          ? "Babel left the async functions in (the check expects generators)"
          : "Babel turned async functions into generators (the check expects none)"
      );
    }
    for (const [app, markup] of Object.entries(build.results ?? {})) {
      if (!markup.includes("<svg")) {
        found.push(`${app} drew no <svg>: ${markup.slice(0, 120)}`);
      }
    }
    if ((build.results?.core ?? "") !== modern) {
      found.push("qrdx/core's markup isn't the modern build's");
    }
    if (found.length === 0) {
      console.log(
        `ok    ${label}: no errors or warnings; ${[...apps].join(", ")} drew their codes`
      );
    } else {
      console.log(
        `FAIL  ${label}\n${found.map((problem) => indent(problem, 6)).join("\n")}`
      );
      problems.push(`webpack 4, ${build.browsers}`);
    }
  }
  for (const app of apps) {
    const [first, ...rest] = builds.map((build) => build.results?.[app]);
    if (rest.some((markup) => markup !== first)) {
      console.log(`FAIL  ${app}: the browser lists drew different markup`);
      problems.push(`webpack 4, ${app}`);
    }
  }
  console.log();

  // 3: the types
  const typesStarted = performance.now();
  const checks = TYPESCRIPTS.flatMap((version) =>
    Object.entries(RESOLUTIONS).map(([resolution, { module, files }]) => ({
      version,
      resolution,
      module,
      files,
    }))
  );
  await Promise.all(
    checks.map(async (check) => {
      const config = `tsconfig.${check.version}.${check.resolution}.json`;
      writeFileSync(
        join(dir, config),
        `${JSON.stringify(
          {
            compilerOptions: {
              strict: true,
              noEmit: true,
              skipLibCheck: false,
              esModuleInterop: true,
              jsx: "react",
              target: "es2020",
              module: check.module,
              moduleResolution: check.resolution,
              lib: ["dom", "es2020"],
              types: [],
            },
            files: check.files,
          },
          null,
          2
        )}\n`
      );
      const tsc = join(
        dir,
        "node_modules",
        `typescript-${check.version}`,
        "bin",
        "tsc"
      );
      try {
        await run(process.execPath, [tsc, "-p", config], dir);
      } catch (error) {
        check.output = error.message.split("\n").slice(1).join("\n");
      }
    })
  );
  console.log(
    `Type-checked consumer.tsx and consumer.mts, skipLibCheck off (${seconds(typesStarted)}):`
  );
  for (const check of checks) {
    const label = `TypeScript ${check.version}, moduleResolution ${check.resolution} (${check.files.join(", ")})`;
    if (check.output === undefined) {
      console.log(`ok    ${label}`);
    } else {
      console.log(`FAIL  ${label}\n${indent(check.output, 12)}`);
      problems.push(label);
    }
  }
} catch (error) {
  problems.push(error instanceof Error ? error.message : String(error));
} finally {
  if (problems.length > 0 || keep) {
    console.log(`\nThe install folder is in ${work}`);
  } else {
    rmSync(work, { recursive: true, force: true });
  }
}

if (problems.length > 0) {
  console.error(`\nqrdx fails with older tools:\n  ${problems.join("\n  ")}`);
  process.exitCode = 1;
} else {
  console.log(
    `\nqrdx builds and draws with webpack 4 (react-scripts 4's config) and type-checks on TypeScript ${TYPESCRIPTS.join(" and ")} (${seconds(started)}).`
  );
}

// Writes the type entries that only re-export the declarations tsc wrote:
//
// 1. The ESM type entry of each export (the `.d.mts` its "import" condition
//    names) as a re-export of the `.d.ts` beside it. The package has no
//    "type" field, so TypeScript reads every `.d.ts` as CommonJS; without an
//    `.d.mts`, an ESM import under node16/nodenext gets CommonJS types for
//    the `.mjs` it loads. The declarations stay in one tree, so both
//    conditions share the same types.
// 2. The type entries for TypeScript 5.0 to 5.3 (the "types@<5.4" condition
//    of each export, and the typesVersions "<5.4" paths for
//    `moduleResolution: node`), in dist/ts5.0. zod's declarations use
//    `NoInfer`, which TypeScript added in 5.4; each of these entries loads
//    a stand-in for it (no-infer.d.ts) and re-exports the same declarations.
//    TypeScript 5.4 and later skip them, since a second NoInfer would clash
//    with the built-in one.
//
//   node scripts/esm-types.mjs
//
// The build runs it after tsc, which writes the `.d.ts` files.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const DEFAULT_EXPORT = /^export (?:default\b|=|\{[^}]*\bas default\b)/m;
const OLD_TS = "types@<5.4";
const OLD_TS_DIR = "./dist/ts5.0/";
const NO_INFER = "no-infer.d.ts";

const path = (file) => fileURLToPath(new URL(file, root));
const write = (file, text) => {
  mkdirSync(dirname(path(file)), { recursive: true });
  writeFileSync(path(file), text);
};
/** `to` as a module specifier from the folder of `from`, without `.d.ts`. */
const specifier = (from, to) => {
  const rel = relative(dirname(path(from)), path(to)).replace(/\.d\.ts$/, "");
  return rel.startsWith(".") ? rel : `./${rel}`;
};

const missing = [];
const problems = [];
let esm = 0;
const oldTs = new Set();

const writeOldTs = (shim, declaration, extension) => {
  if (!shim?.startsWith(OLD_TS_DIR)) {
    problems.push(`${declaration}: no "${OLD_TS}" entry in ${OLD_TS_DIR}`);
    return;
  }
  write(
    shim,
    `/// <reference path="./${NO_INFER}" />\nexport * from "${specifier(shim, declaration)}${extension}";\n`
  );
  oldTs.add(shim);
};

for (const [entry, conditions] of Object.entries(pkg.exports)) {
  const types = conditions?.import?.types;
  if (!types?.endsWith(".d.mts")) continue;
  const declaration = types.replace(/\.d\.mts$/, ".d.ts");
  if (!existsSync(path(declaration))) {
    missing.push(`${entry}: ${declaration}`);
    continue;
  }
  // `export *` leaves a default export out.
  if (DEFAULT_EXPORT.test(readFileSync(path(declaration), "utf8"))) {
    throw new Error(`${declaration} has a default export; re-export it too`);
  }
  write(types, `export * from "./${basename(declaration, ".d.ts")}.js";\n`);
  esm += 1;

  // The condition has to come before "types", which TypeScript 5.0 to 5.3
  // would otherwise take first.
  for (const [condition, extension] of [
    ["import", ".js"],
    ["require", ""],
  ]) {
    const keys = Object.keys(conditions[condition]);
    if (keys.indexOf(OLD_TS) !== 0 || keys.indexOf("types") !== 1) {
      problems.push(
        `${entry} (${condition}): "${OLD_TS}" must come first, then "types"`
      );
    }
    writeOldTs(conditions[condition][OLD_TS], declaration, extension);
  }
}

// `moduleResolution: node` ignores "exports" and reads typesVersions, whose
// first matching range wins: "<5.4" must map every path "*" maps, plus the
// main entry ("types"), to a dist/ts5.0 entry of the same declarations.
const versions = pkg.typesVersions ?? {};
const ranges = Object.keys(versions);
if (ranges[0] !== "<5.4" || ranges[1] !== "*") {
  problems.push('typesVersions must list "<5.4", then "*"');
}
const modern = { [pkg.types.replace(/^\.\//, "")]: [pkg.types] };
Object.assign(modern, versions["*"]);
for (const [key, [declaration]] of Object.entries(modern)) {
  const [shim, ...more] = versions["<5.4"]?.[key] ?? [];
  if (more.length > 0) {
    problems.push(`typesVersions "<5.4" "${key}": one path only`);
  }
  writeOldTs(shim, declaration, "");
}
for (const key of Object.keys(versions["<5.4"] ?? {})) {
  if (!(key in modern)) {
    problems.push(`typesVersions "<5.4" "${key}" has no "*" path`);
  }
}

write(
  `${OLD_TS_DIR}${NO_INFER}`,
  `// TypeScript 5.4 added NoInfer, which zod's declarations use. This stand-in,
// loaded only by qrdx's type entries for TypeScript 5.0 to 5.3, keeps a type
// out of inference the same way.
type NoInfer<T> = [T][T extends any ? 0 : never];
`
);

if (missing.length > 0) {
  throw new Error(
    `No .d.ts to re-export (run tsc first):\n  ${missing.join("\n  ")}`
  );
}
if (problems.length > 0) {
  throw new Error(`package.json type entries:\n  ${problems.join("\n  ")}`);
}
console.log(
  `esm-types: wrote ${esm} .d.mts files and ${oldTs.size} TypeScript 5.0–5.3 entries`
);

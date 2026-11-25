// What tools that don't read "exports" get (tsup.config.ts, "The legacy
// build"): webpack 4, as in react-scripts 4, takes the "module" field and,
// for a subpath, the package.json of the folder of that name (vanilla/…).
// Those name dist/legacy files, which webpack 4's own parser must read, as
// it must every file they import, and which leave the optional jspdf to the
// browser. Also the type entries for TypeScript 5.0 to 5.3. The engine is
// built before the tests in CI and before pushing; without a dist these
// checks have nothing to say. scripts/legacy-compat.mjs builds and runs
// the files with webpack 4 itself and type-checks with TypeScript 5.0 and
// 5.3 (it needs the network).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
// acorn 6.4, the parser webpack 4.44 reads modules with (devDependencies)
import { parse } from "acorn";
import { describe, expect, it, it as test } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const read = (file: string) => readFileSync(join(root, file), "utf8");
const built = existsSync(join(root, "dist/legacy"));

// The subpaths whose folder names a legacy file: every one a browser app
// imports (qrdx/node and qrdx/angular only get "main" and "types").
const BROWSER = [
  "core",
  "vanilla",
  "element",
  "element/define",
  "vue",
  "svelte",
];
const SUBPATHS = [...BROWSER, "preact", "solid", "node", "angular"];
const fileName = (subpath: string) => subpath.replace("/", "-");

// ecmaVersion 11 is webpack 4's setting; acorn 6 still lacks ES2020's ??
// and ?. there, which is what webpack 4 trips on.
const parseLikeWebpack4 = (file: string) =>
  parse(read(file), { ecmaVersion: 11, sourceType: "module" });

/** The modules a built file imports: relative paths and package names. */
function imports(file: string): string[] {
  const found = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }
    const {
      type,
      source,
      callee,
      arguments: args,
    } = node as {
      type?: string;
      source?: { value?: unknown };
      callee?: { type?: string };
      arguments?: { value?: unknown }[];
    };
    // acorn 6 writes import() as a call of an Import node
    const specifier =
      type === "CallExpression" && callee?.type === "Import"
        ? args?.[0]?.value
        : type &&
            /^(ImportDeclaration|Export(All|Named)Declaration)$/.test(type)
          ? source?.value
          : undefined;
    if (typeof specifier === "string") {
      found.add(specifier);
    }
    for (const value of Object.values(node)) {
      visit(value);
    }
  };
  try {
    visit(parseLikeWebpack4(file));
  } catch {
    // reported by the parser test below
  }
  return [...found].sort();
}

/** `file` and every file it imports by a relative path, from dist/. */
function withRelativeImports(file: string, seen = new Set<string>()) {
  if (seen.has(file)) {
    return seen;
  }
  seen.add(file);
  for (const specifier of imports(file)) {
    if (specifier.startsWith(".")) {
      withRelativeImports(
        relative(root, join(root, dirname(file), specifier)),
        seen
      );
    }
  }
  return seen;
}

describe('the fields that tools without "exports" read', () => {
  it('"module" names the legacy main entry, "main" the CommonJS one', () => {
    expect(pkg.module).toBe("./dist/legacy/index.js");
    expect(pkg.main).toBe(pkg.exports["."].require.default);
    expect(pkg.sideEffects).toContain("./dist/legacy/element-define.js");
  });

  it.each(SUBPATHS)("%s/package.json points at the same files", (subpath) => {
    const folder = join(root, subpath);
    const proxy = JSON.parse(
      readFileSync(join(folder, "package.json"), "utf8")
    );
    const exported = pkg.exports[`./${subpath}`].require;
    const fromRoot = (path: string) =>
      `./${relative(root, join(folder, path))}`;
    expect(fromRoot(proxy.main)).toBe(exported.default);
    expect(fromRoot(proxy.types)).toBe(exported.types);
    expect(proxy.module && fromRoot(proxy.module)).toBe(
      [...BROWSER, "preact", "solid"].includes(subpath)
        ? `./dist/legacy/${fileName(subpath)}.js`
        : undefined
    );
    expect(pkg.files).toContain(subpath.split("/")[0]);
  });
});

describe.runIf(built)("the legacy build", () => {
  const entries = [
    "dist/legacy/index.js",
    ...[...BROWSER, "preact", "solid"].map(
      (subpath) => `dist/legacy/${fileName(subpath)}.js`
    ),
  ];
  const files = [
    ...new Set(entries.flatMap((entry) => [...withRelativeImports(entry)])),
  ].sort();

  test("reaches the official frame data and nothing else outside dist/legacy", () => {
    expect(files.filter((file) => !file.startsWith("dist/legacy/"))).toEqual([
      "dist/frames-index.mjs",
      "dist/frames-official.mjs",
    ]);
  });

  test.each(files)("webpack 4's parser reads %s", (file) => {
    expect(() => parseLikeWebpack4(file)).not.toThrow();
  });

  test("bundles zod and imports only the app's frameworks and jsqr", () => {
    const packages = new Set(
      files.flatMap((file) =>
        imports(file).filter((specifier) => !specifier.startsWith("."))
      )
    );
    expect([...packages].sort()).toEqual([
      "jspdf",
      "jsqr",
      "preact",
      "react",
      "solid-js",
      "solid-js/web",
      "vue",
    ]);
  });

  test("leaves the optional jspdf to the browser, where webpack 4 can't fail on it", () => {
    const loads = files.flatMap((file) =>
      [...read(file).matchAll(/\bimport\s*\(([^)]*)["']jspdf["']\s*\)/g)].map(
        (match) => match[1]
      )
    );
    expect(loads.length).toBeGreaterThan(0);
    for (const comment of loads) {
      expect(comment).toContain("webpackIgnore: true");
    }
  });
});

describe.runIf(built)("the type entries for TypeScript 5.0 to 5.3", () => {
  const shims = [
    ...Object.values(pkg.exports).flatMap((conditions) =>
      typeof conditions === "string"
        ? []
        : [
            (conditions as Record<string, Record<string, string>>).import?.[
              "types@<5.4"
            ],
            (conditions as Record<string, Record<string, string>>).require?.[
              "types@<5.4"
            ],
          ]
    ),
    ...Object.values(
      pkg.typesVersions["<5.4"] as Record<string, string[]>
    ).flat(),
  ];

  test("come before the others", () => {
    expect(Object.keys(pkg.typesVersions)).toEqual(["<5.4", "*"]);
  });

  test.each([...new Set(shims)])("%s loads the NoInfer stand-in", (shim) => {
    expect(shim).toMatch(/^\.\/dist\/ts5\.0\//);
    expect(read(shim)).toMatch(
      /^\/\/\/ <reference path="\.\/no-infer\.d\.ts" \/>\nexport \* from "\.\.\//
    );
  });

  test("declare NoInfer only as a global type, which 5.4's lib would clash with", () => {
    expect(read("dist/ts5.0/no-infer.d.ts")).toMatch(
      /^type NoInfer<T> = \[T\]\[T extends any \? 0 : never\];$/m
    );
  });
});

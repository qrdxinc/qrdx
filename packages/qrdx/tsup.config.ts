import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { defineConfig, type Options } from "tsup";

// esbuild's Plugin type, via tsup (esbuild is tsup's dependency, not ours).
type Plugin = NonNullable<Options["esbuildPlugins"]>[number];

// QRCodeCanvas needs client-only hooks, so it is built as its own entry that
// keeps its "use client" directive. The main entry imports that built file
// instead of inlining it, which keeps the rest of the package server-safe (RSC).
const clientEntryExternal = (extension: ".js" | ".mjs"): Plugin => ({
  name: "qrdx-client-entry-external",
  setup(build) {
    build.onResolve({ filter: /^\.\/qr-code-canvas$/ }, () => ({
      path: `./qr-code-canvas${extension}`,
      external: true,
    }));
  },
});

const shared: Options = {
  outDir: "dist",
  sourcemap: true,
  dts: false, // Declarations are emitted by tsc (see the "build" script)
  external: ["react", "jsqr", "jspdf", "@resvg/resvg-js", "sharp"],
  splitting: false,
  minify: true,
  esbuildOptions(options) {
    options.jsx = "automatic";
    options.jsxImportSource = "react";
    // src/ and types/ ship in the package, so maps can point at them instead
    // of embedding a second copy of every source file.
    options.sourcesContent = false;
  },
};

// The official frame library (every spec) and its index are built as
// modules of their own; the main entry re-exports them, so a bundler that
// skips unused side-effect-free modules never ships the data to an app that
// doesn't use it (the playground loads it on demand instead).
const FRAME_DATA: Record<string, string> = {
  "./frames/official": "frames-official",
  "./frames/catalogue/index": "frames-index",
};
const frameDataExternal = (
  extension: ".js" | ".mjs",
  folder = "./"
): Plugin => ({
  name: "qrdx-frame-data-external",
  setup(build) {
    build.onResolve(
      { filter: /^\.\/frames\/(official|catalogue\/index)$/ },
      (args) => ({
        path: `${folder}${FRAME_DATA[args.path]}${extension}`,
        external: true,
      })
    );
  },
});

// The zod schemas (types/schemas.ts) are built as a module of their own,
// dist/schemas, which the core and the React entry only re-export. Nothing
// the engine draws with uses them (it validates frame specs with
// types/frame-spec-parse.ts), so a bundler that skips unused
// side-effect-free modules leaves zod out of an app that never uses a
// schema.
const schemasExternal = (extension: ".js" | ".mjs"): Plugin => ({
  name: "qrdx-schemas-external",
  setup(build) {
    build.onResolve({ filter: /\/types\/schemas$/ }, () => ({
      path: `./schemas${extension}`,
      external: true,
    }));
  },
});

// qrdx/core (dist/core) is the one React-free engine: qrdx/vanilla, qrdx/node
// and the framework adapters import it rather than bundling their own copy,
// so an app that uses two of them loads the engine once. Each of these
// entries may bundle only its own modules (`own`); any other import of the
// engine is an error, since it would be a second copy of the engine.
const sharedCore = (extension: ".js" | ".mjs", own: string[]): Plugin => ({
  name: "qrdx-shared-core",
  setup(build) {
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (args.kind === "entry-point") {
        return;
      }
      if (/^\.\/(core|engine)$/.test(args.path)) {
        return { path: `./core${extension}`, external: true };
      }
      const target = relative(
        resolve("src"),
        resolve(dirname(args.importer), args.path)
      );
      if (own.includes(target)) {
        return;
      }
      return {
        errors: [
          {
            text: `${relative(".", args.importer)} imports ${args.path}; import the engine from "./core" instead`,
          },
        ],
      };
    });
  },
});

// qrdx/angular has to reach an app compiled in Angular's partial mode,
// which the app's Angular CLI then links: a decorated class on its own
// would need the JIT compiler at runtime. So ngc compiles src/angular.ts
// (tsconfig.angular.json) while the other entries build, esbuild bundles
// its output in place of the source like any adapter, and ngc's .d.ts,
// which carries the component's declaration for the app's compiler, goes
// to dist/src (tsconfig.build.json leaves the file to ngc). ngc runs once
// for both formats.
const NGC_OUT = "node_modules/.cache/qrdx-angular";
let ngcRun: Promise<void> | undefined;
const compileAngular = () => {
  ngcRun ??= new Promise<void>((done, fail) => {
    const cli = "node_modules/@angular/compiler-cli";
    const { bin } = JSON.parse(readFileSync(`${cli}/package.json`, "utf8"));
    execFile(
      process.execPath,
      [
        resolve(cli, bin.ngc),
        ...["-p", "tsconfig.angular.json", "--inlineSourceMap"],
        // so esbuild maps the bundle back to src/angular.ts
        ...["--sourceRoot", `${resolve(".")}/`],
      ],
      (error, stdout, stderr) =>
        error ? fail(new Error(`ngc failed\n${stdout}${stderr}`)) : done()
    );
  }).then(async () => {
    await mkdir("dist/src", { recursive: true });
    await copyFile(`${NGC_OUT}/src/angular.d.ts`, "dist/src/angular.d.ts");
  });
  return ngcRun;
};
const angularPartial: Plugin = {
  name: "qrdx-angular-partial",
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]angular\.ts$/ }, async () => {
      await compileAngular();
      return {
        contents: await readFile(`${NGC_OUT}/src/angular.js`, "utf8"),
        loader: "js",
        resolveDir: resolve("src"),
      };
    });
  },
};

// Unminified, with "ɵ" written as is: the app's Angular CLI finds the
// partial declarations by searching the file's text for "ɵɵngDeclare".
const angular: Options = {
  ...shared,
  entry: { angular: "src/angular.ts" },
  treeshake: true,
  minify: false,
  external: [...(shared.external ?? []), "@angular/core"],
  esbuildOptions(options, context) {
    shared.esbuildOptions?.(options, context);
    options.charset = "utf8";
  },
};

// zod's `locales` namespace (every language's error messages, about 260 KB
// minified) is left out of the no-bundler browser file: the schemas use the
// English messages, which zod imports on its own, and the file never exposes
// `z`, so nothing can reach the other languages.
const dropZodLocales: Plugin = {
  name: "qrdx-drop-zod-locales",
  setup(build) {
    build.onResolve({ filter: /\/locales\/index\.js$/ }, (args) =>
      /[\\/]zod[\\/]/.test(args.importer)
        ? { path: "zod-locales", namespace: "qrdx-empty" }
        : undefined
    );
    build.onLoad({ filter: /.*/, namespace: "qrdx-empty" }, () => ({
      contents: "export {};",
      loader: "js",
    }));
  },
};

// qrdx/element/define registers <qrdx-code> and re-exports qrdx/element: it
// imports the built element file rather than a copy of the class.
const elementExternal = (file: string): Plugin => ({
  name: "qrdx-element-external",
  setup(build) {
    build.onResolve({ filter: /^\.\/element$/ }, () => ({
      path: `./${file}`,
      external: true,
    }));
  },
});

// The no-bundler <qrdx-code> file takes the engine from src/engine.ts, the
// core without the official frame library's data (as vanilla.browser does).
const coreWithoutFrameData: Plugin = {
  name: "qrdx-core-without-frame-data",
  setup(build) {
    build.onResolve({ filter: /^\.\/core$/ }, () => ({
      path: resolve("src/engine.ts"),
    }));
  },
};

// ── The legacy build (dist/legacy), for tools that don't read "exports" ──
// webpack 4 (react-scripts 4, Vue CLI 4…) skips "exports": it takes the
// package's "module" field and, for a subpath such as qrdx/vanilla, the
// package.json of the folder of that name (vanilla/package.json). Its
// parser (acorn 6) stops at ES2020 syntax such as ?? and ?., and it reads a
// .mjs file as a strict ES module that can't take named imports from a
// CommonJS package such as react. So the files those fields name are
// ES2019 and end in .js, and their zod is bundled in and lowered (zod's own
// files use ??). The modern .mjs and .js files are untouched. The official
// frame data comes from the main build's .mjs files, which are plain data
// built for ES2019 too. tests/legacy-build.test.ts checks the syntax, and
// scripts/legacy-compat.mjs builds and runs every entry with webpack 4.
const LEGACY_TARGET = "es2019";
const legacy: Options = {
  ...shared,
  outDir: "dist/legacy",
  format: ["esm"],
  target: LEGACY_TARGET,
  treeshake: true,
  // Without maps: about 3 MB the package can do without.
  sourcemap: false,
  outExtension: () => ({ js: ".js" }),
};
const legacyFrameData = frameDataExternal(".mjs", "../");

// webpack 4 fails the build of an app without jspdf (the optional peer PDF
// export loads) at an import() of it, try block or not; webpack 5 only
// warns (src/jspdf.ts). So in the legacy build that import() is one webpack
// leaves to the browser, as in the no-bundler files: the page maps jspdf in
// its import map, or PDF export says how to get it. esbuild drops comments
// when it minifies, so webpack's comment goes in after the build.
const JSPDF_IMPORT = /\bimport\((["'])jspdf\1\)/g;
const leaveJsPDFToTheBrowser = (file: string) => async () => {
  const path = `dist/legacy/${file}`;
  const code = await readFile(path, "utf8");
  const marked = code.replace(
    JSPDF_IMPORT,
    'import(/* webpackIgnore: true */ "jspdf")'
  );
  if (marked === code) {
    throw new Error(`${path} has no import() of jspdf to mark`);
  }
  await writeFile(path, marked);
};

// The configs below build in parallel, so dist/ is cleaned by the "build"
// script rather than with tsup's `clean` (which would race the other entries).
export default defineConfig([
  // ── Library (server-safe) ───────────────────────────────────────────────
  {
    ...shared,
    entry: ["src/index.tsx"],
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [
      clientEntryExternal(".mjs"),
      frameDataExternal(".mjs"),
      schemasExternal(".mjs"),
    ],
  },
  {
    ...shared,
    entry: ["src/index.tsx"],
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [
      clientEntryExternal(".js"),
      frameDataExternal(".js"),
      schemasExternal(".js"),
    ],
  },
  // ── Official frame data (re-exported by the main entry) ────────────────
  // ES2019 so the legacy build below can import these .mjs files as they
  // are: they're plain data, so this changes nothing for anyone else.
  {
    ...shared,
    entry: {
      "frames-official": "src/frames/official.ts",
      "frames-index": "src/frames/catalogue/index.ts",
    },
    format: ["cjs", "esm"],
    target: LEGACY_TARGET,
    treeshake: true,
  },
  // ── The zod schemas (re-exported by the core and the main entry) ───────
  {
    ...shared,
    entry: { schemas: "types/schemas.ts" },
    format: ["cjs", "esm"],
    treeshake: true,
  },
  // ── Client component entry ──────────────────────────────────────────────
  {
    ...shared,
    entry: ["src/qr-code-canvas.tsx"],
    format: ["cjs", "esm"],
    // esbuild keeps the entry's "use client" directive, but tsup's rollup
    // tree-shaking pass would strip it, so rely on esbuild's tree-shaking here.
    treeshake: false,
  },
  // ── React-free engine (qrdx/core) ───────────────────────────────────────
  {
    ...shared,
    entry: { core: "src/core.ts" },
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [frameDataExternal(".mjs"), schemasExternal(".mjs")],
  },
  {
    ...shared,
    entry: { core: "src/core.ts" },
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [frameDataExternal(".js"), schemasExternal(".js")],
  },
  // ── Plain JavaScript API (qrdx/vanilla), on the shared core ─────────────
  {
    ...shared,
    entry: { vanilla: "src/vanilla.ts" },
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".mjs", ["vanilla-api"])],
  },
  {
    ...shared,
    entry: { vanilla: "src/vanilla.ts" },
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".js", ["vanilla-api"])],
  },
  // ── qrdx/preact and qrdx/solid, on the shared core ──────────────────────
  // Neither file has JSX: Preact's elements come from its `h`, and Solid's
  // components return DOM nodes or ssr() markup, so no Solid compiler runs.
  // The framework stays an import of the app's own copy (optional peers).
  {
    ...shared,
    entry: { preact: "src/preact.ts", solid: "src/solid.ts" },
    format: ["esm"],
    treeshake: true,
    external: [...(shared.external ?? []), "preact", /^solid-js(\/|$)/],
    esbuildPlugins: [sharedCore(".mjs", [])],
  },
  {
    ...shared,
    entry: { preact: "src/preact.ts", solid: "src/solid.ts" },
    format: ["cjs"],
    treeshake: true,
    external: [...(shared.external ?? []), "preact", /^solid-js(\/|$)/],
    esbuildPlugins: [sharedCore(".js", [])],
  },
  // ── Angular component (qrdx/angular), on the shared core ──────────────
  {
    ...angular,
    format: ["esm"],
    esbuildPlugins: [angularPartial, sharedCore(".mjs", [])],
  },
  {
    ...angular,
    format: ["cjs"],
    esbuildPlugins: [angularPartial, sharedCore(".js", [])],
  },
  // ── qrdx/vanilla as one file for <script type="module">, no bundler ─────
  // zod is inlined; jspdf and jsqr stay on-demand imports (an import map
  // provides them), and the official frame library's data is left out.
  {
    ...shared,
    entry: { "vanilla.browser": "src/vanilla-browser.ts" },
    format: ["esm"],
    platform: "browser",
    treeshake: true,
    noExternal: ["zod"],
    esbuildPlugins: [dropZodLocales],
  },
  // ── <qrdx-code> custom element (qrdx/element), on the shared core ───────
  {
    ...shared,
    entry: { element: "src/element.ts" },
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".mjs", [])],
  },
  {
    ...shared,
    entry: { element: "src/element.ts" },
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".js", [])],
  },
  {
    ...shared,
    entry: { "element-define": "src/element-define.ts" },
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [elementExternal("element.mjs"), sharedCore(".mjs", [])],
  },
  {
    ...shared,
    entry: { "element-define": "src/element-define.ts" },
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [elementExternal("element.js"), sharedCore(".js", [])],
  },
  // ── <qrdx-code> as one file for <script type="module">, no bundler ──────
  // Like vanilla.browser: jspdf and jsqr on demand, no official frame data.
  // The element exports no schema, so esbuild leaves the schemas and zod
  // out (zod stays bundled-in rather than a bare import, should one ever
  // be reached). element-define.browser registers the tag from it.
  {
    ...shared,
    entry: { "element.browser": "src/element.ts" },
    format: ["esm"],
    platform: "browser",
    treeshake: true,
    noExternal: ["zod"],
    esbuildPlugins: [coreWithoutFrameData, dropZodLocales],
  },
  {
    ...shared,
    entry: { "element-define.browser": "src/element-define.ts" },
    format: ["esm"],
    platform: "browser",
    treeshake: true,
    esbuildPlugins: [elementExternal("element.browser.mjs")],
  },
  // ── Node-only PNG entry (qrdx/node), on the shared core ─────────────────
  // The native rasterizers live here alone, so the main entry never
  // mentions them and browser bundlers never see an import() to follow.
  {
    ...shared,
    entry: { node: "src/node.ts" },
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".mjs", ["rasterize"])],
  },
  {
    ...shared,
    entry: { node: "src/node.ts" },
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".js", ["rasterize"])],
  },
  // ── Vue 3 components (qrdx/vue), on the shared core ─────────────────────
  // A render function, not a .vue file, so no Vue compiler is needed here.
  {
    ...shared,
    entry: { vue: "src/vue.ts" },
    format: ["esm"],
    treeshake: true,
    external: [...(shared.external ?? []), "vue"],
    esbuildPlugins: [sharedCore(".mjs", [])],
  },
  {
    ...shared,
    entry: { vue: "src/vue.ts" },
    format: ["cjs"],
    treeshake: true,
    external: [...(shared.external ?? []), "vue"],
    esbuildPlugins: [sharedCore(".js", [])],
  },
  // ── Svelte action (qrdx/svelte), on the shared core ─────────────────────
  // An action is a plain function and the file imports nothing from Svelte,
  // so no Svelte compiler runs and svelte isn't even an external.
  {
    ...shared,
    entry: { svelte: "src/svelte.ts" },
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".mjs", [])],
  },
  {
    ...shared,
    entry: { svelte: "src/svelte.ts" },
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".js", [])],
  },
  // ── qrdx/types (schemas + helpers, no React) ────────────────────────────
  {
    ...shared,
    entry: { "types/index": "types/public.ts" },
    format: ["cjs", "esm"],
    treeshake: true,
  },
  // ── Legacy build (see `legacy` above), laid out like the modern one ─────
  // The main entry, with the client component and the schemas as files of
  // their own, as above.
  {
    ...legacy,
    entry: ["src/index.tsx"],
    esbuildPlugins: [
      clientEntryExternal(".js"),
      legacyFrameData,
      schemasExternal(".js"),
    ],
    onSuccess: leaveJsPDFToTheBrowser("index.js"),
  },
  { ...legacy, entry: ["src/qr-code-canvas.tsx"], treeshake: false },
  {
    ...legacy,
    entry: { schemas: "types/schemas.ts" },
    noExternal: ["zod"],
    esbuildPlugins: [dropZodLocales],
  },
  {
    ...legacy,
    entry: { core: "src/core.ts" },
    esbuildPlugins: [legacyFrameData, schemasExternal(".js")],
    onSuccess: leaveJsPDFToTheBrowser("core.js"),
  },
  {
    ...legacy,
    entry: { vanilla: "src/vanilla.ts" },
    esbuildPlugins: [sharedCore(".js", ["vanilla-api"])],
  },
  {
    ...legacy,
    entry: {
      element: "src/element.ts",
      preact: "src/preact.ts",
      solid: "src/solid.ts",
      svelte: "src/svelte.ts",
      vue: "src/vue.ts",
    },
    external: [...(shared.external ?? []), "preact", /^solid-js(\/|$)/, "vue"],
    esbuildPlugins: [sharedCore(".js", [])],
  },
  {
    ...legacy,
    entry: { "element-define": "src/element-define.ts" },
    esbuildPlugins: [elementExternal("element.js"), sharedCore(".js", [])],
  },
]);

"use strict";
// Run by scripts/legacy-compat.mjs inside a folder where npm installed the
// packed qrdx next to webpack 4 and the Babel setup of react-scripts 4.0.3.
// Builds every app/*.js with the JavaScript part of react-scripts 4's
// production webpack config, for the browsers in BROWSERSLIST, runs each
// bundle in a DOM (jsdom, at the path in QRDX_JSDOM) and prints JSON:
//
//   { errors, warnings, lowered, results: { <app>: markup }, failed: { <app>: message } }
//
// `lowered` says whether Babel turned the async functions into generators
// (it does for older browsers), which is when an await leaves its try block.
const { readdirSync, readFileSync } = require("node:fs");
const { basename, join } = require("node:path");
// biome-ignore lint/correctness/noUndeclaredDependencies: npm installs it next to qrdx in the check's own folder
const TerserPlugin = require("terser-webpack-plugin");
// biome-ignore lint/correctness/noUndeclaredDependencies: npm installs it next to qrdx in the check's own folder
const webpack = require("webpack");
const { JSDOM } = require(process.env.QRDX_JSDOM);

const app = join(__dirname, "app");
const output = join(__dirname, "build", process.env.QRDX_MODE ?? "default");
const entries = Object.fromEntries(
  readdirSync(app)
    .filter((file) => file.endsWith(".js"))
    .map((file) => [basename(file, ".js"), join(app, file)])
);

// From react-scripts 4.0.3's config/webpack.config.js, production: the
// resolve extensions, the two babel-loader rules (the app, then every other
// .js or .mjs file, node_modules included), no rule that changes how .mjs
// files are parsed, and Terser with its options.
const config = {
  mode: "production",
  devtool: false,
  performance: false,
  entry: entries,
  output: {
    path: output,
    filename: "[name].js",
    chunkFilename: "[name].[contenthash:8].chunk.js",
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          parse: { ecma: 8 },
          compress: { ecma: 5, warnings: false, comparisons: false, inline: 2 },
          mangle: { safari10: true },
          output: { ecma: 5, comments: false, ascii_only: true },
        },
      }),
    ],
  },
  resolve: {
    extensions: [
      "web.mjs",
      "mjs",
      "web.js",
      "js",
      "json",
      "web.jsx",
      "jsx",
    ].map((extension) => `.${extension}`),
  },
  module: {
    strictExportPresence: true,
    rules: [
      { parser: { requireEnsure: false } },
      {
        oneOf: [
          {
            test: /\.(js|mjs|jsx)$/,
            include: app,
            loader: require.resolve("babel-loader"),
            options: {
              babelrc: false,
              configFile: false,
              presets: [
                [
                  require.resolve("babel-preset-react-app"),
                  { runtime: "classic" },
                ],
              ],
              cacheDirectory: false,
              compact: true,
            },
          },
          {
            test: /\.(js|mjs)$/,
            exclude: /@babel(?:\/|\\{1,2})runtime/,
            loader: require.resolve("babel-loader"),
            options: {
              babelrc: false,
              configFile: false,
              compact: false,
              presets: [
                [
                  require.resolve("babel-preset-react-app/dependencies"),
                  { helpers: true },
                ],
              ],
              cacheDirectory: false,
              sourceMaps: false,
            },
          },
        ],
      },
    ],
  },
};

/** The first line of a webpack error or warning, with the module it's in. */
const describe = (problem) =>
  typeof problem === "string"
    ? problem.split("\n").slice(0, 2).join(" ").trim()
    : String(problem);

const tick = () => new Promise((done) => setTimeout(done, 20));

async function runBundle(file) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "http://localhost/",
  });
  const logged = [];
  for (const level of ["error", "warn"]) {
    dom.window.console[level] = (...args) => logged.push(args.join(" "));
  }
  try {
    dom.window.eval(readFileSync(join(output, file), "utf8"));
    // <qrdx-code> draws in a microtask
    await tick();
    const markup = dom.window.qrdxResult();
    if (logged.length > 0) {
      throw new Error(`logged: ${logged[0].split("\n")[0]}`);
    }
    return markup;
  } finally {
    dom.window.close();
  }
}

webpack(config, async (error, stats) => {
  if (error) {
    console.log(JSON.stringify({ errors: [String(error.stack ?? error)] }));
    return;
  }
  const json = stats.toJson({ all: false, errors: true, warnings: true });
  const report = {
    errors: json.errors.map(describe),
    warnings: json.warnings.map(describe),
    lowered: false,
    results: {},
    failed: {},
  };
  if (report.errors.length === 0) {
    for (const name of Object.keys(entries)) {
      const file = `${name}.js`;
      const code = readFileSync(join(output, file), "utf8");
      // babel-preset-react-app's regenerator runtime, which replaces async
      // functions when the browsers lack them
      if (code.includes("GeneratorFunction")) {
        report.lowered = true;
      }
      try {
        report.results[name] = await runBundle(file);
      } catch (failure) {
        report.failed[name] = String(failure?.stack ?? failure)
          .split("\n")
          .slice(0, 3)
          .join(" | ");
      }
    }
  }
  console.log(JSON.stringify(report));
});

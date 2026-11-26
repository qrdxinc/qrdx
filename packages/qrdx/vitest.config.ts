import type { ViteUserConfig } from "vitest/config";

// *.dom.test.ts files run against frameworks' browser builds: solid-js,
// solid-js/web and svelte resolve to their server builds under Node's
// conditions, so these tests resolve with the "browser" condition, and the
// frameworks are inlined so the test, the adapter and the framework's other
// modules share one copy of it (svelte's esm-env flags included).
const DOM_TESTS = "tests/**/*.dom.test.{ts,tsx}";

const config: ViteUserConfig = {
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    testTimeout: 30_000,
    // Vitest keeps its module cache in node_modules/.vitest-cache at the
    // workspace root, shared by every package by default. The pre-push hook
    // runs several packages' tests at once and they cleared it under each
    // other (ENOTEMPTY), so each package keeps its own (projects inherit it).
    fsModuleCachePath: `${import.meta.dirname}/node_modules/.vitest-cache`,
    projects: [
      {
        extends: true,
        test: {
          name: "qrdx",
          environment: "node",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: [DOM_TESTS],
        },
      },
      {
        extends: true,
        resolve: { conditions: ["browser"] },
        test: {
          name: "dom",
          include: [DOM_TESTS],
          environment: "jsdom",
          server: {
            deps: { inline: [/solid-js/, /[\\/]svelte[\\/]/, /esm-env/] },
          },
        },
      },
    ],
  },
};

export default config;

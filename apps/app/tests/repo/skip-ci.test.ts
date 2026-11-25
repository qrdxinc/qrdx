// Vercel's ignored build step (scripts/skip-ci.js): only production (main)
// builds; [skip ci] skips everything. No push creates a deployment at all
// (vercel.json git.deploymentEnabled): production deploys on a timer from
// .github/workflows/production-deploy.yml, which the last tests check.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { shouldSkip } = require("../../scripts/skip-ci.js") as {
  shouldSkip: (input: {
    message: string;
    env?: string;
    branch?: string;
    changedFiles?: string[] | null;
  }) => {
    skip: boolean;
    reason: string;
  };
};

describe("skip-ci", () => {
  it("builds production", () => {
    expect(
      shouldSkip({
        message: "Merge release",
        env: "production",
        branch: "main",
      }).skip,
    ).toBe(false);
  });

  it("skips staging and every preview", () => {
    for (const branch of ["staging", "preview/x", "feat/x"]) {
      expect(
        shouldSkip({ message: "feat: x", env: "preview", branch }).skip,
        branch,
      ).toBe(true);
    }
  });

  it("skips a change to the docs site alone, production included", () => {
    const production = {
      message: "Merge release",
      env: "production",
      branch: "main",
    };
    expect(
      shouldSkip({
        ...production,
        changedFiles: [
          "apps/docs/app/robots.ts",
          ".github/workflows/docs-deploy.yml",
        ],
      }).skip,
    ).toBe(true);
    // The docs' content is the docs site's.
    expect(
      shouldSkip({
        ...production,
        changedFiles: [
          "apps/docs/content/docs/index.mdx",
          "apps/docs/content/docs/help/meta.json",
        ],
      }).skip,
    ).toBe(true);
    // Anything else the main app might use builds.
    for (const changedFiles of [
      ["apps/docs/app/robots.ts", "apps/app/messages/en.json"],
      ["apps/docs/package.json", "bun.lock"],
      ["packages/i18n/docs.ts"],
      // No previous deployment, or git couldn't tell.
      [],
      null,
    ]) {
      expect(shouldSkip({ ...production, changedFiles }).skip).toBe(false);
    }
  });

  it("skips anything with [skip ci], production included", () => {
    expect(
      shouldSkip({
        message: "docs [skip ci]",
        env: "production",
        branch: "main",
      }).skip,
    ).toBe(true);
  });
});

// No push creates a Vercel deployment (vercel.json git.deploymentEnabled);
// production deploys from .github/workflows/production-deploy.yml, which
// asks Vercel to build main and runs this same check before it does.
const vercelJson = JSON.parse(
  readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
) as { git?: { deploymentEnabled?: unknown } };
const productionDeploy = readFileSync(
  new URL(
    "../../../../.github/workflows/production-deploy.yml",
    import.meta.url,
  ),
  "utf8",
);
const productionBuild = readFileSync(
  new URL(
    "../../../../.github/actions/vercel-production-build/action.yml",
    import.meta.url,
  ),
  "utf8",
);

describe("production deploys", () => {
  it("never come from a push (vercel.json git.deploymentEnabled)", () => {
    expect(vercelJson.git?.deploymentEnabled).toBe(false);
  });

  it("come from production-deploy.yml, which builds main after this check", () => {
    expect(productionDeploy).toContain(
      'require("./apps/app/scripts/skip-ci.js")',
    );
    expect(productionDeploy).toMatch(/^\s+ref: main$/m);
    expect(productionDeploy).toContain(
      "uses: ./.github/actions/vercel-production-build",
    );
    expect(productionBuild).toContain('target: "production"');
    expect(productionDeploy).toMatch(/^\s+- cron: "[^"]+"$/m);
  });
});

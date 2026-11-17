// The client portal, white-label pages and conversion tracking are in ee/
// under the QRdx commercial licence. The AGPL app reaches them only through
// the entry points listed here: thin route wrappers, one gate per feature
// (access.ts) and a few components and queries it renders where the feature
// is available. A new import from AGPL code into these folders has to be
// added below on purpose, so the seam stays small and one-directional.
// Packages never import the app's ee/ code.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.resolve(import.meta.dirname, "../..");
const REPO = path.resolve(APP, "../..");
const FEATURES = ["client-portal", "white-label", "conversions"] as const;
const SKIP = new Set([
  "node_modules",
  ".next",
  ".source",
  "ee",
  "tests",
  "e2e",
  "public",
]);

/** AGPL file (relative to apps/app) → the ee modules it imports. */
const SEAM: Record<string, string[]> = {
  // Conversion tracking
  "actions/code-marketing.ts": ["conversions/access"],
  "app/(app)/dashboard/[workspace]/analytics/page.tsx": [
    "conversions/access",
    "conversions/analytics-cards",
    "conversions/queries",
  ],
  "app/(app)/dashboard/codes/[id]/_components/analytics-extra.tsx": [
    "conversions/analytics-cards",
    "conversions/queries",
  ],
  "app/(app)/dashboard/codes/[id]/_components/pixels-panel.tsx": [
    "conversions/conversions-section",
  ],
  "app/api/v1/conversions/route.ts": ["conversions/api"],
  "app/conversions.js/route.ts": ["conversions/script"],
  // Generating the OpenAPI document (not the running app)
  "lib/openapi/document.ts": ["conversions/schemas"],
  // Client portal and client reports
  "app/(app)/dashboard/[workspace]/settings/clients/page.tsx": [
    "client-portal/settings-page",
  ],
  "app/(app)/dashboard/codes/_components/share-stats-dialog.tsx": [
    "client-portal/stats-branding-section",
  ],
  "app/(app)/portal/[workspace]/page.tsx": ["client-portal/portal-home-page"],
  "app/(app)/portal/[workspace]/codes/[id]/page.tsx": [
    "client-portal/portal-code-page",
  ],
  "app/(app)/stats/[token]/og/route.ts": ["client-portal/stats-og"],
  "app/(app)/stats/[token]/page.tsx": ["client-portal/stats-metadata"],
  "app/(app)/stats/[token]/public-stats-view.tsx": ["client-portal/brand-mark"],
  "lib/public-stats.ts": ["client-portal/stats-page"],
  // White-label and custom CSS on hosted pages: the server gate (access.ts)
  // and the editor's controls (editor.tsx). The page model and the renderer
  // only receive decided values.
  "app/(app)/p/_lib/public-page.ts": ["white-label/access"],
  "app/(app)/p/[slug]/page.tsx": ["white-label/access"],
  "app/(app)/dashboard/pages/_lib/landing-pages.ts": ["white-label/access"],
  "app/(app)/dashboard/[workspace]/pages/[id]/page.tsx": ["white-label/access"],
  "app/(app)/dashboard/[workspace]/codes/[id]/change-type/page.tsx": [
    "white-label/access",
  ],
  "components/landing/editor/branding-section.tsx": ["white-label/editor"],
  "components/landing/editor/page-editor.tsx": ["white-label/editor"],
  "components/landing/editor/page-settings-editor.tsx": ["white-label/editor"],
};

const IMPORT = new RegExp(
  `(?:from\\s+|import\\s*\\(\\s*)["']@/ee/((?:${FEATURES.join("|")})/[^"']+)["']`,
  "g",
);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(?:ts|tsx|mts|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...new Set([...text.matchAll(IMPORT)].map((match) => match[1]))]
    .map((specifier) => specifier.replace(/\.(?:ts|tsx)$/, ""))
    .sort();
}

describe("the AGPL app's seam into the three ee/ features", () => {
  it("imports them only through the listed entry points", () => {
    const found: Record<string, string[]> = {};
    for (const file of sourceFiles(APP)) {
      const modules = importsOf(file);
      if (modules.length > 0) found[path.relative(APP, file)] = modules;
    }
    const expected = Object.fromEntries(
      Object.entries(SEAM).map(([file, modules]) => [
        file,
        [...modules].sort(),
      ]),
    );
    expect(found).toEqual(expected);
  });

  it("lists entry points that exist", () => {
    for (const modules of Object.values(SEAM)) {
      for (const module of modules) {
        const base = path.join(APP, "ee", module);
        const exists = [".ts", ".tsx"].some((ext) => {
          try {
            readFileSync(`${base}${ext}`);
            return true;
          } catch {
            return false;
          }
        });
        expect(exists, module).toBe(true);
      }
    }
  });

  it("keeps the packages free of the app's ee/ code", () => {
    const packages = sourceFiles(path.join(REPO, "packages"));
    const offenders = packages.filter((file) =>
      /(?:from\s+|import\s*\(\s*)["'](?:@\/ee\/|[^"']*apps\/app\/ee\/)/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(offenders.map((file) => path.relative(REPO, file))).toEqual([]);
  });
});

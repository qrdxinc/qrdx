// The code builder and the editor open over /[lang]/playground, so the code,
// page, domain, tag and barcode actions they call answer in the language
// their page sends (lib/code-actions/messages-server.ts). Without it they'd
// fall back to the app's language: Spanish on an English page for someone
// whose cookie says Spanish, English on /es/playground for someone with no
// cookie. So every call to them from a client module passes the page's
// useLocale() (`locale`), and so do the routes the editor's Dynamic toggle
// and the barcode generator post to, and getCodeOptions to the actions it
// runs. Server components of the code page aren't checked: they render in
// the app's language, which is what the actions use without one.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** The actions (and the routes' client calls), and where the language goes. */
const ACTIONS: Record<string, (args: string[]) => string | undefined> = {
  createQrCode: (args) => args[2],
  updateQrCode: (args) => args[1],
  getQrCode: (args) => args[1],
  listQrCodes: (args) => args[1],
  checkQrCodeSlug: (args) => args[1],
  setQrCodeTags: (args) => args[1],
  createCodeTag: (args) => args[1],
  moveQrCodes: (args) => args[1],
  suggestCodeDetailsAction: (args) => args[1],
  saveBarcode: (args) => args[1],
  listBarcodeFolders: (args) => args[0],
  getCodeOptions: (args) => args[1],
  getCodeLifecycle: (args) => args[1],
  updateCodeLifecycle: (args) => args[1],
  setCodePaused: (args) => args[1],
  getCodeMarketing: (args) => args[1],
  saveCodeRouting: (args) => args[1],
  saveCodeUtm: (args) => args[1],
  saveCodePixels: (args) => args[1],
  testCodeRouting: (args) => args[1],
  getCustomDomainOptions: (args) => args[0],
  createLandingPage: (args) => args[1],
  getLandingPageUsage: (args) => args[0],
  getPathAliases: (args) => args[1],
  addPathAlias: (args) => args[1],
  removePathAlias: (args) => args[1],
  getUtmTemplates: (args) => args[0],
  saveUtmTemplate: (args) => args[1],
  renameUtmTemplateAction: (args) => args[1],
  deleteUtmTemplateAction: (args) => args[1],
  // lib/widget-routes/client.ts, in front of createQrCode, updateQrCode and
  // saveBarcode
  createDynamicCode: (args) => args[1],
  updateDynamicCode: (args) => args[1],
  saveGeneratorBarcode: (args) => args[1],
  // The builder's helpers around them (components/code-builder/services.ts)
  builderServices: (args) => args[0],
  playgroundBuilderServices: (args) => args[0],
  loadCodeForEdit: (args) => args[2],
  // An options object: { destination, styles, userId, locale }
  makeDynamic: (args) => args[0],
};

/** Where they're defined, not called. */
const DEFINITIONS = new Set([
  "actions/qr-codes.ts",
  "actions/tags.ts",
  "actions/bulk-codes.ts",
  "actions/code-suggestions.ts",
  "actions/barcodes.ts",
  "actions/code-lifecycle.ts",
  "actions/code-marketing.ts",
  "actions/custom-domains.ts",
  "actions/landing-pages.ts",
  "actions/path-aliases.ts",
  "actions/utm-templates.ts",
  "lib/widget-routes/client.ts",
]);

/** Server modules that must pass the page's language on as well. */
const SERVER_CALLERS = new Set([
  "app/(app)/dashboard/codes/_lib/code-option-actions.ts",
  "app/api/playground/codes/route.ts",
  "app/api/playground/codes/[id]/route.ts",
  "app/api/barcodes/route.ts",
]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) {
      return name === "node_modules" || name.startsWith(".")
        ? []
        : sources(file);
    }
    return /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [file] : [];
  });
}

/** The top-level arguments of the call whose "(" is at `open`. */
function argumentsAt(source: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let index = open; index < source.length; index++) {
    const char = source[index];
    if (char === "(" || char === "{" || char === "[") depth++;
    else if (char === ")" || char === "}" || char === "]") {
      depth--;
      if (depth === 0) {
        args.push(source.slice(start, index));
        return args.map((arg) => arg.trim()).filter(Boolean);
      }
    } else if (char === "," && depth === 1) {
      args.push(source.slice(start, index));
      start = index + 1;
    }
  }
  throw new Error("unbalanced call");
}

/** The source without comments and import statements. */
const code = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^import[\s\S]*?from\s+"[^"]+";$/gm, "");

const checked = ["app", "components", "lib", "ee"]
  .flatMap((dir) => sources(path.join(ROOT, dir)))
  .flatMap((file) => {
    const relative = path.relative(ROOT, file);
    if (DEFINITIONS.has(relative)) return [];
    const source = readFileSync(file, "utf8");
    const client = /^\s*["']use client["']/.test(source);
    return client || SERVER_CALLERS.has(relative)
      ? [{ relative, source: code(source) }]
      : [];
  });

const calls = checked.flatMap(({ relative, source }) =>
  Object.keys(ACTIONS).flatMap((name) =>
    [...source.matchAll(new RegExp(`(?<![.\\w])${name}\\(`, "g"))]
      .filter((match) => !/function\s+$/.test(source.slice(0, match.index)))
      .map((match) => ({
        where: `${relative}: ${name}`,
        name,
        args: argumentsAt(source, (match.index ?? 0) + name.length),
      })),
  ),
);

/**
 * Handed on as a value but called with the page's language all the same:
 * makeDynamic's `create` (a fake in tests) defaults to createDynamicCode and
 * is called with `input.locale` (tests/code-builder/playground.test.ts).
 */
const PASSED_ON = new Set([
  "components/editor/dynamic-link-toggle.tsx: createDynamicCode",
]);

/** An action handed on as a value (so its calls escape the check above). */
const references = checked.flatMap(({ relative, source }) => {
  const withoutStrings = source.replace(
    /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g,
    '""',
  );
  return Object.keys(ACTIONS).flatMap((name) =>
    [
      ...withoutStrings.matchAll(
        new RegExp(
          `(?<![.\\w])(?<!typeof\\s)(?<!function\\s)(?<!const\\s)${name}\\b(?!\\s*[(:])`,
          "g",
        ),
      ),
    ]
      .map(() => `${relative}: ${name}`)
      .filter((where) => !PASSED_ON.has(where)),
  );
});

describe("calls to the code actions that answer in the page's language", () => {
  it("are found", () => {
    // The builder, its option panels and fields, the Dynamic toggle, the
    // barcode generator, the routes and getCodeOptions.
    expect(calls.length).toBeGreaterThanOrEqual(35);
  });

  it("each pass the page's language", () => {
    const missing = calls.filter(({ name, args }) => {
      const language = ACTIONS[name]?.(args);
      return !(
        language &&
        (/\b(locale|pageLocale)\b/.test(language) ||
          /^["']en["']$/.test(language))
      );
    });
    expect(missing.map(({ where }) => where)).toEqual([]);
  });

  it("aren't handed on without it", () => {
    expect(references).toEqual([]);
  });
});

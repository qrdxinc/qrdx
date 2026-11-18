// The actions the editor and the community pages call answer in the
// language their page sends (lib/i18n/action-locale.ts). Without it they'd
// fall back to the app's language: Spanish on an English page for someone
// whose cookie says Spanish, English on /es/playground for someone with no
// cookie. So every call to them in the app's code passes a language: the
// page's useLocale() (`locale`), or English where the answer goes to the AI
// model.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** The actions, and the argument that carries the page's language. */
const ACTIONS: Record<string, (args: string[]) => string | undefined> = {
  publishCommunityFrame: (args) => args[1],
  publishCommunityThemeFrame: (args) => args[1],
  publishCommunityDesign: (args) => args[1],
  importCommunityFrameSvg: (args) => args[1],
  toggleCommunityLike: (args) => args[1],
  getCodeBuilderData: (args) => args[0],
  createTheme: (args) => args[1],
  // An options object: { acceptLicense, locale }
  publishTheme: (args) => args[2],
};

/** Where the actions are defined, not called. */
const DEFINITIONS = new Set([
  "actions/community.ts",
  "actions/community-themes.ts",
  "actions/qr-themes.ts",
  "components/code-builder/actions.ts",
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

const calls = ["app", "components", "lib"]
  .flatMap((dir) => sources(path.join(ROOT, dir)))
  .flatMap((file) => {
    const relative = path.relative(ROOT, file);
    if (DEFINITIONS.has(relative)) return [];
    const source = readFileSync(file, "utf8");
    return Object.keys(ACTIONS).flatMap((name) =>
      [...source.matchAll(new RegExp(`\\b${name}\\(`, "g"))]
        .filter((match) => !/function\s+$/.test(source.slice(0, match.index)))
        .map((match) => ({
          where: `${relative}: ${name}`,
          name,
          args: argumentsAt(source, (match.index ?? 0) + name.length),
        })),
    );
  });

describe("calls to the actions that answer in the page's language", () => {
  it("are found", () => {
    // The editor, the community pages, the Themes page, the code builder.
    expect(calls.length).toBeGreaterThanOrEqual(10);
  });

  it("each pass the page's language", () => {
    const missing = calls.filter(({ name, args }) => {
      const language = ACTIONS[name]?.(args);
      return !(
        language &&
        (/\blocale\b/.test(language) || /^["']en["']$/.test(language))
      );
    });
    expect(missing.map(({ where }) => where)).toEqual([]);
  });
});

// No cut stars anywhere (owner, 17 Nov 2026). iconsax's Star1 draws its
// filled star (Bold, Bulk) split in two halves, and StarSlash cuts its star
// with the slash. Every star in the UI comes from Star in
// @repo/design-system/components/icons instead (variant="Bold" fills it).
// This fails when a source file in apps/, packages/, plugins/ or skills/
// imports either one from iconsax-reactjs.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const ROOTS = ["apps", "packages", "plugins", "skills"];
const BANNED = ["Star1", "StarSlash"];
const SOURCE = /\.(?:[cm]?[jt]sx?|mdx)$/;
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  ".source",
  ".vercel",
  ".output",
  "coverage",
  // Capacitor's generated native projects (copies of the web build).
  "ios",
  "android",
]);
// This file names the banned icons in its own examples.
const SELF = import.meta.filename;

const ICONSAX = `["']iconsax-reactjs(?:/[^"']*)?["']`;
// import { A, B as C } from "iconsax-reactjs" (also `import D, {…}` and
// `export {…} from`).
const NAMED = new RegExp(
  String.raw`\b(?:import|export)\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*${ICONSAX}`,
  "g",
);
// import * as Icons from "iconsax-reactjs"
const NAMESPACE = new RegExp(
  String.raw`\bimport\s+\*\s+as\s+([\w$]+)\s+from\s*${ICONSAX}`,
  "g",
);
// const { A } = require("iconsax-reactjs") / await import("iconsax-reactjs")
const DESTRUCTURED = new RegExp(
  String.raw`\{([^}]*)\}\s*=\s*(?:await\s+)?(?:require|import)\(\s*${ICONSAX}\s*\)`,
  "g",
);
// "iconsax-reactjs/…/Star1"
const DEEP = /["']iconsax-reactjs\/[^"']*?\b(Star1|StarSlash)\b[^"']*["']/g;

const escapeRegExp = (text: string) =>
  text.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");

/** The specifier names of an import list: `A, type B, C as D` → A, B, C. */
const importedNames = (list: string) =>
  list
    .split(",")
    .map((spec) =>
      (
        spec
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+|\s*:\s*/)[0] ?? ""
      ).trim(),
    )
    .filter(Boolean);

/** The banned iconsax stars a source file imports, in order found. */
function cutStars(source: string): string[] {
  const found: string[] = [];
  for (const pattern of [NAMED, DESTRUCTURED]) {
    for (const match of source.matchAll(pattern)) {
      found.push(
        ...importedNames(match[1] ?? "").filter((name) =>
          BANNED.includes(name),
        ),
      );
    }
  }
  for (const match of source.matchAll(NAMESPACE)) {
    const ns = escapeRegExp(match[1] ?? "");
    for (const name of BANNED) {
      const member = new RegExp(
        String.raw`\b${ns}\s*(?:\.\s*${name}\b|\[\s*["']${name}["']\s*\])`,
      );
      if (member.test(source)) {
        found.push(name);
      }
    }
  }
  for (const match of source.matchAll(DEEP)) {
    found.push(match[1] ?? "");
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...sourceFiles(path));
      }
    } else if (SOURCE.test(entry.name) && path !== SELF) {
      files.push(path);
    }
  }
  return files;
}

describe("no cut stars", () => {
  it("the matcher finds every way of importing a banned star", () => {
    expect(cutStars(`import { Star1 } from "iconsax-reactjs";`)).toEqual([
      "Star1",
    ]);
    expect(
      cutStars(
        `import {\n  Global,\n  StarSlash as StarOff,\n  Tag2,\n} from 'iconsax-reactjs';`,
      ),
    ).toEqual(["StarSlash"]);
    expect(
      cutStars(`import { type Icon, Star1 } from "iconsax-reactjs";`),
    ).toEqual(["Star1"]);
    expect(cutStars(`export { Star1 as Fav } from "iconsax-reactjs";`)).toEqual(
      ["Star1"],
    );
    expect(
      cutStars(`import * as Icons from "iconsax-reactjs";\n<Icons.Star1 />`),
    ).toEqual(["Star1"]);
    expect(
      cutStars(`const { StarSlash: Off } = require("iconsax-reactjs");`),
    ).toEqual(["StarSlash"]);
    expect(
      cutStars(`import Star from "iconsax-reactjs/dist/esm/icons/Star1";`),
    ).toEqual(["Star1"]);
  });

  it("whole stars and lookalike names pass", () => {
    expect(
      cutStars(
        `import { MagicStar, Star, TicketStar } from "iconsax-reactjs";`,
      ),
    ).toEqual([]);
    expect(
      cutStars(`import { Star } from "@repo/design-system/components/icons";`),
    ).toEqual([]);
    expect(cutStars(`const category = { icon: "Star1" };`)).toEqual([]);
    expect(
      cutStars(`import * as Icons from "iconsax-reactjs";\n<Icons.Star />`),
    ).toEqual([]);
  });

  it("no source file imports Star1 or StarSlash from iconsax-reactjs", () => {
    const files = ROOTS.flatMap((root) => sourceFiles(join(REPO, root)));
    // A wrong REPO path would scan nothing and pass.
    expect(files.length).toBeGreaterThan(1000);
    const offenders = files.flatMap((file) => {
      const names = cutStars(readFileSync(file, "utf8"));
      return names.length > 0
        ? [`${relative(REPO, file)}: ${names.join(", ")}`]
        : [];
    });
    expect(
      offenders,
      'Use Star from @repo/design-system/components/icons (variant="Bold" for a filled star).',
    ).toEqual([]);
  });
});

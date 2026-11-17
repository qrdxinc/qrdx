// A "use client" component that imports server actions from a module
// without "use server" pulls that module, and everything it imports
// (server-only code, the database, secrets), into the client bundle, and
// `next build` fails ("'server-only' cannot be imported from a Client
// Component module"). Vitest and tsc can't see it, and CI doesn't build the
// app, so this checks the source: every actions module (by name) that a
// client module imports, and that isn't a client component itself, starts
// with "use server".
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.resolve(import.meta.dirname, "../..");
const SKIP = new Set(["node_modules", ".next", "tests", "public", ".source"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")
      ? [full]
      : [];
  });
}

/** The file's first statement is this directive (comments may come first). */
function hasDirective(source: string, directive: string): boolean {
  const code = source.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return new RegExp(`^["']${directive}["'];?`).test(code);
}

/** Static import specifiers of `source`. */
function specifiers(source: string): string[] {
  return [
    ...source.matchAll(/\bimport\s+(?!type\b)[^;'"]*?from\s*["']([^"']+)["']/g),
  ].map((match) => match[1] as string);
}

/** A local specifier resolved to a file, or null for a package. */
function resolve(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(APP, specifier.slice(2));
  else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(from), specifier);
  } else return null;
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    base,
  ]) {
    if (existsSync(candidate) && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

/**
 * An actions module by name: actions.ts, *-actions.ts, or a .ts file under
 * an actions/ folder. (.tsx files named so are components and hooks.)
 */
const isActionsModule = (file: string) =>
  file.endsWith(".ts") &&
  (/(?:^|[-/])actions\.ts$/.test(file) ||
    file.split(path.sep).includes("actions"));

describe("server action modules", () => {
  const files = sourceFiles(APP);
  const sources = new Map(
    files.map((file) => [file, readFileSync(file, "utf8")]),
  );

  const imported = new Map<string, string[]>();
  for (const [file, source] of sources) {
    if (!hasDirective(source, "use client")) continue;
    for (const specifier of specifiers(source)) {
      const target = resolve(file, specifier);
      // Components named *-actions.tsx are client modules themselves.
      if (
        target &&
        isActionsModule(target) &&
        !hasDirective(sources.get(target) ?? "", "use client")
      ) {
        imported.set(target, [...(imported.get(target) ?? []), file]);
      }
    }
  }

  it("finds the admin pages' actions among them", () => {
    expect(
      [...imported.keys()].map((file) => path.relative(APP, file)),
    ).toEqual(
      expect.arrayContaining([
        "app/(app)/admin/actions.ts",
        "app/(app)/admin/users/support-actions.ts",
        "app/(app)/admin/codes/actions.ts",
        "app/(app)/admin/abuse/actions.ts",
        "app/(app)/admin/affiliates/actions.ts",
      ]),
    );
  });

  it('start with "use server" when a client module imports them', () => {
    const missing = [...imported.entries()]
      .filter(([file]) => !hasDirective(sources.get(file) ?? "", "use server"))
      .map(
        ([file, by]) =>
          `${path.relative(APP, file)} (imported by ${by.map((f) => path.relative(APP, f)).join(", ")})`,
      );
    expect(missing).toEqual([]);
  });

  it("reads the directive as Next does", () => {
    expect(
      hasDirective('"use server";\nimport x from "y";', "use server"),
    ).toBe(true);
    expect(
      hasDirective("// note\n/* more */\n'use server'\n", "use server"),
    ).toBe(true);
    expect(
      hasDirective('import x from "y";\n"use server";', "use server"),
    ).toBe(false);
    expect(isActionsModule("/a/app/(app)/admin/users/support-actions.ts")).toBe(
      true,
    );
    expect(isActionsModule("/a/lib/transactions.ts")).toBe(false);
    expect(isActionsModule("/a/lib/hooks/use-dialog-actions.tsx")).toBe(false);
  });
});

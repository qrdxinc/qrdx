import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every legal page says when it last changed in substance: `lastUpdated`
// (YYYY-MM-DD) in its frontmatter, set by hand with the change, which the
// page shows (app/(app)/(home)/legal/[[...slug]]/page.tsx) and
// source.config.ts requires. Git's dates aren't used: a shallow clone, as on
// Vercel, dates every file by the clone.
const LEGAL = join(__dirname, "..", "..", "content", "legal");
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The frontmatter's `lastUpdated` value, as written. */
function lastUpdated(file: string): string | null {
  const source = readFileSync(join(LEGAL, file), "utf8");
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(source)?.[1] ?? "";
  return /^lastUpdated:\s*(.+?)\s*$/m.exec(frontmatter)?.[1] ?? null;
}

const pages = readdirSync(LEGAL).filter((file) => file.endsWith(".mdx"));

describe("the legal pages' lastUpdated", () => {
  it("covers every legal page", () => {
    expect(pages.length).toBeGreaterThan(5);
  });

  it.each(pages)("%s has a real day, not in the future", (file) => {
    const day = lastUpdated(file);
    expect(day, file).toMatch(DAY);
    const date = new Date(`${day}T00:00:00Z`);
    // A real calendar day (2026-02-30 would roll over to March).
    expect(date.toISOString().slice(0, 10), file).toBe(day);
    expect(date.getTime(), file).toBeLessThanOrEqual(Date.now());
    expect(date.getUTCFullYear(), file).toBeGreaterThanOrEqual(2025);
  });

  it("is what the page shows, not git's date", () => {
    const page = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "app",
        "(app)",
        "(home)",
        "legal",
        "[[...slug]]",
        "page.tsx",
      ),
      "utf8",
    );
    expect(page).toContain("lastUpdated");
    expect(page).not.toContain("lastModified");
  });
});

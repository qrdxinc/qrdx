// Every GitHub Action the workflows use is pinned to a full commit SHA, with
// its version in a comment (`uses: owner/repo@<40 hex> # v1.2.3`), and
// .github/dependabot.yml moves those pins. The HOL plugin scanner, which the
// awesome-ai-plugins catalog runs before listing the plugin, scores a single
// unpinned action as a failed check (.github/workflows/hol-plugin-scanner.yml).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const github = join(import.meta.dirname, "../../../../.github");
const workflows = join(github, "workflows");
const USES = /^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/;

function references(): { file: string; line: number; text: string }[] {
  const found: { file: string; line: number; text: string }[] = [];
  for (const file of readdirSync(workflows)) {
    if (!/\.ya?ml$/.test(file)) {
      continue;
    }
    const lines = readFileSync(join(workflows, file), "utf8").split("\n");
    lines.forEach((text, index) => {
      if (USES.test(text)) {
        found.push({ file, line: index + 1, text: text.trim() });
      }
    });
  }
  return found;
}

describe("GitHub Actions", () => {
  it("are pinned to a commit SHA with the version in a comment", () => {
    const all = references();
    expect(all.length).toBeGreaterThan(0);
    const unpinned = all
      .filter(({ text }) => {
        const [, target] = text.match(USES) ?? [];
        return !(target?.startsWith("./") || target?.startsWith("docker://"));
      })
      .filter(
        ({ text }) =>
          !/@[0-9a-f]{40} # v\d+(?:\.\d+){0,2}$/.test(
            text.replace(/^-\s*/, ""),
          ),
      )
      .map(({ file, line, text }) => `${file}:${line}: ${text}`);
    expect(unpinned).toEqual([]);
  });

  it("get their pin updates from Dependabot, into staging", () => {
    const config = readFileSync(join(github, "dependabot.yml"), "utf8");
    expect(config).toMatch(/package-ecosystem:\s*github-actions/);
    expect(config).toMatch(/target-branch:\s*staging/);
  });
});

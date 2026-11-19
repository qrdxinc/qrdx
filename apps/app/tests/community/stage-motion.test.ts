// How community previews move (components/community/stage.module.css): on
// hover only where the device can hover with a fine pointer, on keyboard
// focus anywhere, never with reduced motion; transform, opacity and filter
// only, on one shared ease-out curve.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(import.meta.dirname, "../../components/community/stage.module.css"),
  "utf8",
);

/** The text of each top-level @media block, by its query. */
const mediaBlocks = () => {
  const blocks: { query: string; body: string }[] = [];
  const pattern = /@media ([^{]+)\{/g;
  for (const match of css.matchAll(pattern)) {
    let depth = 1;
    let index = (match.index ?? 0) + match[0].length;
    const start = index;
    while (depth > 0 && index < css.length) {
      if (css[index] === "{") depth++;
      if (css[index] === "}") depth--;
      index++;
    }
    // The query as one line ("( prefers-…\n )" → "(prefers-…)")
    const query = match[1]
      .replace(/\s+/g, " ")
      .replace(/\( /g, "(")
      .replace(/ \)/g, ")")
      .trim();
    blocks.push({ query, body: css.slice(start, index - 1) });
  }
  return blocks;
};

describe("community card motion", () => {
  it("plays on hover only where a fine pointer can hover, without reduced motion", () => {
    const hover = mediaBlocks().filter((block) =>
      block.body.includes(".card:hover"),
    );
    expect(hover.length).toBeGreaterThan(0);
    for (const block of hover) {
      expect(block.query).toContain("(hover: hover)");
      expect(block.query).toContain("(pointer: fine)");
      expect(block.query).toContain("(prefers-reduced-motion: no-preference)");
    }
    // Nothing outside a media block reacts to hover
    const outside = mediaBlocks().reduce(
      (rest, block) => rest.replace(block.body, ""),
      css,
    );
    expect(outside).not.toContain(":hover");
  });

  it("plays on keyboard focus too, the same moves as hover", () => {
    const hovered = [...css.matchAll(/\.card:hover (\.\w+)/g)].map((m) => m[1]);
    const focused = [
      ...css.matchAll(/\.card:has\(a:focus-visible\) (\.\w+)/g),
    ].map((m) => m[1]);
    expect(new Set(focused)).toEqual(new Set(hovered));
  });

  it("keeps everything at rest with reduced motion", () => {
    const reduced = mediaBlocks().find(
      (block) => block.query === "(prefers-reduced-motion: reduce)",
    );
    expect(reduced?.body).toMatch(/transition: none;/);
    for (const name of [
      "frame",
      "swatchCode",
      "phone",
      "pageScroll",
      "piece",
    ]) {
      expect(reduced?.body).toContain(`.${name}`);
    }
  });

  it("moves only transform, opacity and filter, on one ease-out curve", () => {
    const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)].map(
      (m) => m[1],
    );
    for (const value of transitions) {
      if (value.trim() === "none") continue;
      for (const part of value.split(",")) {
        const [property, , curve] = part.trim().split(/\s+/);
        expect(["transform", "opacity", "filter"]).toContain(property);
        expect(curve).toBe("var(--stage-ease)");
      }
    }
    expect(css).toContain("--stage-ease: cubic-bezier(0.23, 1, 0.32, 1);");
    // No looping animations
    expect(css).not.toMatch(/@keyframes|animation:/);
  });
});

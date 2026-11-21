// The official designs the community seed publishes (apps/app/scripts/
// community-seed/designs): the generated file is current, and every design
// clears the gallery's bar without a database:
// - no two are alike (same shapes and the same palette);
// - no scan-risk flag (getStylePairRisk: no weak pair, eye or centre) and
//   enough contrast (dark modules on a light ground at the scan score's
//   ratio, every gradient stop and eye color included);
// - the catalogue is used widely: every body pattern, eye frame and eye
//   centre the editor offers (except circle eyes, which only lenient apps
//   read) appears in at least three designs, and a frame from every
//   official collection appears;
// - names, descriptions and tags pass the publish rules.
// Each design is also rendered and read with every decoder the repo tests
// with, and gated, in tests/database/seed-designs-gate-*.test.ts.
import { FRAME_CATALOG } from "@repo/docs-assets/pattern-catalog";
import {
  getContrastRatio,
  getFrameColors,
  getScanContrast,
  getStylePairRisk,
  OFFICIAL_FRAME_COLLECTIONS,
  OFFICIAL_FRAMES,
  SCAN_CONTRAST_MIN,
} from "qrdx";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  type ColorConfig,
} from "qrdx/types";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

import { themePayloadSchema } from "@/lib/community/payloads";
import { cleanDetails } from "@/lib/community/publish";
import { GATE_SAMPLES } from "@/lib/community/scan-samples";
import { textProblem } from "@/lib/community/text";
import { COMMUNITY_THEME_TAGS } from "@/lib/constants";
import { designQRProps } from "@/lib/qr-design/props";
import { FRAME_TEXT_CONTRAST } from "@/lib/themes/compose";
import type { ThemeStyles } from "@/types/theme";
import * as seed from "../../../../packages/database/scripts/seed-community.mjs";
import {
  buildSeedDesigns,
  OFFICIAL_DESIGNS,
} from "../../scripts/community-seed/designs";
import { writeDesignSheets } from "../support/seed-design-sheets";
import { seededDesigns, shownStyle } from "../support/seed-designs";

/** How many designs the seed publishes; raise it when adding designs. */
const DESIGN_COUNT = 218;
/** Fewest designs each body, eye and centre must appear in. */
const MIN_USES = 3;
/**
 * Contrast a design tagged "accessible" must have between every code color
 * and its background: the enhanced level, well past the 4.5:1 a scan needs.
 */
const ACCESSIBLE_CONTRAST = 7;

const designs = seededDesigns();
const byId = new Map(designs.map((item) => [item.facets.design, item]));

/** The props the scan score checks a design with. */
const propsOf = (style: ThemeStyles) =>
  designQRProps(GATE_SAMPLES[0].value, style, undefined);

const stops = (color: ColorConfig | undefined, fallback: string): string[] => {
  if (!color) return [fallback];
  if (typeof color === "string") return [color];
  if (color.type === "solid") return [color.color];
  if (color.type === "image") return [color.underlay ?? fallback];
  return color.stops.map((stop) => stop.color);
};

/** A color rounded to 16 levels a channel, so near shades read as one. */
const coarse = (hex: string) =>
  hex
    .replace("#", "")
    .toLowerCase()
    .replace(/^(.)(.)(.)$/, "$1$1$2$2$3$3")
    .replace(/(.)./g, "$1");

/** The design's shapes and palette: two designs with the same key are alike. */
function likenessKey(style: ThemeStyles): string {
  const colors = [
    ...stops(style.bgColor, "#ffffff"),
    ...stops(style.fgColor, "#000000"),
    ...stops(style.eyeColor ?? style.fgColor, "#000000"),
    ...stops(style.dotColor ?? style.fgColor, "#000000"),
    ...Object.values(style.eyeColors ?? {}).flatMap((eye) => [
      ...stops(eye?.outer, ""),
      ...stops(eye?.inner, ""),
    ]),
  ];
  const palette = [...new Set(colors.map(coarse))].sort().join(",");
  return `${style.bodyPattern}/${style.cornerEyePattern}/${style.cornerEyeDotPattern}:${palette}`;
}

const LABEL_ON_BACKGROUND = new Set<string>(
  FRAME_CATALOG.filter((frame) => frame.textOnLight).map(
    (frame) => frame.value,
  ),
);

describe("the official designs", () => {
  it("are the generated file, current with the design files", () => {
    expect(
      seed.DESIGN_SEED.themes,
      "Run `bun x tsx scripts/community-seed/generate.ts` in apps/app",
    ).toEqual(buildSeedDesigns());
  });

  it(`publish ${DESIGN_COUNT} designs, each once, with a slug of its own`, () => {
    expect(OFFICIAL_DESIGNS).toHaveLength(DESIGN_COUNT);
    expect(designs).toHaveLength(DESIGN_COUNT);
    expect(DESIGN_COUNT).toBeGreaterThanOrEqual(120);
    const all = seed.buildSeedItems() as { type: string; slug: string }[];
    const slugs = all
      .filter((item) => item.type === "theme")
      .map((item) => item.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const item of designs) {
      expect(item.id).toBe(`ci_official_theme_${item.slug}`);
      expect(item.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("store payloads the app accepts", () => {
    for (const item of designs) {
      const parsed = themePayloadSchema.safeParse(item.payload);
      expect(parsed.success, item.slug).toBe(true);
      const style = item.payload.style;
      expect(style.bodyPattern, item.slug).toBeDefined();
      expect(style.cornerEyePattern, item.slug).toBeDefined();
      expect(style.cornerEyeDotPattern, item.slug).toBeDefined();
      expect(style.level, item.slug).toBeDefined();
      expect(style.margin, item.slug).toBeGreaterThanOrEqual(2);
      if (item.payload.logoIcon) expect(style.showLogo).toBe(true);
      expect(style.customLogo).toBeUndefined();
      expect(style.art).toBeUndefined();
    }
  });

  it("are never alike: no two share their shapes and palette", () => {
    const seen = new Map<string, string>();
    const alike: string[] = [];
    for (const item of designs) {
      const key = likenessKey(item.payload.style);
      const other = seen.get(key);
      if (other) alike.push(`${item.slug} is like ${other}`);
      seen.set(key, item.slug);
    }
    expect(alike).toEqual([]);
  });

  it("carry no scan-risk flag: no weak pair, weak eye or weak centre", () => {
    const flagged = designs.flatMap((item) => {
      const risk = getStylePairRisk(propsOf(shownStyle(item)));
      return risk ? [`${item.slug}: ${risk.kind}, ${risk.message}`] : [];
    });
    expect(flagged).toEqual([]);
  });

  it("have dark modules on a light ground at the scan score's contrast", () => {
    const low = designs.flatMap((item) => {
      const contrast = getScanContrast(propsOf(shownStyle(item)));
      const problems: string[] = [];
      if (contrast.inverted) problems.push("inverted");
      if (contrast.ratio < SCAN_CONTRAST_MIN) {
        problems.push(`${contrast.ratio.toFixed(2)}:1`);
      }
      return problems.length > 0
        ? [`${item.slug}: ${problems.join(", ")}`]
        : [];
    });
    expect(low).toEqual([]);
  });

  it("draw every built-in frame label in a color that reads on what it sits on", () => {
    const unreadable: string[] = [];
    for (const item of designs) {
      const { frame, bgColor } = item.payload.style;
      if (!frame || frame.style === "custom") continue;
      if (!(frame.text || frame.secondaryText)) continue;
      const label = getFrameColors(frame)?.text;
      const backdrop = LABEL_ON_BACKGROUND.has(frame.style)
        ? stops(bgColor, "#ffffff")[0]
        : frame.color;
      if (!(label && backdrop)) continue;
      const ratio = getContrastRatio(label, backdrop);
      if (ratio < FRAME_TEXT_CONTRAST) {
        unreadable.push(
          `${item.slug}: ${frame.style} label ${label} on ${backdrop} (${ratio.toFixed(2)}:1)`,
        );
      }
    }
    expect(unreadable).toEqual([]);
  });

  it("use frames that exist, with labels that fit them", () => {
    const ids = new Set(OFFICIAL_FRAMES.map((frame) => frame.id));
    for (const design of OFFICIAL_DESIGNS) {
      if (!design.frame) continue;
      expect(ids.has(design.frame.id), `${design.id}: ${design.frame.id}`).toBe(
        true,
      );
      const item = byId.get(design.id);
      expect(item?.facets.pairedFrame).toBe(design.frame.id);
      expect(item?.payload.style.frame?.style).toBe("custom");
      for (const text of [design.frame.text, design.frame.secondaryText]) {
        if (text !== undefined) expect(text.length).toBeLessThanOrEqual(24);
      }
    }
  });

  it("use the whole catalogue: every body, eye and centre, several times", () => {
    const uses = (pick: (style: ThemeStyles) => string | undefined) => {
      const counts = new Map<string, number>();
      for (const item of designs) {
        const value = pick(item.payload.style);
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      return counts;
    };
    const bodies = uses((style) => style.bodyPattern);
    const eyes = uses((style) => style.cornerEyePattern);
    const dots = uses((style) => style.cornerEyeDotPattern);
    const short: string[] = [];
    for (const body of BODY_PATTERN) {
      if ((bodies.get(body) ?? 0) < MIN_USES) short.push(`body ${body}`);
    }
    for (const eye of CORNER_EYE_PATTERNS) {
      // Circle eyes only read in lenient decoders: a scan-risk flag
      if (eye === "circle") continue;
      if ((eyes.get(eye) ?? 0) < MIN_USES) short.push(`eye ${eye}`);
    }
    for (const dot of CORNER_EYE_DOT_PATTERNS) {
      if ((dots.get(dot) ?? 0) < MIN_USES) short.push(`centre ${dot}`);
    }
    expect(short).toEqual([]);
    expect(eyes.has("circle")).toBe(false);
  });

  it("never take an official frame's name unless they sit on that frame", () => {
    const frameByName = new Map(
      OFFICIAL_FRAMES.map((frame) => [frame.name.toLowerCase(), frame.id]),
    );
    const clashes = designs.flatMap((item) => {
      const namesake = frameByName.get(item.name.toLowerCase());
      return namesake && item.facets.pairedFrame !== namesake
        ? [`${item.slug} is named like the ${namesake} frame`]
        : [];
    });
    expect(clashes).toEqual([]);
  });

  it(`are tagged accessible only at ${ACCESSIBLE_CONTRAST}:1 or more`, () => {
    const low = designs.flatMap((item) => {
      if (!item.tags.includes("accessible")) return [];
      const { ratio } = getScanContrast(propsOf(shownStyle(item)));
      return ratio < ACCESSIBLE_CONTRAST
        ? [`${item.slug}: ${ratio.toFixed(1)}:1`]
        : [];
    });
    expect(low).toEqual([]);
    expect(
      designs.filter((item) => item.tags.includes("accessible")).length,
    ).toBeGreaterThan(0);
  });

  it("put a frame from every official collection on some design", () => {
    const collectionOf = new Map(
      OFFICIAL_FRAMES.map((frame) => [frame.id, frame.collection]),
    );
    const used = new Set(
      designs.flatMap((item) =>
        item.facets.pairedFrame
          ? [collectionOf.get(item.facets.pairedFrame)]
          : [],
      ),
    );
    const missing = OFFICIAL_FRAME_COLLECTIONS.filter(
      (collection) => !used.has(collection.id),
    ).map((collection) => collection.id);
    expect(missing).toEqual([]);
  });

  it("have names, descriptions and tags that pass the publish rules", () => {
    const names = new Set<string>();
    for (const item of designs) {
      expect(item.name.length, item.slug).toBeLessThanOrEqual(60);
      expect(item.name, item.slug).not.toMatch(/\d/);
      expect(names.has(item.name), `duplicate name ${item.name}`).toBe(false);
      names.add(item.name);
      expect(item.description.length, item.slug).toBeGreaterThanOrEqual(40);
      expect(item.description.length, item.slug).toBeLessThanOrEqual(500);
      expect(textProblem(item.name), item.slug).toBeNull();
      expect(textProblem(item.description), item.slug).toBeNull();
      const details = {
        name: item.name,
        description: item.description,
        tags: item.tags,
      };
      expect(cleanDetails(details, COMMUNITY_THEME_TAGS), item.slug).toEqual(
        details,
      );
      expect(item.tags.length, item.slug).toBeGreaterThanOrEqual(2);
      expect(item.tags.length, item.slug).toBeLessThanOrEqual(5);
      expect(new Set(item.tags).size).toBe(item.tags.length);
      for (const tag of item.tags) {
        expect(COMMUNITY_THEME_TAGS, item.slug).toContain(tag);
      }
    }
  });

  // Contact sheets for a person to look at, on demand (see the support file).
  it.runIf(process.env.COMMUNITY_DESIGN_SHEETS)(
    "write the contact sheets",
    { timeout: 600_000 },
    async () => {
      const files = await writeDesignSheets(
        designs,
        process.env.COMMUNITY_DESIGN_SHEETS as string,
      );
      expect(files.length).toBeGreaterThan(0);
    },
  );
});

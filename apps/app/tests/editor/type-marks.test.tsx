// The type marks (components/editor/type-mark.tsx, colours and glyphs in
// lib/type-marks/data.ts): every QR content type and hosted page type has
// one, each glyph resolves, generic glyphs are white at 3:1 or more on their
// fill (WCAG non-text; brand logos are exempt and draw as the brand does),
// and no two types in a picker category look the same.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TYPE_MARK_GLYPHS, TypeMark } from "@/components/editor/type-mark";
import { BRAND_MARKS } from "@/lib/brand-logos/marks.generated";
import { EDITOR_INTEGRATIONS } from "@/lib/integration-catalog";
import { PAGE_TYPE_IDS } from "@/lib/landing/page-type-ids";
import { contrastRatio } from "@/lib/themes/color";
import {
  CONTENT_TYPE_MARKS,
  FALLBACK_FILL,
  PAGE_TYPE_MARKS,
  type TypeMarkEntry,
} from "@/lib/type-marks/data";
import {
  DARK_INK,
  glyphInk,
  isBrandGlyph,
  MIN_GLYPH_CONTRAST,
  tintInks,
  WHITE_INK,
} from "@/lib/type-marks/ink";
import { CONTENT_CATEGORIES, CONTENT_TYPES_METADATA } from "@/types/qr-content";

const DATA_FILE = "apps/app/lib/type-marks/data.ts";

const typeMarks = Object.entries(CONTENT_TYPE_MARKS) as [
  string,
  TypeMarkEntry,
][];
const pageMarks = Object.entries(PAGE_TYPE_MARKS) as [string, TypeMarkEntry][];
const allMarks = [
  ...typeMarks.map(([id, entry]) => [`type ${id}`, entry] as const),
  ...pageMarks.map(([id, entry]) => [`page ${id}`, entry] as const),
];

const typeIds = CONTENT_TYPES_METADATA.map((meta) => meta.type);

/** A type's own icon, for the fallback test. */
function OwnIcon({ className }: { className?: string }) {
  return <svg className={className} data-own="" />;
}

describe("type mark coverage", () => {
  it("has a mark for every QR content type", () => {
    const missing = typeIds.filter((type) => !(type in CONTENT_TYPE_MARKS));
    expect(
      missing,
      `Content types without a mark: ${missing.join(", ")}. Add each to CONTENT_TYPE_MARKS in ${DATA_FILE} as { fill: "#RRGGBB", glyph }.`,
    ).toEqual([]);
  });

  it("has a mark for every hosted page type", () => {
    const missing = PAGE_TYPE_IDS.filter((type) => !(type in PAGE_TYPE_MARKS));
    expect(
      missing,
      `Hosted page types without a mark: ${missing.join(", ")}. Add each to PAGE_TYPE_MARKS in ${DATA_FILE} as { fill: "#RRGGBB", glyph }.`,
    ).toEqual([]);
  });

  it("names only types that exist", () => {
    const known = new Set<string>(typeIds);
    const pages = new Set<string>(PAGE_TYPE_IDS);
    expect(
      typeMarks.map(([id]) => id).filter((id) => !known.has(id)),
      `CONTENT_TYPE_MARKS in ${DATA_FILE} names unknown content types`,
    ).toEqual([]);
    expect(
      pageMarks.map(([id]) => id).filter((id) => !pages.has(id)),
      `PAGE_TYPE_MARKS in ${DATA_FILE} names unknown page types`,
    ).toEqual([]);
  });
});

describe("type mark entries", () => {
  it("are #RRGGBB fills with a glyph the mark can draw", () => {
    const integrations = new Set(EDITOR_INTEGRATIONS.map((item) => item.slug));
    for (const [id, { fill, glyph }] of allMarks) {
      expect(fill, `${id}: fill`).toMatch(/^#[0-9A-F]{6}$/);
      if (glyph.startsWith("brand:")) {
        expect(
          Object.hasOwn(BRAND_MARKS, glyph.slice(6)),
          `${id}: ${glyph} isn't in BRAND_MARKS (add the slug to UI_SLUGS in scripts/brand-logos/generate-marks.mjs)`,
        ).toBe(true);
      } else if (glyph.startsWith("integration:")) {
        expect(integrations.has(glyph.slice(12)), `${id}: ${glyph}`).toBe(true);
      } else if (glyph !== "LinkedinLogo") {
        expect(
          Object.hasOwn(TYPE_MARK_GLYPHS, glyph),
          `${id}: iconsax "${glyph}" isn't in TYPE_MARK_GLYPHS (components/editor/type-mark.tsx)`,
        ).toBe(true);
      }
    }
  });

  it("draw brands in their official Simple Icons colour", () => {
    for (const [id, { fill, glyph }] of allMarks) {
      if (!glyph.startsWith("brand:")) continue;
      const slug = glyph.slice(6) as keyof typeof BRAND_MARKS;
      expect(fill, id).toBe(`#${BRAND_MARKS[slug].hex}`);
    }
  });

  it("never use iconsax's cheque or split star", () => {
    for (const [id, { glyph }] of allMarks) {
      expect(["Check", "Star1"], id).not.toContain(glyph);
    }
  });
});

describe("glyph colour", () => {
  it("is white unless the entry says the brand draws it dark", () => {
    expect(glyphInk(undefined)).toBe(WHITE_INK);
    expect(glyphInk(CONTENT_TYPE_MARKS.whatsapp)).toBe(WHITE_INK);
    expect(glyphInk(CONTENT_TYPE_MARKS.snapchat)).toBe(DARK_INK);
  });

  it("is white at 3:1 or more on every generic fill (and the fallback tile)", () => {
    for (const [id, entry] of [
      ...allMarks.filter(([, { glyph }]) => !isBrandGlyph(glyph)),
      ["fallback", { fill: FALLBACK_FILL, glyph: "" }] as const,
    ]) {
      expect(
        entry.ink,
        `${id}: only brands set ink; darken the fill instead`,
      ).toBeUndefined();
      const ratio = contrastRatio(WHITE_INK, entry.fill);
      expect(
        ratio,
        `${id}: white on ${entry.fill} is ${ratio.toFixed(2)}:1; lower the fill's OKLCH lightness in ${DATA_FILE} until it reaches 3:1`,
      ).toBeGreaterThanOrEqual(MIN_GLYPH_CONTRAST);
    }
  });

  it("is set dark only for the brands whose own icon draws a dark mark", () => {
    const dark = allMarks
      .filter(([, entry]) => entry.ink === "dark")
      .map(([id]) => id);
    expect(dark).toEqual(["type snapchat", "type spotify", "type waze"]);
  });

  it("of the tint variant reads on the light and the dark card", () => {
    for (const [id, { fill }] of allMarks) {
      const { light, dark } = tintInks(fill);
      expect(contrastRatio(light, "#FFFFFF"), `${id} light`).toBeGreaterThan(
        MIN_GLYPH_CONTRAST - 0.001,
      );
      expect(contrastRatio(dark, "#151618"), `${id} dark`).toBeGreaterThan(
        MIN_GLYPH_CONTRAST - 0.001,
      );
    }
  });
});

describe("picker categories", () => {
  const twins = (ids: readonly string[], marks: Record<string, unknown>) => {
    const seen = new Map<string, string>();
    const found: string[] = [];
    for (const id of ids) {
      const entry = marks[id] as TypeMarkEntry | undefined;
      if (!entry) continue;
      const key = `${entry.fill} ${entry.glyph}`;
      const other = seen.get(key);
      if (other) found.push(`${other} = ${id}`);
      else seen.set(key, id);
    }
    return found;
  };

  it("never show two types with the same fill and glyph", () => {
    for (const category of CONTENT_CATEGORIES) {
      expect(twins(category.types, CONTENT_TYPE_MARKS), category.id).toEqual(
        [],
      );
    }
    expect(twins(PAGE_TYPE_IDS, PAGE_TYPE_MARKS), "hosted pages").toEqual([]);
  });
});

describe("TypeMark", () => {
  it("draws the fill, the computed glyph colour and the real brand mark", () => {
    const html = renderToStaticMarkup(<TypeMark type="whatsapp" />);
    expect(html).toContain("background-color:#25D366");
    expect(html).toContain(`color:${WHITE_INK}`);
    expect(html).toContain('data-brand="whatsapp"');
    expect(html).toContain("width:36px");
  });

  it("draws a slate tile with the type's own icon when it has no entry", () => {
    const html = renderToStaticMarkup(
      <TypeMark fallbackIcon={OwnIcon} size={44} type="not-a-type-yet" />,
    );
    expect(html).toContain(`background-color:${FALLBACK_FILL}`);
    expect(html).toContain("data-own");
    expect(html).toContain("width:44px");
  });

  it("draws a dark glyph where the brand does", () => {
    const html = renderToStaticMarkup(<TypeMark type="snapchat" />);
    expect(html).toContain(`color:${DARK_INK}`);
  });

  it("draws page types and the tint variant", () => {
    const page = renderToStaticMarkup(<TypeMark pageType="pdf" />);
    expect(page).toContain("background-color:#E5484D");
    const tint = renderToStaticMarkup(<TypeMark type="wifi" variant="tint" />);
    expect(tint).not.toContain("background-color:#0A84FF");
    expect(tint).toContain("--mark-ink:");
  });
});

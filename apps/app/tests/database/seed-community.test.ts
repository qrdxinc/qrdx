// The official seed (packages/database/scripts/seed-community.mjs): every
// seeded item is valid for the app (payload schemas, tag vocabularies), the
// frames are exactly the engine's official catalogue, the built-in themes
// are their presets as a publish stores them (and the generated file is
// current), every seeded design scans Great with the publish gate (the real
// server scorer) and stores the score the gate gives it, and the script
// runs end to end against the fake Postgres client. Nothing connects to a
// database.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OFFICIAL_FRAMES } from "qrdx";
import { beforeEach, describe, expect, it, vi } from "vitest";

// next/font only works inside Next's compiler (the page renderer's fonts).
vi.mock("next/font/google", () => {
  const font = (options: { variable: string }) => ({
    className: "",
    variable: `font-var${options.variable}`,
    style: { fontFamily: "" },
  });
  return {
    Bricolage_Grotesque: font,
    Cormorant_Garamond: font,
    DM_Sans: font,
    Fraunces: font,
    Instrument_Serif: font,
    Space_Grotesk: font,
  };
});
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

import {
  readPageTemplate,
  scrubPageContent,
} from "@/lib/community/page-template";
import {
  collectionPayloadSchema,
  FRAME_TAGS,
  framePayloadSchema,
  framePreviewStyle,
  PAGE_TEMPLATE_TAGS,
  type ThemePayload,
  themePayloadFromStyle,
  themePayloadSchema,
} from "@/lib/community/payloads";
import { toPublicStyle } from "@/lib/community/public-style-server";
import { cleanDetails, payloadHash } from "@/lib/community/publish";
import { checkScanGate } from "@/lib/community/scan-gate";
import { MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import { COMMUNITY_THEME_TAGS } from "@/lib/constants";
import { defaultPresets } from "@/utils/qr-presets";
import * as backfill from "../../../../packages/database/scripts/backfill-community.mjs";
import * as seed from "../../../../packages/database/scripts/seed-community.mjs";
import { buildSeedDesigns } from "../../scripts/community-seed/designs";
import {
  buildSeedPageTemplates,
  SEED_KITS,
  withoutEventStarts,
} from "../../scripts/community-seed/page-templates";
import {
  buildPresetSeedThemes,
  PRESET_THEME_DESCRIPTIONS,
} from "../../scripts/community-seed/preset-themes";
import { FakeCommunityPg } from "../support/fake-pg-community";
import { SCORES_UPDATE } from "../support/seed-designs";

const NOW = new Date("2026-11-03T12:00:00Z");
const items = seed.buildSeedItems();
const byType = (type: string) => items.filter((item) => item.type === type);
const presetIds = new Set(Object.keys(PRESET_THEME_DESCRIPTIONS));
const isPreset = (item: (typeof items)[number]) =>
  item.type === "theme" && item.facets?.preset !== undefined;
// The official designs are gated in seed-designs-gate-*.test.ts (shards)
const isDesign = (item: (typeof items)[number]) =>
  item.type === "theme" && item.facets?.design !== undefined;
/** The 10 hand-made themes, the 41 built-in ones and the designs */
const DESIGNS = buildSeedDesigns().length;
const THEMES = 51 + DESIGNS;
/** The 8 original collections and the 10 that group the designs */
const COLLECTIONS = 18;
/** The design a theme or frame item is shown (and gated) as. */
const shownStyle = (item: (typeof items)[number]) =>
  item.type === "frame"
    ? framePreviewStyle(
        (item.payload as { frame: Parameters<typeof framePreviewStyle>[0] })
          .frame,
      )
    : toPublicStyle(
        (item.payload as ThemePayload).style,
        (item.payload as ThemePayload).logoIcon,
      );

describe("the seed's items", () => {
  it("publishes the engine's official frames, the themes and 18 collections", () => {
    expect(byType("frame").map((item) => item.slug)).toEqual(
      OFFICIAL_FRAMES.map((frame) => frame.id),
    );
    expect(byType("theme")).toHaveLength(THEMES);
    expect(byType("theme").filter(isPreset)).toHaveLength(41);
    expect(byType("theme").filter(isDesign)).toHaveLength(DESIGNS);
    expect(byType("collection")).toHaveLength(COLLECTIONS);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(new Set(items.map((item) => `${item.type}:${item.slug}`)).size).toBe(
      items.length,
    );
  });

  it("never publishes the same design twice (a publish refuses it)", () => {
    const designs = items.map(
      (item) => `${item.type}:${payloadHash(item.payload)}`,
    );
    expect(new Set(designs).size).toBe(designs.length);
  });

  it("stores payloads the app accepts, with tags from its vocabularies", () => {
    for (const item of items) {
      // Page templates and kits are checked in "the page templates and kits".
      if (item.type === "page-template" || item.type === "kit") continue;
      const schema =
        item.type === "frame"
          ? framePayloadSchema
          : item.type === "theme"
            ? themePayloadSchema
            : collectionPayloadSchema;
      expect(schema.safeParse(item.payload).success, item.slug).toBe(true);
      expect(item.tags.length).toBeLessThanOrEqual(5);
      const vocabulary: readonly string[] =
        item.type === "theme" ? COMMUNITY_THEME_TAGS : FRAME_TAGS;
      for (const tag of item.tags) expect(vocabulary, item.slug).toContain(tag);
      expect(item.name.length).toBeLessThanOrEqual(60);
    }
  });

  it("lists only seeded items in its collections", () => {
    const ids = new Set(items.map((item) => item.id));
    for (const collection of byType("collection")) {
      expect(collection.entries?.length).toBeGreaterThan(1);
      for (const entry of collection.entries ?? []) {
        expect(ids.has(entry)).toBe(true);
      }
    }
  });

  // A theme that fails the gate, or whose stored score (scan_score) isn't
  // the one the gate gives it now
  const gateFailures = async (gated: typeof items) => {
    const failures: string[] = [];
    for (const item of gated) {
      const gate = await checkScanGate(shownStyle(item));
      if (!gate.passed) {
        failures.push(
          `${item.ref}: ${gate.results.map((r) => `${r.sample}=${r.score}`).join(" ")}`,
        );
      } else if (item.type === "theme" && gate.minScore !== item.scanScore) {
        failures.push(
          `${item.ref}: stores ${item.scanScore}, scores ${gate.minScore}`,
        );
      }
    }
    return failures;
  };

  // Each theme's gate score, stored as scan_score by the seed (as a publish
  // stores it). Written by this test on demand, since it takes the server's
  // scorer; each score is checked against the gate where its theme is gated
  // (above, and seed-designs-gate-*.test.ts for the designs).
  const SCORES_FILE = join(
    __dirname,
    "../../../../packages/database/scripts/community-seed-theme-scores.json",
  );
  it.runIf(process.env.UPDATE_COMMUNITY_SEED_SCORES === "1")(
    "write the theme scores file",
    { timeout: 1_800_000 },
    async () => {
      const scores: Record<string, number> = {};
      for (const item of byType("theme")) {
        scores[item.slug] = (await checkScanGate(shownStyle(item))).minScore;
      }
      const sorted = Object.fromEntries(
        Object.entries(scores).sort(([a], [b]) => (a < b ? -1 : 1)),
      );
      const file = JSON.parse(readFileSync(SCORES_FILE, "utf8"));
      writeFileSync(
        SCORES_FILE,
        `${JSON.stringify({ note: file.note, scores: sorted }, null, 2)}\n`,
      );
    },
  );

  it("stores a gate score for every theme and only for themes, none below the gate", () => {
    const { scores } = JSON.parse(readFileSync(SCORES_FILE, "utf8")) as {
      scores: Record<string, number>;
    };
    expect(Object.keys(scores).sort(), SCORES_UPDATE).toEqual(
      byType("theme")
        .map((item) => item.slug)
        .sort(),
    );
    for (const [slug, score] of Object.entries(scores)) {
      expect(Number.isInteger(score), slug).toBe(true);
      expect(score, slug).toBeGreaterThanOrEqual(MIN_GATE_SCORE);
    }
    expect(
      items.filter((item) => item.type !== "theme" && item.scanScore != null),
    ).toEqual([]);
  });

  // Every frame is gated in seed-frames-gate-*.test.ts (hundreds, in shards)
  it("scans Great with the publish gate, every hand-made theme", {
    timeout: 240_000,
  }, async () => {
    const gated = items.filter(
      (item) => item.type === "theme" && !(isPreset(item) || isDesign(item)),
    );
    expect(await gateFailures(gated)).toEqual([]);
  });

  it("scans Great with the publish gate, every built-in theme", {
    timeout: 240_000,
  }, async () => {
    expect(await gateFailures(items.filter(isPreset))).toEqual([]);
  });
});

// QRdx's own page templates, scrubbed as a real publish scrubs them, and
// the official kits (scripts/community-seed/page-templates.ts).
describe("the page templates and kits", () => {
  const PAGES_FILE = join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "packages",
    "database",
    "scripts",
    "community-seed-pages.json",
  );
  const templates = buildSeedPageTemplates();

  it("are the generated file, current with the app's templates and scrub", () => {
    if (process.env.UPDATE_COMMUNITY_SEED_PAGES === "1") {
      const file = {
        note: "Generated by apps/app/scripts/community-seed/page-templates.ts (UPDATE_COMMUNITY_SEED_PAGES=1 bun x vitest run tests/database/seed-community.test.ts). Don't edit by hand.",
        templates,
        kits: SEED_KITS,
      };
      writeFileSync(PAGES_FILE, `${JSON.stringify(file, null, 2)}\n`);
      const ultracite = join(
        __dirname,
        "..",
        "..",
        "..",
        "..",
        "node_modules",
        ".bin",
        "ultracite",
      );
      spawnSync(ultracite, ["fix", PAGES_FILE], { stdio: "inherit" });
      return;
    }
    const message =
      "Run `UPDATE_COMMUNITY_SEED_PAGES=1 bun x vitest run tests/database/seed-community.test.ts` in apps/app";
    expect(seed.PAGES_SEED.templates, message).toEqual(templates);
    expect(seed.PAGES_SEED.kits, message).toEqual(SEED_KITS);
  });

  it("store pages the app accepts, with nothing left for the scrub to take out", () => {
    const seeded = byType("page-template");
    expect(seeded.length).toBeGreaterThanOrEqual(30);
    for (const item of seeded) {
      const payload = item.payload as {
        page: { type: string; content: Parameters<typeof scrubPageContent>[0] };
      };
      // The app's own validator, in write mode (as a save checks a page).
      const used = readPageTemplate(payload, "write");
      expect(used, item.slug).not.toBeNull();
      // Event dates aren't stored: using the template fills in a future one.
      for (const block of used?.page.content.blocks ?? []) {
        if (block.type !== "event") continue;
        const start = String((block.props as { start?: unknown }).start);
        expect(start.slice(0, 10) > new Date().toISOString().slice(0, 10)).toBe(
          true,
        );
      }
      // Scrubbing it again changes nothing: no real text, links or photos
      // (parsing fills the event date back in, so it's left out here too).
      expect(
        withoutEventStarts(scrubPageContent(payload.page.content).content),
        item.slug,
      ).toEqual(payload.page.content);
      const json = JSON.stringify(payload);
      expect(json, item.slug).not.toMatch(
        /\.(?:webp|png|jpe?g|gif|svg|avif)\b|\/images\/templates\/|fileId/i,
      );
      expect(() =>
        cleanDetails(
          { name: item.name, description: item.description, tags: item.tags },
          PAGE_TEMPLATE_TAGS,
        ),
      ).not.toThrow();
      for (const tag of item.tags) expect(PAGE_TEMPLATE_TAGS).toContain(tag);
      expect(item.id).toBe(`ci_official_page-template_${item.slug}`);
    }
  });

  it("pair each kit's page template with a seeded theme or frame", () => {
    const byId = new Map(items.map((item) => [item.id, item]));
    const kits = byType("kit");
    expect(kits).toHaveLength(SEED_KITS.length);
    for (const kit of kits) {
      expect(kit.id).toBe(`ci_official_kit_${kit.slug}`);
      const parts = (kit.payload as { kit: Record<string, string> }).kit;
      expect(byId.get(parts.page)?.type, kit.slug).toBe("page-template");
      expect(parts.theme || parts.frame, kit.slug).toBeTruthy();
      if (parts.theme) expect(byId.get(parts.theme)?.type).toBe("theme");
      if (parts.frame) expect(byId.get(parts.frame)?.type).toBe("frame");
      expect(kit.entries).toEqual(
        [parts.theme, parts.frame, parts.page].filter(Boolean),
      );
    }
  });
});

describe("the built-in themes", () => {
  const presets = byType("theme").filter(isPreset);

  it("are the generated file, current with the presets", () => {
    expect(
      seed.PRESET_SEED.themes,
      "Run `bun x tsx scripts/community-seed/generate.ts` in apps/app",
    ).toEqual(buildPresetSeedThemes());
    expect(presets.map((item) => item.facets?.preset)).toEqual([...presetIds]);
  });

  it("store what a publish of the preset stores, nothing taken out", () => {
    for (const item of presets) {
      const id = item.facets?.preset as string;
      const preset = defaultPresets[id];
      expect(preset, id).toBeDefined();
      expect(item.id).toBe(`ci_official_theme_${id}`);
      const built = themePayloadFromStyle(preset.styles);
      expect(built?.removed, id).toEqual([]);
      expect(item.payload, id).toEqual(built?.payload);
      expect(item.name).toBe(preset.label);
      // The publish path's name, description and tag rules leave them as is
      const details = {
        name: item.name,
        description: item.description,
        tags: item.tags,
      };
      expect(cleanDetails(details, COMMUNITY_THEME_TAGS), id).toEqual(details);
      expect(item.description.length, id).toBeGreaterThan(40);
      // Tags are the preset's own words and shelf, never added ones
      const words = [...(preset.tags ?? []), preset.category ?? ""].map(
        (word) => word.replace(/\s+/g, "-"),
      );
      for (const tag of item.tags) expect(words, id).toContain(tag);
    }
  });

  it("keep the QRdx mark where the preset shows it, as a publish does", () => {
    const withLogo = presets.filter(
      (item) => (item.payload as ThemePayload).style.showLogo,
    );
    expect(withLogo.map((item) => item.slug)).toEqual(["pebble", "logotype"]);
    for (const item of withLogo) {
      const payload = item.payload as ThemePayload;
      expect(payload.logoIcon).toBeUndefined();
      expect(payload.style.customLogo).toBeUndefined();
    }
  });
});

describe("seed-community", () => {
  let pg: FakeCommunityPg;
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);
  const save = async () => {};

  beforeEach(() => {
    pg = new FakeCommunityPg();
    lines.length = 0;
    pg.seed("user", [{ id: "u_team", name: "QRdx", email: "team@qrdx.dev" }]);
    pg.seed("organization", [{ id: "org_qrdx", slug: "qrdx" }]);
  });

  it("dry-runs by default", async () => {
    expect(await seed.run({ client: pg, argv: [], log, save, now: NOW })).toBe(
      0,
    );
    expect(pg.rows("community_item")).toHaveLength(0);
    expect(lines.join("\n")).toMatch(
      new RegExp(
        `Planned: ${OFFICIAL_FRAMES.length} frame\\(s\\), ${THEMES} theme\\(s\\), ${COLLECTIONS} collection\\(s\\), ${byType("page-template").length} page template\\(s\\), ${byType("kit").length} kit\\(s\\), 0 entry\\(ies\\) added to seeded collections, 0 existing theme\\(s\\) marked official`,
      ),
    );
  });

  it("seeds everything as the verified @qrdx profile, then nothing the second time", async () => {
    // A theme of the official account, copied by the backfill without the profile.
    pg.seed("community_profile", [
      { id: "cp_other", kind: "person", user_id: "u_team", handle: null },
    ]);
    pg.seed("community_item", [
      {
        id: "ci_legacy",
        type: "theme",
        slug: "classic-ab12",
        profile_id: "cp_other",
        is_official: false,
        created_by: "u_team",
        legacy_community_theme_id: "ct_1",
      },
    ]);
    const argv = ["--apply", "--backup", "s.json"];
    expect(await seed.run({ client: pg, argv, log, save, now: NOW })).toBe(0);
    expect(pg.log.at(-1)).toBe("COMMIT");

    const profile = pg
      .rows("community_profile")
      .find((p) => p.kind === "official");
    expect(profile).toMatchObject({
      id: backfill.OFFICIAL_PROFILE_ID,
      handle: "qrdx",
      user_id: "u_team",
      workspace_id: "org_qrdx",
      verified_at: NOW.toISOString(),
    });
    const seeded = pg
      .rows("community_item")
      .filter((i) => String(i.id).startsWith("ci_official_"));
    expect(seeded).toHaveLength(items.length);
    // The official frames, the themes and the collections, then the pages
    expect(items).toHaveLength(
      OFFICIAL_FRAMES.length +
        THEMES +
        COLLECTIONS +
        byType("page-template").length +
        byType("kit").length,
    );
    expect(
      seeded.every((i) => i.is_official && i.profile_id === profile?.id),
    ).toBe(true);
    expect(
      pg
        .rows("community_item")
        .find((i) => i.id === "ci_official_frame_wifi-card"),
    ).toMatchObject({
      slug: "wifi-card",
      featured_at: NOW.toISOString(),
      license: "CC0-1.0",
    });
    expect(
      pg.rows("community_item").find((i) => i.id === "ci_legacy"),
    ).toMatchObject({
      is_official: true,
      profile_id: backfill.OFFICIAL_PROFILE_ID,
    });
    expect(pg.rows("community_collection_entry").length).toBe(
      [...byType("collection"), ...byType("kit")].reduce(
        (sum, c) => sum + (c.entries?.length ?? 0),
        0,
      ),
    );
    expect(pg.rows("community_item_version")).toHaveLength(items.length);
    // A millisecond apart, in seed order, so "newest" pages in a fixed order
    const times = seeded.map((i) => Date.parse(i.published_at as string));
    expect(new Set(times).size).toBe(seeded.length);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times[0]).toBe(NOW.getTime());
    // Every time the seed writes is UTC text, as the app writes these
    // timestamp-without-time-zone columns (a Date would go out as local
    // time and lose its offset; the fake refuses one)
    const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const written = [
      ...seeded.flatMap((i) =>
        [
          "published_at",
          "created_at",
          "updated_at",
          "featured_at",
          "scan_checked_at",
        ].map((column) => [i.id, column, i[column]] as const),
      ),
      ...pg
        .rows("community_item_version")
        .map((v) => [v.item_id, "created_at", v.created_at] as const),
      ...["verified_at", "created_at", "updated_at"].map(
        (column) => ["profile", column, profile?.[column]] as const,
      ),
    ].filter(([, , value]) => value !== null);
    // Each item's published, created and updated time, the featured and
    // scored ones' extra time, each version's and the profile's three
    expect(written).toHaveLength(
      items.length * 3 + seed.SEED.featured.length + THEMES + items.length + 3,
    );
    expect(
      written.filter(
        ([, , value]) => !(typeof value === "string" && utc.test(value)),
      ),
    ).toEqual([]);
    // Themes carry their gate score, checked when published, as a publish
    // stores them; nothing else is gated by a publish, nor by the seed
    const scoreOf = new Map(items.map((i) => [i.id, i.scanScore ?? null]));
    const themes = seeded.filter((i) => i.type === "theme");
    expect(themes).toHaveLength(THEMES);
    for (const row of themes) {
      const id = row.id as string;
      expect(row.scan_score, id).toBe(scoreOf.get(id));
      expect(row.scan_score, id).toBeGreaterThanOrEqual(MIN_GATE_SCORE);
      expect(row.scan_checked_at).toEqual(row.published_at);
    }
    expect(
      seeded.filter(
        (i) =>
          i.type !== "theme" &&
          (i.scan_score !== null || i.scan_checked_at !== null),
      ),
    ).toEqual([]);
    expect(
      pg
        .rows("community_item")
        .find((i) => i.id === "ci_official_theme_loveNote"),
    ).toMatchObject({
      type: "theme",
      slug: "love-note",
      name: "Love Note",
      is_official: true,
      featured_at: null,
      payload: { style: { frame: { style: "envelope", text: "Open me" } } },
    });

    lines.length = 0;
    await seed.run({ client: pg, argv: [], log, save, now: NOW });
    expect(lines.join("\n")).toMatch(/Nothing to do/);
  });

  it("skips a design that is already published, as a publish would", async () => {
    const aurora = items.find((item) => item.id === "ci_official_theme_aurora");
    pg.seed("community_item", [
      {
        id: "ci_someone",
        type: "theme",
        slug: "my-aurora-ab12",
        status: "published",
        payload_hash: payloadHash(aurora?.payload),
        profile_id: "cp_someone",
        is_official: false,
        created_by: "u_someone",
      },
    ]);
    const argv = ["--apply", "--backup", "s.json"];
    expect(await seed.run({ client: pg, argv, log, save, now: NOW })).toBe(0);
    expect(lines.join("\n")).toMatch(
      /theme aurora is already published as "my-aurora-ab12": ci_official_theme_aurora is skipped/,
    );
    const ids = pg.rows("community_item").map((i) => i.id);
    expect(ids).not.toContain("ci_official_theme_aurora");
    expect(ids).toHaveLength(items.length);
  });

  it("seeds collections without their colliding designs, then adds the entries in place once the designs are in", async () => {
    const paperInk = items.find((i) => i.id === "ci_official_theme_paper-ink");
    const pastel = items.find(
      (i) => i.id === "ci_official_collection_soft-and-pastel",
    );
    const slugTaken = items.find((i) => i.id === pastel?.entries?.[1]);
    // Someone published paper-ink's design, and someone else took the slug
    // of a soft-and-pastel look with a design of their own
    const theirs = [
      {
        id: "ci_theirs",
        type: "theme",
        slug: "their-look",
        status: "published",
        payload_hash: payloadHash(paperInk?.payload),
        profile_id: "cp_someone",
        is_official: false,
        created_by: "u_someone",
      },
      {
        id: "ci_their_slug",
        type: "theme",
        slug: slugTaken?.slug,
        status: "published",
        payload_hash: "their-own-design",
        profile_id: "cp_someone_else",
        is_official: false,
        created_by: "u_someone_else",
      },
    ];
    pg.seed("community_item", theirs);
    const argv = ["--apply", "--backup", "s.json"];
    expect(await seed.run({ client: pg, argv, log, save, now: NOW })).toBe(0);
    expect(
      lines.find((l) => l.includes("collection minimal-print:")),
    ).toContain(
      `not seeded: ci_official_theme_paper-ink (its design is already published as "their-look"); left out of its payload and entries, and a later run adds the entry once the item is in.`,
    );
    expect(
      lines.find((l) => l.includes("collection soft-and-pastel:")),
    ).toContain(
      `not seeded: ${slugTaken?.id} (its theme slug "${slugTaken?.slug}" is taken)`,
    );
    // Entries in position order; each keeps its place in the full list
    const entriesOf = (id: string) =>
      pg
        .rows("community_collection_entry")
        .filter((e) => e.collection_id === id)
        .sort((a, b) => Number(a.position) - Number(b.position))
        .map((e) => [e.item_id, e.position]);
    const placed = (id: string, without?: string) =>
      ((items.find((i) => i.id === id)?.entries ?? []) as string[]).flatMap(
        (entry, position) => (entry === without ? [] : [[entry, position]]),
      );
    const minimal = "ci_official_collection_minimal-print";
    expect(entriesOf(minimal)).toEqual(placed(minimal, paperInk?.id));
    expect(entriesOf(pastel?.id as string)).toEqual(
      placed(pastel?.id as string, slugTaken?.id),
    );
    // The stored payload and version list only items that are there
    const rowOf = (id: string) =>
      pg.rows("community_item").find((i) => i.id === id);
    const versionOf = (id: string) =>
      pg.rows("community_item_version").find((v) => v.item_id === id);
    const listed = (id: string, without?: string) =>
      ((items.find((i) => i.id === id)?.entries ?? []) as string[]).filter(
        (entry) => entry !== without,
      );
    expect(rowOf(minimal)?.payload).toEqual({
      items: listed(minimal, paperInk?.id),
    });
    expect(rowOf(pastel?.id as string)?.payload).toEqual({
      items: listed(pastel?.id as string, slugTaken?.id),
    });
    const there = new Set(pg.rows("community_item").map((i) => i.id));
    for (const row of pg
      .rows("community_item")
      .filter((i) => i.type === "collection")) {
      const payload = row.payload as { items: string[] };
      expect(versionOf(row.id as string)?.payload).toEqual(payload);
      expect(row.payload_hash).toBe(payloadHash(payload));
      expect(payload.items.filter((id) => !there.has(id))).toEqual([]);
    }
    // Their rows are never written
    const rowsOf = () =>
      pg
        .rows("community_item")
        .filter((i) => String(i.id).startsWith("ci_their"));
    expect(rowsOf()).toEqual(theirs);
    expect(
      pg
        .rows("community_collection_entry")
        .filter((e) => String(e.item_id).startsWith("ci_their")),
    ).toEqual([]);

    // The colliding rows are gone: the next run seeds both designs and
    // puts each entry back at its place
    pg.tables.community_item = pg
      .rows("community_item")
      .filter((i) => !String(i.id).startsWith("ci_their"));
    lines.length = 0;
    const saved: string[] = [];
    const keep = async (_path: string, text: string) => {
      saved.push(text);
    };
    expect(
      await seed.run({ client: pg, argv, log, save: keep, now: NOW }),
    ).toBe(0);
    expect(lines.join("\n")).toMatch(
      /INSERT community_collection_entry collection=ci_official_collection_minimal-print item=ci_official_theme_paper-ink position=\d+/,
    );
    // The backup lists the entries this run adds, to undo them
    const paperAt = (
      items.find((i) => i.id === minimal)?.entries ?? []
    ).indexOf(paperInk?.id as string);
    const slugAt = (pastel?.entries ?? []).indexOf(slugTaken?.id as string);
    // (in seed order: soft-and-pastel comes before minimal-print)
    expect(JSON.parse(saved[0] as string).insertedEntries).toEqual([
      { collection_id: pastel?.id, item_id: slugTaken?.id, position: slugAt },
      { collection_id: minimal, item_id: paperInk?.id, position: paperAt },
    ]);
    expect(lines.join("\n")).toMatch(
      /2 entry\(ies\) added to seeded collections/,
    );
    expect(entriesOf(minimal)).toEqual(placed(minimal));
    expect(entriesOf(pastel?.id as string)).toEqual(
      placed(pastel?.id as string),
    );
    const ids = pg.rows("community_item").map((i) => i.id);
    expect(ids).toContain(paperInk?.id);
    expect(ids).toContain(slugTaken?.id);
    // A published payload never changes: the gallery shows the entries
    expect(rowOf(minimal)?.payload).toEqual({
      items: listed(minimal, paperInk?.id),
    });
  });

  it("seeds a kit without a colliding look part, and skips a kit left with no look", async () => {
    const onyx = items.find((i) => i.id === "ci_official_theme_onyx");
    const crema = items.find((i) => i.id === "ci_official_theme_cafe-crema");
    const businessCard = items.find(
      (i) => i.id === "ci_official_kit_business-card",
    );
    const parts = (businessCard?.payload as { kit: Record<string, string> })
      .kit;
    expect(parts.theme).toBe(onyx?.id);
    expect(parts.frame).toBeTruthy();
    pg.seed("community_item", [
      {
        id: "ci_their_onyx",
        type: "theme",
        slug: "their-onyx",
        status: "published",
        payload_hash: payloadHash(onyx?.payload),
        profile_id: "cp_someone",
        is_official: false,
        created_by: "u_someone",
      },
      {
        id: "ci_their_crema",
        type: "theme",
        slug: "their-crema",
        status: "published",
        payload_hash: payloadHash(crema?.payload),
        profile_id: "cp_someone",
        is_official: false,
        created_by: "u_someone",
      },
    ]);
    const argv = ["--apply", "--backup", "s.json"];
    expect(await seed.run({ client: pg, argv, log, save, now: NOW })).toBe(0);
    expect(lines.find((l) => l.includes("kit business-card:"))).toContain(
      `not seeded: ${onyx?.id} (its design is already published as "their-onyx"); the kit goes in without it (payload and entries).`,
    );
    expect(lines.find((l) => l.includes("kit cafe-table:"))).toContain(
      `not seeded: ${crema?.id} (its design is already published as "their-crema"); a kit needs its page template and a theme or frame, so it is skipped.`,
    );
    const kit = pg
      .rows("community_item")
      .find((i) => i.id === businessCard?.id);
    expect(kit?.payload).toEqual({
      kit: { frame: parts.frame, page: parts.page },
    });
    expect(
      pg.rows("community_item_version").find((v) => v.item_id === kit?.id)
        ?.payload,
    ).toEqual(kit?.payload);
    const kitEntries = () =>
      pg
        .rows("community_collection_entry")
        .filter((e) => e.collection_id === businessCard?.id)
        .map((e) => [e.item_id, e.position]);
    expect(kitEntries()).toEqual([
      [parts.frame, 1],
      [parts.page, 2],
    ]);
    expect(
      pg
        .rows("community_item")
        .some((i) => i.id === "ci_official_kit_cafe-table"),
    ).toBe(false);

    // Once the looks are in, cafe-table goes in whole; business-card stays
    // as published (a kit is used by its payload's parts)
    pg.tables.community_item = pg
      .rows("community_item")
      .filter((i) => !String(i.id).startsWith("ci_their"));
    lines.length = 0;
    expect(await seed.run({ client: pg, argv, log, save, now: NOW })).toBe(0);
    expect(
      pg
        .rows("community_item")
        .find((i) => i.id === "ci_official_kit_cafe-table")?.payload,
    ).toEqual(
      items.find((i) => i.id === "ci_official_kit_cafe-table")?.payload,
    );
    expect(kitEntries()).toEqual([
      [parts.frame, 1],
      [parts.page, 2],
    ]);
    expect(lines.join("\n")).not.toContain(`collection=${businessCard?.id}`);
  });

  it("adopts only rows its UPDATE itself allows, and names whose themes they are", async () => {
    // Every condition the plan adopts by is in the statement
    for (const condition of [
      "id = $1",
      "type = 'theme'",
      "created_by = $4",
      "NOT starts_with(id, 'ci_official_')",
      "(is_official IS NOT TRUE OR profile_id IS DISTINCT FROM $2)",
    ]) {
      expect(seed.SQL.adoptTheme).toContain(condition);
    }
    const before = {
      id: "ci_legacy",
      type: "theme",
      slug: "classic-ab12",
      profile_id: "cp_other",
      is_official: false,
      created_by: "u_team",
      updated_at: "2026-10-01 09:30:00.123456",
    };
    const notOurs = [
      { ...before, id: "ci_their_theme", slug: "theirs", created_by: "u_x" },
      { ...before, id: "ci_their_frame", type: "frame", slug: "their-frame" },
      { ...before, id: "ci_official_theme_x", slug: "x" },
    ];
    pg.seed("community_item", [before, ...notOurs]);
    // Straight at the statement: rows outside its conditions don't move
    for (const row of notOurs) {
      const result = await pg.query(seed.SQL.adoptTheme, [
        row.id,
        backfill.OFFICIAL_PROFILE_ID,
        NOW.toISOString(),
        "u_team",
      ]);
      expect(result.rowCount, row.id).toBe(0);
    }
    expect(
      pg.rows("community_item").filter((i) => i.id !== "ci_legacy"),
    ).toEqual(notOurs);

    // The dry run names whose themes move, and which
    await seed.run({ client: pg, argv: [], log, save, now: NOW });
    expect(lines).toContain(
      "  Adopting 1 theme(s) created by team@qrdx.dev (user u_team): they move to @qrdx, marked official",
    );
    expect(lines).toContain(
      "  UPDATE community_item theme slug=classic-ab12 id=ci_legacy SET profile=@qrdx, official",
    );

    // A wrong plan (an id outside the conditions) moves nothing: the count
    // check fails and everything rolls back
    const snapshot = await seed.loadSnapshot(pg, seed.parseArgs([]));
    const plan = seed.planSeed(snapshot, [], NOW);
    expect(plan.adopt).toEqual(["ci_legacy"]);
    plan.adopt.push("ci_their_theme");
    await pg.query("BEGIN");
    await seed.applySeed(pg, plan, snapshot.officialUserId);
    expect(await seed.verifySeed(pg, plan)).toEqual([
      "community_item: 1 of 2 official item(s) in place",
    ]);
    await pg.query("ROLLBACK");
    expect(
      pg.rows("community_item").find((i) => i.id === "ci_their_theme"),
    ).toEqual(notOurs[0]);

    // The backup keeps an adopted row as it was, updated_at included
    const saved: string[] = [];
    const keep = async (_path: string, text: string) => {
      saved.push(text);
    };
    expect(
      await seed.run({
        client: pg,
        argv: ["--apply", "--backup", "s.json"],
        log,
        save: keep,
        now: NOW,
        seedItems: [],
      }),
    ).toBe(0);
    expect(JSON.parse(saved[0] as string).updatedItems).toEqual([
      {
        id: "ci_legacy",
        type: "theme",
        slug: "classic-ab12",
        status: null,
        payload_hash: null,
        profile_id: "cp_other",
        is_official: false,
        created_by: "u_team",
        updated_at: "2026-10-01 09:30:00.123456",
      },
    ]);
    expect(
      pg.rows("community_item").find((i) => i.id === "ci_legacy"),
    ).toMatchObject({
      profile_id: backfill.OFFICIAL_PROFILE_ID,
      is_official: true,
      updated_at: NOW.toISOString(),
    });
  });

  it("takes another --official-email only with --allow-other-official-email", () => {
    expect(() =>
      seed.parseArgs(["--official-email", "someone@example.com"]),
    ).toThrow(
      "--official-email someone@example.com isn't the official account (team@qrdx.dev): its themes would move to @qrdx. Pass --allow-other-official-email too to mean it.",
    );
    expect(
      seed.parseArgs([
        "--official-email",
        "someone@example.com",
        "--allow-other-official-email",
      ]).officialEmail,
    ).toBe("someone@example.com");
    expect(
      seed.parseArgs(["--official-email", "Team@QRdx.dev"]).officialEmail,
    ).toBe("Team@QRdx.dev");
  });

  it("asks for a new --backup path when the backup file is there already", async () => {
    await expect(
      seed.run({ client: pg, argv: ["--apply"], log, save, now: NOW }),
    ).rejects.toThrow(/a new file each run/);
    const exists = async () => {
      throw Object.assign(new Error("EEXIST: file already exists"), {
        code: "EEXIST",
      });
    };
    await expect(
      seed.run({
        client: pg,
        argv: ["--apply", "--backup", "s.json"],
        log,
        save: exists,
        now: NOW,
      }),
    ).rejects.toThrow(
      "s.json already exists: a rerun needs a new --backup path (a backup is never overwritten).",
    );
    expect(pg.log.at(-1)).toBe("ROLLBACK");
    expect(pg.rows("community_item")).toHaveLength(0);
  });

  it("refuses to seed without the official account", async () => {
    pg.tables.user = [];
    await expect(
      seed.run({ client: pg, argv: [], log, save, now: NOW }),
    ).rejects.toThrow(/official account/);
    expect(pg.log.at(-1)).toBe("ROLLBACK");
  });

  it("rolls back when a count is wrong", async () => {
    pg.loseInserts = "community_collection_entry";
    expect(
      await seed.run({
        client: pg,
        argv: ["--apply", "--backup", "s.json"],
        log,
        save,
        now: NOW,
      }),
    ).toBe(1);
    expect(pg.rows("community_item")).toHaveLength(0);
  });
});

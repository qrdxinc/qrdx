// The docs' pictures and clips: the manifest scripts/shots writes
// (lib/shots-manifest.json), the lookup behind <Shot> and <Clip>
// (lib/shots.ts), and the files it points at.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanLlmMarkdown } from "@/lib/agents/llm-markdown";
import {
  clipSources,
  getClip,
  getShot,
  listShots,
  type ShotsManifest,
  shotMarkdown,
} from "@/lib/shots";
import manifest from "@/lib/shots-manifest.json";
import { JOBS as APP_JOBS } from "@/scripts/shots/jobs";
import { LIBRARY_JOBS } from "@/scripts/shots/library";
import en from "../../../app/messages/en.json";

// The app's screens and the library's rendered samples.
const JOBS = [...APP_JOBS, ...LIBRARY_JOBS];

const PUBLIC = join(__dirname, "../../public");
const shots = manifest as ShotsManifest;

const sample: ShotsManifest = {
  "codes-list": {
    kind: "shot",
    look: "window",
    light: "/docs-static/shots/codes-list.light.webp",
    dark: "/docs-static/shots/codes-list.dark.webp",
    width: 1800,
    height: 1174,
    alt: "The Codes page listing dynamic QR codes.",
    title: "The list of dynamic codes",
    pages: ["/docs/help/dynamic-codes/create"],
    job: "codes-list",
  },
  "first-code": {
    kind: "clip",
    poster: {
      light: "/docs-static/shots/first-code.poster.light.webp",
      dark: "/docs-static/shots/first-code.poster.dark.webp",
    },
    sources: {
      webm: "/videos/docs/first-code.{theme}.webm",
      mp4: "/videos/docs/first-code.{theme}.mp4",
    },
    width: 1920,
    height: 1200,
    seconds: 9.5,
    alt: "Making a first code in the playground.",
    title: "A first code",
    pages: ["/docs/help/getting-started/first-qr-code"],
    job: "first-code",
  },
};

describe("getShot and getClip", () => {
  it("return the entry for a known id", () => {
    expect(getShot("codes-list", sample).width).toBe(1800);
    expect(getClip("first-code", sample).seconds).toBe(9.5);
  });

  it("fail with the id and the fix for an unknown id", () => {
    expect(() => getShot("nope", sample)).toThrow(
      /<Shot id="nope" \/>: no picture with this id/,
    );
    expect(() => getShot("nope", sample)).toThrow(
      /bun run --filter docs shots -- --list/,
    );
    expect(() => getClip("nope", sample)).toThrow(
      /<Clip id="nope" \/>: no clip with this id/,
    );
  });

  it("point a picture id used as a clip (and the reverse) at the right component", () => {
    expect(() => getShot("first-code", sample)).toThrow(
      /is a clip, not a picture. Use <Clip id="first-code" \/>/,
    );
    expect(() => getClip("codes-list", sample)).toThrow(
      /is a picture, not a clip. Use <Shot id="codes-list" \/>/,
    );
  });
});

describe("clipSources", () => {
  const entry = getClip("first-code", sample);

  it("resolves the theme's files through the media manifest when uploaded", () => {
    const media = {
      origin: "https://assets.qrdx.dev/",
      files: {
        "/videos/docs/first-code.dark.webm":
          "static/videos/docs/first-code.dark.abc123.webm",
        "/videos/docs/first-code.dark.mp4":
          "static/videos/docs/first-code.dark.def456.mp4",
      },
    };
    expect(clipSources(entry, "dark", media)).toEqual({
      webm: "https://assets.qrdx.dev/static/videos/docs/first-code.dark.abc123.webm",
      mp4: "https://assets.qrdx.dev/static/videos/docs/first-code.dark.def456.mp4",
    });
  });

  it("keeps the local path for files not uploaded yet", () => {
    expect(
      clipSources(entry, "light", {
        origin: "https://assets.qrdx.dev",
        files: {},
      }),
    ).toEqual({
      webm: "/videos/docs/first-code.light.webm",
      mp4: "/videos/docs/first-code.light.mp4",
    });
  });
});

describe("shotMarkdown", () => {
  it("writes a picture as a Markdown image with its alt text and absolute URL", () => {
    expect(shotMarkdown({ id: "codes-list" }, "https://qrdx.dev", sample)).toBe(
      "\n\n![The Codes page listing dynamic QR codes.](https://qrdx.dev/docs-static/shots/codes-list.light.webp)\n\n",
    );
  });

  it("prefers the page's own alt text and keeps a caption", () => {
    expect(
      shotMarkdown(
        { id: "codes-list", alt: "La lista de códigos", caption: "Paso 1" },
        "https://qrdx.dev",
        sample,
      ),
    ).toBe(
      "\n\n![La lista de códigos](https://qrdx.dev/docs-static/shots/codes-list.light.webp)\n\n*Paso 1*\n\n",
    );
  });

  it("writes a clip as its poster plus a link to the video", () => {
    const text = shotMarkdown({ id: "first-code" }, "https://qrdx.dev", sample);
    expect(text).toContain(
      "![Making a first code in the playground.](https://qrdx.dev/docs-static/shots/first-code.poster.light.webp)",
    );
    expect(text).toContain("[Watch the clip (9.5s, no sound)](");
  });

  it("renders nothing for an id that isn't in the manifest", () => {
    expect(shotMarkdown({ id: "nope" }, "https://qrdx.dev", sample)).toBe("");
  });
});

describe("in the Markdown copies of the pages", () => {
  it("a <Shot> becomes an image and a <Diagram> nothing", () => {
    const markdown = cleanLlmMarkdown(
      'Before.\n\n<Shot id="codes-list" caption="The list." />\n\n<Diagram id="dynamic-redirect" />\n\nAfter.',
      { origin: "https://qrdx.dev" },
    );
    expect(markdown).toContain(
      "![The Codes page listing dynamic QR codes with their short links",
    );
    expect(markdown).toContain(
      "](https://qrdx.dev/docs-static/shots/codes-list.light.webp)",
    );
    expect(markdown).toContain("*The list.*");
    expect(markdown).not.toContain("Diagram");
    expect(markdown.trim().endsWith("After.")).toBe(true);
  });
});

describe("the committed manifest", () => {
  const ids = listShots(shots);

  it("has at least the first asset set", () => {
    expect(ids.length).toBeGreaterThanOrEqual(40);
  });

  it("names a job for every entry, and every entry's files exist", () => {
    for (const id of ids) {
      const entry = shots[id] as ShotsManifest[string];
      expect(
        JOBS.some((job) => job.id === entry.job),
        `${id}: job ${entry.job} is not in scripts/shots/jobs.ts or library.tsx`,
      ).toBe(true);
      expect(entry.alt.trim().length, `${id}: alt text`).toBeGreaterThan(20);
      expect(
        entry.alt,
        `${id}: alt text must not be a placeholder`,
      ).not.toMatch(/TODO|TBD|\[\[/);
      expect(
        entry.pages.length,
        `${id}: lists the pages that use it`,
      ).toBeGreaterThan(0);
      const files =
        entry.kind === "shot"
          ? [entry.light, entry.dark]
          : [entry.poster.light, entry.poster.dark];
      for (const file of files) {
        expect(
          file.startsWith("/docs-static/shots/"),
          `${id}: ${file} is under the proxied /docs-static path`,
        ).toBe(true);
        const path = join(PUBLIC, file);
        expect(existsSync(path), `${id}: ${file} exists`).toBe(true);
        // Stills stay small (the brief asks for about 150 KB each where possible).
        expect(statSync(path).size, `${id}: ${file} under 400 KB`).toBeLessThan(
          400 * 1024,
        );
      }
      // Stills are 1600 to 2000 px wide; a clip is the viewport it recorded.
      const minWidth = entry.kind === "shot" ? 1600 : 1280;
      expect(
        entry.width,
        `${id}: width at least ${minWidth}`,
      ).toBeGreaterThanOrEqual(minWidth);
      expect(entry.width).toBeLessThanOrEqual(2000);
      expect(entry.height).toBeGreaterThan(0);
    }
  });

  it("uses only ids that are valid in MDX attributes and file names", () => {
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("the pictures the English pages use", () => {
  const CONTENT = join(__dirname, "../../content/docs");
  const englishPages = (dir = CONTENT): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return englishPages(full);
      return /^[^.]+\.mdx$/.test(name) ? [full] : [];
    });
  const pages = englishPages().map((file) => ({
    name: relative(CONTENT, file),
    uses: [
      ...readFileSync(file, "utf8").matchAll(
        /<(Shot|Clip|Diagram) id="([^"]+)"/g,
      ),
    ].map((match) => ({ tag: match[1], id: match[2] })),
    text: readFileSync(file, "utf8"),
  }));
  const diagrams = en.docs.shots.diagrams as Record<
    string,
    Record<string, string>
  >;

  it("are all captured or drawn", () => {
    for (const page of pages) {
      for (const { tag, id } of page.uses) {
        if (tag === "Diagram") {
          expect(
            diagrams[id]?.title,
            `${page.name}: <Diagram id="${id}" /> has no labels in docs.shots.diagrams`,
          ).toBeTruthy();
        } else {
          expect(
            shots[id]?.kind,
            `${page.name}: <${tag} id="${id}" /> is not in the manifest`,
          ).toBe(tag === "Shot" ? "shot" : "clip");
        }
      }
    }
  });

  it("never repeat on one page", () => {
    for (const page of pages) {
      const ids = page.uses.map((use) => `${use.tag} ${use.id}`);
      expect(
        ids.filter((id, index) => ids.indexOf(id) !== index),
        `${page.name} shows a picture twice`,
      ).toEqual([]);
    }
  });

  it("leave no marker behind", () => {
    for (const page of pages) {
      expect(
        page.text,
        `${page.name} still has a shot, clip or diagram marker`,
      ).not.toMatch(/\{\/\*\s*(shot|clip|diagram):/);
    }
  });

  it("have every word a drawing shows in the English catalog", () => {
    const source = readFileSync(
      join(__dirname, "../../components/mdx/shot-diagram.tsx"),
      "utf8",
    );
    // `"id": { component: …, keys: [ "a", "b" ] }` for every registered drawing.
    const registered = [
      ...source.matchAll(
        /"([a-z0-9-]+)": \{\s*(?:fits: true,\s*)?component: \w+,\s*keys: \[([^\]]*)\]/g,
      ),
    ];
    expect(registered.length).toBeGreaterThanOrEqual(18);
    for (const [, id, keys] of registered) {
      for (const [, key] of keys.matchAll(/"([^"]+)"/g)) {
        expect(
          diagrams[id]?.[key],
          `docs.shots.diagrams.${id}.${key} is missing in apps/app/messages/en.json`,
        ).toBeTruthy();
      }
    }
  });
});

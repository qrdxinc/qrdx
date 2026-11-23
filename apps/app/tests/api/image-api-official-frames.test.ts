// Official frames by id in GET /v1/qr: the Get code dialog's image URL
// (code-snippets.ts imageSnippet) names an official frame by its id instead
// of carrying its whole spec, and draws exactly what the old URL with the
// spec drew, edited labels and colors included. Frames drawn from their own
// spec go as JSON or a playground link's compact value, the same image
// either way. The route runs in-process; nothing reaches the network.
import { NextRequest } from "next/server";
import { getOfficialFrame, OFFICIAL_FRAMES } from "qrdx";
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 300,
      remaining: 299,
      reset: Date.now() + 30_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const route = await import("@/app/api/v1/qr/route");
const { IMAGE_API_URL, imageSnippet } = await import(
  "@/components/editor/action-bar/code-snippets"
);
const { OFFICIAL_FRAME_RESOLVER } = await import("@/lib/community/catalog");
const { isOfficialFrameName } = await import("@/lib/qr-api/style");

const VALUE = "https://example.com";
const IMMUTABLE = "public, max-age=31536000, immutable";

/** Finds no official frame, as the browser before the frame index loads. */
const NO_OFFICIAL_FRAMES = {
  idOfSpec: () => undefined,
  specOf: () => undefined,
};

function officialSpec(id: string) {
  const frame = getOfficialFrame(id);
  if (!frame) throw new Error(`No official frame ${id}`);
  return frame.spec;
}

const local = (url: string) =>
  url.replace(IMAGE_API_URL, "http://localhost:3000/api/v1/qr");

async function render(url: string) {
  const response = await route.GET(new NextRequest(local(url)));
  const body = Buffer.from(await response.arrayBuffer());
  expect(response.status, body.toString("utf8").slice(0, 400)).toBe(200);
  return { body, cache: response.headers.get("Cache-Control") };
}

/** The URL the dialog wrote before: the frame's whole spec, as JSON in `style`. */
function inlineSpecUrl(flat: Record<string, string>, frame: object) {
  const params = new URLSearchParams({
    data: VALUE,
    ...flat,
    style: JSON.stringify({ frame }),
  });
  return `${IMAGE_API_URL}?${params}`;
}

const snippet = (style: object, officialFrames = OFFICIAL_FRAME_RESOLVER) =>
  imageSnippet({
    style: style as never,
    value: VALUE,
    contentType: "url",
    content: { type: "url", url: VALUE },
    officialFrames,
  });

// The design the owner saw, a code under it with only a frame, and a frame
// with every label and color edited.
const SCREENSHOT_LOOK = {
  fgColor: "#4c1d95",
  bgColor: "#bf95ff",
  eyeColor: "#4c1d95",
  dotColor: "#4c1d95",
  bodyPattern: "classy-rounded",
  cornerEyePattern: "cushion",
  cornerEyeDotPattern: "plus",
  margin: 2,
};
const SCREENSHOT_FLAT = {
  fg: "4c1d95",
  bg: "bf95ff",
  body: "classy-rounded",
  eye: "cushion",
  dot: "plus",
  margin: "2",
};
const EDITED = {
  text: "Order sweets",
  secondaryText: "Open till 9",
  color: "#1e3a8a",
  textColor: "#fef3c7",
  secondaryColor: "#f59e0b",
  fontScale: 1.2,
};

const CASES = [
  {
    name: "the autumn leaf, labelled",
    id: "autumn-maple",
    look: SCREENSHOT_LOOK,
    flat: SCREENSHOT_FLAT,
    overrides: { text: "Hello autumn" },
  },
  {
    name: "a frame as it ships",
    id: "menu-cutlery",
    look: {},
    flat: { margin: "0", body: "circle", eye: "gear", dot: "circle" },
    overrides: {},
  },
  {
    name: "a frame with its labels and colors edited",
    id: "diwali-diya",
    look: {},
    flat: { margin: "0", body: "circle", eye: "gear", dot: "circle" },
    overrides: EDITED,
  },
  {
    name: "a frame with its second line hidden",
    id: "thanksgiving-leaf",
    look: {},
    flat: { margin: "0", body: "circle", eye: "gear", dot: "circle" },
    overrides: { text: "Give thanks", secondaryText: "" },
  },
] as const;

describe("Official frames by id in the image URL", () => {
  it("can name every official frame: no id is a built-in frame's", () => {
    for (const frame of OFFICIAL_FRAMES) {
      expect(isOfficialFrameName(frame.id), frame.id).toBe(true);
    }
  });

  for (const { name, id, look, flat, overrides } of CASES) {
    it(`${name}: names ${id} and draws what the whole spec drew`, async () => {
      const frame = { style: "custom", spec: officialSpec(id), ...overrides };
      const { url, omitted } = snippet({ ...look, frame });
      expect(omitted).toEqual([]);
      expect(url).not.toContain("qrdx.frame");
      expect(url).toContain(id);

      const before = inlineSpecUrl(flat, frame);
      expect(url.length).toBeLessThan(before.length / 3);
      const [old, short] = await Promise.all([render(before), render(url)]);
      expect(short.body.equals(old.body)).toBe(true);
      expect(short.cache).toBe(IMMUTABLE);
      expect(old.cache).toBe(IMMUTABLE);
    });
  }

  it("writes the owner's design as flat parameters only", () => {
    const { url } = snippet({
      ...SCREENSHOT_LOOK,
      frame: {
        style: "custom",
        spec: officialSpec("autumn-maple"),
        text: "Hello autumn",
      },
    });
    expect(url).toBe(
      `${IMAGE_API_URL}?data=https%3A%2F%2Fexample.com&fg=4c1d95&bg=bf95ff&body=classy-rounded&eye=cushion&dot=plus&margin=2&frame=autumn-maple&frameText=Hello+autumn`,
    );
  });

  it("keeps edited labels and colors in readable JSON", () => {
    const { url } = snippet({
      frame: { style: "custom", spec: officialSpec("diwali-diya"), ...EDITED },
    });
    const style = new URL(url).searchParams.get("style") ?? "";
    expect(JSON.parse(style)).toEqual({
      frame: { style: "diwali-diya", ...EDITED },
    });
  });

  it("draws the same PNG both ways", async () => {
    const frame = {
      style: "custom",
      spec: officialSpec("autumn-maple"),
      text: "Hello autumn",
    };
    const { url } = snippet({ ...SCREENSHOT_LOOK, frame });
    const [old, short] = await Promise.all([
      render(`${inlineSpecUrl(SCREENSHOT_FLAT, frame)}&format=png`),
      render(`${url}&format=png`),
    ]);
    expect(short.body.equals(old.body)).toBe(true);
  });

  it("takes an id in any case, and relabels it with frameText", async () => {
    const plain = await render(
      `${IMAGE_API_URL}?data=${VALUE}&frame=autumn-maple`,
    );
    const upper = await render(
      `${IMAGE_API_URL}?data=${VALUE}&frame=Autumn-Maple`,
    );
    expect(upper.body.equals(plain.body)).toBe(true);
    const relabelled = await render(
      `${IMAGE_API_URL}?data=${VALUE}&frame=autumn-maple&frameText=Hi`,
    );
    expect(relabelled.body.equals(plain.body)).toBe(false);
    expect(relabelled.body.toString("utf8")).toContain("Hi");
  });

  it("refuses an id with no frame, naming the parameter", async () => {
    for (const [query, param] of [
      ["frame=not-a-frame", "frame"],
      [
        `style=${encodeURIComponent('{"frame":{"style":"not-a-frame"}}')}`,
        "style.frame.style",
      ],
      ["frame=banner%20bottom", "frame"],
      // Frame styles, not frames: still refused, as before ids
      ["frame=none", "frame"],
      ["frame=custom", "frame"],
    ] as const) {
      const response = await route.GET(
        new NextRequest(`http://localhost:3000/api/v1/qr?data=x&${query}`),
      );
      expect(response.status, query).toBe(400);
      const body = (await response.json()) as {
        data: { details: { param: string; message: string }[] };
      };
      expect(body.data.details[0]?.param, query).toBe(param);
    }
  });

  /** An official spec edited past its labels: a frame of its own. */
  const ownFrame = (id: string) => {
    const spec = officialSpec(id);
    return {
      style: "custom",
      spec: { ...spec, qr: { ...spec.qr, radius: 12 } },
      text: "Hello autumn",
    };
  };
  const styleValue = (url: string) =>
    new URL(url).searchParams.get("style") ?? "";

  it("sends a frame's own spec compact when that's clearly shorter", async () => {
    // Rectangles and labels: JSON that URL-encoding more than doubles
    const frame = ownFrame("review-us");
    const { url, omitted } = snippet({ ...SCREENSHOT_LOOK, frame });
    expect(omitted).toEqual([]);
    expect(styleValue(url)).toMatch(/^1\./);
    expect(url).toContain("&fg=4c1d95&bg=bf95ff&body=classy-rounded");
    const json = inlineSpecUrl(SCREENSHOT_FLAT, frame);
    expect(url.length).toBeLessThan(json.length * 0.8);
    const [fromJson, fromCompact] = await Promise.all([
      render(json),
      render(url),
    ]);
    expect(fromCompact.body.equals(fromJson.body)).toBe(true);
  });

  it("keeps a frame's own spec as JSON when compact saves less than a fifth", () => {
    // Mostly one long path, which URL-encoding barely grows
    const frame = ownFrame("autumn-maple");
    const { url } = snippet({ ...SCREENSHOT_LOOK, frame });
    expect(JSON.parse(styleValue(url))).toEqual({ frame });
  });

  it("sends the spec when it can't tell the frame is official", () => {
    const frame = {
      style: "custom",
      spec: officialSpec("autumn-maple"),
      text: "Hello autumn",
    };
    const { url } = snippet({ ...SCREENSHOT_LOOK, frame }, NO_OFFICIAL_FRAMES);
    expect(new URL(url).searchParams.get("frame")).toBeNull();
    expect(JSON.parse(styleValue(url))).toEqual({ frame });
  });
});

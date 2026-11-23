// Official frame versions in GET /v1/qr: the Get code dialog's image URL
// names an official frame with its version (frame=autumn-maple.v1), and the
// API draws that version from the record of every version QRdx has
// published (lib/frames/versions), so an embedded image never changes when
// QRdx redesigns the frame. A bare id, as image URLs were copied before
// versions, is version 1 for good; `.latest` follows the newest design,
// with a short cache. The route runs in-process; nothing reaches the
// network.
import { NextRequest } from "next/server";
import { frameSpecHash, getOfficialFrame } from "qrdx";
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
const { decodeStyleParam, encodeStyleParam, officialFrameIdOfStyleParam } =
  await import("@/lib/playground-style");
const { packStyleParam } = await import("@/lib/playground-style-pack");

type Route = typeof route;

const IMMUTABLE = "public, max-age=31536000, immutable";
const FOLLOWS_LATEST = "public, max-age=300, stale-while-revalidate=3600";
const FOLLOWS_LATEST_CDN = "public, max-age=600, stale-while-revalidate=3600";
const ID = "autumn-maple";
const VALUE = "https://example.com";
const ORIGIN = "http://localhost:3000/api/v1/qr";

const spec = getOfficialFrame(ID)?.spec;
if (!spec) throw new Error(`No official frame ${ID}`);
/** The same frame after a redesign: a new accent color. */
const REDESIGNED = { ...spec, colors: { ...spec.colors, accent: "#0f766e" } };

const url = (query: Record<string, string>) =>
  `${ORIGIN}?${new URLSearchParams({ data: VALUE, ...query })}`;

async function render(handler: Route, href: string) {
  const response = await handler.GET(new NextRequest(href));
  const body = Buffer.from(await response.arrayBuffer());
  expect(response.status, body.toString("utf8").slice(0, 400)).toBe(200);
  return {
    body,
    cache: response.headers.get("Cache-Control"),
    cdn: response.headers.get("CDN-Cache-Control"),
  };
}

async function refusal(href: string) {
  const response = await route.GET(new NextRequest(href));
  expect(response.status, href).toBe(400);
  const body = (await response.json()) as {
    data: { details: { param: string; message: string }[] };
  };
  return body.data.details[0];
}

/** A playground link's `style` value naming the frame as `name`. */
const linkStyle = (name: string, labels: object = {}) =>
  `1.${Buffer.from(
    JSON.stringify({ r: { style: "custom", ...labels }, of: name }),
  ).toString("base64url")}`;

// Each way the API takes an official frame by name.
const WAYS = {
  frame: (name: string) => ({ frame: name, frameText: "Hello autumn" }),
  "a frame's style": (name: string) => ({
    style: JSON.stringify({ frame: { style: name, text: "Hello autumn" } }),
  }),
  "a playground link's style": (name: string) => ({
    style: linkStyle(name, { text: "Hello autumn" }),
  }),
};
const INLINE = {
  style: JSON.stringify({
    frame: { style: "custom", spec, text: "Hello autumn" },
  }),
};

const redesignedInline = {
  style: JSON.stringify({
    frame: { style: "custom", spec: REDESIGNED, text: "Hello autumn" },
  }),
};

describe("Official frame versions in the image URL", () => {
  it("copies the frame with the version on screen", () => {
    const { url: copied } = imageSnippet({
      style: { frame: { style: "custom", spec, text: "Hello autumn" } },
      value: VALUE,
      contentType: "url",
      content: { type: "url", url: VALUE },
      officialFrames: OFFICIAL_FRAME_RESOLVER,
    });
    expect(copied.startsWith(`${IMAGE_API_URL}?`)).toBe(true);
    expect(copied).toContain(`&frame=${ID}.v1&frameText=Hello+autumn`);
    expect(copied).not.toContain("qrdx.frame");
  });

  for (const [way, query] of Object.entries(WAYS)) {
    it(`${way}: a version and a bare id are cached for good, .latest briefly, all the same image today`, async () => {
      const [inline, pinned, bare, latest] = await Promise.all([
        render(route, url(INLINE)),
        render(route, url(query(`${ID}.v1`))),
        render(route, url(query(ID))),
        render(route, url(query(`${ID}.latest`))),
      ]);
      for (const drawn of [pinned, bare, latest]) {
        expect(drawn.body.equals(inline.body)).toBe(true);
      }
      expect([pinned.cache, pinned.cdn]).toEqual([IMMUTABLE, IMMUTABLE]);
      expect([bare.cache, bare.cdn]).toEqual([IMMUTABLE, IMMUTABLE]);
      expect([latest.cache, latest.cdn]).toEqual([
        FOLLOWS_LATEST,
        FOLLOWS_LATEST_CDN,
      ]);
    });
  }

  it("takes a frame name in any case", async () => {
    const [lower, upper, latest] = await Promise.all([
      render(route, url({ frame: `${ID}.v1` })),
      render(route, url({ frame: "Autumn-Maple.V1" })),
      render(route, url({ frame: "AUTUMN-MAPLE.LATEST" })),
    ]);
    expect(upper.body.equals(lower.body)).toBe(true);
    expect(upper.cache).toBe(IMMUTABLE);
    expect(latest.body.equals(lower.body)).toBe(true);
    expect(latest.cache).toBe(FOLLOWS_LATEST);
  });

  it("refuses a version the frame doesn't have, naming the parameter and the versions it has", async () => {
    for (const [query, param] of [
      [{ frame: `${ID}.v9` }, "frame"],
      [WAYS["a frame's style"](`${ID}.v9`), "style.frame.style"],
      [WAYS["a playground link's style"](`${ID}.v9`), "style"],
    ] as const) {
      const detail = await refusal(url(query));
      expect(detail?.param).toBe(param);
      expect(detail?.message).toContain(`${ID} has no version 9`);
      expect(detail?.message).toContain(`Its versions: ${ID}.v1;`);
      expect(detail?.message).toContain(`${ID}.latest follows the newest`);
    }
    // No such frame, with a version or not
    for (const frame of [
      "not-a-frame",
      "not-a-frame.v1",
      "not-a-frame.latest",
    ]) {
      expect((await refusal(url({ frame })))?.message, frame).toMatch(
        new RegExp(`^No frame "${frame}"`),
      );
    }
    // Not a frame name's shape
    for (const frame of [
      `${ID}.v0`,
      `${ID}.1`,
      `${ID}.v01`,
      `${ID}.v1.v1`,
      `${ID}.newest`,
      `${ID}.v1.latest`,
    ]) {
      expect((await refusal(url({ frame })))?.param, frame).toBe("frame");
    }
  });

  it("keeps drawing v1 and the bare id after the frame is redesigned; v2 and .latest draw the redesign", async () => {
    const ways = Object.values(WAYS);
    const before = await Promise.all(
      ways.map((query) => render(route, url(query(`${ID}.v1`)))),
    );

    // The same app after QRdx changes the frame and records the change as
    // v2 (bun run --filter app frames:versions): a new spec in the
    // catalogue, v2 in the record, v2 as the frame's newest version.
    vi.resetModules();
    vi.doMock("qrdx", async () => {
      const actual = await vi.importActual<typeof import("qrdx")>("qrdx");
      const frames = actual.OFFICIAL_FRAMES.map((frame) =>
        frame.id === ID ? { ...frame, spec: REDESIGNED } : frame,
      );
      return {
        ...actual,
        OFFICIAL_FRAMES: frames,
        getOfficialFrame: (id: string) => frames.find((f) => f.id === id),
      };
    });
    vi.doMock("@/lib/frames/versions/record.json", async () => {
      const actual = await vi.importActual<{
        default: Record<string, unknown[]>;
      }>("@/lib/frames/versions/record.json");
      return {
        default: {
          ...actual.default,
          [ID]: [
            ...(actual.default[ID] ?? []),
            { v: 2, hash: frameSpecHash(REDESIGNED), spec: REDESIGNED },
          ],
        },
      };
    });
    vi.doMock("@/lib/frames/versions/latest", () => ({
      LATEST_FRAME_VERSIONS: { [ID]: 2 },
    }));
    try {
      const redesigned = await import("@/app/api/v1/qr/route");
      const redesign = await render(redesigned, url(redesignedInline));
      expect(redesign.body.toString("utf8")).toContain("#0f766e");

      for (const [index, query] of ways.entries()) {
        const [v1, bare, v2, latest] = await Promise.all([
          render(redesigned, url(query(`${ID}.v1`))),
          render(redesigned, url(query(ID))),
          render(redesigned, url(query(`${ID}.v2`))),
          render(redesigned, url(query(`${ID}.latest`))),
        ]);
        const old = before[index]?.body ?? Buffer.alloc(0);
        expect(v1.body.equals(old), `v1 ${index}`).toBe(true);
        expect(bare.body.equals(old), `bare ${index}`).toBe(true);
        expect(v2.body.equals(redesign.body), `v2 ${index}`).toBe(true);
        expect(latest.body.equals(redesign.body), `latest ${index}`).toBe(true);
        expect([v1.cache, bare.cache, v2.cache, latest.cache]).toEqual([
          IMMUTABLE,
          IMMUTABLE,
          IMMUTABLE,
          FOLLOWS_LATEST,
        ]);
      }

      // The editor now copies v2
      const fresh = await import(
        "@/components/editor/action-bar/code-snippets"
      );
      const { OFFICIAL_FRAME_RESOLVER: resolver } = await import(
        "@/lib/community/catalog"
      );
      const { url: copied } = fresh.imageSnippet({
        style: { frame: { style: "custom", spec: REDESIGNED, text: "Hi" } },
        value: VALUE,
        contentType: "url",
        content: { type: "url", url: VALUE },
        officialFrames: resolver,
      });
      expect(copied).toContain(`&frame=${ID}.v2&frameText=Hi`);

      // Playground links made before the redesign (a bare id, as every link
      // made before versions has, or v1): read on the server, like in the
      // browser, they keep their frame at its newest design; the image API
      // still draws v1 for the same values.
      const { decodeStyleParam: decode } = await import(
        "@/lib/playground-style"
      );
      for (const name of [ID, `${ID}.v1`]) {
        const value = linkStyle(name, { text: "Hello autumn" });
        expect(decode(value, resolver)?.styles.frame, name).toEqual({
          style: "custom",
          text: "Hello autumn",
          spec: REDESIGNED,
        });
        const drawn = await render(redesigned, url({ style: value }));
        expect(
          drawn.body.equals(before[2]?.body ?? Buffer.alloc(0)),
          name,
        ).toBe(true);
        expect(drawn.cache, name).toBe(IMMUTABLE);
      }
      // A version past the newest is still unknown
      expect(
        decode(linkStyle(`${ID}.v3`, { text: "Hello autumn" }), resolver),
      ).toBeNull();
    } finally {
      vi.doUnmock("qrdx");
      vi.doUnmock("@/lib/frames/versions/record.json");
      vi.doUnmock("@/lib/frames/versions/latest");
      vi.resetModules();
    }
  });
});

describe("Official frame versions in playground links", () => {
  const frame = { style: "custom" as const, spec, text: "Hello autumn" };

  it("names the frame with its version, so the link's style draws this version in the image API", () => {
    const encoded = encodeStyleParam(
      { frame },
      { officialFrames: OFFICIAL_FRAME_RESOLVER },
    );
    expect(encoded?.value).toBe(
      linkStyle(`${ID}.v1`, { text: "Hello autumn" }),
    );
    // The playground loads the frame by its id
    expect(officialFrameIdOfStyleParam(encoded?.value)).toBe(ID);
    expect(
      decodeStyleParam(encoded?.value, OFFICIAL_FRAME_RESOLVER)?.styles.frame,
    ).toEqual(frame);
  });

  it("decodes links made before versions exactly as before", () => {
    const old = packStyleParam({ frame } as never, undefined, ID);
    expect(old).toBe(linkStyle(ID, { text: "Hello autumn" }));
    expect(officialFrameIdOfStyleParam(old)).toBe(ID);
    expect(
      decodeStyleParam(old, OFFICIAL_FRAME_RESOLVER)?.styles.frame,
    ).toEqual(frame);
  });
});

describe("Older versions where only the newest design is at hand", () => {
  it("open at the newest, in the playground and in links read on the server", async () => {
    vi.resetModules();
    vi.doMock("@/lib/frames/versions/latest", () => ({
      LATEST_FRAME_VERSIONS: { [ID]: 2 },
    }));
    try {
      const { currentIdOf, pinFrameName } = await import(
        "@/lib/frames/versions/names"
      );
      expect(pinFrameName(ID)).toBe(`${ID}.v2`);
      expect(pinFrameName("menu-cutlery")).toBe("menu-cutlery.v1");
      expect(currentIdOf(`${ID}.v2`)).toBe(ID);
      expect(currentIdOf(`${ID}.latest`)).toBe(ID);
      // Only v2 is at hand: a link naming v1, or a bare id (v1), opens at it
      expect(currentIdOf(`${ID}.v1`)).toBe(ID);
      expect(currentIdOf(ID)).toBe(ID);
      expect(currentIdOf(`${ID}.v3`)).toBeUndefined();
      expect(currentIdOf("menu-cutlery.v2")).toBeUndefined();
      expect(currentIdOf("constructor.v2")).toBeUndefined();
    } finally {
      vi.doUnmock("@/lib/frames/versions/latest");
      vi.resetModules();
    }
  });
});

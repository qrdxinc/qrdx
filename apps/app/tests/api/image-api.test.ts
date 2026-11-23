// GET /v1/qr, as apps/docs/content/docs/developers/image-api.mdx describes it: the
// original parameters render exactly as before (cached for a year), and the
// editor's styles come in through `style` (JSON or a playground style value),
// `frame`/`frameText` and `logoIcon`, still keyless, deterministic and
// cached. Every styled code here is decoded back.
import { NextRequest } from "next/server";
import { OFFICIAL_FRAMES } from "qrdx";
import { describe, expect, it, vi } from "vitest";
import { readBMP } from "../../../../packages/qrdx/tests/support/bmp";
import { readICO } from "../../../../packages/qrdx/tests/support/ico";
import {
  decodeQR,
  rasterizeSvg,
} from "../../../../packages/qrdx/tests/support/raster";

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
const { renderQrSvg } = await import("@/lib/qr-render");
const { qrImageQuerySchema } = await import("@/app/api/v1/qr/_lib/query");
const { encodeStyleParam } = await import("@/lib/playground-style");

const IMMUTABLE = "public, max-age=31536000, immutable";
const get = (query: string) =>
  route.GET(new NextRequest(`http://localhost:3000/api/v1/qr?${query}`));
const q = (params: Record<string, string>) =>
  new URLSearchParams(params).toString();
const decodes = (svg: string, width = 520) =>
  decodeQR(rasterizeSvg(svg, { width, pad: 24 }));

describe("the original parameters", () => {
  it("render byte for byte as the original renderer, cached for a year", async () => {
    const query =
      "data=https://qrdx.dev&size=256&fg=155dfc&body=rounded&eye=rounded&dot=rounded&template=Arrow";
    const response = await get(query);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(IMMUTABLE);
    const expected = renderQrSvg(
      qrImageQuerySchema.parse(Object.fromEntries(new URLSearchParams(query))),
    );
    expect(await response.text()).toBe(expected);
  });
});

describe("the editor's styles", () => {
  it("takes gradients, eye and dot colours, a border and a frame as style JSON", async () => {
    const style = {
      fgColor: {
        type: "linear",
        angle: 45,
        stops: [
          { color: "#1d4ed8", offset: 0 },
          { color: "#7c3aed", offset: 100 },
        ],
      },
      eyeColor: "#b91c1c",
      dotColor: "#111827",
      bodyPattern: "rounded",
      frame: { style: "banner-bottom", text: "See the menu" },
    };
    const response = await get(
      q({
        data: "https://qrdx.dev/menu",
        size: "300",
        style: JSON.stringify(style),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const svg = await response.text();
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain("#b91c1c");
    // The frame adds to the code's 300 px.
    expect(Number(/height="([\d.]+)"/.exec(svg)?.[1])).toBeGreaterThan(300);
    expect(decodes(svg)).toBe("https://qrdx.dev/menu");
  });

  it("takes a playground link's style value and a custom frame spec", async () => {
    const frame = OFFICIAL_FRAMES.find((item) => item.id === "wifi-card");
    const encoded = encodeStyleParam({
      fgColor: "#14532d",
      cornerEyePattern: "rounded",
      frame: { style: "custom", spec: frame?.spec },
    } as never);
    expect(encoded?.omitted).toEqual([]);
    const response = await get(
      q({ data: "https://qrdx.dev/link", style: encoded?.value ?? "" }),
    );
    expect(response.status).toBe(200);
    const svg = await response.text();
    expect(svg).toContain("#14532d");
    expect(decodes(svg, 640)).toBe("https://qrdx.dev/link");
  });

  it("adds a built-in frame and a quick logo icon from flat parameters", async () => {
    const response = await get(
      q({
        data: "https://qrdx.dev/wifi",
        frame: "speech-bubble",
        frameText: "Join",
        logoIcon: "wifi",
        level: "H",
      }),
    );
    expect(response.status).toBe(200);
    const svg = await response.text();
    expect(svg).toContain("data-qrdx-icon%3D%22wifi%22");
    expect(decodes(svg)).toBe("https://qrdx.dev/wifi");
  });

  it("flat parameters win over style", async () => {
    const response = await get(
      q({
        data: "x",
        fg: "0f172a",
        style: JSON.stringify({ fgColor: "#ff0000" }),
      }),
    );
    const svg = await response.text();
    expect(svg).toContain("#0f172a");
    expect(svg).not.toContain("#ff0000");
  });

  it("raises error correction for a logo, so a small code still scans", async () => {
    const response = await get(
      q({ data: "https://qrdx.dev/gen", size: "320", logoIcon: "link" }),
    );
    expect(decodes(await response.text())).toBe("https://qrdx.dev/gen");
  });

  it("sizes PNG and EPS to the frame", async () => {
    const png = await get(
      q({ data: "x", size: "200", format: "png", frame: "border" }),
    );
    expect(png.headers.get("content-type")).toBe("image/png");
    const bytes = Buffer.from(await png.arrayBuffer());
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(200);
    const eps = await get(q({ data: "x", format: "eps", frame: "border" }));
    expect(eps.headers.get("content-type")).toBe("application/postscript");
    expect((await eps.text()).startsWith("%!PS")).toBe(true);
  });

  it("names every problem, keeps CORS and never caches errors", async () => {
    const cases: [Record<string, string>, string, RegExp][] = [
      [
        { style: JSON.stringify({ customLogo: "https://x.example/l.png" }) },
        "style.customLogo",
        /logoFileId/,
      ],
      [{ style: JSON.stringify({ art: {} }) }, "style.art", /art/],
      [
        { style: JSON.stringify({ fgColor: "url(#x)" }) },
        "style.fgColor",
        /colour/,
      ],
      [{ style: JSON.stringify({ colour: "#000" }) }, "style", /Unrecognized/],
      [{ style: "{oops" }, "style", /JSON/],
      [{ frameText: "Hi" }, "frameText", /no frame/],
      [{ frame: "nope" }, "frame", /./],
      [{ logoIcon: "skull" }, "logoIcon", /./],
    ];
    for (const [params, param, message] of cases) {
      const response = await get(q({ data: "x", ...params }));
      expect(response.status, param).toBe(400);
      expect(response.headers.get("cache-control"), param).toBe("no-store");
      expect(response.headers.get("access-control-allow-origin"), param).toBe(
        "*",
      );
      const body = await response.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.data.details[0], param).toMatchObject({ param });
      expect(body.data.details[0].message, param).toMatch(message);
    }
  });
});

describe("WebP", () => {
  const pixels = async (response: Response) => {
    const { default: sharp } = await import("sharp");
    const bytes = Buffer.from(await response.arrayBuffer());
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { bytes, data: new Uint8ClampedArray(data), info };
  };
  const isLosslessWebp = (bytes: Buffer) =>
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 16) === "WEBPVP8L";

  it("is the PNG's pixels, lossless and smaller, with the same caching", async () => {
    const query = { data: "https://qrdx.dev/webp", size: "300", fg: "155dfc" };
    const [webp, png] = await Promise.all([
      get(q({ ...query, format: "webp" })),
      get(q({ ...query, format: "png" })),
    ]);
    expect(webp.status).toBe(200);
    expect(webp.headers.get("content-type")).toBe("image/webp");
    expect(webp.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(webp.headers.get("cdn-cache-control")).toBe(IMMUTABLE);
    expect(webp.headers.get("access-control-allow-origin")).toBe("*");
    const fromWebp = await pixels(webp);
    const fromPng = await pixels(png);
    expect(isLosslessWebp(fromWebp.bytes)).toBe(true);
    expect([fromWebp.info.width, fromWebp.info.height]).toEqual([300, 300]);
    expect(
      Buffer.compare(Buffer.from(fromWebp.data), Buffer.from(fromPng.data)),
    ).toBe(0);
    expect(fromWebp.bytes.length).toBeLessThan(fromPng.bytes.length);
    expect(decodeQR({ data: fromWebp.data, width: 300, height: 300 })).toBe(
      "https://qrdx.dev/webp",
    );
  });

  it("takes WEBP in any case, and styles, frames and a transparent background", async () => {
    const response = await get(
      q({
        data: "https://qrdx.dev/styled",
        size: "240",
        format: "WEBP",
        frame: "border",
        style: JSON.stringify({ bgColor: "transparent" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    const { bytes, data, info } = await pixels(response);
    expect(isLosslessWebp(bytes)).toBe(true);
    // The frame makes it larger than the code.
    expect(info.width).toBeGreaterThan(240);
    const alphas = new Set<number>();
    for (let index = 3; index < data.length; index += 4) {
      alphas.add(data[index] as number);
    }
    expect(alphas.has(0)).toBe(true);
    expect(alphas.has(255)).toBe(true);
  });
});

describe("BMP", () => {
  const bmpOf = async (response: Response) =>
    new Uint8Array(await response.arrayBuffer());
  const pngPixels = async (response: Response) => {
    const { default: sharp } = await import("sharp");
    const { data, info } = await sharp(
      Buffer.from(await response.arrayBuffer()),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), info };
  };

  it("is the PNG's pixels as a 24-bit BMP, with the same caching", async () => {
    const query = { data: "https://qrdx.dev/bmp", size: "300", fg: "155dfc" };
    const [bmp, png] = await Promise.all([
      get(q({ ...query, format: "bmp" })),
      get(q({ ...query, format: "png" })),
    ]);
    expect(bmp.status).toBe(200);
    expect(bmp.headers.get("content-type")).toBe("image/bmp");
    expect(bmp.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(bmp.headers.get("cdn-cache-control")).toBe(IMMUTABLE);
    expect(bmp.headers.get("access-control-allow-origin")).toBe("*");
    const bytes = await bmpOf(bmp);
    expect(String.fromCharCode(bytes[0] as number, bytes[1] as number)).toBe(
      "BM",
    );
    const decoded = readBMP(bytes);
    const fromPng = await pngPixels(png);
    expect([decoded.width, decoded.height]).toEqual([300, 300]);
    expect(
      Buffer.compare(Buffer.from(decoded.rgba), Buffer.from(fromPng.data)),
    ).toBe(0);
    expect(decodeQR({ data: decoded.rgba, width: 300, height: 300 })).toBe(
      "https://qrdx.dev/bmp",
    );
  });

  it("takes BMP in any case, and styles and frames, sized by the frame", async () => {
    const response = await get(
      q({
        data: "https://qrdx.dev/styled",
        size: "240",
        format: "BMP",
        frame: "border",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/bmp");
    const { width } = readBMP(await bmpOf(response));
    // The frame makes it larger than the code.
    expect(width).toBeGreaterThan(240);
  });

  it("lays a transparent background over white, since 24-bit BMP has no alpha", async () => {
    const response = await get(
      q({
        data: "https://qrdx.dev/transparent",
        size: "240",
        format: "bmp",
        style: JSON.stringify({ bgColor: "transparent" }),
      }),
    );
    expect(response.status).toBe(200);
    const { width, height, rgba } = readBMP(await bmpOf(response));
    expect([width, height]).toEqual([240, 240]);
    // Both corners are in the quiet zone: white, not black.
    expect([...rgba.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...rgba.subarray((width * height - 1) * 4)]).toEqual([
      255, 255, 255, 255,
    ]);
    // The modules are still there and the code scans.
    expect(decodeQR({ data: rgba, width, height })).toBe(
      "https://qrdx.dev/transparent",
    );
  });
});

describe("TIFF", () => {
  const pixelsOf = async (bytes: Uint8Array) => {
    const { default: sharp } = await import("sharp");
    const { data, info } = await sharp(Buffer.from(bytes))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), info };
  };
  const tag = (bytes: Uint8Array, id: number) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ifd = view.getUint32(4, true);
    for (let i = 0; i < view.getUint16(ifd, true); i++) {
      const entry = ifd + 2 + i * 12;
      if (view.getUint16(entry, true) === id) {
        return view.getUint16(entry + 8, true);
      }
    }
    return undefined;
  };

  it("is the PNG's pixels as a TIFF at 300 dpi, with the same caching", async () => {
    const { default: sharp } = await import("sharp");
    const query = {
      data: "https://qrdx.dev/tiff",
      size: "300",
      fg: "155dfc",
      style: JSON.stringify({ bgColor: "transparent" }),
    };
    const [tiff, png] = await Promise.all([
      get(q({ ...query, format: "tiff" })),
      get(q({ ...query, format: "png" })),
    ]);
    expect(tiff.status).toBe(200);
    expect(tiff.headers.get("content-type")).toBe("image/tiff");
    expect(tiff.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(tiff.headers.get("access-control-allow-origin")).toBe("*");
    const bytes = new Uint8Array(await tiff.arrayBuffer());
    expect(String.fromCharCode(bytes[0] as number, bytes[1] as number)).toBe(
      "II",
    );
    expect((await sharp(Buffer.from(bytes)).metadata()).density).toBe(300);
    const fromTiff = await pixelsOf(bytes);
    const fromPng = await pixelsOf(new Uint8Array(await png.arrayBuffer()));
    // Every pixel, transparency included
    expect(
      Buffer.compare(Buffer.from(fromTiff.data), Buffer.from(fromPng.data)),
    ).toBe(0);
    expect(decodeQR({ data: fromTiff.data, width: 300, height: 300 })).toBe(
      "https://qrdx.dev/tiff",
    );
  });

  it("writes CMYK for print by the engine's conversion, not sharp's, and it scans", async () => {
    const { default: sharp } = await import("sharp");
    const response = await get(
      q({
        data: "https://qrdx.dev/cmyk",
        size: "240",
        format: "TIFF-CMYK",
        style: JSON.stringify({ bgColor: "transparent" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/tiff");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(tag(bytes, 262)).toBe(5); // separated (CMYK)
    expect(tag(bytes, 332)).toBe(1); // InkSet: CMYK
    const meta = await sharp(Buffer.from(bytes)).metadata();
    expect([meta.space, meta.hasProfile]).toEqual(["cmyk", false]);
    const { data, info } = await pixelsOf(bytes);
    // The quiet zone's corner: no ink, white
    expect([...data.subarray(0, 3)]).toEqual([255, 255, 255]);
    expect(decodeQR({ data, width: info.width, height: info.height })).toBe(
      "https://qrdx.dev/cmyk",
    );
  });
});

describe("GIF", () => {
  const gifOf = async (response: Response) => {
    const { default: sharp } = await import("sharp");
    const bytes = Buffer.from(await response.arrayBuffer());
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { bytes, data: new Uint8ClampedArray(data), info };
  };
  const isGif = (bytes: Buffer) => bytes.toString("latin1", 0, 4) === "GIF8";

  it("is the PNG's pixels in at most 256 colors, with the same caching", async () => {
    const query = { data: "https://qrdx.dev/gif", size: "300", fg: "155dfc" };
    const [gif, png] = await Promise.all([
      get(q({ ...query, format: "gif" })),
      get(q({ ...query, format: "png" })),
    ]);
    expect(gif.status).toBe(200);
    expect(gif.headers.get("content-type")).toBe("image/gif");
    expect(gif.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(gif.headers.get("cdn-cache-control")).toBe(IMMUTABLE);
    expect(gif.headers.get("access-control-allow-origin")).toBe("*");
    const fromGif = await gifOf(gif);
    const fromPng = await gifOf(png);
    expect(isGif(fromGif.bytes)).toBe(true);
    expect([fromGif.info.width, fromGif.info.height]).toEqual([300, 300]);
    // A GIF can't say more than 256 colors, and a flat code needs fewer
    const colors = new Set<number>();
    for (let at = 0; at < fromGif.data.length; at += 4) {
      colors.add(
        ((fromGif.data[at] as number) << 16) |
          ((fromGif.data[at + 1] as number) << 8) |
          (fromGif.data[at + 2] as number),
      );
    }
    expect(colors.size).toBeLessThanOrEqual(256);
    expect(decodeQR({ data: fromGif.data, width: 300, height: 300 })).toBe(
      "https://qrdx.dev/gif",
    );
    // Same pixels as the PNG, give or take the palette's rounding
    let worst = 0;
    for (let at = 0; at < fromGif.data.length; at++) {
      worst = Math.max(
        worst,
        Math.abs((fromGif.data[at] as number) - (fromPng.data[at] as number)),
      );
    }
    expect(worst).toBeLessThan(40);
  });

  it("takes GIF in any case, and styles, frames and a transparent background", async () => {
    const response = await get(
      q({
        data: "https://qrdx.dev/styled-gif",
        size: "240",
        format: "GIF",
        frame: "border",
        style: JSON.stringify({ bgColor: "transparent" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/gif");
    const { bytes, data, info } = await gifOf(response);
    expect(isGif(bytes)).toBe(true);
    // The frame makes it larger than the code.
    expect(info.width).toBeGreaterThan(240);
    // GIF has one transparent color: every pixel is clear or solid
    const alphas = new Set<number>();
    for (let at = 3; at < data.length; at += 4) {
      alphas.add(data[at] as number);
    }
    expect([...alphas].sort((a, b) => a - b)).toEqual([0, 255]);
  });

  it("scans after a gradient is reduced to a palette", async () => {
    const style = {
      fgColor: {
        type: "linear",
        angle: 45,
        stops: [
          { color: "#1d4ed8", offset: 0 },
          { color: "#0f172a", offset: 100 },
        ],
      },
    };
    const response = await get(
      q({
        data: "https://qrdx.dev/gradient-gif",
        size: "400",
        format: "gif",
        style: JSON.stringify(style),
      }),
    );
    expect(response.status).toBe(200);
    const { data, info } = await gifOf(response);
    expect(decodeQR({ data, width: info.width, height: info.height })).toBe(
      "https://qrdx.dev/gradient-gif",
    );
  });
});

describe("ICO", () => {
  const icoOf = async (response: Response) =>
    new Uint8Array(await response.arrayBuffer());
  const rawOf = async (png: Uint8Array | Buffer) => {
    const { default: sharp } = await import("sharp");
    const { data, info } = await sharp(Buffer.from(png))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), info };
  };

  it("is a favicon with the code at 16, 32, 48 and 256 px, and the same caching", async () => {
    const response = await get(
      q({ data: "https://qrdx.dev/ico", format: "ico", fg: "155dfc" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "image/vnd.microsoft.icon",
    );
    expect(response.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(response.headers.get("cdn-cache-control")).toBe(IMMUTABLE);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const entries = readICO(await icoOf(response));
    expect(entries.map((entry) => [entry.width, entry.height])).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
      [256, 256],
    ]);
    for (const entry of entries) {
      expect(entry.bitCount).toBe(32);
      const { info } = await rawOf(entry.png);
      expect([info.width, info.height]).toEqual([entry.width, entry.height]);
    }
  });

  it("scans at 256 px and is the PNG render scaled down to each size", async () => {
    const query = { data: "https://qrdx.dev/ico", fg: "155dfc" };
    const entries = readICO(
      await icoOf(await get(q({ ...query, format: "ico" }))),
    );
    const { default: sharp } = await import("sharp");
    const master = new Uint8Array(
      await (
        await get(q({ ...query, format: "png", size: "1024" }))
      ).arrayBuffer(),
    );
    for (const entry of entries) {
      const expected = await sharp(Buffer.from(master))
        .resize(entry.width, entry.height, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: "lanczos3",
        })
        .ensureAlpha()
        .raw()
        .toBuffer();
      const decoded = await rawOf(entry.png);
      expect(
        Buffer.compare(Buffer.from(decoded.data), expected),
        `${entry.width} px`,
      ).toBe(0);
    }
    const large = entries.at(-1);
    const { data, info } = await rawOf(large?.png as Uint8Array);
    expect(decodeQR({ data, width: info.width, height: info.height })).toBe(
      "https://qrdx.dev/ico",
    );
  });

  it("takes ICO in any case, and ignores size and a frame", async () => {
    const plainResponse = await get(q({ data: "x", format: "ico" }));
    expect(plainResponse.status).toBe(200);
    expect(plainResponse.headers.get("content-type")).toBe(
      "image/vnd.microsoft.icon",
    );
    const plain = await icoOf(plainResponse);
    expect(readICO(plain)).toHaveLength(4);
    const sized = await icoOf(
      await get(q({ data: "x", format: "ICO", size: "64" })),
    );
    const huge = await icoOf(
      await get(q({ data: "x", format: "ico", size: "2000" })),
    );
    const framed = await icoOf(
      await get(q({ data: "x", format: "ico", frame: "border" })),
    );
    for (const other of [sized, huge, framed]) {
      expect(Buffer.compare(Buffer.from(other), Buffer.from(plain))).toBe(0);
    }
  });

  it("keeps a transparent background transparent at every size", async () => {
    const response = await get(
      q({
        data: "https://qrdx.dev/transparent",
        format: "ico",
        style: JSON.stringify({ bgColor: "transparent" }),
      }),
    );
    expect(response.status).toBe(200);
    for (const entry of readICO(await icoOf(response))) {
      const { data } = await rawOf(entry.png);
      expect(data[3], `${entry.width} px corner`).toBe(0);
      expect(Math.max(...data.filter((_, i) => i % 4 === 3))).toBeGreaterThan(
        0,
      );
    }
  });
});

describe("ICO from a PNG that isn't square", () => {
  it("fits it whole in each size, with a transparent margin", async () => {
    const { default: sharp } = await import("sharp");
    const { convertPng } = await import("@/lib/qr-image-formats");
    const wide = await sharp({
      create: {
        width: 300,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const entries = readICO(await convertPng(new Uint8Array(wide), "ico"));
    expect(entries.map((entry) => entry.width)).toEqual([16, 32, 48, 256]);
    const { data, info } = await sharp(
      Buffer.from(entries[3]?.png as Uint8Array),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([256, 256]);
    // Top-left is margin (transparent); the middle is the red bar (opaque)
    expect(data[3]).toBe(0);
    const middle = (128 * 256 + 128) * 4;
    expect([data[middle], data[middle + 3]]).toEqual([255, 255]);
  });
});

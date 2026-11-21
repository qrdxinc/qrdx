import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { buildSVGString, saveOutput } from "../src/render/output.js";

const tmp = (name: string) => join(tmpdir(), `qrdx-output-test-${name}`);

const cleanups: string[] = [];
afterEach(() => {
  for (const f of cleanups.splice(0)) {
    if (existsSync(f)) {
      rmSync(f);
    }
  }
});

describe("buildSVGString", () => {
  it("returns a string starting with <svg", () => {
    const svg = buildSVGString({ value: "https://qrdx.dev" });
    expect(svg).toMatch(/^<svg/);
  });

  it("includes width and height attributes", () => {
    const svg = buildSVGString({ value: "https://qrdx.dev", size: 256 });
    expect(svg).toContain('width="256"');
    expect(svg).toContain('height="256"');
  });

  it("uses default size of 512 when not specified", () => {
    const svg = buildSVGString({ value: "https://qrdx.dev" });
    expect(svg).toContain('width="512"');
  });

  it("encodes the given value as a scannable QR", () => {
    const svg = buildSVGString({ value: "hello-world" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toMatch(/<(path|rect)/);
  });

  it("respects foreground color", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      fgColor: "#ff0000",
    });
    expect(svg).toContain("#ff0000");
  });

  it("respects background color", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      bgColor: "#0000ff",
    });
    expect(svg).toContain("#0000ff");
  });

  it("accepts body pattern", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      bodyPattern: "circle",
    });
    expect(svg).toMatch(/^<svg/);
  });

  it("accepts corner eye pattern", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      cornerEyePattern: "gear",
    });
    expect(svg).toMatch(/^<svg/);
  });

  it("accepts corner dot pattern", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      cornerEyeDotPattern: "star",
    });
    expect(svg).toMatch(/^<svg/);
  });
});

describe("buildSVGString – frames", () => {
  it("keeps the QR code at full size inside the frame", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      size: 300,
      frame: { style: "border", text: "Hi" },
    });
    expect(svg).toMatch(/^<svg[^>]*width="372"/);
    // The code itself is nested at its original size.
    expect(svg).toMatch(/<svg[^>]*height="300"[^>]*width="300"[^>]*x="36"/);
  });

  it("caps the label at 24 characters", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      frame: { style: "banner-top", text: "A".repeat(30) },
    });
    expect(svg).toContain(`>${"A".repeat(24)}</text>`);
  });

  it("puts caller SVG attributes on the outer frame element", () => {
    const svg = buildSVGString({
      value: "https://qrdx.dev",
      frame: { style: "banner-bottom" },
      // @ts-expect-error SVG attribute passthrough
      "aria-label": "Menu QR code",
    });
    expect(svg).toMatch(/^<svg[^>]*aria-label="Menu QR code"/);
    expect(svg.match(/aria-label/g)).toHaveLength(1);
  });
});

describe("saveOutput – SVG", () => {
  it("writes an SVG file to disk", async () => {
    const out = tmp("save.svg");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "svg",
    });
    expect(existsSync(out)).toBe(true);
  });

  it("SVG file begins with <?xml declaration", async () => {
    const out = tmp("xmldecl.svg");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "svg",
    });
    const content = readFileSync(out, "utf-8");
    expect(content).toMatch(/^<\?xml/);
  });

  it("SVG file contains <svg and </svg>", async () => {
    const out = tmp("valid.svg");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "svg",
    });
    const content = readFileSync(out, "utf-8");
    expect(content).toContain("<svg");
    expect(content).toContain("</svg>");
  });
});

describe("saveOutput – PNG", () => {
  it("writes a PNG file to disk", async () => {
    const out = tmp("save.png");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "png",
      size: 128,
    });
    expect(existsSync(out)).toBe(true);
  });

  it("PNG file has correct magic bytes", async () => {
    const out = tmp("magic.png");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "png",
      size: 64,
    });
    const buf = readFileSync(out);
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4e); // N
    expect(buf[3]).toBe(0x47); // G
  });

  // sharp's SVG renderer ignores embedded <image> elements, so the logo has to
  // be composited onto the PNG.
  const redLogo = async () => {
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  };
  const countRedPixels = async (file: string) => {
    const { data, info } = await sharp(file)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let red = 0;
    for (let i = 0; i < info.width * info.height * 3; i += 3) {
      if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) {
        red++;
      }
    }
    const mid =
      (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) *
      3;
    return { red, center: [data[mid], data[mid + 1], data[mid + 2]] };
  };

  it("draws the center logo into the PNG", async () => {
    const out = tmp("logo.png");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "png",
      size: 256,
      level: "H",
      imageSettings: {
        src: await redLogo(),
        width: 52,
        height: 52,
        excavate: true,
      },
    });
    const { red, center } = await countRedPixels(out);
    expect(center).toEqual([255, 0, 0]);
    expect(red).toBeGreaterThan(40 * 40);
  });

  it("draws the logo inside a template", async () => {
    const out = tmp("logo-template.png");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "png",
      size: 300,
      templateId: "SquareBorder",
      imageSettings: {
        src: await redLogo(),
        width: 60,
        height: 60,
        excavate: true,
      },
    });
    const { red } = await countRedPixels(out);
    expect(red).toBeGreaterThan(40 * 40);
  });
});

describe("saveOutput – WebP", () => {
  // jsqr ships with qrdx, so resolve it from there.
  const require = createRequire(import.meta.url);
  const jsQR = createRequire(require.resolve("qrdx/package.json"))(
    "jsqr"
  ) as typeof import("jsqr").default;

  const pixels = async (file: string) => {
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), info };
  };

  it("writes lossless WebP with the PNG's pixels, smaller, and it scans", async () => {
    const webp = tmp("save.webp");
    const png = tmp("same.png");
    cleanups.push(webp, png);
    const props = { value: "https://qrdx.dev/cli-webp", size: 300 };
    await saveOutput({ ...props, outputPath: webp, format: "webp" });
    await saveOutput({ ...props, outputPath: png, format: "png" });
    const bytes = readFileSync(webp);
    expect(bytes.toString("latin1", 0, 4)).toBe("RIFF");
    expect(bytes.toString("latin1", 8, 16)).toBe("WEBPVP8L");
    expect(bytes.length).toBeLessThan(readFileSync(png).length);
    const fromWebp = await pixels(webp);
    const fromPng = await pixels(png);
    expect([fromWebp.info.width, fromWebp.info.height]).toEqual([300, 300]);
    expect(
      Buffer.compare(Buffer.from(fromWebp.data), Buffer.from(fromPng.data))
    ).toBe(0);
    expect(jsQR(fromWebp.data, 300, 300)?.data).toBe(
      "https://qrdx.dev/cli-webp"
    );
  });

  it("keeps a transparent background and a framed size", async () => {
    const out = tmp("frame.webp");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "webp",
      size: 200,
      bgColor: "transparent",
      frame: { style: "banner-bottom", text: "Scan me" },
    });
    const { data, info } = await pixels(out);
    expect(info.height).toBeGreaterThan(info.width);
    const alphas = new Set<number>();
    for (let index = 3; index < data.length; index += 4) {
      alphas.add(data[index] as number);
    }
    expect(alphas.has(0)).toBe(true);
    expect(alphas.has(255)).toBe(true);
  });

  it("draws the center logo into the WebP", async () => {
    const out = tmp("logo.webp");
    cleanups.push(out);
    const logo = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "webp",
      size: 256,
      level: "H",
      imageSettings: {
        src: `data:image/png;base64,${logo.toString("base64")}`,
        width: 52,
        height: 52,
        excavate: true,
      },
    });
    expect(readFileSync(out).toString("latin1", 8, 12)).toBe("WEBP");
    const { data, info } = await pixels(out);
    const mid =
      (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) *
      4;
    expect([data[mid], data[mid + 1], data[mid + 2]]).toEqual([255, 0, 0]);
  });
});

describe("saveOutput – EPS", () => {
  const hasGhostscript = (() => {
    try {
      execFileSync("gs", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  it("writes an EPSF-3.0 file with a bounding box in points", async () => {
    const out = tmp("save.eps");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "eps",
      size: 144,
    });
    const eps = readFileSync(out, "utf-8");
    expect(eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0\n")).toBe(true);
    expect(eps).toContain("%%BoundingBox: 0 0 144 144");
    expect(eps).toContain("%%HiResBoundingBox: 0 0 144 144");
    expect(eps.trimEnd().endsWith("%%EOF")).toBe(true);
    // Modules are vector paths, not an embedded raster
    expect(eps).toMatch(/ m .* l .* f/);
    expect(eps).not.toContain(" image\n");
  });

  it("embeds a PNG logo with the image operator", async () => {
    const out = tmp("logo.eps");
    cleanups.push(out);
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "eps",
      size: 256,
      level: "H",
      imageSettings: {
        src: `data:image/png;base64,${png.toString("base64")}`,
        width: 52,
        height: 52,
        excavate: true,
      },
    });
    const eps = readFileSync(out, "utf-8");
    expect(eps).toContain("/ImageType 1 /Width 16 /Height 16");
    expect(eps).toContain("%%LanguageLevel: 3");
  });

  it("grows the bounding box to fit a frame", async () => {
    const out = tmp("frame.eps");
    cleanups.push(out);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "eps",
      size: 200,
      frame: { style: "banner-bottom", text: "Scan me" },
    });
    const eps = readFileSync(out, "utf-8");
    const [, width, height] = /%%BoundingBox: 0 0 (\d+) (\d+)/.exec(eps) ?? [];
    expect(Number(height)).toBeGreaterThan(Number(width));
    expect(eps).toContain("(Scan me)");
  });

  it.skipIf(!hasGhostscript)("renders with Ghostscript", async () => {
    const out = tmp("gs.eps");
    const png = tmp("gs.png");
    cleanups.push(out, png);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: out,
      format: "eps",
      size: 144,
    });
    execFileSync("gs", [
      "-q",
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-dEPSCrop",
      "-sDEVICE=png16m",
      "-r144",
      "-o",
      png,
      out,
    ]);
    const { width, height } = await sharp(png).metadata();
    expect(width).toBe(288);
    expect(height).toBe(288);
  });
});

describe("saveOutput – BMP", () => {
  // jsqr ships with qrdx, so resolve it from there.
  const require = createRequire(import.meta.url);
  const jsQR = createRequire(require.resolve("qrdx/package.json"))(
    "jsqr"
  ) as typeof import("jsqr").default;

  /** The pixels of a 24-bit bottom-up BMP, top row first, as RGBA. */
  const readBMP = (file: string) => {
    const bytes = readFileSync(file);
    expect(bytes.toString("latin1", 0, 2)).toBe("BM");
    expect(bytes.readUInt32LE(2)).toBe(bytes.length);
    expect(bytes.readUInt16LE(28)).toBe(24);
    expect(bytes.readUInt32LE(30)).toBe(0);
    const width = bytes.readInt32LE(18);
    const height = bytes.readInt32LE(22);
    const offset = bytes.readUInt32LE(10);
    const stride = Math.ceil((width * 3) / 4) * 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) {
      const y = height - 1 - row;
      for (let x = 0; x < width; x++) {
        const from = offset + row * stride + x * 3;
        const to = (y * width + x) * 4;
        data[to] = bytes[from + 2] as number;
        data[to + 1] = bytes[from + 1] as number;
        data[to + 2] = bytes[from] as number;
        data[to + 3] = 255;
      }
    }
    return { width, height, data };
  };

  const pixels = async (file: string) => {
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), info };
  };

  it("writes the PNG's pixels as a 24-bit BMP, and it scans", async () => {
    const bmp = tmp("save.bmp");
    const png = tmp("same-bmp.png");
    cleanups.push(bmp, png);
    const props = { value: "https://qrdx.dev/cli-bmp", size: 300 };
    await saveOutput({ ...props, outputPath: bmp, format: "bmp" });
    await saveOutput({ ...props, outputPath: png, format: "png" });
    const fromBmp = readBMP(bmp);
    const fromPng = await pixels(png);
    expect([fromBmp.width, fromBmp.height]).toEqual([300, 300]);
    expect(
      Buffer.compare(Buffer.from(fromBmp.data), Buffer.from(fromPng.data))
    ).toBe(0);
    expect(jsQR(fromBmp.data, 300, 300)?.data).toBe("https://qrdx.dev/cli-bmp");
  });

  it("lays a transparent background over white, keeps opaque pixels exact and sizes a frame", async () => {
    const bmp = tmp("frame.bmp");
    const png = tmp("frame-bmp.png");
    cleanups.push(bmp, png);
    const props = {
      value: "https://qrdx.dev",
      size: 200,
      bgColor: "transparent",
      frame: { style: "banner-bottom", text: "Scan me" },
    } as const;
    await saveOutput({ ...props, outputPath: bmp, format: "bmp" });
    await saveOutput({ ...props, outputPath: png, format: "png" });
    const fromBmp = readBMP(bmp);
    const fromPng = await pixels(png);
    expect([fromBmp.width, fromBmp.height]).toEqual([
      fromPng.info.width,
      fromPng.info.height,
    ]);
    // The frame makes it taller than wide.
    expect(fromBmp.height).toBeGreaterThan(fromBmp.width);
    let transparent = 0;
    let opaque = 0;
    for (let index = 0; index < fromPng.data.length; index += 4) {
      const alpha = fromPng.data[index + 3] as number;
      const out = fromBmp.data.subarray(index, index + 4);
      if (alpha === 0) {
        transparent++;
        expect([...out]).toEqual([255, 255, 255, 255]);
      } else if (alpha === 255) {
        opaque++;
        expect([...out]).toEqual([...fromPng.data.subarray(index, index + 4)]);
      }
    }
    // Both kinds are really there, so neither branch passed on nothing.
    expect(transparent).toBeGreaterThan(0);
    expect(opaque).toBeGreaterThan(0);
  });
});

describe("saveOutput – ICO", () => {
  // jsqr ships with qrdx, so resolve it from there.
  const require = createRequire(import.meta.url);
  const jsQR = createRequire(require.resolve("qrdx/package.json"))(
    "jsqr"
  ) as typeof import("jsqr").default;

  /** The images of an ICO whose directory entries hold whole PNG files. */
  const readICO = (file: string) => {
    const bytes = readFileSync(file);
    expect(bytes.readUInt16LE(0)).toBe(0);
    expect(bytes.readUInt16LE(2)).toBe(1);
    const count = bytes.readUInt16LE(4);
    return Array.from({ length: count }, (_, index) => {
      const at = 6 + 16 * index;
      const length = bytes.readUInt32LE(at + 8);
      const offset = bytes.readUInt32LE(at + 12);
      return {
        width: bytes[at] || 256,
        height: bytes[at + 1] || 256,
        bitCount: bytes.readUInt16LE(at + 6),
        png: bytes.subarray(offset, offset + length),
      };
    });
  };

  const pixels = async (png: Uint8Array | Buffer) => {
    const { data, info } = await sharp(Buffer.from(png))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), info };
  };

  it("writes the code at each icon size as a PNG, and the biggest scans", async () => {
    const ico = tmp("save.ico");
    cleanups.push(ico);
    await saveOutput({
      value: "https://qrdx.dev/cli-ico",
      size: 999,
      outputPath: ico,
      format: "ico",
    });
    const images = readICO(ico);
    expect(images.map((image) => [image.width, image.height])).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
      [256, 256],
    ]);
    for (const image of images) {
      expect(image.bitCount).toBe(32);
      const { info } = await pixels(image.png);
      expect([info.width, info.height]).toEqual([image.width, image.height]);
    }
    const large = await pixels(images[3]?.png as Uint8Array);
    expect(jsQR(large.data, 256, 256)?.data).toBe("https://qrdx.dev/cli-ico");
  });

  it("keeps a transparent background and leaves a frame out", async () => {
    const ico = tmp("frame.ico");
    cleanups.push(ico);
    await saveOutput({
      value: "https://qrdx.dev",
      outputPath: ico,
      format: "ico",
      bgColor: "transparent",
      // A margin, so the corner is background (the CLI's own default is none)
      margin: 4,
      frame: { style: "banner-bottom", text: "Scan me" },
    });
    const images = readICO(ico);
    // Square at every size: the banner would have made the 256 px one taller.
    expect(images.map((image) => [image.width, image.height])).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
      [256, 256],
    ]);
    for (const image of images) {
      const { data } = await pixels(image.png);
      expect(data[3], `${image.width} px corner`).toBe(0);
    }
  });
});

describe("saveOutput – GIF", () => {
  // jsqr ships with qrdx, so resolve it from there.
  const require = createRequire(import.meta.url);
  const jsQR = createRequire(require.resolve("qrdx/package.json"))(
    "jsqr"
  ) as typeof import("jsqr").default;

  /**
   * What sharp (an independent reader) makes of a GIF file: RGBA, top row
   * first. sharp reads by content, so the header is checked here: a WebP or
   * PNG with a .gif name would decode just as well.
   */
  const pixels = async (file: string) => {
    const bytes = readFileSync(file);
    expect(bytes.toString("latin1", 0, 6)).toBe("GIF89a");
    expect(bytes.at(-1)).toBe(0x3b);
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), info };
  };

  /** The PNG's pixels: this one is not a GIF, so no header check. */
  const pngPixels = async (file: string) => {
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), info };
  };

  it("writes the PNG's pixels as a GIF, and it scans", async () => {
    const gif = tmp("save.gif");
    const png = tmp("same-gif.png");
    cleanups.push(gif, png);
    const props = { value: "https://qrdx.dev/cli-gif", size: 300 };
    await saveOutput({ ...props, outputPath: gif, format: "gif" });
    await saveOutput({ ...props, outputPath: png, format: "png" });
    const fromGif = await pixels(gif);
    const fromPng = await pngPixels(png);
    expect([fromGif.info.width, fromGif.info.height]).toEqual([300, 300]);
    // A code in flat colors fits in 256 colors, so nothing is lost
    expect(
      Buffer.compare(Buffer.from(fromGif.data), Buffer.from(fromPng.data))
    ).toBe(0);
    expect(jsQR(fromGif.data, 300, 300)?.data).toBe("https://qrdx.dev/cli-gif");
  });

  it("keeps a transparent background transparent and sizes a frame", async () => {
    const gif = tmp("frame.gif");
    const png = tmp("frame-gif.png");
    cleanups.push(gif, png);
    const props = {
      value: "https://qrdx.dev",
      size: 200,
      bgColor: "transparent",
      // A margin, so the corner is background (the CLI's own default is none)
      margin: 4,
      frame: { style: "banner-bottom", text: "Scan me" },
    } as const;
    await saveOutput({ ...props, outputPath: gif, format: "gif" });
    await saveOutput({ ...props, outputPath: png, format: "png" });
    const fromGif = await pixels(gif);
    const fromPng = await pngPixels(png);
    expect([fromGif.info.width, fromGif.info.height]).toEqual([
      fromPng.info.width,
      fromPng.info.height,
    ]);
    // The frame makes it taller than wide.
    expect(fromGif.info.height).toBeGreaterThan(fromGif.info.width);
    // Clear stays clear and solid stays exactly as the PNG has it
    let transparent = 0;
    let opaque = 0;
    for (let index = 0; index < fromPng.data.length; index += 4) {
      const alpha = fromPng.data[index + 3] as number;
      const out = fromGif.data.subarray(index, index + 4);
      if (alpha === 0) {
        transparent++;
        expect(out[3]).toBe(0);
      } else if (alpha === 255) {
        opaque++;
        expect([...out]).toEqual([...fromPng.data.subarray(index, index + 4)]);
      }
    }
    // Both kinds are really there, so neither branch passed on nothing.
    expect(transparent).toBeGreaterThan(0);
    expect(opaque).toBeGreaterThan(0);
    // GIF has one transparent color: every pixel is clear or solid
    const alphas = new Set<number>();
    for (let index = 3; index < fromGif.data.length; index += 4) {
      alphas.add(fromGif.data[index] as number);
    }
    expect([...alphas].sort((a, b) => a - b)).toEqual([0, 255]);
  });

  it("reduces a gradient to a palette and the GIF still scans", async () => {
    const gif = tmp("gradient.gif");
    cleanups.push(gif);
    await saveOutput({
      value: "https://qrdx.dev/cli-gradient",
      size: 400,
      level: "Q",
      outputPath: gif,
      format: "gif",
      fgColor: {
        type: "linear",
        angle: 45,
        stops: [
          { color: "#1d4ed8", offset: 0 },
          { color: "#0f172a", offset: 100 },
        ],
      },
    });
    const { data, info } = await pixels(gif);
    expect(jsQR(data, info.width, info.height)?.data).toBe(
      "https://qrdx.dev/cli-gradient"
    );
  });
});

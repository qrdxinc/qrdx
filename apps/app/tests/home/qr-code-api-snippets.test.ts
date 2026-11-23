// The /qr-code-api URL builder's snippets: formats an <img> can't show (EPS,
// and TIFF outside Safari) get a download link instead of image snippets,
// are previewed in a format a browser shows, and save under a real
// extension (.tif, never .tiff-cmyk).
import { describe, expect, it } from "vitest";
import {
  type ApiQuery,
  apiSnippets,
  previewFormat,
} from "@/app/[lang]/(home)/qr-code-api/snippets";

const query = (format: ApiQuery["format"]): ApiQuery => ({
  data: "https://qrdx.dev",
  format,
  size: 512,
  fg: "#000000",
  bg: "#ffffff",
  body: "square",
  level: "Q",
  logoIcon: "none",
});

describe("apiSnippets", () => {
  it("links TIFF and CMYK TIFF as downloads saved as .tif", () => {
    for (const [format, label] of [
      ["tiff", "TIFF"],
      ["tiff-cmyk", "CMYK TIFF"],
    ] as const) {
      const snippets = apiSnippets("https://api.qrdx.dev/v1", query(format));
      expect(snippets.html).toMatch(
        new RegExp(
          `^<a href="[^"]+" download>Download the QR code \\(${label}\\)</a>$`,
        ),
      );
      expect(snippets.html).not.toContain("<img");
      expect(snippets.markdown).toMatch(/^\[QR code/);
      expect(snippets.curl).toMatch(/^curl -o qr\.tif "/);
    }
  });

  it("keeps EPS as a download and images as <img>", () => {
    expect(apiSnippets("https://x", query("eps")).curl).toMatch(
      /^curl -o qr\.eps "/,
    );
    const png = apiSnippets("https://x", query("png"));
    expect(png.html).toMatch(/^<img /);
    expect(png.curl).toMatch(/^curl -o qr\.png "/);
  });
});

describe("previewFormat", () => {
  it("previews EPS as SVG, TIFF as PNG, and the rest as themselves", () => {
    expect(previewFormat("eps")).toBe("svg");
    expect(previewFormat("tiff")).toBe("png");
    expect(previewFormat("tiff-cmyk")).toBe("png");
    expect(previewFormat("webp")).toBe("webp");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildQrImageQuery,
  isQrImageFormat,
  qrImageFile,
  qrImageUrl,
} from "../nodes/Qrdx/qr-image";

describe("buildQrImageQuery", () => {
  it("sends only data and format by default", () => {
    expect(buildQrImageQuery("https://qrdx.dev", "png")).toEqual({
      data: "https://qrdx.dev",
      format: "png",
    });
  });

  it("maps every option to its GET /qr parameter", () => {
    expect(
      buildQrImageQuery("hello", "svg", {
        size: 1024,
        foregroundColor: "#111827",
        backgroundColor: "#FFFFFF",
        eyeColor: "#155dfc",
        dotColor: "abc",
        bodyShape: "circle",
        eyeShape: "rounded",
        eyeDotShape: "dots",
        errorCorrection: "H",
        margin: 0,
        frame: "banner-bottom",
        frameText: "Menu",
        logoIcon: "wifi",
        fileName: "menu",
        baseUrl: "https://api.qrdx.dev/v1",
      })
    ).toEqual({
      data: "hello",
      format: "svg",
      size: "1024",
      fg: "111827",
      bg: "FFFFFF",
      eyeColor: "155dfc",
      dotColor: "abc",
      body: "circle",
      eye: "rounded",
      dot: "dots",
      level: "H",
      margin: "0",
      frame: "banner-bottom",
      frameText: "Menu",
      logoIcon: "wifi",
    });
  });

  it("sends an empty frame label, which hides it", () => {
    expect(
      buildQrImageQuery("x", "png", { frame: "border", frameText: "" })
    ).toMatchObject({ frame: "border", frameText: "" });
  });

  it("refuses bad input before calling QRdx", () => {
    expect(() => buildQrImageQuery("", "png")).toThrow(/text or URL/);
    expect(() => buildQrImageQuery("x".repeat(2049), "png")).toThrow(/2048/);
    expect(() =>
      buildQrImageQuery("x", "png", { foregroundColor: "red" })
    ).toThrow(/hex color/);
    expect(() =>
      buildQrImageQuery("x", "png", { frameText: "x".repeat(25) })
    ).toThrow(/24 characters/);
  });
});

describe("qrImageUrl", () => {
  it("is the keyless image URL for the same query", () => {
    expect(
      qrImageUrl("https://api.qrdx.dev/v1", {
        data: "https://example.com/?a=1&b=2",
        format: "png",
        fg: "111827",
      })
    ).toBe(
      "https://api.qrdx.dev/v1/qr?data=https%3A%2F%2Fexample.com%2F%3Fa%3D1%26b%3D2&format=png&fg=111827"
    );
  });
});

describe("qrImageFile", () => {
  it("names the file and picks the MIME type", () => {
    expect(qrImageFile("png")).toEqual({
      fileName: "qr-code.png",
      mimeType: "image/png",
      fileExtension: "png",
    });
    expect(qrImageFile("svg", "menu").fileName).toBe("menu.svg");
    expect(qrImageFile("svg", "menu.SVG").fileName).toBe("menu.SVG");
    expect(qrImageFile("eps", " ").mimeType).toBe("application/postscript");
    expect(qrImageFile("webp", "menu")).toEqual({
      fileName: "menu.webp",
      mimeType: "image/webp",
      fileExtension: "webp",
    });
    expect(qrImageFile("bmp", "menu")).toEqual({
      fileName: "menu.bmp",
      mimeType: "image/bmp",
      fileExtension: "bmp",
    });
    expect(qrImageFile("gif", "badge")).toEqual({
      fileName: "badge.gif",
      mimeType: "image/gif",
      fileExtension: "gif",
    });
    expect(qrImageFile("ico", "favicon")).toEqual({
      fileName: "favicon.ico",
      mimeType: "image/vnd.microsoft.icon",
      fileExtension: "ico",
    });
    expect(qrImageFile("tiff", "print")).toEqual({
      fileName: "print.tif",
      mimeType: "image/tiff",
      fileExtension: "tif",
    });
    expect(qrImageFile("tiff-cmyk", "label.tif")).toEqual({
      fileName: "label.tif",
      mimeType: "image/tiff",
      fileExtension: "tif",
    });
  });

  it("knows the formats", () => {
    expect(
      [
        "png",
        "webp",
        "gif",
        "bmp",
        "ico",
        "tiff",
        "tiff-cmyk",
        "svg",
        "eps",
        "jpg",
      ].map(isQrImageFormat)
    ).toEqual([true, true, true, true, true, true, true, true, true, false]);
  });
});

import { describe, expect, it } from "vitest";
import {
  barcodeImageFile,
  barcodeImageUrl,
  buildBarcodeImageQuery,
  isBarcodeFileType,
  isBarcodeFormat,
} from "../nodes/Qrdx/barcode-image";
import { BARCODE_FILE_TYPES, BARCODE_FORMATS } from "../nodes/Qrdx/constants";

describe("buildBarcodeImageQuery", () => {
  it("sends only format, data and type by default", () => {
    expect(buildBarcodeImageQuery("590123412345", "ean13", "png")).toEqual({
      format: "ean13",
      data: "590123412345",
      type: "png",
    });
  });

  it.each(BARCODE_FORMATS)("sends the format %s as is", (format) => {
    expect(buildBarcodeImageQuery("x", format, "svg").format).toBe(format);
  });

  it.each(BARCODE_FILE_TYPES)("sends the file type %s as is", (type) => {
    expect(buildBarcodeImageQuery("x", "code128", type).type).toBe(type);
  });

  it("maps every option to its GET /barcode parameter", () => {
    expect(
      buildBarcodeImageQuery("QRDX-2026-0042", "code128", "pdf", {
        foregroundColor: "#111827",
        backgroundColor: "FFF",
        scale: 6,
        barHeight: 12.5,
        quietZone: 0,
        showText: false,
        rotation: "90",
        fileName: "label",
        baseUrl: "https://api.qrdx.dev/v1",
      })
    ).toEqual({
      format: "code128",
      data: "QRDX-2026-0042",
      type: "pdf",
      fg: "111827",
      bg: "FFF",
      scale: "6",
      height: "12.5",
      quietZone: "0",
      text: "false",
      rotate: "90",
    });
    expect(
      buildBarcodeImageQuery("x", "code128", "png", { showText: true }).text
    ).toBe("true");
  });

  it("refuses bad input before calling QRdx", () => {
    expect(() => buildBarcodeImageQuery("", "ean13", "png")).toThrow(
      /number or text/
    );
    expect(() =>
      buildBarcodeImageQuery("x".repeat(1001), "datamatrix", "png")
    ).toThrow(/1,000/);
    expect(() =>
      buildBarcodeImageQuery("x", "code128", "png", {
        foregroundColor: "black",
      })
    ).toThrow(/hex color/);
    // The barcode API takes #rgb and #rrggbb only, not alpha.
    expect(() =>
      buildBarcodeImageQuery("x", "code128", "png", {
        backgroundColor: "#ffffff80",
      })
    ).toThrow(/hex color/);
  });
});

describe("barcodeImageUrl", () => {
  it("is the keyless image URL for the same query", () => {
    expect(
      barcodeImageUrl("https://api.qrdx.dev/v1", {
        format: "gs1-128",
        data: "(01)09501101530003(10)AB-123",
        type: "svg",
      })
    ).toBe(
      "https://api.qrdx.dev/v1/barcode?format=gs1-128&data=%2801%2909501101530003%2810%29AB-123&type=svg"
    );
  });
});

describe("barcodeImageFile", () => {
  it.each([
    ["png", "barcode.png", "image/png"],
    ["jpg", "barcode.jpg", "image/jpeg"],
    ["webp", "barcode.webp", "image/webp"],
    ["avif", "barcode.avif", "image/avif"],
    ["svg", "barcode.svg", "image/svg+xml"],
    ["pdf", "barcode.pdf", "application/pdf"],
    ["eps", "barcode.eps", "application/postscript"],
  ] as const)(
    "names a %s file and picks its MIME type",
    (type, fileName, mimeType) => {
      expect(barcodeImageFile(type)).toEqual({
        fileName,
        mimeType,
        fileExtension: type,
      });
    }
  );

  it("covers every file type", () => {
    for (const type of BARCODE_FILE_TYPES) {
      expect(barcodeImageFile(type).mimeType, type).toMatch(/^\w+\/[\w.+-]+$/);
    }
  });

  it("adds the extension to a chosen name unless it's there", () => {
    expect(barcodeImageFile("pdf", "sku-1042").fileName).toBe("sku-1042.pdf");
    expect(barcodeImageFile("pdf", "sku-1042.PDF").fileName).toBe(
      "sku-1042.PDF"
    );
    expect(barcodeImageFile("svg", " ").fileName).toBe("barcode.svg");
  });

  it("knows the formats and file types", () => {
    expect(["ean13", "gs1-128", "qr", "EAN13"].map(isBarcodeFormat)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(["jpg", "avif", "jpeg", "gif"].map(isBarcodeFileType)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});

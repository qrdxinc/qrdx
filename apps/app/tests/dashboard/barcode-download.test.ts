// The dashboard's Download menu on a saved barcode
// (dashboard/[workspace]/barcodes/[id]/download): every file type the menu
// lists comes back as that file, as an attachment named after the barcode.
// BMP is a real 24-bit BMP with the PNG's pixels. The session's workspace and
// the saved row are stubbed.
import { NextRequest } from "next/server";
import { isBMPFile } from "qrdx";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { BARCODE_FILE_TYPES, BARCODE_FILES } from "@/lib/barcode/files";
import { defaultBarcodeStyle } from "@/lib/barcode/style";
import { readBMP } from "../../../../packages/qrdx/tests/support/bmp";

vi.mock("@/lib/scope", () => ({
  getActiveScope: async () => ({ userId: "u_alice", organizationId: "org" }),
}));
vi.mock("@/lib/barcodes/service", () => ({
  getBarcode: async () => ({
    id: "bc_1",
    format: "ean13",
    value: "5901234123457",
    options: { ...defaultBarcodeStyle("ean13"), background: "#fffbeb" },
  }),
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const { GET } = await import(
  "@/app/(app)/dashboard/[workspace]/barcodes/[id]/download/route"
);

const download = (type: string) =>
  GET(
    new NextRequest(
      `http://localhost:3000/dashboard/alice/barcodes/bc_1/download?type=${type}`,
    ),
    { params: Promise.resolve({ id: "bc_1" }) },
  );

describe("dashboard barcode download", () => {
  it.each(BARCODE_FILE_TYPES)("type=%s", async (type) => {
    const response = await download(type);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(
      new RegExp(`^${BARCODE_FILES[type].mime.replace("+", "\\+")}`),
    );
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="ean13-5901234123457.${type}"`,
    );
  });

  it("BMP is the PNG's pixels in a real BMP", async () => {
    const [bmp, png] = await Promise.all([download("bmp"), download("png")]);
    const bytes = new Uint8Array(await bmp.arrayBuffer());
    expect(isBMPFile(bytes)).toBe(true);
    const pixels = await sharp(new Uint8Array(await png.arrayBuffer()))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const decoded = readBMP(bytes);
    expect([decoded.width, decoded.height]).toEqual([
      pixels.info.width,
      pixels.info.height,
    ]);
    expect(Buffer.from(decoded.rgba).equals(pixels.data)).toBe(true);
  });

  it("refuses an unknown type", async () => {
    expect((await download("gif")).status).toBe(400);
  });
});

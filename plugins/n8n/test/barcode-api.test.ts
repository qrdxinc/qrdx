import { describe, expect, it } from "vitest";
// The app's own lists, which GET /v1/barcode validates against. Tests aren't
// published, so they may reach into the monorepo; the node itself can't.
import {
  BARCODE_FILE_TYPES as API_FILE_TYPES,
  BARCODE_FILES,
} from "../../../apps/app/lib/barcode/files";
import { BARCODE_FORMATS as API_FORMATS } from "../../../apps/app/lib/barcode/formats";
import {
  BARCODE_DATA_MAX,
  barcodeImageQuerySchema,
} from "../../../apps/app/lib/barcode/request";
import {
  BARCODE_ROTATIONS as API_ROTATIONS,
  BARCODE_LIMITS,
} from "../../../apps/app/lib/barcode/style";
import { BARCODE_MIME_TYPES } from "../nodes/Qrdx/barcode-image";
import {
  BARCODE_DATA_MAX_LENGTH,
  BARCODE_FILE_TYPES,
  BARCODE_FORMATS,
  BARCODE_HEIGHT,
  BARCODE_QUIET_ZONE,
  BARCODE_ROTATIONS,
  BARCODE_SCALE,
} from "../nodes/Qrdx/constants";

// The node keeps copies of the barcode API's lists in constants.ts. These
// fail when the copies and the API's drift apart, in either direction.

const sorted = (values: readonly string[]) => [...values].sort();

describe("the node's barcode lists match GET /v1/barcode", () => {
  it("offers exactly the API's formats", () => {
    expect(sorted(BARCODE_FORMATS)).toEqual(
      sorted(API_FORMATS.map((format) => format.id))
    );
  });

  it("offers exactly the API's file types, with its MIME types", () => {
    expect(sorted(BARCODE_FILE_TYPES)).toEqual(sorted(API_FILE_TYPES));
    for (const type of API_FILE_TYPES) {
      expect(
        BARCODE_MIME_TYPES[type as keyof typeof BARCODE_MIME_TYPES],
        type
      ).toBe(BARCODE_FILES[type].mime);
    }
  });

  it("uses the API's rotations, limits and defaults", () => {
    expect(sorted(BARCODE_ROTATIONS)).toEqual(
      sorted(API_ROTATIONS.map(String))
    );
    expect(BARCODE_SCALE).toEqual(BARCODE_LIMITS.scale);
    expect(BARCODE_HEIGHT).toEqual(BARCODE_LIMITS.barHeightMm);
    expect(BARCODE_QUIET_ZONE).toEqual({
      min: BARCODE_LIMITS.quietZone.min,
      max: BARCODE_LIMITS.quietZone.maxLinear,
    });
    expect(BARCODE_DATA_MAX_LENGTH).toBe(BARCODE_DATA_MAX);
  });

  it("builds queries the API's schema takes", () => {
    for (const format of BARCODE_FORMATS) {
      for (const type of BARCODE_FILE_TYPES) {
        const parsed = barcodeImageQuerySchema.safeParse({
          format,
          data: "1",
          type,
          scale: String(BARCODE_SCALE.max),
          height: String(BARCODE_HEIGHT.min),
          quietZone: String(BARCODE_QUIET_ZONE.max),
          text: "false",
          rotate: BARCODE_ROTATIONS.at(-1),
        });
        expect(parsed.success, `${format} ${type}`).toBe(true);
      }
    }
  });
});

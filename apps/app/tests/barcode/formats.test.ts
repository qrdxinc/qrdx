// Input rules of the barcode generator (lib/barcode/formats.ts): characters,
// lengths and check digits for every symbology, against published examples.
import { describe, expect, it } from "vitest";
import {
  BARCODE_FORMATS,
  barcodeIssueText,
  compressUpca,
  DATABAR_EXPANDED_MAX_DATA,
  decodedMatches,
  expandUpce,
  GS1_128_MAX_DATA,
  gs1CheckDigit,
  isScanCheckable,
  maxicodeMessage,
  publicationEan13,
  splitBarcodeValue,
  validateBarcodeInput,
} from "@/lib/barcode/formats";

/** The API's view of a success: value and English note (the codes are checked below). */
const ok = (id: Parameters<typeof validateBarcodeInput>[0], raw: string) => {
  const result = validateBarcodeInput(id, raw);
  if (!result.ok) throw new Error(`${id} "${raw}": ${result.error}`);
  const { notes: _codes, ...api } = result;
  return api;
};
const error = (id: Parameters<typeof validateBarcodeInput>[0], raw: string) => {
  const result = validateBarcodeInput(id, raw);
  if (result.ok) throw new Error(`${id} "${raw}" was accepted`);
  return result.error;
};

describe("BARCODE_FORMATS", () => {
  it("has every symbology the page promises, each with a valid example", () => {
    expect(BARCODE_FORMATS.map((format) => format.label)).toEqual([
      "EAN-13",
      "EAN-8",
      "UPC-A",
      "UPC-E",
      "ISBN",
      "ISSN",
      "ISMN",
      "Code 128",
      "Code 39",
      "Code 93",
      "Codabar",
      "ITF-14",
      "GS1-128",
      "GS1 DataBar",
      "GS1 DataBar Expanded",
      "USPS Intelligent Mail",
      "Data Matrix",
      "PDF417",
      "Aztec",
      "rMQR",
      "MaxiCode",
      "DotCode",
    ]);
    for (const format of BARCODE_FORMATS) {
      expect(validateBarcodeInput(format.id, format.example)).toMatchObject({
        ok: true,
      });
      expect(format.quietZone.default).toBeGreaterThanOrEqual(
        format.quietZone.min,
      );
      expect(Boolean(format.barHeightMm || format.fixedBarHeightMm)).toBe(
        format.kind === "linear",
      );
    }
  });

  it("names a reader format for every symbology but the two no reader here decodes", () => {
    // DotCode and Intelligent Mail: neither the scanner's reader (ZXing in
    // barcode-detector) nor zbar decodes them, so they have no reader names
    // and the scan check reports them unchecked (tests/barcode/decode.test.ts).
    const unchecked = BARCODE_FORMATS.filter(
      (format) => !isScanCheckable(format.id),
    ).map((format) => format.id);
    expect(unchecked).toEqual(["intelligent-mail", "dotcode"]);
    for (const format of BARCODE_FORMATS) {
      expect(format.detectorFormats.length > 0).toBe(
        !unchecked.includes(format.id),
      );
    }
  });
});

describe("gs1CheckDigit", () => {
  // Published examples: GS1's sample GTINs and SSCC, Wikipedia's EAN-13,
  // EAN-8, UPC-A and ITF-14 examples and an ISBN-13.
  it.each([
    ["590123412345", 7], // EAN-13 5901234123457 (GS1)
    ["400638133393", 1], // EAN-13 4006381333931
    ["978030640615", 7], // ISBN 978-0-306-40615-7
    ["9638507", 4], // EAN-8 96385074
    ["03600029145", 2], // UPC-A 036000291452
    ["1540014128876", 3], // ITF-14 15400141288763
    ["0950110153000", 3], // GTIN-14 09501101530003 (GS1)
    ["10614141123456789", 7], // SSCC 106141411234567897 (GS1)
  ])("%s → %i", (body, digit) => {
    expect(gs1CheckDigit(body)).toBe(digit);
  });

  it("rejects anything but digits", () => {
    expect(() => gs1CheckDigit("12a")).toThrow();
  });
});

describe("EAN-13, EAN-8, UPC-A and ITF-14", () => {
  it("adds the check digit when it's left out", () => {
    expect(ok("ean13", "590123412345")).toEqual({
      ok: true,
      value: "5901234123457",
      note: "Check digit 7 added.",
    });
    expect(ok("ean8", "9638507").value).toBe("96385074");
    expect(ok("upca", "03600029145").value).toBe("036000291452");
    expect(ok("itf14", "1540014128876").value).toBe("15400141288763");
  });

  it("accepts a full number with the right check digit, ignoring spaces and hyphens", () => {
    expect(ok("ean13", "5 901234 123457")).toEqual({
      ok: true,
      value: "5901234123457",
    });
    expect(ok("ean13", "978-0-306-40615-7").value).toBe("9780306406157");
    expect(ok("ean8", "96385074").value).toBe("96385074");
    expect(ok("upca", "036000291452").value).toBe("036000291452");
    expect(ok("itf14", "1 54 00141 28876 3").value).toBe("15400141288763");
  });

  it("names the right check digit when it's wrong", () => {
    expect(error("ean13", "5901234123458")).toMatch(
      /check digit should be 7, not 8/,
    );
    expect(error("ean8", "96385075")).toMatch(/should be 4, not 5/);
    expect(error("upca", "036000291453")).toMatch(/should be 2, not 3/);
    expect(error("itf14", "15400141288764")).toMatch(/should be 3, not 4/);
  });

  it("explains wrong lengths and characters", () => {
    expect(error("ean13", "12345")).toBe(
      "EAN-13 needs 12 or 13 digits; this has 5 digits.",
    );
    expect(error("ean8", "12345678901")).toMatch(/7 or 8 digits/);
    expect(error("upca", "ABC")).toBe("UPC-A takes digits only.");
    expect(error("itf14", "")).toMatch(/Enter 13 digits/);
  });
});

describe("UPC-E", () => {
  it("expands and compresses like the standard's examples", () => {
    // Wikipedia: UPC-E 06543217 is UPC-A 065100004327.
    expect(expandUpce("06543217")).toBe("065100004327");
    expect(compressUpca("065100004327")).toBe("06543217");
    // One number for each rule (last digit 0-2, 3, 4 and 5-9), each in its
    // canonical form: the UPC-A shortens back to the same UPC-E.
    for (const [upce7, upca11] of [
      ["0120030", "01200000003"],
      ["0123453", "01230000045"],
      ["0123414", "01234000001"],
      ["0123455", "01234500005"],
    ] as const) {
      const upca = expandUpce(upce7);
      expect(upca.slice(0, 11)).toBe(upca11);
      expect(compressUpca(upca)).toBe(upce7 + upca.at(-1));
    }
    // Numbers without the zeros can't be shortened.
    expect(compressUpca("036000291452")).toBeNull();
  });

  it("takes 6, 7 or 8 digits and works out the check digit", () => {
    expect(ok("upce", "654321")).toEqual({
      ok: true,
      value: "06543217",
      note: "Number system 0 assumed. Check digit 7 added.",
    });
    expect(ok("upce", "0654321").value).toBe("06543217");
    expect(ok("upce", "06543217")).toEqual({ ok: true, value: "06543217" });
    expect(error("upce", "06543218")).toMatch(/should be 7, not 8/);
    expect(error("upce", "2654321")).toMatch(/number system 0 or 1/);
  });

  it("shortens a UPC-A that has a UPC-E form, and says when it doesn't", () => {
    expect(ok("upce", "065100004327")).toEqual({
      ok: true,
      value: "06543217",
      note: "Shortened from UPC-A 065100004327.",
    });
    expect(ok("upce", "06510000432").value).toBe("06543217");
    expect(error("upce", "036000291452")).toMatch(/no UPC-E form/);
  });
});

describe("Code 128 and Code 39", () => {
  it("takes printable ASCII in Code 128", () => {
    expect(ok("code128", "QRDX-2026-0042 a/b!").value).toBe(
      "QRDX-2026-0042 a/b!",
    );
    expect(error("code128", "café ✓")).toBe(
      "Code 128 here takes plain ASCII letters, digits, spaces and symbols. Not allowed: é ✓",
    );
    expect(error("code128", "x".repeat(81))).toMatch(/up to 80 characters/);
    expect(error("code128", "")).toBe("Enter the text to encode.");
  });

  it("takes Code 39's 43 characters and points lowercase to Code 128", () => {
    expect(ok("code39", "QRDX-39 $/+%.").value).toBe("QRDX-39 $/+%.");
    expect(error("code39", "qrdx")).toMatch(/no lowercase letters/);
    expect(error("code39", "AB*C")).toMatch(/Not allowed: \*/);
  });

  it("takes the same 43 characters in Code 93 and points lowercase to Code 128", () => {
    expect(ok("code93", "QRDX-93 $/+%.").value).toBe("QRDX-93 $/+%.");
    expect(ok("code93", "1234567890").value).toBe("1234567890");
    expect(error("code93", "qrdx")).toBe(
      "Code 93 here has no lowercase letters. Use capitals, or Code 128 for mixed case.",
    );
    expect(error("code93", "AB*C#")).toBe(
      "Code 93 takes capital letters, digits, spaces and - . $ / + % only. Not allowed: * #",
    );
    // Mixed: lowercase plus a character no case change fixes is a character error.
    expect(error("code93", "ab#")).toMatch(/Not allowed: a b #/);
    expect(error("code93", "A".repeat(41))).toMatch(
      /Code 93 here takes up to 40 characters; this has 41/,
    );
    expect(error("code93", "")).toBe("Enter the text to encode.");
  });
});

describe("Codabar", () => {
  it("takes a start and stop letter around digits and - $ : / . +", () => {
    expect(ok("codabar", "A40156B").value).toBe("A40156B");
    expect(ok("codabar", "C12-$:/.+34D").value).toBe("C12-$:/.+34D");
    expect(ok("codabar", `A${"1".repeat(38)}A`).value).toHaveLength(40);
  });

  it("needs A to D at both ends and something between them", () => {
    for (const raw of [
      "40156",
      "A40156",
      "40156B",
      "E40156B",
      "a40156b",
      "AB",
      "A",
    ]) {
      expect(error("codabar", raw), raw).toMatch(
        /starts and ends with A, B, C or D/,
      );
    }
  });

  it("lists characters it can't hold, and caps the length", () => {
    expect(error("codabar", "A12*45B")).toBe(
      "Codabar takes digits and - $ : / . + between its start and stop letters. Not allowed: *",
    );
    expect(error("codabar", "A1B2B")).toMatch(/Not allowed: B/);
    expect(error("codabar", `A${"1".repeat(39)}A`)).toMatch(
      /up to 40 characters; this has 41/,
    );
    expect(error("codabar", "")).toBe("Enter the text to encode.");
  });
});

describe("GS1-128", () => {
  it("accepts AIs in brackets and completes GTIN and SSCC check digits", () => {
    expect(ok("gs1-128", "(01)09501101530003(17)261231(10)AB-123")).toEqual({
      ok: true,
      value: "(01)09501101530003(17)261231(10)AB-123",
    });
    expect(ok("gs1-128", " (01) 0950110153000 (10)AB-123")).toEqual({
      ok: true,
      value: "(01)09501101530003(10)AB-123",
      note: "AI (01): Check digit 3 added.",
    });
    expect(ok("gs1-128", "(00)10614141123456789").value).toBe(
      "(00)106141411234567897",
    );
  });

  it("explains malformed input", () => {
    expect(error("gs1-128", "0109501101530003")).toMatch(
      /Start with an Application Identifier/,
    );
    expect(error("gs1-128", "(1)123")).toMatch(/AIs are 2 to 4 digits/);
    expect(error("gs1-128", "(10)")).toBe("AI (10) has no value after it.");
    expect(error("gs1-128", "(01)09501101530004")).toMatch(
      /^AI \(01\): .*should be 3, not 4/,
    );
    expect(error("gs1-128", "(10)AB 12(21)é")).toMatch(/GS1 doesn't allow: é/);
    expect(error("gs1-128", "(10)AB)")).toMatch(/Brackets don't line up/);
    expect(error("gs1-128", `(01)09501101530003(21)${"9".repeat(40)}`)).toMatch(
      new RegExp(`up to ${GS1_128_MAX_DATA} characters`),
    );
  });
});

describe("GS1 DataBar", () => {
  it("takes a GTIN in (01) and completes or checks its check digit", () => {
    expect(ok("gs1-databar", "(01)09501101530003")).toEqual({
      ok: true,
      value: "(01)09501101530003",
    });
    expect(ok("gs1-databar", " (01) 0950110153000 ")).toEqual({
      ok: true,
      value: "(01)09501101530003",
      note: "AI (01): Check digit 3 added.",
    });
    expect(error("gs1-databar", "(01)09501101530004")).toMatch(
      /^AI \(01\): .*should be 3, not 4/,
    );
    expect(error("gs1-databar", "(01)0950")).toMatch(/^AI \(01\): /);
  });

  it("refuses anything but a GTIN, in words rather than bwip-js's", () => {
    const gtinOnly =
      "GS1 DataBar holds only a GTIN: (01) and its 14 digits. For dates, a batch or a weight, use GS1 DataBar Expanded or GS1-128.";
    expect(error("gs1-databar", "(01)09501101530003(10)AB-123")).toBe(gtinOnly);
    expect(error("gs1-databar", "(10)AB-123")).toBe(gtinOnly);
    expect(error("gs1-databar", "(02)09501101530003")).toBe(gtinOnly);
    expect(error("gs1-databar", "09501101530003")).toMatch(
      /Start with an Application Identifier/,
    );
    expect(error("gs1-databar", "")).toMatch(/Enter Application Identifiers/);
  });
});

describe("GS1 DataBar Expanded", () => {
  it("takes AIs in brackets like GS1-128", () => {
    expect(
      ok("gs1-databar-expanded", "(01)09501101530003(17)261231(10)AB-123"),
    ).toEqual({
      ok: true,
      value: "(01)09501101530003(17)261231(10)AB-123",
    });
    expect(ok("gs1-databar-expanded", "(01)0950110153000(3103)000123")).toEqual(
      {
        ok: true,
        value: "(01)09501101530003(3103)000123",
        note: "AI (01): Check digit 3 added.",
      },
    );
    expect(error("gs1-databar-expanded", "(01)09501101530004")).toMatch(
      /^AI \(01\): .*should be 3, not 4/,
    );
    expect(error("gs1-databar-expanded", "(10)AB 12(21)é")).toMatch(
      /GS1 doesn't allow: é/,
    );
  });

  it("holds more than GS1-128's 48 characters, up to its own limit", () => {
    // 66 digits of AIs and data: too long for GS1-128, fine here.
    const long =
      "(01)09501101530003(3103)000123(11)261231(13)261231(15)261231(17)261231(16)261231";
    expect(ok("gs1-databar-expanded", long).value).toBe(long);
    expect(error("gs1-128", long)).toMatch(/GS1-128 holds up to 48/);
    const tooLong = `(01)09501101530003(21)${"1".repeat(20)}(10)${"2".repeat(20)}(240)${"3".repeat(20)}`;
    expect(error("gs1-databar-expanded", tooLong)).toBe(
      `GS1 DataBar Expanded holds up to ${DATABAR_EXPANDED_MAX_DATA} digits of AIs and data, and fewer when there are letters; this has 83 characters. Remove an AI or shorten a value.`,
    );
  });
});

describe("USPS Intelligent Mail", () => {
  // USPS-B-3200's worked examples: one tracking code with each routing length.
  const tracking = "01234567094987654321";

  it("takes the tracking code and a 0-, 5-, 9- or 11-digit routing code", () => {
    for (const routing of ["", "01234", "012345678", "01234567891"]) {
      expect(ok("intelligent-mail", tracking + routing).value).toBe(
        tracking + routing,
      );
    }
    // Spaces and hyphens, as the digits are often printed, are dropped.
    expect(
      ok("intelligent-mail", " 01 234 567094 987654321 01234-5678-91 ").value,
    ).toBe("0123456709498765432101234567891");
  });

  it("names each field in a note, with a 6- or 9-digit mailer ID", () => {
    expect(ok("intelligent-mail", `${tracking}01234567891`).note).toBe(
      "Barcode ID 01, service type 234, mailer ID 567094, serial number 987654321, routing code 01234-5678-91.",
    );
    expect(ok("intelligent-mail", "00700901234567000123").note).toBe(
      "Barcode ID 00, service type 700, mailer ID 901234567, serial number 000123, no routing code.",
    );
    expect(ok("intelligent-mail", `${tracking}012345678`).note).toMatch(
      /routing code 01234-5678\.$/,
    );
    expect(ok("intelligent-mail", `${tracking}01234`).note).toMatch(
      /routing code 01234\.$/,
    );
  });

  it("says which field is wrong", () => {
    expect(error("intelligent-mail", "")).toBe(
      "Enter the 20-digit tracking code, then the routing ZIP Code if there is one.",
    );
    expect(error("intelligent-mail", `${tracking}0123A`)).toBe(
      "USPS Intelligent Mail takes digits only.",
    );
    expect(error("intelligent-mail", tracking.slice(0, 19))).toBe(
      "The tracking code has 20 digits: barcode ID (2), service type (3), mailer ID and serial number (15). This has 19 digits.",
    );
    expect(error("intelligent-mail", `${tracking}012`)).toBe(
      "After the 20-digit tracking code comes the routing ZIP Code: 5 digits, 9 (ZIP+4) or 11 (ZIP+4 and delivery point). This has 3 digits after the tracking code.",
    );
    expect(error("intelligent-mail", `${tracking}012345678901`)).toMatch(
      /This has 12 digits after the tracking code/,
    );
    // The barcode ID's second digit is 0 to 4; bwip-js would draw a 05.
    expect(error("intelligent-mail", `05${tracking.slice(2)}`)).toBe(
      "The barcode ID (the first 2 digits) ends in 0 to 4; this one is 05.",
    );
    expect(ok("intelligent-mail", `94${tracking.slice(2)}`).value).toBe(
      `94${tracking.slice(2)}`,
    );
  });
});

describe("2D formats", () => {
  it("take any text, including Unicode and line breaks, up to the limit", () => {
    for (const id of [
      "datamatrix",
      "pdf417",
      "aztec",
      "rmqr",
      "dotcode",
    ] as const) {
      expect(ok(id, "héllo ✓\nline two").value).toBe("héllo ✓\nline two");
    }
    for (const id of ["datamatrix", "pdf417", "aztec"] as const) {
      expect(error(id, "x".repeat(1001))).toMatch(/up to 1,000 characters/);
    }
    // DotCode's real limit is the size drawn (tests/barcode/dotcode.test.ts);
    // the field stops at 800 characters, past the 784 digits that fit.
    expect(error("dotcode", "1".repeat(801))).toBe(
      "DotCode here takes up to 800 characters; this has 801.",
    );
    // rMQR's largest size holds 361 digits; text that fills it sooner is
    // refused when it's drawn (render.test.ts).
    expect(error("rmqr", "1".repeat(362))).toBe(
      "rMQR here takes up to 361 characters; this has 362.",
    );
  });
});

describe("MaxiCode", () => {
  const CARRIER = "152382802<GS>840<GS>001<GS>QRDX SAMPLE PARCEL";

  it("draws a carrier message with a numeric postcode as mode 2", () => {
    const result = ok("maxicode", CARRIER);
    expect(result.value).toBe(CARRIER);
    expect(result.note).toBe(
      "Carrier message (mode 2): postcode 152382802, country 840, service class 001.",
    );
    expect(maxicodeMessage(CARRIER)).toMatchObject({
      mode: 2,
      text: "152382802\x1d840\x1d001\x1dQRDX SAMPLE PARCEL",
    });
  });

  it("takes the separators typed in any case, or as the characters", () => {
    expect(ok("maxicode", "152382802<gs>840<Gs>001<GS>X").value).toBe(
      "152382802<GS>840<GS>001<GS>X",
    );
    expect(ok("maxicode", "152382802\x1d840\x1d001\x1dX").value).toBe(
      "152382802<GS>840<GS>001<GS>X",
    );
  });

  it("draws other postcodes as mode 3, and the [)> header as a carrier message", () => {
    expect(maxicodeMessage("B1050<GS>056<GS>999<GS>X").mode).toBe(3);
    expect(ok("maxicode", "B1 05<GS>056<GS>999<GS>X").note).toMatch(
      /^Carrier message \(mode 3\): postcode B1 05,/,
    );
    const header =
      "[)><RS>01<GS>96152382802<GS>840<GS>001<GS>1Z00004951<GS>UPSN<RS><EOT>";
    expect(maxicodeMessage(header).mode).toBe(2);
    expect(ok("maxicode", header).value).toBe(header);
  });

  it("says a 5-digit ZIP Code is padded with 0000", () => {
    expect(ok("maxicode", "15238<GS>840<GS>001<GS>X").note).toBe(
      "Carrier message (mode 2): postcode 15238, country 840, service class 001. A 5-digit ZIP Code is drawn as 15238 with 0000 for the +4, and readers return it that way.",
    );
  });

  it("draws anything else as text (mode 4), Latin-1 included", () => {
    expect(maxicodeMessage("Caf\u00e9 cr\u00e8me 42").mode).toBe(4);
    expect(ok("maxicode", "Caf\u00e9 cr\u00e8me 42").note).toBeUndefined();
    // Fewer than four fields isn't a carrier message.
    expect(maxicodeMessage("A<GS>B<GS>C").mode).toBe(4);
  });

  it("names what's wrong in a carrier message", () => {
    expect(error("maxicode", "b1050<GS>056<GS>999<GS>X")).toMatch(
      /starts with the postcode: up to 9 digits/,
    );
    expect(error("maxicode", "ABCDEFG<GS>056<GS>999<GS>X")).toMatch(
      /starts with the postcode/,
    );
    expect(error("maxicode", "15238<GS>84<GS>001<GS>X")).toBe(
      'After the postcode comes the 3-digit ISO country code (840 for the US); this is "84".',
    );
    expect(error("maxicode", "15238<GS>840<GS>01<GS>X")).toBe(
      'After the country code comes the 3-digit service class; this is "01".',
    );
  });

  it("refuses characters outside Latin-1", () => {
    expect(error("maxicode", "h\u00e9llo \u2713")).toBe(
      "MaxiCode holds Latin-1 characters: letters, digits, symbols and Western European accents. Not allowed: \u2713",
    );
  });

  it("matches what readers return: <GS>, control pictures and padded postcodes", () => {
    const GS = "\x1d";
    expect(
      decodedMatches(
        "maxicode",
        CARRIER,
        `152382802<GS>840<GS>001<GS>QRDX SAMPLE PARCEL`,
      ),
    ).toBe(true);
    expect(
      decodedMatches(
        "maxicode",
        CARRIER,
        `152382802${GS}840${GS}001${GS}QRDX SAMPLE PARCEL`,
      ),
    ).toBe(true);
    expect(
      decodedMatches(
        "maxicode",
        "15238<GS>840<GS>001<GS>X",
        "152380000<GS>840<GS>001<GS>X",
      ),
    ).toBe(true);
    expect(
      decodedMatches(
        "maxicode",
        "15238<GS>840<GS>001<GS>X",
        "15238<GS>840<GS>001<GS>X",
      ),
    ).toBe(false);
    expect(
      decodedMatches(
        "maxicode",
        "B1050<GS>056<GS>999<GS>X",
        "B1050 <GS>056<GS>999<GS>X",
      ),
    ).toBe(true);
    expect(
      decodedMatches(
        "maxicode",
        "[)><RS>01<GS>96152382802<GS>840<GS>001<GS>A B<RS><EOT>",
        "[)>\u241e01\u241d96152382802\u241d840\u241d001\u241dA\u2420B\u241e\u2404",
      ),
    ).toBe(true);
    expect(decodedMatches("maxicode", "Caf\u00e9", "Caf\u00e9")).toBe(true);
    expect(decodedMatches("maxicode", "Caf\u00e9", "Caf\u00c3\u00a9")).toBe(
      false,
    );
  });
});

describe("ISBN", () => {
  it("takes an ISBN-13 with or without hyphens or spaces, and hyphenates it", () => {
    for (const raw of [
      "978-1-873671-00-9",
      "9781873671009",
      "978 1 873671 00 9",
      " 978-1873671009 ",
    ]) {
      expect(ok("isbn", raw).value).toBe("978-1-873671-00-9");
    }
    expect(ok("isbn", "9791090636071").value).toBe("979-10-90636-07-1");
  });

  it("adds a missing check digit and checks a given one", () => {
    expect(ok("isbn", "978187367100")).toEqual({
      ok: true,
      value: "978-1-873671-00-9",
      note: "Check digit 9 added.",
    });
    expect(error("isbn", "9781873671008")).toMatch(/should be 9, not 8/);
  });

  it("converts an ISBN-10 to its ISBN-13 with a new check digit", () => {
    // ISO 2108's example: 0-306-40615-2 is 978-0-306-40615-7.
    expect(ok("isbn", "0-306-40615-2")).toEqual({
      ok: true,
      value: "978-0-306-40615-7",
      note: "Converted from ISBN-10 0-306-40615-2.",
    });
    expect(ok("isbn", "1-56581-231-x").value).toBe("978-1-56581-231-4");
    expect(ok("isbn", "156581231X").value).toBe("978-1-56581-231-4");
    expect(error("isbn", "0-306-40615-3")).toMatch(/should be 2, not 3/);
    expect(error("isbn", "1-56581-231-4")).toMatch(/should be X, not 4/);
  });

  it("places the hyphens by the ranges and says so when they differ", () => {
    expect(ok("isbn", "978-18-73671-00-9")).toEqual({
      ok: true,
      value: "978-1-873671-00-9",
      note: "Hyphens placed by the ISBN ranges: 978-1-873671-00-9.",
    });
  });

  it("keeps typed hyphens for a range newer than the data, and asks for them otherwise", () => {
    expect(error("isbn", "9786700000007")).toMatch(
      /isn't in a range the ISBN agencies had given out/,
    );
    expect(ok("isbn", "978-670-0000-00-7").value).toBe("978-670-0000-00-7");
    expect(ok("isbn", "978-670-0000-00").value).toBe("978-670-0000-00-7");
  });

  it("refuses what isn't an ISBN", () => {
    expect(error("isbn", "")).toBe(
      "Enter 12 digits, or all 13 with the check digit.",
    );
    // 9 digits: an ISBN-13 being typed, not an ISBN-10 short of its check digit
    expect(error("isbn", "978-1-87367")).toBe(
      "An ISBN has 13 digits, or 10 in the old ISBN-10 form; this has 9 digits.",
    );
    expect(error("isbn", "97818736710")).toMatch(/this has 11 digits/);
    expect(error("isbn", "5901234123457")).toBe(
      "An ISBN-13 starts with 978 or 979.",
    );
    expect(error("isbn", "9790345246805")).toMatch(/are ISMNs/);
    expect(error("isbn", "97818736710X")).toMatch(/can end in X/);
    expect(error("isbn", "978-1-87367l-00-9")).toMatch(/can end in X/);
  });

  it("takes a 2- or 5-digit add-on after a space, or in its own part", () => {
    expect(ok("isbn", "978-1-873671-00-9 52250").value).toBe(
      "978-1-873671-00-9 52250",
    );
    expect(ok("isbn", "978 1 873671 00 9 90000").value).toBe(
      "978-1-873671-00-9 90000",
    );
    expect(ok("isbn", "978187367100 12").value).toBe("978-1-873671-00-9 12");
    expect(ok("isbn", "1873671008 52499").value).toBe(
      "978-1-873671-00-9 52499",
    );
    const parts = validateBarcodeInput("isbn", "978 1 873671 00 9", {
      addOn: " 52250 ",
    });
    expect(parts.ok && parts.value).toBe("978-1-873671-00-9 52250");
    expect(error("isbn", "978-1-873671-00-9 123")).toBe(
      "An add-on has 2 or 5 digits; this has 3 digits.",
    );
    expect(error("isbn", "978-1-873671-00-9 5225A")).toBe(
      "The add-on takes digits only.",
    );
  });
});

describe("ISSN", () => {
  it("takes the 8-character ISSN, with 00 as the sequence variant", () => {
    expect(ok("issn", "0317-8471")).toEqual({
      ok: true,
      value: "0317-8471 00",
      note: "Sequence variant 00 used.",
    });
    expect(ok("issn", "03178471 00").value).toBe("0317-8471 00");
    expect(ok("issn", "0317 8471 00").value).toBe("0317-8471 00");
    expect(ok("issn", "0311-175x 00").value).toBe("0311-175X 00");
  });

  it("adds a missing check digit (modulo 11, X for 10) and checks a given one", () => {
    expect(ok("issn", "0311175 00")).toEqual({
      ok: true,
      value: "0311-175X 00",
      note: "Check digit X added.",
    });
    expect(error("issn", "0317-8472")).toMatch(/should be 1, not 2/);
    expect(error("issn", "0311-1750")).toMatch(/should be X, not 0/);
  });

  it("reads the variant and add-on in order, or from their own parts", () => {
    expect(ok("issn", "0317-8471 00 05").value).toBe("0317-8471 00 05");
    expect(ok("issn", "0317-8471 99 12345").value).toBe("0317-8471 99 12345");
    // A lone 5-digit group can only be the add-on.
    expect(ok("issn", "0317-8471 12345").value).toBe("0317-8471 00 12345");
    const parts = validateBarcodeInput("issn", "0317-8471", {
      variant: "03",
      addOn: "11",
    });
    expect(parts.ok && parts.value).toBe("0317-8471 03 11");
    expect(error("issn", "0317-8471 1")).toBe(
      "The sequence variant is 2 digits: 00 for the regular edition.",
    );
    expect(error("issn", "0317-8471 00 05 1")).toMatch(
      /with a space between each/,
    );
    expect(error("issn", "0317-8471 00 123")).toMatch(/this has 3 digits/);
  });

  it("reads the ISSN and variant out of a 13-digit 977 number", () => {
    // 977 + 0317847 + 00 + check digit 1
    expect(ok("issn", "9770317847001")).toEqual({
      ok: true,
      value: "0317-8471 00",
      note: "Read from the 977 number: ISSN 0317-8471, sequence variant 00.",
    });
    expect(ok("issn", "977031784700 05").value).toBe("0317-8471 00 05");
    expect(error("issn", "9770317847002")).toMatch(/should be 1, not 2/);
    expect(error("issn", "9780317847001")).toBe(
      "A 13-digit ISSN barcode number starts with 977.",
    );
    const twice = validateBarcodeInput("issn", "9770317847001", {
      variant: "05",
    });
    expect(!twice.ok && twice.issue).toEqual({
      code: "issnEanVariant",
      values: { variant: "00" },
    });
  });

  it("refuses what isn't an ISSN", () => {
    expect(error("issn", "")).toBe(
      "Enter 7 digits, or all 8 with the check digit.",
    );
    expect(error("issn", "0317-84")).toMatch(/this has 6 characters/);
    expect(error("issn", "03X7-8471")).toMatch(/can be X/);
    expect(error("issn", "031784711")).toMatch(/this has 9 characters/);
  });
});

describe("ISMN", () => {
  it("takes 979-0 ISMNs, adds a missing check digit and checks a given one", () => {
    // The ISMN Users' Manual's example
    expect(ok("ismn", "979-0-3452-4680-5").value).toBe("979-0-3452-4680-5");
    expect(ok("ismn", "9790345246805").value).toBe("979-0-3452-4680-5");
    expect(ok("ismn", "979034524680")).toEqual({
      ok: true,
      value: "979-0-3452-4680-5",
      note: "Check digit 5 added.",
    });
    expect(error("ismn", "979-0-3452-4680-6")).toMatch(/should be 5, not 6/);
  });

  it("converts the old M form, keeping its check digit", () => {
    expect(ok("ismn", "M-2306-7118-7")).toEqual({
      ok: true,
      value: "979-0-2306-7118-7",
      note: "Converted from the old form M-2306-7118-7.",
    });
    expect(ok("ismn", "m 3452 4680").value).toBe("979-0-3452-4680-5");
    expect(error("ismn", "M-2306-7118-6")).toMatch(/should be 7, not 6/);
  });

  it("takes an add-on and refuses ISBNs and other numbers", () => {
    expect(ok("ismn", "979-0-3452-4680-5 12").value).toBe(
      "979-0-3452-4680-5 12",
    );
    expect(error("ismn", "9781873671009")).toMatch(/are ISBNs/);
    expect(error("ismn", "97903452468")).toMatch(/this has 11 characters/);
    expect(error("ismn", "979-0-3452-468O-5")).toMatch(/takes digits/);
  });
});

describe("splitBarcodeValue and publicationEan13", () => {
  it("split a checked value into the generator's fields", () => {
    expect(splitBarcodeValue("isbn", "978-1-873671-00-9 52250")).toEqual({
      main: "978-1-873671-00-9",
      addOn: "52250",
      variant: "",
    });
    expect(splitBarcodeValue("issn", "0317-8471 00 05")).toEqual({
      main: "0317-8471",
      variant: "00",
      addOn: "05",
    });
    expect(splitBarcodeValue("ismn", "979-0-3452-4680-5")).toEqual({
      main: "979-0-3452-4680-5",
      addOn: "",
      variant: "",
    });
    expect(splitBarcodeValue("code128", "A B 12")).toEqual({
      main: "A B 12",
      addOn: "",
      variant: "",
    });
  });

  it("give the EAN-13 each value is drawn as", () => {
    expect(publicationEan13("isbn", "978-1-873671-00-9 52250")).toBe(
      "9781873671009",
    );
    expect(publicationEan13("issn", "0317-8471 00 05")).toBe("9770317847001");
    expect(publicationEan13("issn", "0311-175X 99")).toBe(
      `977031117599${gs1CheckDigit("977031117599")}`,
    );
    expect(publicationEan13("ismn", "979-0-3452-4680-5")).toBe("9790345246805");
    expect(publicationEan13("ean13", "5901234123457")).toBeNull();
  });

  it("round-trip: every checked value checks to itself", () => {
    for (const [id, raw] of [
      ["isbn", "1-56581-231-X 52499"],
      ["issn", "9770317847001 05"],
      ["ismn", "M-2306-7118-7 12"],
    ] as const) {
      const once = ok(id, raw).value;
      expect(ok(id, once).value).toBe(once);
      const { main, ...parts } = splitBarcodeValue(id, once);
      const fromParts = validateBarcodeInput(id, main, parts);
      expect(fromParts.ok && fromParts.value).toBe(once);
    }
  });
});

describe("decodedMatches", () => {
  it("accepts the ways readers report each symbology", () => {
    expect(decodedMatches("ean13", "5901234123457", "5901234123457")).toBe(
      true,
    );
    expect(decodedMatches("ean13", "5901234123457", "5901234123450")).toBe(
      false,
    );
    expect(decodedMatches("upca", "036000291452", "0036000291452")).toBe(true);
    expect(decodedMatches("upce", "06543217", "06543217")).toBe(true);
    expect(decodedMatches("upce", "06543217", "065100004327")).toBe(true);
    expect(decodedMatches("upce", "06543217", "0065100004327")).toBe(true);
    const gs1 = "(01)09501101530003(10)AB-123(17)261231";
    expect(
      decodedMatches("gs1-128", gs1, "010950110153000310AB-123\x1d17261231"),
    ).toBe(true);
    expect(decodedMatches("gs1-128", gs1, gs1)).toBe(true);
    // What ZXing returns for GS1 DataBar: no brackets, GS between fields,
    // sometimes after the ]e0 symbology identifier.
    expect(
      decodedMatches("gs1-databar", "(01)09501101530003", "0109501101530003"),
    ).toBe(true);
    expect(
      decodedMatches(
        "gs1-databar",
        "(01)09501101530003",
        "]e00109501101530003",
      ),
    ).toBe(true);
    expect(
      decodedMatches("gs1-databar", "(01)09501101530003", "0109501101530004"),
    ).toBe(false);
    expect(
      decodedMatches(
        "gs1-databar-expanded",
        gs1,
        "010950110153000310AB-123\x1d17261231",
      ),
    ).toBe(true);
    expect(decodedMatches("code128", "ABC", "ABD")).toBe(false);
  });

  it("reads ISBN, ISSN and ISMN as their EAN-13, with or without the add-on", () => {
    const isbn = "978-1-873671-00-9 52250";
    expect(decodedMatches("isbn", isbn, "9781873671009")).toBe(true);
    expect(decodedMatches("isbn", isbn, "978187367100952250")).toBe(true);
    expect(decodedMatches("isbn", isbn, "9781873671009 52250")).toBe(true);
    expect(decodedMatches("isbn", isbn, "978187367100952251")).toBe(false);
    expect(decodedMatches("issn", "0317-8471 00 05", "977031784700105")).toBe(
      true,
    );
    expect(decodedMatches("ismn", "979-0-3452-4680-5", "9790345246805")).toBe(
      true,
    );
    expect(decodedMatches("ismn", "979-0-3452-4680-5", "979034524680512")).toBe(
      false,
    );
  });
});

describe("issue codes (the generator translates by code)", () => {
  it("every error carries a code whose English text is the error", () => {
    for (const [id, raw] of [
      ["ean13", ""],
      ["ean13", "59012341234x"],
      ["ean13", "5901234123450"],
      ["ean13", "59012"],
      ["upce", "123456789"],
      ["upce", "2123456"],
      ["code39", "abc"],
      ["code93", "abc"],
      ["code93", "A*B"],
      ["codabar", "123"],
      ["codabar", "A1*B"],
      ["code128", "naïve"],
      ["gs1-128", "01)09501101530003"],
      ["gs1-128", "(01)0950"],
      ["gs1-128", "(01)09501101530004"],
      ["gs1-databar", "(10)AB-123"],
      ["gs1-databar", "(01)09501101530004"],
      ["intelligent-mail", ""],
      ["intelligent-mail", "0123456709498765432x"],
      ["intelligent-mail", "012345"],
      ["intelligent-mail", "01234567094987654321012"],
      ["intelligent-mail", "07234567094987654321"],
      ["dotcode", ""],
      ["rmqr", ""],
      [
        "gs1-databar-expanded",
        `(21)${"1".repeat(20)}(10)${"2".repeat(20)}(240)${"3".repeat(30)}`,
      ],
      ["isbn", ""],
      ["isbn", "97818736710X"],
      ["isbn", "978187367"],
      ["isbn", "5901234123457"],
      ["isbn", "9790345246805"],
      ["isbn", "9786700000007"],
      ["isbn", "978-1-873671-00-9 1"],
      ["isbn", "978-1-873671-00-9 1a"],
      ["issn", "03X78471"],
      ["issn", "031784"],
      ["issn", "9780317847001"],
      ["issn", "0317-8471 00 05 1"],
      ["issn", "0317-8471 1"],
      ["ismn", "979-0-3452-468X-5"],
      ["ismn", "M-2306"],
      ["ismn", "9781873671009"],
    ] as const) {
      const result = validateBarcodeInput(id, raw);
      if (result.ok) throw new Error(`${id} "${raw}" was accepted`);
      expect(barcodeIssueText(result.issue), `${id} ${raw}`).toBe(result.error);
    }
  });

  it("nests an AI's own problem, and lists characters as they are", () => {
    const wrong = validateBarcodeInput("gs1-128", "(01)09501101530004");
    expect(!wrong.ok && wrong.issue).toMatchObject({
      code: "gs1Ai",
      values: { ai: "01" },
      inner: { code: "wrongCheckDigit", values: { expected: 3, given: 4 } },
    });
    const chars = validateBarcodeInput("code39", "AB_C D\nE");
    expect(!chars.ok && chars.issue).toMatchObject({
      code: "code39Chars",
      chars: ["_", "\n"],
    });
  });

  it("gives notes as codes too", () => {
    const result = validateBarcodeInput("upce", "123456");
    expect(result.ok && result.notes?.map((note) => note.code)).toEqual([
      "numberSystemAssumed",
      "checkDigitAdded",
    ]);
    const isbn = validateBarcodeInput("isbn", "156581231X");
    expect(isbn.ok && isbn.notes).toEqual([
      { code: "isbn10Converted", values: { isbn10: "1-56581-231-X" } },
    ]);
    const issn = validateBarcodeInput("issn", "0317847");
    expect(issn.ok && issn.notes?.map((note) => note.code)).toEqual([
      "checkDigitAdded",
      "issnVariantAssumed",
    ]);
    const imb = validateBarcodeInput(
      "intelligent-mail",
      "01234567094987654321",
    );
    expect(imb.ok && imb.notes).toEqual([
      {
        code: "imbFields",
        values: {
          barcodeId: "01",
          serviceType: "234",
          mailerId: "567094",
          serial: "987654321",
          routing: "none",
        },
      },
    ]);
  });
});

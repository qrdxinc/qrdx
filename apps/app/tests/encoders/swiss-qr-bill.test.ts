// Swiss QR-bill codes against SIX's Swiss Implementation Guidelines for the
// QR-bill (v2.4): SIX's own sample data files rebuilt byte for byte (with
// LF, which the guidelines allow, in place of CRLF), the Annex B check-digit
// example, the reference and currency rules, and the scanner.
import { describe, expect, it } from "vitest";
import { type ParsedScan, parseScan } from "@/components/scanner/parse";
import { validateDesignContent } from "@/lib/qr-design/content";
import { swissQrBillSchema } from "@/lib/validations/qr-content";
import type { SwissQrBillContent } from "@/types/qr-content";
import { encodeQRContent, validateContent } from "@/utils/qr-content-encoder";
import {
  encodeSwissQrBill,
  isQrIban,
  isQrReference,
  qrReferenceCheckDigit,
  SWISS_CROSS_LOGO,
  SWISS_CROSS_SVG,
  swissCrossShare,
  swissQrAmount,
  swissQrBillContentIssue,
  swissQrModules,
} from "@/utils/swiss-qr-bill";
import {
  IG_EXAMPLE_3_IMAGE,
  SIX_SAMPLES,
} from "../support/swiss-qr-bill-samples";

/** The form's content for a sample payload, read line by line. */
function contentOf(payload: string): SwissQrBillContent {
  const line = payload.split("\r\n");
  const at = (index: number) => line[index] || undefined;
  return {
    type: "swiss-qr-bill",
    iban: line[3] as string,
    name: line[5] as string,
    street: at(6),
    buildingNumber: at(7),
    postalCode: line[8] as string,
    town: line[9] as string,
    country: line[10] as string,
    amount: at(18),
    currency: line[19] as "CHF" | "EUR",
    payableBy: line[20] === "S",
    debtorName: at(21),
    debtorStreet: at(22),
    debtorBuildingNumber: at(23),
    debtorPostalCode: at(24),
    debtorTown: at(25),
    debtorCountry: at(26),
    reference: at(28),
    message: at(29),
    billingInfo: at(31),
  };
}

const bill = (
  overrides: Partial<SwissQrBillContent> = {},
): SwissQrBillContent => ({
  type: "swiss-qr-bill",
  iban: "CH4431999123000889012",
  name: "Max Muster & Söhne",
  street: "Musterstrasse",
  buildingNumber: "123",
  postalCode: "8000",
  town: "Seldwyla",
  country: "CH",
  currency: "CHF",
  amount: "1949.75",
  reference: "210000000003139471430009017",
  message: "Order from 15.10.2020",
  ...overrides,
});

const issueField = (overrides: Partial<SwissQrBillContent>) =>
  swissQrBillContentIssue(bill(overrides))?.field;

describe("SIX's sample data", () => {
  it.each(
    (["nr1", "nr13", "nr17", "nr29", "nr33", "nr45"] as const).map(
      (name) => [name, SIX_SAMPLES[name]] as const,
    ),
  )("rebuilds sample %s byte for byte", (_name, payload) => {
    const content = contentOf(payload);
    expect(swissQrBillContentIssue(content)).toBeNull();
    expect(encodeSwissQrBill(content)).toBe(payload.replace(/\r\n/g, "\n"));
  });

  it("writes 31 lines up to EPD and nothing after it", () => {
    const payload = encodeSwissQrBill(contentOf(SIX_SAMPLES.nr33));
    const lines = payload.split("\n");
    expect(lines).toHaveLength(31);
    expect(lines.at(-1)).toBe("EPD");
    expect(lines.slice(11, 18)).toEqual(["", "", "", "", "", "", ""]);
    expect(lines.slice(27, 29)).toEqual(["NON", ""]);
  });

  it("leaves the payer's 7 lines empty without a payer", () => {
    const lines = encodeSwissQrBill(bill()).split("\n");
    expect(lines.slice(20, 27)).toEqual(["", "", "", "", "", "", ""]);
    expect(lines.slice(27, 29)).toEqual(["QRR", "210000000003139471430009017"]);
  });
});

describe("references", () => {
  it("computes Annex B's worked check digit", () => {
    expect(qrReferenceCheckDigit("21000000000313947143000901")).toBe(7);
    expect(isQrReference("21 00000 00003 13947 14300 09017")).toBe(true);
    expect(isQrReference("210000000003139471430009018")).toBe(false);
    // All zeros passes mod 10, but the guidelines forbid it.
    expect(isQrReference("000000000000000000000000000")).toBe(false);
  });

  it("knows a QR-IBAN by its institution ID (30000 to 31999)", () => {
    expect(isQrIban("CH44 3199 9123 0008 8901 2")).toBe(true);
    expect(isQrIban("CH5800791123000889012")).toBe(false);
  });

  it("writes QRR, SCOR or NON from the account and the reference", () => {
    const type = (content: SwissQrBillContent) =>
      encodeSwissQrBill(content).split("\n")[27];
    expect(type(bill())).toBe("QRR");
    expect(
      type(
        bill({
          iban: "CH5800791123000889012",
          reference: "RF18 5390 0754 7034",
        }),
      ),
    ).toBe("SCOR");
    expect(
      type(bill({ iban: "CH5800791123000889012", reference: undefined })),
    ).toBe("NON");
  });

  it.each([
    [{ reference: undefined }, "reference"],
    [{ reference: "210000000003139471430009018" }, "reference"],
    // v2.4: a QR-IBAN with a QR reference is CHF only.
    [{ currency: "EUR" as const }, "currency"],
    [
      {
        iban: "CH5800791123000889012",
        reference: "210000000003139471430009017",
      },
      "reference",
    ],
    // The guidelines' example 4 table prints this one; its check digits fail.
    [
      { iban: "CH5800791123000889012", reference: "RF720191230100405JSH0438" },
      "reference",
    ],
  ])("%j is refused on its field", (overrides, field) => {
    expect(issueField(overrides)).toBe(field);
  });
});

describe("checks", () => {
  it.each([
    [{ iban: "" }, "iban"],
    [{ iban: "DE89370400440532013000" }, "iban"],
    [{ iban: "CH4431999123000889013" }, "iban"],
    [{ name: "" }, "name"],
    [{ name: "x".repeat(71) }, "name"],
    [{ postalCode: "" }, "postalCode"],
    [{ town: "" }, "town"],
    [{ country: "XX" }, "country"],
    [{ amount: "0" }, "amount"],
    [{ amount: "1000000000" }, "amount"],
    [{ amount: "12.345" }, "amount"],
    [{ message: "Grüße ✓" }, "message"],
    [{ message: "x".repeat(141) }, "message"],
    [{ billingInfo: "S1/10/1234" }, "billingInfo"],
    [{ payableBy: true, debtorName: "Sarah" }, "debtorPostalCode"],
  ])("%j is refused on its field", (overrides, field) => {
    expect(issueField(overrides)).toBe(field);
  });

  it("writes amounts with two decimals", () => {
    expect(swissQrAmount("1949.7")).toBe("1949.70");
    expect(swissQrAmount("12,5")).toBe("12.50");
    expect(swissQrAmount("0.5")).toBe("0.50");
    expect(swissQrAmount("999999999.99")).toBe("999999999.99");
  });

  it("writes typographic quotes and dashes as plain ones", () => {
    const lines = encodeSwissQrBill(
      bill({ message: "Invoice “1024” – thanks" }),
    ).split("\n");
    expect(lines[29]).toBe('Invoice "1024" - thanks');
  });

  it("runs through the form schema, the main encoder and design_qr", () => {
    const parsed = swissQrBillSchema.safeParse({
      iban: "CH4431999123000889012",
      name: "Max Muster",
      postalCode: "8000",
      town: "Seldwyla",
      country: "CH",
    });
    expect(parsed.error?.issues[0]?.path).toEqual(["reference"]);
    expect(validateContent(bill())).toEqual({ valid: true });
    expect(encodeQRContent(bill())).toBe(encodeSwissQrBill(bill()));
    const design = validateDesignContent({
      type: "swiss-qr-bill",
      iban: "CH5800791123000889012",
      name: "Muster Krankenkasse",
      postalCode: "8000",
      town: "Seldwyla",
      country: "CH",
    });
    expect(design.ok && design.value.split("\n")[27]).toBe("NON");
  });
});

describe("the Swiss cross", () => {
  it("is drawn to SIX's proportions: 0.5 mm border, 6 mm square, 1/6 and 5/9 bars", () => {
    // 126 units = 7 mm, so 18 units = 1 mm.
    expect(SWISS_CROSS_SVG).toContain('width="126" height="126"');
    expect(SWISS_CROSS_SVG).toContain(
      '<rect x="9" y="9" width="108" height="108" fill="#000"/>',
    );
    expect(SWISS_CROSS_SVG).toContain('width="21" height="70"');
    expect(SWISS_CROSS_SVG).toContain('width="70" height="21"');
    expect(SWISS_CROSS_LOGO.startsWith("data:image/svg+xml,")).toBe(true);
  });

  it("covers 7/46 of the symbol at the code's version", () => {
    expect(swissQrModules("x".repeat(331))).toBe(69); // version 13
    expect(swissQrModules("x".repeat(997))).toBe(117); // version 25
    expect(swissCrossShare("x".repeat(331))).toBeCloseTo(7 / 46, 3);
    // With a 4-module quiet zone the symbol is 69 of 77 modules.
    expect(swissCrossShare("x".repeat(331), 4)).toBeCloseTo(
      ((7 / 46) * 69) / 77,
      3,
    );
  });
});

describe("scanner", () => {
  const payment = (raw: string) => {
    const parsed = parseScan(raw);
    expect(parsed.kind, raw).toBe("payment");
    return parsed as Extract<ParsedScan, { kind: "payment" }>;
  };
  const field = (
    parsed: { fields: { label: string; value: string }[] },
    label: string,
  ) => parsed.fields.find((item) => item.label === label)?.value;

  it("reads a bill QRdx makes", () => {
    const parsed = payment(encodeSwissQrBill(bill()));
    expect(parsed.scheme).toBe("swiss-qr-bill");
    expect(parsed.payee).toBe("Max Muster & Söhne");
    expect(parsed.amount).toBe("CHF 1949.75");
    expect(field(parsed, "IBAN")).toBe("CH4431999123000889012");
    expect(field(parsed, "QR reference")).toBe("210000000003139471430009017");
    expect(field(parsed, "Address")).toBe(
      "Musterstrasse 123, 8000 Seldwyla, CH",
    );
    expect(parsed.copyValue).toBe("CH4431999123000889012");
  });

  it("reads SIX's samples, payer and billing information included", () => {
    const parsed = payment(SIX_SAMPLES.nr5);
    expect(field(parsed, "Payable by")).toBe(
      "Sarah Beispiel, Mustergasse 1, 3600 Thun, CH",
    );
    expect(field(parsed, "Billing information")).toMatch(/^\/\/S1\/10\//);
  });

  it("tolerates the trailing line break of the guidelines' images", () => {
    const parsed = payment(IG_EXAMPLE_3_IMAGE);
    expect(parsed.payee).toBe("Sample Foundation");
    expect(parsed.amount).toBeUndefined();
    expect(field(parsed, "Reference")).toBeUndefined();
  });
});

// QR Platba (ČBA standard no. 26, SPD 1.0), Swish (Swish developer docs,
// "Create QR code from specification") and KHQR (National Bank of Cambodia:
// KHQR Content Guideline and the bakong-khqr SDK). Expected strings are the
// specs' own examples and the reference tools' outputs, as noted.
import { describe, expect, it } from "vitest";
import {
  buildPaymentPayload,
  paymentPayloadSchema,
} from "@/app/api/mcp/payloads";
import { type ParsedScan, parseScan } from "@/components/scanner/parse";
import { validateDesignContent } from "@/lib/qr-design/content";
import type {
  CzechSpdContent,
  KhqrContent,
  SwishContent,
} from "@/types/qr-content";
import {
  czechIban,
  czechSpdIssue,
  encodeCzechSpd,
  spdText,
} from "@/utils/czech-spd";
import { parseEmvPayload } from "@/utils/emv-qr";
import { encodeKhqr, khqrIssue } from "@/utils/payment-qr-codes";
import { encodeSwish, normalizeSwishNumber, swishIssue } from "@/utils/swish";

const NOW = new Date(Date.UTC(2026, 0, 1));

const payment = (raw: string) => {
  const parsed = parseScan(raw);
  expect(parsed.kind, raw).toBe("payment");
  return parsed as Extract<ParsedScan, { kind: "payment" }>;
};
const field = (
  parsed: { fields: { label: string; value: string }[] },
  label: string,
) => parsed.fields.find((item) => item.label === label)?.value;

describe("QR Platba (SPD)", () => {
  const spd = (overrides: Partial<CzechSpdContent>): CzechSpdContent => ({
    type: "czech-spd",
    account: "CZ9106000000000000000123",
    ...overrides,
  });

  it("writes the qr-platba.cz specification's example", () => {
    expect(
      encodeCzechSpd(
        spd({
          amount: "450.00",
          message: "PLATBA ZA ZBOZI",
          variableSymbol: "1234567890",
        }),
      ),
    ).toBe(
      "SPD*1.0*ACC:CZ9106000000000000000123*AM:450.00*CC:CZK*MSG:PLATBA ZA ZBOZI*X-VS:1234567890",
    );
  });

  it("matches the reference generator for a domestic account number", () => {
    // api.paylibo.com …?accountNumber=222885&bankCode=5500&amount=250.00…
    expect(
      encodeCzechSpd(
        spd({
          account: "222885/5500",
          amount: "250.00",
          message: "FOND HUMANITY CCK",
          variableSymbol: "333",
        }),
      ),
    ).toBe(
      "SPD*1.0*ACC:CZ1355000000000000222885*AM:250.00*CC:CZK*MSG:FOND HUMANITY CCK*X-VS:333",
    );
    expect(czechIban("19-123/0800")).toBe("CZ2408000000190000000123");
  });

  it("writes text in capitals without diacritics, * as %2A and + as %2B", () => {
    expect(spdText("Platba za elektřinu * test")).toBe(
      "PLATBA ZA ELEKTRINU %2A TEST",
    );
    expect(spdText("1+1 = 2%")).toBe("1%2B1 = 2%25");
  });

  it("writes the instant, due date, symbol and BIC keys", () => {
    expect(
      encodeCzechSpd(
        spd({
          account: "CZ3301000000000002970297",
          bic: "KOMBCZPP",
          amount: "555.55",
          dueDate: "2026-04-30",
          instant: true,
          message: "Prispevek na nadaci",
          variableSymbol: "0987654321",
          specificSymbol: "1234567890",
          constantSymbol: "0558",
        }),
        NOW,
      ),
    ).toBe(
      "SPD*1.0*ACC:CZ3301000000000002970297+KOMBCZPP*AM:555.55*CC:CZK*DT:20260430*PT:IP*MSG:PRISPEVEK NA NADACI*X-VS:0987654321*X-SS:1234567890*X-KS:0558",
    );
  });

  it.each([
    [{ account: "" }, "account"],
    [{ account: "CZ9106000000000000000124" }, "account"],
    [{ account: "222886/5500" }, "account"],
    [{ account: "DE89370400440532013000" }, "account"],
    [{ amount: "10000000" }, "amount"],
    [{ variableSymbol: "12345678901" }, "variableSymbol"],
    [{ message: "x".repeat(61) }, "message"],
    [{ dueDate: "2025-12-31" }, "dueDate"],
    [{ bic: "NOPE" }, "bic"],
  ])("%j is refused on its field", (overrides, name) => {
    expect(czechSpdIssue(spd(overrides), NOW)?.field).toBe(name);
  });

  it("scans the standard's v1.2 example", () => {
    const parsed = payment(
      "SPD*1.0*ACC:CZ3301000000000002970297*AM:555.55*CC:CZK*RF:7004139146*X-VS:0987654321*X-SS:1234567890*X-KS:0558*DT:20210430*MSG:PRISPEVEK NA NADACI",
    );
    expect(parsed.scheme).toBe("czech-spd");
    expect(parsed.amount).toBe("CZK 555.55");
    expect(field(parsed, "Variable symbol")).toBe("0987654321");
    expect(field(parsed, "Due")).toBe("2021-04-30");
    expect(field(parsed, "Message")).toBe("PRISPEVEK NA NADACI");
  });
});

describe("Swish", () => {
  const swish = (overrides: Partial<SwishContent>): SwishContent => ({
    type: "swish",
    payee: "46701234567",
    ...overrides,
  });

  it.each([
    [{}, "https://app.swish.nu/1/p/sw/?sw=46701234567"],
    [
      { payee: "1231561596", amount: "170.0" },
      "https://app.swish.nu/1/p/sw/?sw=1231561596&amt=170.0",
    ],
    [
      { amount: "170.0", message: "Hot Dog" },
      "https://app.swish.nu/1/p/sw/?sw=46701234567&amt=170.0&msg=Hot%20Dog",
    ],
    [
      { amount: "170.0", amountEditable: true },
      "https://app.swish.nu/1/p/sw/?sw=46701234567&amt=170.0&edit=amt",
    ],
    [
      {
        amount: "170.0",
        message: "Hot Dog",
        amountEditable: true,
        messageEditable: true,
      },
      "https://app.swish.nu/1/p/sw/?sw=46701234567&amt=170.0&msg=Hot%20Dog&edit=amt,msg",
    ],
    [
      { amount: "170.0", message: "Hot Dog", messageEditable: true },
      "https://app.swish.nu/1/p/sw/?sw=46701234567&amt=170.0&msg=Hot%20Dog&edit=msg",
    ],
  ])("writes the docs' example %j", (overrides, link) => {
    expect(encodeSwish(swish(overrides))).toBe(link);
  });

  it("writes mobiles as 46 and 9 digits", () => {
    expect(normalizeSwishNumber("070-123 45 67")).toBe("46701234567");
    expect(normalizeSwishNumber("+46 70 123 45 67")).toBe("46701234567");
    expect(normalizeSwishNumber("123 456 78 90")).toBe("1234567890");
    expect(normalizeSwishNumber("08 123 456")).toBeNull();
  });

  it.each([
    [{ payee: "12345" }, "payee"],
    [{ amount: "0.50" }, "amount"],
    [{ amount: "150000.01" }, "amount"],
    [{ message: "x".repeat(51) }, "message"],
    [{ message: "Thanks 🙂" }, "message"],
  ])("%j is refused on its field", (overrides, name) => {
    expect(swishIssue(swish(overrides))?.field).toBe(name);
  });

  it("scans back", () => {
    const parsed = payment(
      encodeSwish(swish({ amount: "100", message: "Fika" })),
    );
    expect(parsed).toMatchObject({
      scheme: "swish",
      payee: "46701234567",
      amount: "SEK 100",
    });
    expect(field(parsed, "Message")).toBe("Fika");
  });
});

describe("KHQR", () => {
  const khqr = (overrides: Partial<KhqrContent>): KhqrContent => ({
    type: "khqr",
    bakongId: "jonhsmith@nbcq",
    name: "Jonh Smith",
    ...overrides,
  });

  it.each([
    [
      {},
      "00020101021129180014jonhsmith@nbcq5204599953031165802KH5910Jonh Smith6010Phnom Penh6304856B",
    ],
    [
      { currency: "USD" as const },
      "00020101021129180014jonhsmith@nbcq5204599953038405802KH5910Jonh Smith6010Phnom Penh63041985",
    ],
    [
      { billNumber: "INV-42", mobile: "85512345678" },
      "00020101021129180014jonhsmith@nbcq5204599953031165802KH5910Jonh Smith6010Phnom Penh62250106INV-4202118551234567863040657",
    ],
  ])("matches NBC's SDK for %j", (overrides, payload) => {
    expect(encodeKhqr(khqr(overrides), NOW)).toBe(payload);
  });

  it("writes an amount as a dynamic code with tag 99", () => {
    const payload = encodeKhqr(
      khqr({ currency: "USD", amount: "1.5", expiry: "2026-01-31" }),
      NOW,
    );
    const parsed = parseEmvPayload(payload);
    expect(parsed?.crcValid).toBe(true);
    expect(parsed?.fields.get("01")).toBe("12");
    expect(parsed?.fields.get("54")).toBe("1.50");
    // Creation now; expiry at the end of 31 January in Cambodia (UTC+7).
    expect(parsed?.fields.get("99")).toBe(
      `0013${NOW.getTime()}0113${Date.UTC(2026, 0, 31, 16, 59, 59, 999)}`,
    );
  });

  it.each([
    [{ bakongId: "jonhsmith" }, "bakongId"],
    [{ name: "x".repeat(26) }, "name"],
    [{ amount: "1.5" }, "amount"],
    [{ amount: "5000" }, "expiry"],
    [{ amount: "5000", expiry: "2025-12-31" }, "expiry"],
  ])("%j is refused on its field", (overrides, name) => {
    expect(khqrIssue(khqr(overrides), NOW)?.field).toBe(name);
  });

  it("scans NBC's static example", () => {
    const parsed = payment(
      "00020101021129200016test_bakong@devb5204599953031165802KH5917Lucky Supermarket6010Phnom Penh9917001316339210247786304102F",
    );
    expect(parsed.scheme).toBe("khqr");
    expect(parsed.payee).toBe("Lucky Supermarket");
    expect(field(parsed, "Bakong ID")).toBe("test_bakong@devb");
    expect(field(parsed, "Checksum")).toBeUndefined();
  });
});

describe("design_qr and qr_payload_payment", () => {
  it("build each standard like the playground", () => {
    const build = (input: unknown) =>
      buildPaymentPayload(paymentPayloadSchema.parse(input));
    expect(
      build({ scheme: "swish", payee: "1231181189", amount: "100" }),
    ).toEqual({
      ok: true,
      value: "https://app.swish.nu/1/p/sw/?sw=1231181189&amt=100",
    });
    expect(
      build({ scheme: "khqr", bakongId: "jonhsmith@nbcq", name: "Jonh Smith" }),
    ).toEqual({
      ok: true,
      value:
        "00020101021129180014jonhsmith@nbcq5204599953031165802KH5910Jonh Smith6010Phnom Penh6304856B",
    });
    const swiss = build({
      scheme: "swiss-qr-bill",
      iban: "CH4431999123000889012",
      name: "Max Muster",
      postalCode: "8000",
      town: "Seldwyla",
      country: "CH",
    });
    expect(swiss).toEqual({
      ok: false,
      message:
        "reference: A QR-IBAN needs a QR reference: the 27-digit number from your invoicing",
    });
    const spd = validateDesignContent({
      type: "czech-spd",
      account: "CZ9106000000000000000123",
      amount: "450",
    });
    expect(spd.ok && spd.value).toBe(
      "SPD*1.0*ACC:CZ9106000000000000000123*AM:450.00*CC:CZK",
    );
  });
});

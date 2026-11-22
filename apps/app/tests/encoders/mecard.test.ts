// MeCard contacts (NTT Docomo's MECARD format): fields, "last,first" names,
// the \ ; : , escaping, birthdays, and the scanner reading them back. The
// examples are the ones ZXing's Barcode Contents page and the MeCard
// field table give.
import { describe, expect, it } from "vitest";
import {
  buildMecardPayload,
  mecardPayloadSchema,
} from "@/app/api/mcp/payloads";
import { type ParsedScan, parseScan } from "@/components/scanner/parse";
import { validateDesignContent } from "@/lib/qr-design/content";
import { mecardSchema } from "@/lib/validations/qr-content";
import type { MeCardContent } from "@/types/qr-content";
import { encodeMeCard, escapeMeCard, meCardIssue } from "@/utils/mecard";
import { encodeQRContent, validateContent } from "@/utils/qr-content-encoder";

const card = (overrides: Partial<MeCardContent> = {}): MeCardContent => ({
  type: "mecard",
  firstName: "Sean",
  lastName: "Owen",
  ...overrides,
});

const contact = (raw: string) => {
  const parsed = parseScan(raw);
  expect(parsed.kind, raw).toBe("contact");
  return (parsed as Extract<ParsedScan, { kind: "contact" }>).contact;
};

describe("encoder", () => {
  it("writes ZXing's documented example", () => {
    // github.com/zxing/zxing/wiki/Barcode-Contents: the address's commas
    // are escaped here, so it stays one value.
    expect(
      encodeMeCard(
        card({
          address: "76 9th Avenue, 4th Floor, New York, NY 10011",
          phone: "12125551212",
          email: "srowen@example.com",
        }),
      ),
    ).toBe(
      "MECARD:N:Owen,Sean;TEL:12125551212;EMAIL:srowen@example.com;ADR:76 9th Avenue\\, 4th Floor\\, New York\\, NY 10011;;",
    );
  });

  it("writes every field in order", () => {
    expect(
      encodeMeCard(
        card({
          firstName: "John",
          lastName: "Doe",
          reading: "ドウ ジョン",
          phone: "+1 (202) 555-0142",
          email: "johndoe@example.com",
          birthday: "1970-03-10",
          address: "123 Main St.",
          url: "www.example.com/john",
          nickname: "Johnny",
          note: "Line one\nline two",
        }),
        new Date(2026, 10, 22),
      ),
    ).toBe(
      "MECARD:N:Doe,John;SOUND:ドウ ジョン;TEL:+12025550142;EMAIL:johndoe@example.com;BDAY:19700310;ADR:123 Main St.;URL:https\\://www.example.com/john;NICKNAME:Johnny;NOTE:Line one line two;;",
    );
  });

  it("escapes \\ ; : and , in values", () => {
    expect(escapeMeCard('a\\b;c:d,e"f')).toBe('a\\\\b\\;c\\:d\\,e"f');
    expect(encodeMeCard(card({ firstName: "Ann;Marie", lastName: "" }))).toBe(
      "MECARD:N:Ann\\;Marie;;",
    );
  });

  it("writes a first name alone without a comma", () => {
    expect(encodeMeCard(card({ lastName: undefined }))).toBe("MECARD:N:Sean;;");
  });
});

describe("checks", () => {
  const now = new Date(2026, 10, 22);
  it.each([
    [{ firstName: " " }, "firstName"],
    [{ phone: "12" }, "phone"],
    [{ email: "not-an-email" }, "email"],
    [{ url: "mailto:a@b.c" }, "url"],
    [{ birthday: "2026-02-30" }, "birthday"],
    [{ birthday: "2030-01-01" }, "birthday"],
  ])("%j is refused on its field", (overrides, field) => {
    expect(meCardIssue(card(overrides), now)?.field).toBe(field);
    expect(encodeMeCard(card(overrides), now)).toBe("");
  });

  it("the form schema and design_qr report the same field", () => {
    const parsed = mecardSchema.safeParse({
      firstName: "Sean",
      email: "nope",
    });
    expect(parsed.error?.issues[0]?.path).toEqual(["email"]);
    const design = validateDesignContent({
      type: "mecard",
      firstName: "Sean",
      lastName: "Owen",
      phone: "12125551212",
    });
    expect(design.ok && design.value).toBe(
      "MECARD:N:Owen,Sean;TEL:12125551212;;",
    );
  });

  it("goes through the main encoder and validation", () => {
    expect(encodeQRContent(card())).toBe("MECARD:N:Owen,Sean;;");
    expect(validateContent(card())).toEqual({ valid: true });
    expect(validateContent(card({ firstName: "" })).valid).toBe(false);
  });
});

describe("scanner", () => {
  it("reads back what the encoder writes, escapes and all", () => {
    const read = contact(
      encodeMeCard(
        card({
          firstName: "Jr, John",
          lastName: "Doe; Sr",
          phone: "+12025550142",
          email: "john@example.com",
          url: "https://example.com/a:b",
          address: "1 Main St, Springfield",
          birthday: "1970-03-10",
          nickname: "JD",
          reading: "ジョン",
          note: "a\\b",
        }),
        new Date(2026, 10, 22),
      ),
    );
    expect(read).toEqual({
      name: "Jr, John Doe; Sr",
      organization: undefined,
      phones: ["+12025550142"],
      emails: ["john@example.com"],
      urls: ["https://example.com/a:b"],
      address: "1 Main St, Springfield",
      note: "a\\b",
      nickname: "JD",
      birthday: "1970-03-10",
      reading: "ジョン",
    });
  });

  it("reads the MeCard field table's example", () => {
    const read = contact(
      "MECARD:N:Doe,John;TEL:(123) 555-5832;EMAIL:johndoe@hotmail.com;BDAY:19700310;NICKNAME:Johnny;;",
    );
    expect(read.name).toBe("John Doe");
    expect(read.phones).toEqual(["(123) 555-5832"]);
    expect(read.birthday).toBe("1970-03-10");
    expect(read.nickname).toBe("Johnny");
  });

  it("saves the contact as a vCard with the extra fields", () => {
    const parsed = parseScan(
      "MECARD:N:Doe,John;BDAY:19700310;NICKNAME:Johnny;;",
    );
    expect(parsed.kind === "contact" && parsed.vcard).toBe(
      "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Doe;John;;;\r\nFN:John Doe\r\nNICKNAME:Johnny\r\nBDAY:1970-03-10\r\nEND:VCARD\r\n",
    );
  });
});

describe("qr_payload_mecard", () => {
  const build = (input: unknown) =>
    buildMecardPayload(mecardPayloadSchema.parse(input));

  it("builds the editor's payload", () => {
    expect(
      build({
        firstName: "Sean",
        lastName: "Owen",
        phone: "+1 212 555 1212",
        url: "https://example.com",
      }),
    ).toEqual({
      ok: true,
      value: "MECARD:N:Owen,Sean;TEL:+12125551212;URL:https\\://example.com;;",
    });
  });

  it("names the field with a problem", () => {
    expect(build({ firstName: "Sean", birthday: "1970-13-01" })).toEqual({
      ok: false,
      message: "birthday: Pick a date for the birthday",
    });
  });
});

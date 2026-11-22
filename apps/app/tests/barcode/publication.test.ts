// Book, serial and printed music numbers (lib/barcode/publication.ts): their
// check digits and hyphens, against the examples their manuals and
// standards publish, and the ISBN range data the hyphens come from.
import { describe, expect, it } from "vitest";
import {
  ISBN_RANGES,
  ISBN_RANGES_DATE,
} from "@/lib/barcode/isbn-ranges.generated";
import {
  hyphenateIsbn,
  hyphenateIsmn,
  isbn10CheckDigit,
  issnCheckDigit,
} from "@/lib/barcode/publication";

describe("isbn10CheckDigit", () => {
  it.each([
    ["030640615", "2"], // ISBN-10 0-306-40615-2 (ISO 2108's example)
    ["156581231", "X"], // 1-56581-231-X
    ["187367100", "8"], // 1-873671-00-8
    ["057108989", "5"], // 0-571-08989-5
  ])("%s → %s", (body, check) => {
    expect(isbn10CheckDigit(body)).toBe(check);
  });

  it("takes 9 digits only", () => {
    expect(() => isbn10CheckDigit("12345678")).toThrow();
  });
});

describe("issnCheckDigit", () => {
  it.each([
    ["0317847", "1"], // ISSN 0317-8471 (ISO 3297's example)
    ["0378595", "5"], // ISSN 0378-5955
    ["0311175", "X"], // ISSN 0311-175X
    ["2049363", "0"], // ISSN 2049-3630
  ])("%s → %s", (body, check) => {
    expect(issnCheckDigit(body)).toBe(check);
  });
});

describe("hyphenateIsbn", () => {
  // Hyphenated ISBNs as their publishers print them.
  it.each([
    "978-0-571-08989-5", // ISBN Users' Manual
    "978-1-873671-00-9", // ISBN Users' Manual, its barcode example
    "978-92-990051-5-6", // ISMN Users' Manual 2016, its own ISBN
    "978-0-306-40615-7", // ISO 2108's example
    "978-3-16-148410-0",
    "978-1-56581-231-4",
  ])("%s", (isbn) => {
    expect(hyphenateIsbn(isbn.replace(/-/g, ""))).toBe(isbn);
  });

  it("splits 979 groups too", () => {
    expect(hyphenateIsbn("9791090636071")).toBe("979-10-90636-07-1");
    expect(hyphenateIsbn("9798886451740")).toMatch(/^979-8-/);
  });

  it("returns null for ranges not given out, and for anything but an ISBN-13", () => {
    // 978-6700000 to 978-6998999 is unassigned in the range message.
    expect(hyphenateIsbn("9786700000007")).toBeNull();
    expect(hyphenateIsbn("9790345246805")).toBeNull(); // an ISMN
    expect(hyphenateIsbn("5901234123457")).toBeNull();
    expect(hyphenateIsbn("97803064061")).toBeNull();
  });
});

describe("hyphenateIsmn", () => {
  it("splits the registrant by the ISMN Users' Manual's ranges", () => {
    expect(hyphenateIsmn("9790345246805")).toBe("979-0-3452-4680-5");
    expect(hyphenateIsmn("9790260532113")).toBe("979-0-2605-3211-3");
    expect(hyphenateIsmn("9790099123452")).toBe("979-0-099-12345-2");
    expect(hyphenateIsmn("9790400001005")).toBe("979-0-40000-100-5");
    expect(hyphenateIsmn("9790700000105")).toBe("979-0-700000-10-5");
    expect(hyphenateIsmn("9790900000013")).toBe("979-0-9000000-1-3");
  });

  it("takes ISMNs only", () => {
    expect(() => hyphenateIsmn("9781873671009")).toThrow();
  });
});

describe("ISBN range data", () => {
  it("is dated, and covers 978, 979 and their registration groups", () => {
    expect(ISBN_RANGES_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(ISBN_RANGES)).toEqual(
      expect.arrayContaining(["978", "979", "978-0", "978-1", "979-8"]),
    );
  });

  it("runs every prefix's ranges in order up to 9999999", () => {
    for (const [prefix, rules] of Object.entries(ISBN_RANGES)) {
      const ends = rules
        .split(",")
        .map((rule) => rule.slice(0, -1).padEnd(7, "9"));
      expect(ends.at(-1), prefix).toBe("9999999");
      expect([...ends].sort(), prefix).toEqual(ends);
      for (const rule of rules.split(",")) {
        expect(rule, prefix).toMatch(/^\d{0,7}[0-7]$/);
      }
    }
  });
});

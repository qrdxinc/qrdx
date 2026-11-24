// The flag, brand mark or icon before each analytics breakdown row
// (app/(app)/dashboard/codes/_lib/breakdown-marks.ts).
import { describe, expect, it } from "vitest";
import {
  browserMark,
  countryMark,
  deviceMark,
  hostMark,
  languageMark,
  osMark,
  targetMark,
} from "@/app/(app)/dashboard/codes/_lib/breakdown-marks";
import { BRAND_MARKS } from "@/lib/brand-logos/marks.generated";

const brand = (slug: string) => ({ kind: "brand", slug });
const letter = (value: string) => ({ kind: "letter", letter: value });

describe("countryMark", () => {
  it("flags ISO codes and draws the globe otherwise", () => {
    expect(countryMark("IN")).toEqual({ kind: "flag", country: "IN" });
    expect(countryMark("sg")).toEqual({ kind: "flag", country: "SG" });
    for (const value of [null, "", "XX", "ZZ", "T1", "USA"]) {
      expect(countryMark(value)).toEqual({ kind: "icon", icon: "globe" });
    }
  });
});

describe("deviceMark", () => {
  it("has an icon for every device type", () => {
    expect(deviceMark("mobile")).toEqual({ kind: "icon", icon: "mobile" });
    expect(deviceMark("tablet")).toEqual({ kind: "icon", icon: "tablet" });
    expect(deviceMark("desktop")).toEqual({ kind: "icon", icon: "desktop" });
    expect(deviceMark("other")).toEqual({ kind: "icon", icon: "devices" });
    expect(deviceMark(null)).toEqual({ kind: "icon", icon: "devices" });
  });
});

describe("osMark and browserMark", () => {
  it("draw real marks, Apple's for iOS and macOS", () => {
    expect(osMark("iOS")).toEqual(brand("apple"));
    expect(osMark("macOS")).toEqual(brand("apple"));
    expect(osMark("Android")).toEqual(brand("android"));
    expect(browserMark("Chrome")).toEqual(brand("googlechrome"));
    expect(browserMark("Safari")).toEqual(brand("safari"));
    expect(browserMark("Instagram")).toEqual(brand("instagram"));
  });

  it("draw a letter for brands without a Simple Icons mark", () => {
    expect(osMark("Windows")).toEqual(letter("W"));
    expect(browserMark("Edge")).toEqual(letter("E"));
    expect(browserMark("Samsung Internet")).toEqual(letter("S"));
    expect(osMark(null)).toEqual(letter("?"));
  });

  it("only name marks the UI ships", () => {
    const names = [
      "Android",
      "ChromeOS",
      "HarmonyOS",
      "iOS",
      "KaiOS",
      "Linux",
      "macOS",
      "Chrome",
      "Facebook",
      "Firefox",
      "Google App",
      "Instagram",
      "LINE",
      "Opera",
      "Safari",
      "Snapchat",
      "TikTok",
      "WeChat",
    ];
    for (const name of names) {
      const mark =
        osMark(name).kind === "brand" ? osMark(name) : browserMark(name);
      expect(mark.kind, name).toBe("brand");
      if (mark.kind === "brand") expect(BRAND_MARKS).toHaveProperty(mark.slug);
    }
  });
});

describe("hostMark", () => {
  it("matches a brand's domain and its subdomains", () => {
    expect(hostMark("l.instagram.com")).toEqual(brand("instagram"));
    expect(hostMark("www.google.co.in")).toEqual(brand("google"));
    expect(hostMark("mail.google.com")).toEqual(brand("gmail"));
    expect(hostMark("t.co")).toEqual(brand("x"));
    expect(hostMark("lm.facebook.com")).toEqual(brand("facebook"));
    expect(hostMark("www.linkedin.com")).toEqual({ kind: "linkedin" });
    expect(hostMark("qrdx.dev")).toEqual({ kind: "qrdx" });
  });

  it("doesn't match a look-alike domain", () => {
    expect(hostMark("notx.com")).toEqual(letter("N"));
    expect(hostMark("myinstagram.com")).toEqual(letter("M"));
  });

  it("treats no referrer as a direct scan", () => {
    expect(hostMark(null)).toEqual({ kind: "icon", icon: "scan" });
  });
});

describe("targetMark", () => {
  it("reads links, phone numbers and addresses", () => {
    expect(targetMark("https://wa.me/123")).toEqual(brand("whatsapp"));
    expect(targetMark("tel:+6512345678")).toEqual({
      kind: "icon",
      icon: "call",
    });
    expect(targetMark("mailto:hi@example.com")).toEqual({
      kind: "icon",
      icon: "mail",
    });
    expect(targetMark("https://example.com/menu")).toEqual(letter("E"));
  });
});

describe("languageMark", () => {
  it("uses the tag's region, else the likely one", () => {
    expect(languageMark("en-in")).toEqual({ kind: "flag", country: "IN" });
    expect(languageMark("ja")).toEqual({ kind: "flag", country: "JP" });
    expect(languageMark(null)).toEqual(letter("?"));
  });
});

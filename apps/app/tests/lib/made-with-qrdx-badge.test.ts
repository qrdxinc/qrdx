// The "Made with QRdx" badge on Free hosted pages leads to the template
// gallery at the page's own type (lib/landing/demo-paths.ts), keeping the
// badge's ref tag so its visits count as its own.
import { describe, expect, it } from "vitest";
import { SITE_REFS } from "@/lib/analytics/handoff-tags";
import { madeWithQrdxPath, TEMPLATES_PATH } from "@/lib/landing/demo-paths";
import { PAGE_TYPE_IDS } from "@/lib/landing/page-type-ids";

describe("madeWithQrdxPath", () => {
  it("opens the gallery at the page's type", () => {
    expect(madeWithQrdxPath("menu")).toBe(
      "/templates?ref=made-with-qrdx#menu",
    );
    expect(madeWithQrdxPath("real-estate")).toBe(
      "/templates?ref=made-with-qrdx#real-estate",
    );
  });

  it("has a section for every hosted page type", () => {
    for (const type of PAGE_TYPE_IDS) {
      expect(madeWithQrdxPath(type)).toBe(
        `${TEMPLATES_PATH}?ref=made-with-qrdx#${type}`,
      );
    }
  });

  it("opens the whole gallery for a type it doesn't know", () => {
    expect(madeWithQrdxPath("not-a-type")).toBe(
      "/templates?ref=made-with-qrdx",
    );
    expect(madeWithQrdxPath("menu#x")).toBe("/templates?ref=made-with-qrdx");
  });

  it("keeps a ref tag QRdx counts as its own", () => {
    const ref = new URL(madeWithQrdxPath("menu"), "https://qrdx.dev")
      .searchParams.get("ref");
    expect(SITE_REFS).toContain(ref);
  });
});

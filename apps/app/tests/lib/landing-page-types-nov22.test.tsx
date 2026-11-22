// The hosted page types added on 22 Nov 2026 (location, resume, guest Wi-Fi,
// invitation, contact form, lost and found, message): their templates, the
// block options they use (Waze on Address & map, security and join steps on
// Wi-Fi), the Timeline block, and their public demos.
import { describe, expect, it, vi } from "vitest";
import { LandingRender } from "@/components/landing/render";
import { getBlock, parseLandingPageContent } from "@/lib/landing/blocks";
import { buildDemoContent } from "@/lib/landing/demo";
import { FILE_PAGE_TYPES } from "@/lib/landing/file-page-types";
import { PAGE_TYPE_IDS } from "@/lib/landing/page-type-ids";
import {
  buildTemplateContent,
  getTemplate,
  listTemplates,
} from "@/lib/landing/templates";
import { PAGE_TYPES } from "@/lib/seo-content/page-types";
import { DEFAULT_LANDING_THEME, type LandingBlock } from "@/types/landing";
import { renderIntl } from "../support/intl";

// next/font only works inside Next's compiler.
vi.mock("next/font/google", () => {
  const font = (options: { variable: string }) => ({
    className: "",
    variable: `font-var${options.variable}`,
    style: { fontFamily: "" },
  });
  return {
    Bricolage_Grotesque: font,
    Cormorant_Garamond: font,
    DM_Sans: font,
    Fraunces: font,
    Instrument_Serif: font,
    Space_Grotesk: font,
  };
});

const NEW_TYPES = [
  "location",
  "resume",
  "wifi",
  "invitation",
  "form",
  "asset-tag",
  "message",
];

const parseProps = (type: string, props: unknown) =>
  getBlock(type)?.schema.safeParse(props);

/** Stored content as a page renders it: props parsed (defaults applied). */
function render(
  blocks: Omit<LandingBlock, "id">[],
  options: { thumbnail?: boolean } = {},
): string {
  const parsed = parseLandingPageContent({
    version: 1,
    theme: DEFAULT_LANDING_THEME,
    blocks: blocks.map((block, index) => ({ id: `b${index}`, ...block })),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  return renderIntl(
    <LandingRender
      content={parsed.data}
      context={{
        theme: DEFAULT_LANDING_THEME,
        mode: "live",
        pageId: "page_1",
        qrCodeId: "code_1",
        ...(options.thumbnail && { thumbnail: true }),
      }}
    />,
  );
}

/** Visible text, tags stripped, entities kept as rendered. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("the 22 Nov page types", () => {
  it("are in the picker and the SEO list, each with its own icon", () => {
    const templates = listTemplates();
    for (const type of NEW_TYPES) {
      expect(getTemplate(type), type).toBeDefined();
      expect(PAGE_TYPE_IDS as readonly string[], type).toContain(type);
      expect(PAGE_TYPES, type).toHaveProperty(type);
    }
    const icons = templates.map((template) => template.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("are offered without file storage (the CV download can be a link)", () => {
    for (const type of NEW_TYPES) {
      expect(FILE_PAGE_TYPES.has(type), type).toBe(false);
    }
  });

  it("start from valid sample content", () => {
    for (const type of NEW_TYPES) {
      for (const variant of getTemplate(type)?.variants ?? []) {
        const content = buildTemplateContent(type, variant.id);
        expect(
          parseLandingPageContent(JSON.parse(JSON.stringify(content))).success,
          `${type}/${variant.id}`,
        ).toBe(true);
      }
    }
  });

  it("set every field a block's defaults would fill with other sample text", () => {
    const leaks: string[] = [];
    for (const type of NEW_TYPES) {
      for (const variant of getTemplate(type)?.variants ?? []) {
        for (const block of variant.blocks) {
          const defaults = getBlock(block.type)?.defaults ?? {};
          for (const key of Object.keys(defaults)) {
            if (!(key in (block.props ?? {}))) {
              leaks.push(`${type}/${variant.id} ${block.type}.${key}`);
            }
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it("collect form answers on the form, invitation and lost and found pages", () => {
    for (const type of ["form", "invitation", "asset-tag"]) {
      const first = getTemplate(type)?.variants[0];
      expect(
        first?.blocks.some((block) => block.type === "form"),
        type,
      ).toBe(true);
    }
  });

  it("show the Waze button on the location templates that set it", () => {
    const shop = buildTemplateContent("location", "shop");
    const map = shop.blocks.find((block) => block.type === "address-map");
    expect(map?.props.showWaze).toBe(true);
    expect(map?.props.showMap).toBe(true);
  });

  it("give each resume demo its own sample CV", () => {
    for (const variant of getTemplate("resume")?.variants ?? []) {
      const json = JSON.stringify(buildDemoContent("resume", variant.id));
      expect(json, variant.id).toMatch(/\/samples\/cv-[a-z-]+\.pdf/);
      expect(json, variant.id).not.toContain("product-guide.pdf");
    }
  });
});

describe("the Address & map block's Waze button", () => {
  const address = {
    title: "",
    name: "Paper & Pine",
    address: { street: "3150 18th Street", city: "San Francisco" },
  };

  it("is off by default, so existing pages don't change", () => {
    const parsed = parseProps("address-map", address);
    expect(parsed?.success).toBe(true);
    expect(parsed?.data?.showWaze).toBe(false);
    const html = render([{ type: "address-map", props: address }]);
    expect(html).toContain("google.com/maps/search");
    expect(html).toContain("maps.apple.com");
    expect(html).not.toContain("waze.com");
  });

  it("opens Waze's search link for the same place", () => {
    const html = render([
      { type: "address-map", props: { ...address, showWaze: true } },
    ]);
    const query = encodeURIComponent(
      "Paper & Pine, 3150 18th Street, San Francisco",
    );
    expect(html).toContain(
      `https://waze.com/ul?q=${query}`.replace(/&/g, "&amp;"),
    );
    expect(textOf(html)).toContain("Waze");
  });

  it("never loads Google's map in a scaled-down preview", () => {
    const props = { ...address, showMap: true };
    expect(render([{ type: "address-map", props }])).toContain("<iframe");
    expect(
      render([{ type: "address-map", props }], { thumbnail: true }),
    ).not.toContain("<iframe");
  });
});

describe("the Wi-Fi block's security row and join steps", () => {
  const wifi = {
    ssid: "Lune-Guest",
    password: "flatwhite2026",
    security: "WPA",
  };

  it("are off by default, so existing menu pages don't change", () => {
    const parsed = parseProps("wifi", wifi);
    expect(parsed?.data).toMatchObject({
      showSecurity: false,
      showSteps: false,
    });
    const text = textOf(render([{ type: "wifi", props: wifi }]));
    expect(text).not.toContain("How to join");
    expect(text).not.toContain("WPA/WPA2/WPA3");
  });

  it("names the security type when asked", () => {
    const text = textOf(
      render([{ type: "wifi", props: { ...wifi, showSecurity: true } }]),
    );
    expect(text).toContain("Security");
    expect(text).toContain("WPA/WPA2/WPA3");
  });

  it("explains joining a listed network on iPhone and Android", () => {
    const text = textOf(
      render([{ type: "wifi", props: { ...wifi, showSteps: true } }]),
    );
    expect(text).toContain("On iPhone");
    expect(text).toContain("On Android");
    expect(text).toContain("Copy the password with the button above.");
    expect(text).toContain("Open Settings and tap Wi-Fi.");
    expect(text).toContain("Network & internet, then Internet");
    expect(text).toContain("Tap “Lune-Guest” in the list of networks.");
    expect(text).toContain("Paste the password and tap Join.");
    expect(text).toContain("Paste the password and tap Connect.");
  });

  it("explains adding a hidden network by its name", () => {
    const text = textOf(
      render([
        { type: "wifi", props: { ...wifi, hidden: true, showSteps: true } },
      ]),
    );
    expect(text).toContain("Tap Other, type “Lune-Guest”");
    expect(text).toContain("Tap Add network");
    expect(text).toContain("set Hidden network to Yes");
    expect(text).toContain("Paste the password and tap Save.");
    expect(text).not.toContain("in the list of networks");
  });

  it("skips the password steps on an open network", () => {
    const text = textOf(
      render([
        {
          type: "wifi",
          props: { ssid: "Free", security: "nopass", showSteps: true },
        },
      ]),
    );
    expect(text).not.toContain("Copy the password");
    expect(text).not.toContain("Paste the password");
    expect(text).toContain("Tap “Free” in the list of networks.");
  });
});

describe("the Timeline block", () => {
  const items = [
    { when: "2022 – now", title: "Lead designer", place: "Northwind" },
    { when: "2019 – 2022", title: "Designer", note: "Patient app" },
  ];

  it("needs a title on every entry", () => {
    expect(parseProps("timeline", { items })?.success).toBe(true);
    expect(
      parseProps("timeline", { items: [{ when: "2020", title: " " }] })
        ?.success,
    ).toBe(false);
  });

  it("lists entries in order with when, where and the note", () => {
    const html = render([
      { type: "timeline", props: { title: "Experience", items } },
    ]);
    const text = textOf(html);
    expect(html).toContain("<ol");
    expect(text).toContain("Experience");
    expect(text.indexOf("Lead designer")).toBeLessThan(
      text.indexOf("Designer", text.indexOf("Lead designer") + 5),
    );
    for (const value of ["2022 – now", "Northwind", "Patient app"]) {
      expect(text).toContain(value);
    }
  });

  it("shows nothing on a live page without entries", () => {
    const html = render([{ type: "timeline", props: { items: [] } }]);
    expect(html).not.toContain("<ol");
    expect(textOf(html)).not.toContain("Add entries");
  });
});

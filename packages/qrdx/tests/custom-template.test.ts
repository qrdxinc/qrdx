// @vitest-environment jsdom
/** biome-ignore-all lint/style/noMagicNumbers: template artwork */
// `customTemplate` and `customProps`: artwork a library user draws in code
// around the code (Flam's ring of dots, different for every link, is built
// on it). The built-in templates and `templateId` became frames in qrdx
// 0.0.64, which dropped this hook too; it's back since 0.0.65 and draws the
// same in React, the core, qrdx/vanilla and <qrdx-code>. `templateId` next
// to it is ignored.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, test } from "vitest";
import {
  getFrameDimensions,
  getQRAsSVGDataUri,
  h,
  resolveQRCodeProps,
  toSVGString,
} from "../src/core";
import * as elementSource from "../src/element";
import { QRCode, QRCodeSVG } from "../src/index";
import * as vanillaSource from "../src/vanilla";
import type {
  QRProps,
  QRSVGOptions,
  TemplateConfig,
  TemplateDefinition,
} from "../types";
import { decodeQR, rasterizeSvg } from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";

interface BadgeProps {
  label?: string;
  cardColor?: string;
}

/** What the badge's wrapper was called with, last call first. */
const calls: {
  props?: Record<string, unknown>;
  config?: TemplateConfig;
}[] = [];

/** A card with the code in it and a label under it, from `customProps`. */
const BADGE: TemplateDefinition<BadgeProps> = {
  id: "badge",
  name: "Badge",
  wrapper: (children, props, config) => {
    calls.unshift({ props, config });
    return h(
      "svg",
      { viewBox: "0 0 300 340", xmlns: "http://www.w3.org/2000/svg" },
      h("rect", {
        width: 300,
        height: 340,
        rx: 24,
        fill: props?.cardColor ?? "#e2e8f0",
        "data-artwork": "badge",
      }),
      h("g", { transform: "translate(30, 14) scale(0.8)" }, children),
      h(
        "text",
        { x: 150, y: 325, textAnchor: "middle", fill: props?.fgColor },
        props?.label
      )
    );
  },
};

const OPTIONS: QRSVGOptions = {
  value: VALUE,
  size: 256,
  fgColor: "#1d4ed8",
  customTemplate: BADGE,
  customProps: { label: "Scan & go", cardColor: "#fde047" },
};

/** Markup as the browser serializes it, for comparing with the DOM. */
function asParsed(markup: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  return holder.innerHTML;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("customTemplate and customProps", () => {
  it("wrap the code in the template's artwork, with customProps", () => {
    const markup = toSVGString(OPTIONS);
    // The artwork, drawn at size, with the template's own viewBox
    expect(markup.slice(0, markup.indexOf(">") + 1)).toBe(
      '<svg viewBox="0 0 300 340" xmlns="http://www.w3.org/2000/svg" width="256" height="256">'
    );
    expect(markup).toContain('fill="#fde047" data-artwork="badge"');
    expect(markup).toContain(
      '<text x="150" y="325" text-anchor="middle" fill="#1d4ed8">Scan &amp; go</text>'
    );
    // The code inside it, as a 300 × 300 drawing
    expect(markup).toContain(
      '<g transform="translate(30, 14) scale(0.8)"><svg height="300" viewBox="0 0 300 300" width="300"'
    );
    // The wrapper gets fgColor and bgColor, customProps spread after them,
    // and the code's url and module width
    const [call] = calls;
    expect(call?.props).toMatchObject({
      fgColor: "#1d4ed8",
      bgColor: "#FFFFFF",
      label: "Scan & go",
      cardColor: "#fde047",
    });
    expect(call?.config?.url).toBe(VALUE);
    expect(call?.config?.pixelSize).toBeGreaterThan(0);
  });

  it("draw the same in React's QRCodeSVG and QRCode", () => {
    expect(renderToStaticMarkup(createElement(QRCodeSVG, OPTIONS))).toBe(
      toSVGString(OPTIONS)
    );
    const code = renderToStaticMarkup(createElement(QRCode, OPTIONS));
    expect(code).toBe(toSVGString(resolveQRCodeProps(OPTIONS)));
    expect(code).toContain('data-artwork="badge"');
    expect(code).toContain("Scan &amp; go</text>");
    expect(code).not.toMatch(/customtemplate|customprops/i);
  });

  it("keep the code readable inside the artwork", () => {
    const image = rasterizeSvg(toSVGString(OPTIONS), { width: 720, pad: 24 });
    expect(decodeQR(image)).toBe(VALUE);
  });

  it("draw a frame around the template's artwork", () => {
    const framed: QRProps = {
      ...OPTIONS,
      frame: { style: "banner-bottom", text: "Menu" },
    };
    const markup = toSVGString(framed);
    const { width, height } = getFrameDimensions(256, framed.frame);
    expect(markup).toContain(`width="${width}"`);
    expect(markup).toContain(`height="${height}"`);
    expect(markup).toContain('data-artwork="badge"');
    expect(markup).toContain(">Menu</text>");
  });

  it("stay in the SVG download", async () => {
    const uri = await getQRAsSVGDataUri(OPTIONS);
    const svg = decodeURIComponent(uri.replace("data:image/svg+xml,", ""));
    expect(svg).toBe(toSVGString(OPTIONS));
  });

  it("customProps without a template change nothing", () => {
    expect(
      toSVGString({ value: VALUE, customProps: { label: "Scan me" } })
    ).toBe(toSVGString({ value: VALUE }));
    expect(
      renderToStaticMarkup(
        createElement(QRCode, {
          value: VALUE,
          customProps: { label: "Scan me" },
        })
      )
    ).toBe(renderToStaticMarkup(createElement(QRCode, { value: VALUE })));
  });

  it("templateId next to a custom template is ignored", () => {
    // It used to lose to customTemplate; now it names nothing at all
    const withId = { ...OPTIONS, templateId: "Arrow" } as QRSVGOptions;
    expect(toSVGString(withId)).toBe(toSVGString(OPTIONS));
    expect(renderToStaticMarkup(createElement(QRCode, withId))).toBe(
      renderToStaticMarkup(createElement(QRCode, OPTIONS))
    );
  });

  it("give every link its own artwork from the code's url, as Flam's ring does", () => {
    // Dots on a ring, chosen by a hash of the link: the same link always
    // gets the same ring, another link another one
    const ring: TemplateDefinition<{ dots?: number }> = {
      id: "ring",
      name: "Ring",
      wrapper: (children, props, config) => {
        // A seed from the link, then a Lehmer generator picks the dots
        const MODULUS = 2_147_483_647;
        let seed = 1;
        for (const char of config?.url ?? "") {
          seed = (seed * 31 + (char.codePointAt(0) ?? 0)) % MODULUS;
        }
        const count = props?.dots ?? 48;
        const dots = Array.from({ length: count }, (_, index) => {
          seed = (seed * 48_271) % MODULUS;
          const angle = (index / count) * 2 * Math.PI;
          return seed % 2 === 1
            ? h("circle", {
                cx: 150 + 135 * Math.cos(angle),
                cy: 150 + 135 * Math.sin(angle),
                r: 4,
              })
            : null;
        });
        return h(
          "svg",
          { viewBox: "0 0 300 300", xmlns: "http://www.w3.org/2000/svg" },
          h("g", { "data-ring": "" }, ...dots),
          h("g", { transform: "translate(60, 60) scale(0.6)" }, children)
        );
      },
    };
    const ringOf = (value: string) => {
      const markup = toSVGString({
        value,
        customTemplate: ring,
        customProps: { dots: 64 },
      });
      return markup.match(/<circle[^>]*>/g)?.join("") ?? "";
    };
    const first = ringOf("https://example.com/a");
    expect(first.length).toBeGreaterThan(0);
    expect(ringOf("https://example.com/a")).toBe(first);
    expect(ringOf("https://example.com/b")).not.toBe(first);
  });
});

// A path, not `new URL(…, import.meta.url)`: under the jsdom environment Vite
// rewrites that pattern to an http:// asset URL (see vanilla.test.ts)
const dist = (file: string) =>
  join(dirname(fileURLToPath(import.meta.url)), "../dist", file);
const loadBuilt =
  <T>(file: string) =>
  async () =>
    existsSync(dist(file))
      ? ((await import(/* @vite-ignore */ pathToFileURL(dist(file)).href)) as T)
      : null;

describe.each([
  ["source", async () => vanillaSource],
  [
    "dist/vanilla.browser.mjs",
    loadBuilt<typeof vanillaSource>("vanilla.browser.mjs"),
  ],
] as const)("qrdx/vanilla (%s)", (_label, load) => {
  test("createQRCode draws the template, and updates its props", async () => {
    const api = await load();
    if (!api) return;
    const container = document.createElement("div");
    document.body.append(container);
    const qr = api.createQRCode(container, OPTIONS);
    expect(container.innerHTML).toBe(asParsed(toSVGString(OPTIONS)));
    expect(container.querySelector('[data-artwork="badge"]')).not.toBeNull();
    expect(container.querySelector("text")?.textContent).toBe("Scan & go");

    qr.update({ customProps: { label: "Menu" } });
    expect(container.querySelector("text")?.textContent).toBe("Menu");
    expect(container.querySelector('[data-artwork="badge"]')).not.toBeNull();
    qr.destroy();
  });
});

let tagCount = 0;

describe.each([
  ["source", async () => elementSource],
  ["dist/element.mjs", loadBuilt<typeof elementSource>("element.mjs")],
  [
    "dist/element.browser.mjs",
    loadBuilt<typeof elementSource>("element.browser.mjs"),
  ],
] as const)("<qrdx-code> (%s)", (_label, load) => {
  test("draws the template from its customTemplate and customProps properties", async () => {
    const api = await load();
    if (!api) return;
    tagCount += 1;
    const tag = `qrdx-template-${tagCount}`;
    api.defineQRdxCode(tag);
    const element = document.createElement(
      tag
    ) as elementSource.QRdxCodeElement;
    element.setAttribute("value", VALUE);
    element.setAttribute("size", "256");
    element.setAttribute("fg-color", "#1d4ed8");
    element.customTemplate = BADGE;
    element.customProps = OPTIONS.customProps;
    document.body.append(element);

    const svg = element.shadowRoot?.querySelector("svg[part]");
    expect(svg?.outerHTML).toBe(
      asParsed(
        toSVGString({
          ...OPTIONS,
          part: "svg",
          role: "img",
          "aria-label": "QR code",
        })
      )
    );
    expect(svg?.querySelector('[data-artwork="badge"]')).not.toBeNull();
    expect(element.toSVGString()).toBe(toSVGString(OPTIONS));

    // A property only: it never becomes an attribute
    expect(element.hasAttribute("custom-template")).toBe(false);
    element.customProps = { label: "Menu" };
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(
      element.shadowRoot?.querySelector("svg[part] text")?.textContent
    ).toBe("Menu");
  });
});

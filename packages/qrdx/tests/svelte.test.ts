// @vitest-environment jsdom
// qrdx/svelte's action in a DOM, called the way Svelte calls it: the
// action draws the core's markup into the element, redraws when the options
// change, leaves the <svg> alone when the markup is the same, takes over the
// server's <svg> instead of drawing it again, and cleans up on destroy.
// tests/svelte.dom.test.ts runs it in components compiled by Svelte.
import { afterEach, describe, expect, it } from "vitest";
import type { QRCodeProps } from "../src/qr-code-props";
import {
  type QRSVGOptions,
  qrcode,
  resolveQRCodeProps,
  toSVGString,
} from "../src/svelte";
import { type ParityCase, parityCases } from "./support/parity-cases";
import { decodeQR, rasterizeSvg } from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const OPTIONS: QRSVGOptions = {
  value: VALUE,
  size: 200,
  level: "Q",
  bodyPattern: "rounded",
  fgColor: {
    type: "linear",
    angle: 45,
    stops: [
      { color: "#1d4ed8", offset: 0 },
      { color: "#0f172a", offset: 100 },
    ],
  },
  frame: { style: "banner-bottom", text: "Scan me" },
  className: "qr",
  "aria-label": "QR code",
};

/** Markup as the browser serializes it, for comparing with the DOM. */
function asParsed(markup: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  return holder.innerHTML;
}

function mount(html = "") {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  return container;
}

const coreProps = (c: ParityCase): QRSVGOptions =>
  c.component === "code" ? resolveQRCodeProps(c.props as QRCodeProps) : c.props;

afterEach(() => {
  document.body.replaceChildren();
});

describe("qrcode (Svelte action)", () => {
  it("draws the core's markup into the element, and it decodes", () => {
    const container = mount();
    qrcode(container, OPTIONS);

    expect(container.children).toHaveLength(1);
    const svg = container.firstElementChild;
    expect(svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg?.getAttribute("class")).toBe("qr");
    expect(container.innerHTML).toBe(asParsed(toSVGString(OPTIONS)));

    const image = rasterizeSvg(toSVGString(OPTIONS), { width: 600 });
    expect(decodeQR(image)).toBe(VALUE);
  });

  it("redraws on update, and keeps the <svg> when the markup is the same", () => {
    const container = mount();
    const action = qrcode(container, { value: VALUE, size: 160 });
    const first = container.firstElementChild;

    // A new object with the same options, as Svelte passes on every change
    action.update({ value: VALUE, size: 160 });
    expect(container.firstElementChild).toBe(first);

    const next: QRSVGOptions = {
      value: VALUE,
      size: 160,
      fgColor: "#be123c",
      bodyPattern: "diamond",
    };
    action.update(next);
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).not.toBe(first);
    expect(first?.isConnected).toBe(false);
    expect(container.innerHTML).toBe(asParsed(toSVGString(next)));

    // Options are replaced, not merged: what Svelte passes is all of them
    const second = container.firstElementChild;
    action.update({ value: VALUE, size: 160 });
    expect(container.firstElementChild).not.toBe(second);
    expect(container.innerHTML).toBe(
      asParsed(toSVGString({ value: VALUE, size: 160 }))
    );

    // A frame changes the root element
    action.update({ ...next, frame: { style: "banner-top", text: "Menu" } });
    expect(container.children).toHaveLength(1);
    expect(container.querySelector("text")?.textContent).toBe("Menu");
  });

  it("draws next to the element's other children", () => {
    const container = mount("<p>Scan to open the menu</p>");
    const action = qrcode(container, { value: VALUE });
    expect(container.children).toHaveLength(2);
    expect(container.firstElementChild?.localName).toBe("p");
    action.update({ value: `${VALUE}/2` });
    expect(container.children).toHaveLength(2);
    expect(container.lastElementChild?.localName).toBe("svg");
    action.destroy();
    expect(container.innerHTML).toBe("<p>Scan to open the menu</p>");
  });

  it("removes the code on destroy", () => {
    const container = mount();
    const action = qrcode(container, { value: VALUE });
    action.destroy();
    expect(container.children).toHaveLength(0);
    expect(() => action.destroy()).not.toThrow();
  });

  it("works on an <svg> element's <g> too", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.append(group);
    document.body.append(svg);
    qrcode(group, { value: VALUE, size: 120 });
    expect(group.firstElementChild?.localName).toBe("svg");
    expect(group.firstElementChild?.namespaceURI).toBe(
      "http://www.w3.org/2000/svg"
    );
  });
});

// Server-rendered pages write `{@html toSVGString(options)}` inside the
// element. Svelte puts comments around it (hydration markers), and the
// browser parsed the markup as HTML; the action keeps that <svg>.
describe("qrcode over server markup", () => {
  const ssr = (markup: string) => `<!---->${markup}<!---->`;

  // isOGContext draws an HTML <img> inside the <svg> for OG image renderers;
  // an HTML parser moves it out of the <svg>, so no page holds that markup
  const pageCases = parityCases().filter((c) => !c.props.isOGContext);

  it("covers the parity designs", () => {
    expect(pageCases.length).toBeGreaterThan(50);
  });

  it.each(pageCases.map((c) => [c.name, c] as const))(
    "%s: keeps the server's <svg>",
    (_name, c) => {
      const options = coreProps(c);
      const container = mount(ssr(toSVGString(options)));
      const server = container.querySelector("svg");
      expect(server).not.toBeNull();

      qrcode(container, options);
      expect(container.querySelector("svg")).toBe(server);
      expect(container.querySelectorAll(":scope > svg")).toHaveLength(1);
    }
  );

  it("keeps text the markup escapes", () => {
    const options: QRSVGOptions = {
      value: VALUE,
      frame: { style: "banner-bottom", text: `Tom & Jerry's "menu" <3` },
    };
    const container = mount(ssr(toSVGString(options)));
    const server = container.querySelector("svg");
    qrcode(container, options);
    expect(container.querySelector("svg")).toBe(server);
  });

  it("replaces server markup drawn with other options", () => {
    const container = mount(
      ssr(toSVGString({ value: VALUE, fgColor: "#be123c" }))
    );
    const server = container.querySelector("svg");
    qrcode(container, { value: VALUE });
    expect(server?.isConnected).toBe(false);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(container.innerHTML).toBe(
      asParsed(ssr(toSVGString({ value: VALUE })))
    );
  });

  it("then redraws on update like any code", () => {
    const options: QRSVGOptions = { value: VALUE, size: 160 };
    const container = mount(ssr(toSVGString(options)));
    const server = container.querySelector("svg");
    const action = qrcode(container, options);

    action.update({ ...options });
    expect(container.querySelector("svg")).toBe(server);

    action.update({ ...options, fgColor: "#1d4ed8" });
    expect(server?.isConnected).toBe(false);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    // The comments around it stay where they were
    expect(container.innerHTML).toBe(
      asParsed(ssr(toSVGString({ ...options, fgColor: "#1d4ed8" })))
    );
  });

  // `{@html toSVGString(options)}` that follows the options: Svelte redraws
  // it before the action's update runs, and the action takes that <svg>
  it("takes over an <svg> that replaced its own", () => {
    const options: QRSVGOptions = { value: VALUE, size: 160 };
    const container = mount(ssr(toSVGString(options)));
    const action = qrcode(container, options);

    const next = { ...options, bodyPattern: "dots" as const };
    const holder = document.createElement("div");
    holder.innerHTML = toSVGString(next);
    const redrawn = holder.firstElementChild as Element;
    container.querySelector("svg")?.replaceWith(redrawn);

    action.update(next);
    expect(container.querySelector("svg")).toBe(redrawn);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });
});

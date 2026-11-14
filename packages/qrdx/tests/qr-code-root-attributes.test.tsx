// React's QRCode forwards root attributes (`aria-label`, `className`,
// `role`, `id`, `data-*`…) to the `<svg>`, as QRCodeSVG always has: the same
// markup as QRCodeSVG with the resolved props, on the frame's outer <svg>
// when there is a frame, and never its own props as attributes.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveQRCodeProps, toSVGString } from "../src/core";
import { QRCode, QRCodeSVG } from "../src/index";
import type { QRCodePropsSVG } from "../types/react";

const LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#1d4ed8"/></svg>'
)}`;

const ATTRIBUTES = {
  "aria-label": "Guest Wi-Fi",
  className: "qr",
  role: "img",
  id: "wifi-code",
  title: "Scan to join",
  "data-testid": "code",
} as const;

/** The root element's opening tag. */
const rootTag = (html: string) => html.slice(0, html.indexOf(">") + 1);

describe("resolveQRCodeProps", () => {
  it("forwards root attributes and keeps QRCode's own props out of them", () => {
    const resolved = resolveQRCodeProps({
      value: "https://qrdx.dev",
      logo: LOGO,
      logoOptions: { size: 0.2 },
      hideLogo: false,
      scale: 2,
      level: "H",
      ...ATTRIBUTES,
    });
    expect(resolved).toMatchObject(ATTRIBUTES);
    for (const own of ["logo", "logoOptions", "hideLogo", "scale"]) {
      expect(own in resolved).toBe(false);
    }
    // The attributes come after the drawing props, in the order given
    expect(Object.keys(resolved).slice(-6)).toEqual(Object.keys(ATTRIBUTES));
  });

  it("adds nothing when there are none", () => {
    const props = { value: "https://qrdx.dev", size: 100, level: "M" } as const;
    expect(Object.keys(resolveQRCodeProps(props))).toEqual(
      Object.keys(resolveQRCodeProps({ ...props, margin: 0 }))
    );
    expect(toSVGString(resolveQRCodeProps(props))).not.toMatch(
      /class=|aria-|data-/
    );
  });
});

describe("<QRCode> root attributes", () => {
  const props: QRCodePropsSVG = {
    value: "https://qrdx.dev",
    size: 128,
    level: "H",
    logo: LOGO,
    ...ATTRIBUTES,
  };

  it("writes them on the <svg>, like <QRCodeSVG>", () => {
    const html = renderToStaticMarkup(createElement(QRCode, props));
    const root = rootTag(html);
    expect(root).toContain('aria-label="Guest Wi-Fi"');
    expect(root).toContain('class="qr"');
    expect(root).toContain('role="img"');
    expect(root).toContain('id="wifi-code"');
    expect(root).toContain('title="Scan to join"');
    expect(root).toContain('data-testid="code"');
    const resolved = resolveQRCodeProps(props);
    expect(html).toBe(renderToStaticMarkup(createElement(QRCodeSVG, resolved)));
    expect(html).toBe(toSVGString(resolved));
  });

  it("writes none of its own props as attributes", () => {
    const html = renderToStaticMarkup(
      createElement(QRCode, { ...props, scale: 2, hideLogo: true })
    );
    expect(rootTag(html)).not.toMatch(/\b(logo|logoOptions|hideLogo|scale)=/);
    // scale is applied to the size, not written
    expect(rootTag(html)).toContain('width="256"');
  });

  it("puts them on the frame's outer <svg> only", () => {
    const html = renderToStaticMarkup(
      createElement(QRCode, {
        ...props,
        frame: { style: "banner-bottom", text: "Join" },
      })
    );
    expect(rootTag(html)).toContain('aria-label="Guest Wi-Fi"');
    expect(html.match(/aria-label=/g)).toHaveLength(1);
    expect(html.match(/class="qr"/g)).toHaveLength(1);
  });

  it("puts them on a template's root <svg>", () => {
    const html = renderToStaticMarkup(
      createElement(QRCode, { ...props, templateId: "Arrow" })
    );
    expect(rootTag(html)).toContain('class="qr"');
    expect(html.match(/class="qr"/g)).toHaveLength(1);
  });

  it("draws the same code without them as before", () => {
    const plain = renderToStaticMarkup(
      createElement(QRCode, { value: "https://qrdx.dev", size: 128 })
    );
    expect(plain).toBe(
      toSVGString(resolveQRCodeProps({ value: "https://qrdx.dev", size: 128 }))
    );
    expect(rootTag(plain)).toBe(
      '<svg height="128" viewBox="0 0 128 128" width="128" xmlns="http://www.w3.org/2000/svg">'
    );
  });

  it("leaves event handlers out of the markup", () => {
    const html = renderToStaticMarkup(
      createElement(QRCode, { ...props, onClick: () => undefined })
    );
    expect(html).not.toContain("onClick");
    expect(html).not.toContain("onclick");
  });
});

"use strict";
// Run by scripts/react-compat.mjs inside a folder where npm installed the
// packed qrdx next to one React version: renders each design below through
// the built CommonJS entry, on the server with that React's react-dom/server
// and in a DOM (jsdom, at the path in QRDX_JSDOM) with its react-dom, and
// prints { react, markup, dom, logged } as JSON: the static markup and the
// DOM's HTML of each design, and everything React wrote to
// console.error or console.warn (invalid props, missing keys…).
const { createElement } = require("react");
const { version } = require("react/package.json");
const { renderToStaticMarkup } = require("react-dom/server");
const {
  getQRAsSVG,
  QRCode,
  QRCodeCanvas,
  QRCodeSVG,
  QRFrameSVG,
} = require("qrdx");

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1d4ed8"/></svg>'
)}`;
const GRADIENT = {
  type: "linear",
  angle: 45,
  stops: [
    { color: "#1d4ed8", offset: 0 },
    { color: "#0f172a", offset: 100 },
  ],
};

const DESIGNS = {
  "QRCodeSVG, default": () => createElement(QRCodeSVG, { value: VALUE }),
  "QRCodeSVG, gradient": () =>
    createElement(QRCodeSVG, {
      value: VALUE,
      size: 220,
      level: "Q",
      fgColor: GRADIENT,
      bgColor: "#f8fafc",
    }),
  "QRCodeSVG, dots and custom eyes": () =>
    createElement(QRCodeSVG, {
      value: VALUE,
      bodyPattern: "circle",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "circle",
      eyeColor: "#1d4ed8",
      dotColor: "#0f172a",
    }),
  "QRCodeSVG, rounded body, eye shapes and looks": () =>
    createElement(QRCodeSVG, {
      value: VALUE,
      bodyPattern: "rounded",
      eyeShapes: {
        topLeft: { outer: "gear", inner: "rounded" },
        bottomLeft: { outer: "octagon", inner: "circle" },
      },
      bgRadius: 0.2,
      backdrop: "#e2e8f0",
      halo: { width: 0.3 },
      shadow: { opacity: 0.3 },
    }),
  "QRCodeSVG, dot ring frame": () =>
    createElement(QRCodeSVG, { value: VALUE, frame: { style: "dot-ring" } }),
  "QRCodeSVG, custom template": () =>
    createElement(QRCodeSVG, {
      value: VALUE,
      fgColor: "#1d4ed8",
      customTemplate: {
        id: "labelled",
        name: "Labelled",
        wrapper: (children, props) =>
          createElement(
            "svg",
            { viewBox: "0 0 300 340", xmlns: "http://www.w3.org/2000/svg" },
            createElement(
              "g",
              { transform: "translate(20, 20) scale(0.87)" },
              children
            ),
            createElement(
              "text",
              { x: "150", y: "325", textAnchor: "middle", fill: props.fgColor },
              props.label
            )
          ),
      },
      customProps: { label: "Scan me" },
    }),
  "QRCode, logo": () =>
    createElement(QRCode, {
      value: VALUE,
      logo: LOGO,
      logoOptions: { size: 0.22 },
    }),
  "QRCode, frame with text": () =>
    createElement(QRCode, {
      value: VALUE,
      fgColor: GRADIENT,
      frame: { style: "banner-bottom", text: "Scan for our menu" },
    }),
  "QRCode, root attributes": () =>
    createElement(QRCode, {
      value: VALUE,
      className: "qr",
      "aria-label": "Menu",
      role: "img",
      id: "menu-code",
      "data-testid": "code",
    }),
  "QRFrameSVG with a code in its slot": () =>
    createElement(QRFrameSVG, {
      frame: { style: "banner-bottom", text: "Scan me" },
      size: 200,
      slot: createElement(QRCodeSVG, { value: VALUE, size: 200 }),
    }),
  "QRCodeCanvas with a logo": () =>
    createElement(QRCodeCanvas, {
      value: VALUE,
      size: 160,
      className: "qr-canvas",
      imageSettings: { src: LOGO, width: 32, height: 32, excavate: true },
    }),
  "getQRAsSVG, logo": () =>
    getQRAsSVG({
      value: VALUE,
      size: 200,
      imageSettings: { src: LOGO, width: 40, height: 40, excavate: true },
    }),
};

const logged = [];
for (const level of ["error", "warn"]) {
  console[level] = (...args) => {
    logged.push(`${level}: ${args.map(String).join(" ")}`);
  };
}

/**
 * The container's HTML with every element's attributes in name order. The
 * order isn't part of the DOM, and it changes between versions: React 19
 * sets an <img>'s src after its other props, earlier versions in prop order.
 */
function sortedHTML(container) {
  const copy = container.cloneNode(true);
  for (const element of copy.querySelectorAll("*")) {
    const attributes = [...element.attributes]
      .map(({ namespaceURI, name, value }) => ({ namespaceURI, name, value }))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const { name } of attributes) {
      element.removeAttribute(name);
    }
    for (const { namespaceURI, name, value } of attributes) {
      if (namespaceURI) {
        element.setAttributeNS(namespaceURI, name, value);
      } else {
        element.setAttribute(name, value);
      }
    }
  }
  return copy.innerHTML;
}

/**
 * Mounts `element` in a fresh container, the way this React's apps do:
 * `ReactDOM.render` before React 18, a root from react-dom/client since.
 */
function renderInDOM(element) {
  const ReactDOM = require("react-dom");
  const container = document.createElement("div");
  if (Number.parseInt(version, 10) < 18) {
    ReactDOM.render(element, container);
    const html = sortedHTML(container);
    ReactDOM.unmountComponentAtNode(container);
    return html;
  }
  const root = require("react-dom/client").createRoot(container);
  ReactDOM.flushSync(() => root.render(element));
  const html = sortedHTML(container);
  root.unmount();
  return html;
}

async function main() {
  const elements = {};
  const markup = {};
  for (const [name, design] of Object.entries(DESIGNS)) {
    elements[name] = await design();
    markup[name] = renderToStaticMarkup(elements[name]);
  }
  // react-dom looks for a DOM when it loads, so the globals come first
  const { JSDOM, VirtualConsole } = require(process.env.QRDX_JSDOM);
  // jsdom's own messages (it has no canvas to draw on) aren't React's
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  // React 16's scheduler reads requestAnimationFrame as a global, as in a
  // browser
  Object.assign(globalThis, {
    window,
    document: window.document,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  });
  const dom = {};
  for (const [name, element] of Object.entries(elements)) {
    dom[name] = renderInDOM(element);
  }
  window.close();
  return JSON.stringify({ react: version, markup, dom, logged });
}

// React's scheduler and jsdom's timers would keep the process running, so it
// exits once the output is written.
main().then(
  (output) => process.stdout.write(output, () => process.exit(0)),
  (error) =>
    process.stderr.write(`${error?.stack ?? error}\n`, () => process.exit(1))
);

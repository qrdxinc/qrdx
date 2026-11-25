// qrdx/svelte in components that Svelte itself compiles (svelte/compiler,
// as a SvelteKit build does), on Svelte's browser build (the "dom" project
// in vitest.config.ts): `use:qrcode` draws the code, follows the options,
// and goes away on unmount; with `{@html toSVGString(options)}` inside the
// element, svelte/server writes the markup and hydration keeps that <svg>.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Component, flushSync, hydrate, mount, unmount } from "svelte";
import { compile } from "svelte/compiler";
import { render } from "svelte/server";
import { afterEach, describe, expect, it, it as test, vi } from "vitest";
import { type QRSVGOptions, toSVGString } from "../src/svelte";
import { decodeQR, rasterizeSvg } from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";

// Compiled components are written next to the package (an ignored folder),
// so their imports of svelte and of src/svelte.ts resolve as the test's do.
// A path, not `new URL(…, import.meta.url)`, which Vite rewrites under jsdom.
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "../.cache/svelte-tests");

interface Exports {
  setColor(color: string): void;
}

/** `source` compiled for the browser and for svelte/server. */
async function compileComponent(name: string, source: string) {
  mkdirSync(OUT, { recursive: true });
  const load = async (generate: "client" | "server") => {
    const { js } = compile(source, { filename: `${name}.svelte`, generate });
    const file = join(OUT, `${name}.${generate}.js`);
    writeFileSync(file, js.code);
    return (await import(/* @vite-ignore */ pathToFileURL(file).href))
      .default as Component<{ value: string }, Exports>;
  };
  return { client: await load("client"), server: await load("server") };
}

const ACTION = `import { qrcode, toSVGString } from "${join(here, "../src/svelte.ts")}";`;

// What the docs show: the server's markup once (untrack: Svelte never
// redraws it), and the action keeps the code up to date from there
const RUNES = `<script>
  import { untrack } from "svelte";
  ${ACTION}
  let { value } = $props();
  let color = $state("#0f172a");
  export function setColor(next) { color = next; }
  const options = $derived({ value, size: 160, fgColor: color, "aria-label": "QR code" });
</script>

<div class="qr" use:qrcode={options}>{@html untrack(() => toSVGString(options))}</div>
`;

// The same in Svelte 4's syntax (legacy mode)
const LEGACY = `<script>
  ${ACTION}
  export let value;
  let color = "#0f172a";
  export function setColor(next) { color = next; }
  $: options = { value, size: 160, fgColor: color, "aria-label": "QR code" };
  const initial = toSVGString({ value, size: 160, fgColor: color, "aria-label": "QR code" });
</script>

<div class="qr" use:qrcode={options}>{@html initial}</div>
`;

// {@html} that follows the options too: Svelte redraws it first, and the
// action takes over that <svg> rather than drawing a second one
const REACTIVE_HTML = `<script>
  ${ACTION}
  let { value } = $props();
  let color = $state("#0f172a");
  export function setColor(next) { color = next; }
  const options = $derived({ value, size: 160, fgColor: color, "aria-label": "QR code" });
</script>

<div class="qr" use:qrcode={options}>{@html toSVGString(options)}</div>
`;

// Client-only: nothing inside the element
const CLIENT_ONLY = `<script>
  ${ACTION}
  let { value } = $props();
  let color = $state("#0f172a");
  export function setColor(next) { color = next; }
  const options = $derived({ value, size: 160, fgColor: color, "aria-label": "QR code" });
</script>

<div class="qr" use:qrcode={options}></div>
`;

const optionsFor = (color: string): QRSVGOptions => ({
  value: VALUE,
  size: 160,
  fgColor: color,
  "aria-label": "QR code",
});

/** The element's markup without Svelte's hydration comments. */
function markupIn(container: Element): string {
  const copy = container.querySelector(".qr")?.cloneNode(true) as
    | Element
    | undefined;
  for (const node of [...(copy?.childNodes ?? [])]) {
    if (node.nodeType === node.COMMENT_NODE) {
      node.remove();
    }
  }
  return copy?.innerHTML ?? "";
}

const asParsed = (markup: string) => {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  return holder.innerHTML;
};

const mounted: Record<string, unknown>[] = [];
afterEach(() => {
  for (const component of mounted.splice(0)) {
    unmount(component);
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function target(html = "") {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  return container;
}

describe.each([
  ["runes", RUNES],
  ["legacy syntax", LEGACY],
  ["{@html} that follows the options", REACTIVE_HTML],
] as const)("qrdx/svelte server-rendered (%s)", (name, source) => {
  test("writes the markup on the server, keeps it when hydrating, then follows the options", async () => {
    const { client, server } = await compileComponent(
      name.replace(/\W+/g, "-"),
      source
    );
    const logged = [
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ] as const;

    const { body } = render(server, { props: { value: VALUE } });
    expect(body).toContain(toSVGString(optionsFor("#0f172a")));

    const container = target(body);
    const fromServer = container.querySelector("svg");
    const exports = hydrate(client, {
      target: container,
      props: { value: VALUE },
    });
    mounted.push(exports);
    flushSync();

    // The server's <svg> is still the one on the page
    expect(container.querySelector("svg")).toBe(fromServer);
    expect(container.querySelectorAll("svg")).toHaveLength(1);

    exports.setColor("#1d4ed8");
    flushSync();
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(fromServer?.isConnected).toBe(false);
    expect(markupIn(container)).toBe(
      asParsed(toSVGString(optionsFor("#1d4ed8")))
    );
    const drawn = container.querySelector("svg");
    const image = rasterizeSvg(drawn?.outerHTML ?? "", { width: 480 });
    expect(decodeQR(image)).toBe(VALUE);

    // Same options again: the <svg> stays
    exports.setColor("#0f172a");
    flushSync();
    const back = container.querySelector("svg");
    exports.setColor("#0f172a");
    flushSync();
    expect(container.querySelector("svg")).toBe(back);
    expect(markupIn(container)).toBe(
      asParsed(toSVGString(optionsFor("#0f172a")))
    );

    for (const spy of logged) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe("qrdx/svelte in the browser only", () => {
  it("draws the code into the element, follows the options and goes on unmount", async () => {
    const { client } = await compileComponent("client-only", CLIENT_ONLY);
    const container = target();
    const exports = mount(client, {
      target: container,
      props: { value: VALUE },
    });
    flushSync();
    expect(markupIn(container)).toBe(
      asParsed(toSVGString(optionsFor("#0f172a")))
    );

    exports.setColor("#be123c");
    flushSync();
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(markupIn(container)).toBe(
      asParsed(toSVGString(optionsFor("#be123c")))
    );

    unmount(exports);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("the server-rendering component works without a server too", async () => {
    const { client } = await compileComponent("runes", RUNES);
    const container = target();
    const exports = mount(client, {
      target: container,
      props: { value: VALUE },
    });
    mounted.push(exports);
    flushSync();
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    exports.setColor("#be123c");
    flushSync();
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(markupIn(container)).toBe(
      asParsed(toSVGString(optionsFor("#be123c")))
    );
  });
});

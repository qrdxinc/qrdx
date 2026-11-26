// @vitest-environment jsdom
// The download buttons under the generator and barcode widgets. In four
// columns, "CMYK TIFF" spilled out of its button beside the 20rem preview,
// and every label did on 320 px phones: the generator's grid has two
// columns and lets a label wrap; the barcode widget's has two on phones.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BarcodeDownloads,
  type BarcodeGeneratorState,
} from "@/components/sections/tools/barcode-generator";
import { DownloadButtons } from "@/components/sections/tools/type-generator";
import en from "@/messages/en.json";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(node: ReactNode) {
  act(() => {
    root.render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {node}
      </NextIntlClientProvider>,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the generator's download buttons", () => {
  it("offer every format, two to a row, each label free to wrap", () => {
    const onDownload = vi.fn();
    render(
      <DownloadButtons
        downloading={null}
        onDownload={onDownload}
        payload="https://example.com"
      />,
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).not.toContain("grid-cols-4");
    const buttons = [...grid.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual([
      "PNG",
      "WebP",
      "GIF",
      "BMP",
      "ICO",
      "TIFF",
      "CMYK TIFF",
      "SVG",
    ]);
    for (const button of buttons) {
      expect(button.className).toContain("whitespace-normal");
      expect(button.className).not.toMatch(/(^|\s)h-9(\s|$)/);
      expect(button.querySelector("svg")).not.toBeNull();
    }
    act(() => buttons[6]?.click());
    expect(onDownload).toHaveBeenCalledWith("tiff-cmyk");
  });

  it("are off until there is something to download", () => {
    render(
      <DownloadButtons downloading={null} onDownload={vi.fn()} payload="" />,
    );
    for (const button of container.querySelectorAll("button")) {
      expect(button.disabled).toBe(true);
    }
  });
});

describe("the barcode widget's download buttons", () => {
  it("sit two to a row on phones and four from the sm breakpoint", () => {
    const state = {
      canDownload: true,
      downloading: null,
      download: vi.fn(),
    } as unknown as BarcodeGeneratorState;
    render(<BarcodeDownloads state={state} />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toMatch(/(^|\s)grid-cols-2(\s|$)/);
    expect(grid.className).toContain("sm:grid-cols-4");
    expect(
      [...grid.querySelectorAll("button")].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["PNG", "SVG", "PDF", "More"]);
  });
});

// @vitest-environment jsdom
// The "New" tags on the looks added in November 2026 (lib/whats-new/looks.ts):
// every id is a real Design control, the tag stops the day after the batch's
// date, and NewLookTag shows the pill for a new control only, in the browser
// after hydration (never in server markup, so a static build can't mismatch).
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { EYE_GRADIENT_CONTROL } from "@/components/editor/control-sections/eye-colors";
import { NewLookTag } from "@/components/editor/control-sections/new-look-tag";
import { DESIGN_SECTIONS } from "@/lib/playground-links";
import { isNewIn } from "@/lib/whats-new";
import { NEW_LOOKS } from "@/lib/whats-new/looks";
import en from "@/messages/en.json";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const DURING = new Date("2026-12-01T12:00:00Z");
const AFTER = new Date("2027-01-01T00:00:00Z");

describe("NEW_LOOKS", () => {
  it("names only controls the Design tab has", () => {
    const controls = new Set<string>([
      ...DESIGN_SECTIONS,
      EYE_GRADIENT_CONTROL,
    ]);
    for (const batch of NEW_LOOKS) {
      for (const id of batch.ids) {
        expect(controls.has(id), id).toBe(true);
      }
      expect(batch.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(NEW_LOOKS.flatMap((batch) => batch.ids)).toEqual([
      "eye-shapes",
      "eye-gradient",
      "corners",
      "halo",
      "shadow",
    ]);
  });

  it("is new until its date and not the day after", () => {
    expect(isNewIn(NEW_LOOKS, "halo", DURING)).toBe(true);
    expect(isNewIn(NEW_LOOKS, "halo", new Date("2026-12-31T23:59:59Z"))).toBe(
      true,
    );
    expect(isNewIn(NEW_LOOKS, "halo", AFTER)).toBe(false);
    expect(isNewIn(NEW_LOOKS, "dots", DURING)).toBe(false);
  });
});

describe("NewLookTag", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  const mount = (id: string, now: Date) => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          <NewLookTag id={id} now={now} />
        </NextIntlClientProvider>,
      );
    });
    return host.textContent;
  };

  it("shows the pill for a new control in the browser", () => {
    expect(mount("halo", DURING)).toBe("New");
  });

  it("shows nothing for an old control, or once the batch's date has passed", () => {
    expect(mount("dots", DURING)).toBe("");
    act(() => root?.unmount());
    expect(mount("halo", AFTER)).toBe("");
  });

  it("renders nothing on the server, so a static page never mismatches", () => {
    expect(
      renderToStaticMarkup(
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          <NewLookTag id="halo" now={DURING} />
        </NextIntlClientProvider>,
      ),
    ).toBe("");
  });
});

// The playground's theme gallery thumbnails (components/editor/
// theme-gallery.tsx) draw a theme as the editor does: its frame and logo,
// scaled to the thumbnail. Before, a bordered or logo theme
// showed as a plain code.
import { describe, expect, it } from "vitest";
import { thumbProps } from "@/components/editor/theme-gallery";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { designQRProps } from "@/lib/qr-design/props";
import { defaultPresets } from "@/utils/qr-presets";

const SIZE = 96;
const styles = (id: string) => {
  const preset = defaultPresets[id];
  if (!preset) throw new Error(`no preset ${id}`);
  return preset.styles;
};

describe("theme gallery thumbnails", () => {
  it("draw a theme's frame, the former templates' too", () => {
    expect(thumbProps(styles("ink"), SIZE).frame).toEqual({
      style: "square-border",
    });
  });

  it.each(["logotype", "pebble"])(
    "draw the editor's default logo for %s, at its share of the code",
    (id) => {
      const props = thumbProps(styles(id), SIZE);
      expect(props.imageSettings?.src).toBe(DEFAULT_QR_LOGO);
      // The logo the editor draws on a 1024 px code (capped for the code's
      // length and error correction), scaled to the thumbnail.
      const editor = designQRProps(
        "https://qrdx.dev",
        styles(id),
        DEFAULT_QR_LOGO,
      ).imageSettings;
      expect(editor?.width).toBeGreaterThan(0);
      expect(props.imageSettings?.width).toBeCloseTo(
        ((editor?.width ?? 0) * SIZE) / 1024,
        5,
      );
      expect(props.imageSettings?.width).toBeLessThanOrEqual(SIZE / 4);
      expect(props.size).toBe(SIZE);
    },
  );

  it("draw no logo, frame or art for a plain theme, and keep frames", () => {
    const plain = thumbProps(styles("classic"), SIZE);
    expect(plain.imageSettings).toBeUndefined();
    expect(plain.frame).toBeUndefined();
    expect(thumbProps(styles("guestWifi"), SIZE).frame?.style).toBe(
      "rounded-border",
    );
  });

  it("cap the quiet zone at three modules", () => {
    expect(thumbProps(styles("classic"), SIZE).margin).toBe(3);
  });

  it("render every built-in theme's frame and logo", () => {
    for (const [id, preset] of Object.entries(defaultPresets)) {
      const props = thumbProps(preset.styles, SIZE);
      expect(props.frame, id).toEqual(preset.styles.frame);
      expect(Boolean(props.imageSettings), id).toBe(
        Boolean(preset.styles.showLogo),
      );
    }
  });
});

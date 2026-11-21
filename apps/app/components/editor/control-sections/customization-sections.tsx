"use client";

import * as React from "react";
import { defaultThemeState } from "@/config/qr";
import type { DesignSection } from "@/lib/playground-links";
import type { QRStyle } from "@/types/theme";
import { CornersSection } from "./corners-section";
import { DotSizeSection } from "./dot-size-section";
import { EyeColorsSection } from "./eye-colors-section";
import { EyeShapesSection } from "./eye-shapes-section";
import { HaloSection } from "./halo-section";
import { LogoOptionsSection } from "./logo-options-section";
import { ShadowSection } from "./shadow-section";

/**
 * `styles` with `change` merged in. Cleared options leave the style, so it
 * saves and links as before. The Design tab's sections and the preview's
 * part toolbars (part-inline/) merge every change this way.
 */
export function withStyleChange(
  styles: QRStyle,
  change: Partial<QRStyle>,
): QRStyle {
  const next: QRStyle = { ...styles, ...change };
  for (const key of Object.keys(change) as (keyof QRStyle)[]) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

interface CustomizationSectionsProps {
  styles: QRStyle;
  onChange: (styles: QRStyle) => void;
  /** The section a link asked for (opens it) */
  focus?: DesignSection;
}

/**
 * Engine options the Design tab adds after the Logo section: logo options
 * (while a logo is on), per-eye colors and shapes, dot size, rounded
 * corners, the halo and the shadow (the code's shape is a choice in
 * Frame). One component, so design-controls.tsx wires them in a single
 * place.
 */
export function CustomizationSections({
  styles,
  onChange,
  focus,
}: CustomizationSectionsProps) {
  const current = React.useMemo(
    () => ({ ...defaultThemeState.styles, ...styles }),
    [styles],
  );
  const update = (change: Partial<QRStyle>) =>
    onChange(withStyleChange(styles, change));

  return (
    <>
      {current.showLogo && (
        <LogoOptionsSection onChange={update} style={current} />
      )}
      <EyeColorsSection
        expanded={focus === "eye-colors"}
        onChange={(eyeColors) => update({ eyeColors })}
        onEyeGradientChange={(eyeGradient) => update({ eyeGradient })}
        style={current}
      />
      <EyeShapesSection
        expanded={focus === "eye-shapes"}
        onChange={(eyeShapes) => update({ eyeShapes })}
        style={current}
      />
      <DotSizeSection
        expanded={focus === "dot-size"}
        onChange={(moduleScale) => update({ moduleScale })}
        style={current}
      />
      {/* ── The looks around the shapes (feat/more-customization) ── */}
      <CornersSection
        expanded={focus === "corners"}
        onChange={update}
        style={current}
      />
      <HaloSection
        expanded={focus === "halo"}
        onChange={(halo) => update({ halo })}
        style={current}
      />
      <ShadowSection
        expanded={focus === "shadow"}
        onChange={(shadow) => update({ shadow })}
        style={current}
      />
    </>
  );
}

// The type mark (type-mark.tsx) for Open Graph images, which next/og draws
// with Satori: no stylesheet, so the tile is inline styles, and an <svg> may
// only hold plain elements, so the glyph's components are expanded first.

import {
  Children,
  type ComponentType,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { BrandLogo } from "@/lib/brand-logos/brand-logo";
import { glyphInk, markFill } from "@/lib/type-marks/ink";
import {
  glyphBox,
  resolveGlyph,
  TYPE_MARK_HIGHLIGHT,
  typeMarkEntry,
} from "./type-mark";

/**
 * The plain elements a tree renders to: function components (iconsax's
 * variants, the design system's logos) and forwardRef ones (iconsax's
 * icons) are called. None of them use hooks.
 */
function plainElements(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node;
  const { props } = node as ReactElement<Record<string, unknown>>;
  const type: unknown = node.type;
  if (typeof type === "function") {
    return plainElements((type as (props: unknown) => ReactNode)(props));
  }
  if (typeof type === "object" && type !== null && "render" in type) {
    const { render } = type as {
      render: (props: unknown, ref: null) => ReactNode;
    };
    return plainElements(render(props, null));
  }
  const { children, ref: _ref, ...rest } = props;
  return createElement(
    type as string,
    { ...rest, key: node.key },
    ...Children.toArray(children as ReactNode).map(plainElements),
  );
}

/**
 * A type's mark for an Open Graph image (BrandOgImage's `mark`), or null
 * where it can't be drawn there: an integration's logo is a file in public/.
 */
export function typeMarkOgImage({
  type,
  pageType,
  size = 96,
}: {
  type?: string;
  pageType?: string;
  size?: number;
}): ReactNode {
  const entry = typeMarkEntry({ type, pageType });
  const glyph = resolveGlyph(entry, undefined);
  if (glyph.kind === "integration") return null;
  const box = glyphBox(size, glyph);
  let art: ReactNode;
  if (glyph.kind === "brand") {
    art = <BrandLogo color="currentColor" size={box} slug={glyph.slug} />;
  } else {
    const GlyphIcon = glyph.Icon as ComponentType<{
      size?: number;
      variant?: "Bold";
    }>;
    art = glyph.bold ? (
      <GlyphIcon size={box} variant="Bold" />
    ) : (
      <GlyphIcon size={box} />
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        backgroundColor: markFill(entry),
        backgroundImage: TYPE_MARK_HIGHLIGHT,
        color: glyphInk(entry),
        // The light theme's 1 px ring and soft drop shadow.
        boxShadow:
          "inset 0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.06), 0 6px 14px -8px rgba(0, 0, 0, 0.25)",
      }}
    >
      {plainElements(art)}
    </div>
  );
}

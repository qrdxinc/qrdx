// What a frame's or theme's page says about it (a server component, in
// English like the rest of the item page): the sentence under its title
// and its "What's in it" list, from what the design holds, plus the frames
// a theme is shown in under "How it looks".

import { findOfficialFrame, officialFrameValue } from "@/lib/community/catalog";
import {
  type ColorRole,
  type FrameParts,
  frameParts,
  themeColors,
  themeParts,
} from "@/lib/community/design-parts";
import type { CommunityItemCard } from "@/lib/community/types";
import type { ThemeStyles } from "@/types/theme";

/**
 * The official frames a theme's page shows it in (after its own frame, if
 * it has one; three in all): plain call-to-action frames that suit any
 * content.
 */
const THEME_SAMPLE_FRAMES = ["scan-me-tile", "learn-more-card", "scan-me-card"];

/** "a, b and c" */
const listOf = (words: string[]) =>
  words.length < 2
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

/** What can be changed on a frame in the editor, by its parts. */
function frameChanges(parts: FrameParts): string[] {
  return [
    ...(parts.lines.label ? ["label"] : []),
    ...(parts.lines.secondLine ? ["second line"] : []),
    ...(parts.colors.length > 0 ? ["colors"] : []),
    ...(parts.icons > 0 ? [parts.icons === 1 ? "icon" : "icons"] : []),
    ...(parts.textSize ? ["text size"] : []),
  ];
}

function frameSentence(parts: FrameParts | null): string {
  const drawn = listOf([
    "border",
    ...(parts && parts.icons > 0 ? ["icon"] : []),
    ...(parts?.label || parts?.secondLine ? ["label"] : []),
  ]);
  // The main ones; "What's in it" lists every one
  const changes = parts
    ? frameChanges(parts).filter(
        (change) => change !== "second line" && change !== "text size",
      )
    : [];
  return `A frame goes around your QR code: the ${drawn}. Your code goes in the middle and keeps its own look${
    changes.length > 0 ? `, and you can change the ${listOf(changes)}` : ""
  }.`;
}

function themeSentence(style: ThemeStyles): string {
  const base =
    "A theme is the look of the code itself: dot pattern, eye shape and colors. Use it with any content, with or without a frame.";
  return style.frame && style.frame.style !== "none"
    ? `${base} This one comes with a frame, which you can change or take off in the editor.`
    : base;
}

/**
 * One plain sentence under a frame's or theme's title: what the type is and
 * what you get. Null for the other types.
 */
export function designSentence(
  item: Pick<CommunityItemCard, "type" | "preview">,
): string | null {
  if (item.type === "frame") {
    return frameSentence(
      item.preview.frame ? frameParts(item.preview.frame) : null,
    );
  }
  return item.type === "theme" ? themeSentence(item.preview) : null;
}

/** A theme without the frame it may carry (its page shows that above). */
export function withoutFrame(style: ThemeStyles): ThemeStyles {
  const { frame: _frame, ...look } = style;
  return look;
}

/**
 * The frames a theme is shown in: its own (named null), then official ones
 * by name, three in all.
 */
export function sampleFrames(style: ThemeStyles) {
  const own =
    style.frame && style.frame.style !== "none"
      ? [{ name: null, frame: style.frame }]
      : [];
  const official = THEME_SAMPLE_FRAMES.flatMap((id) => {
    const frame = findOfficialFrame(id);
    return frame
      ? [{ name: frame.name, frame: officialFrameValue(frame) }]
      : [];
  });
  return [...own, ...official].slice(0, 3);
}

const ROLE_NAMES: Record<ColorRole, string> = {
  dots: "Dots",
  eyes: "Eyes",
  eyeDots: "Eye dots",
  background: "Background",
};

/** "Dots, eyes" */
const rolesOf = (roles: ColorRole[]) =>
  roles
    .map((role, index) =>
      index === 0 ? ROLE_NAMES[role] : ROLE_NAMES[role].toLowerCase(),
    )
    .join(", ");

/** A pattern's id as words, for one the editor no longer offers. */
const idWords = (id: string) =>
  id.charAt(0).toUpperCase() + id.slice(1).replaceAll("-", " ");

/** A color chip with its hex value and what it's for. */
function ColorRow({ hex, label }: { hex: string; label: string }) {
  return (
    <li className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="ring-foreground/20 size-4 shrink-0 rounded-full ring-1 ring-inset"
        style={{ backgroundColor: hex }}
      />
      <span className="font-mono text-xs tabular-nums">{hex}</span>
      <span className="text-muted-foreground truncate text-xs">{label}</span>
    </li>
  );
}

/** "What's in it": the parts of a theme, in the editor's words. */
export function ThemeContents({ style }: { style: ThemeStyles }) {
  const parts = themeParts(style);
  const frame = style.frame ? frameParts(style.frame) : null;
  const shape = style.silhouette
    ? "Your own shape"
    : style.shape === "circle" || style.shape === "heart"
      ? idWords(style.shape)
      : null;
  return (
    <section aria-labelledby="whats-in-it" className="space-y-3">
      <h2 className="text-sm font-semibold" id="whats-in-it">
        What's in it
      </h2>
      <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Dot pattern</dt>
        <dd>{parts.dots ?? idWords(style.bodyPattern ?? "circle")}</dd>
        <dt className="text-muted-foreground">Eye shape</dt>
        <dd>{parts.eyes ?? idWords(style.cornerEyePattern ?? "gear")}</dd>
        <dt className="text-muted-foreground">Eye dot</dt>
        <dd>
          {parts.eyeDots ?? idWords(style.cornerEyeDotPattern ?? "circle")}
        </dd>
        <dt className="text-muted-foreground">Colors</dt>
        <dd>
          <ul className="space-y-1.5">
            {themeColors(style).map((color) => (
              <ColorRow
                hex={color.hex}
                key={color.hex}
                label={rolesOf(color.roles)}
              />
            ))}
          </ul>
        </dd>
        {shape && (
          <>
            <dt className="text-muted-foreground">Code shape</dt>
            <dd>{shape}</dd>
          </>
        )}
        {style.frame && style.frame.style !== "none" && (
          <>
            <dt className="text-muted-foreground">Frame</dt>
            <dd className="text-pretty">
              {frame?.label
                ? `Included, labelled “${frame.label}”`
                : "Included"}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

/** "What's in it": a frame's labels and colors, and what you can change. */
export function FrameContents({ parts }: { parts: FrameParts }) {
  const changes = frameChanges(parts);
  return (
    <section aria-labelledby="whats-in-it" className="space-y-3">
      <h2 className="text-sm font-semibold" id="whats-in-it">
        What's in it
      </h2>
      <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {parts.label && (
          <>
            <dt className="text-muted-foreground">Label</dt>
            <dd className="text-pretty">“{parts.label}”</dd>
          </>
        )}
        {parts.secondLine && (
          <>
            <dt className="text-muted-foreground">Second line</dt>
            <dd className="text-pretty">“{parts.secondLine}”</dd>
          </>
        )}
        {parts.colors.length > 0 && (
          <>
            <dt className="text-muted-foreground">Colors</dt>
            <dd>
              <ul className="space-y-1.5">
                {parts.colors.map((color) => (
                  <ColorRow
                    hex={color.hex}
                    key={color.name}
                    label={color.name}
                  />
                ))}
              </ul>
            </dd>
          </>
        )}
        {changes.length > 0 && (
          <>
            <dt className="text-muted-foreground">You can change</dt>
            <dd className="text-pretty">
              {listOf(changes).replace(/^./, (first) => first.toUpperCase())}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

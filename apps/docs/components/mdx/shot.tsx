import { cn } from "@repo/design-system/lib/utils";
import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import type { ReactNode } from "react";
import { FrameShell } from "@/components/mdx/frame";
import { ClipPlayer } from "@/components/mdx/shot-clip";
import { Diagram } from "@/components/mdx/shot-diagram";
import { clipSources, getClip, getShot } from "@/lib/shots";

// Pictures and clips of the real app in the docs (lib/shots-manifest.json,
// captured by scripts/shots), in the same frame as every other picture
// (components/mdx/frame.tsx). Both themes are rendered and the stylesheet
// picks one, so the page never flashes the wrong theme and never shifts:
// width and height come from the manifest. A browser only fetches the image
// it shows: the other has no layout box, so lazy loading never reaches it.
//
//   <Shot id="codes-list" />
//   <Shot id="codes-list" alt="…" caption="…" />
//   <Clip id="first-code" />
//
// An id nobody captured throws, which fails the build with the fix in the
// message. The pictures carry their own backdrop and shadow (style.ts), so
// the frame adds no inner padding or border around them.

export function Shot({
  id,
  alt,
  caption,
  className,
}: {
  id: string;
  /** Overrides the manifest's alt text. */
  alt?: string;
  caption?: ReactNode;
  className?: string;
}) {
  const shot = getShot(id);
  const text = alt ?? shot.alt;
  const image = (theme: "light" | "dark") => (
    <ImageZoom
      alt={text}
      caption={typeof caption === "string" ? caption : undefined}
      src={theme === "light" ? shot.light : shot.dark}
    >
      <img
        alt={text}
        className={cn(
          "block h-auto w-full",
          theme === "light" ? "dark:hidden" : "hidden dark:block",
        )}
        decoding="async"
        height={shot.height}
        loading="lazy"
        src={theme === "light" ? shot.light : shot.dark}
        width={shot.width}
      />
    </ImageZoom>
  );
  return (
    <FrameShell caption={caption} className={className} data-shot={id}>
      <div style={{ aspectRatio: `${shot.width} / ${shot.height}` }}>
        {image("light")}
        {image("dark")}
      </div>
    </FrameShell>
  );
}

export function Clip({
  id,
  alt,
  caption,
  className,
}: {
  id: string;
  alt?: string;
  caption?: ReactNode;
  className?: string;
}) {
  const clip = getClip(id);
  return (
    <FrameShell caption={caption} className={className} data-clip={id}>
      <div style={{ aspectRatio: `${clip.width} / ${clip.height}` }}>
        <ClipPlayer
          alt={alt ?? clip.alt}
          dark={clipSources(clip, "dark")}
          height={clip.height}
          light={clipSources(clip, "light")}
          poster={clip.poster}
          seconds={clip.seconds}
          width={clip.width}
        />
      </div>
    </FrameShell>
  );
}

/** What mdx-components.tsx registers (one spread). */
export const shotComponents = { Shot, Clip, Diagram };

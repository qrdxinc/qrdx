import { cn } from "@repo/design-system/lib/utils";
import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import type { ReactNode } from "react";
import { ClipPlayer } from "@/components/mdx/shot-clip";
import { Diagram } from "@/components/mdx/shot-diagram";
import { clipSources, getClip, getShot } from "@/lib/shots";

// Pictures and clips of the real app in the docs (lib/shots-manifest.json,
// captured by scripts/shots). Both themes are rendered and the stylesheet
// picks one, so the page never flashes the wrong theme and never shifts:
// width and height come from the manifest. A browser only fetches the image
// it shows: the other has no layout box, so lazy loading never reaches it.
//
//   <Shot id="codes-list" />
//   <Shot id="codes-list" alt="…" caption="…" />   (translated pages)
//   <Clip id="first-code" />
//
// An id nobody captured throws, which fails the build with the fix in the
// message. The frame below is the minimal one; the Shell lane's Frame takes
// over the look in a later pass.

const FRAME = "overflow-hidden rounded-xl border border-fd-border bg-fd-card";

function Caption({ children }: { children: ReactNode }) {
  return (
    <figcaption className="mt-2 text-center text-fd-muted-foreground text-sm">
      {children}
    </figcaption>
  );
}

export function Shot({
  id,
  alt,
  caption,
  className,
}: {
  id: string;
  /** Overrides the manifest's English alt text (translated pages). */
  alt?: string;
  caption?: ReactNode;
  className?: string;
}) {
  const shot = getShot(id);
  const text = alt ?? shot.alt;
  const image = (theme: "light" | "dark") => (
    <ImageZoom
      alt={text}
      className={cn(
        "block h-auto w-full",
        theme === "light" ? "dark:hidden" : "hidden dark:block",
      )}
      height={shot.height}
      loading="lazy"
      src={theme === "light" ? shot.light : shot.dark}
      width={shot.width}
    />
  );
  return (
    <figure className={cn("not-prose my-6", className)} data-shot={id}>
      <div
        className={FRAME}
        style={{ aspectRatio: `${shot.width} / ${shot.height}` }}
      >
        {image("light")}
        {image("dark")}
      </div>
      {caption && <Caption>{caption}</Caption>}
    </figure>
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
    <figure className={cn("not-prose my-6", className)} data-clip={id}>
      <div
        className={FRAME}
        style={{ aspectRatio: `${clip.width} / ${clip.height}` }}
      >
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
      {caption && <Caption>{caption}</Caption>}
    </figure>
  );
}

/** What mdx-components.tsx registers (one spread). */
export const shotComponents = { Shot, Clip, Diagram };

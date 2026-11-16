import { cn } from "@repo/design-system/lib/utils";
import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import { PictureFrame } from "iconsax-reactjs";
import type { ComponentProps, ReactNode } from "react";

/**
 * The chrome every picture and clip in the docs sits in: a hairline border,
 * a soft neutral backdrop, rounded corners and an optional caption. Shared
 * by <Frame /> and <Video />; the Shots lane's <Shot /> builds on <Frame />.
 */
export function FrameShell({
  caption,
  className,
  children,
  ...props
}: ComponentProps<"figure"> & { caption?: ReactNode }) {
  return (
    <figure
      data-docs-frame
      {...props}
      className={cn(
        "not-prose my-6 overflow-hidden rounded-xl border bg-fd-muted/50 dark:bg-fd-muted/30",
        className,
      )}
    >
      {children}
      {caption ? (
        <figcaption className="border-t bg-fd-background/60 px-4 py-2.5 text-center text-sm text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export interface FrameProps extends Omit<ComponentProps<"figure">, "title"> {
  /** The image; without it the frame wraps whatever it is given. */
  src?: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  caption?: ReactNode;
  /** Keep the backdrop out (a screenshot that already has its own). */
  plain?: boolean;
}

/**
 * A framed image, zoomable on click (and with Enter or Space when
 * focused: fumadocs' image viewer, with the caption and arrow keys between
 * the page's images). With children instead of `src`, a framed anything.
 *
 * `Frame` was also an icon name in content (`<Card icon={<Frame />} />`);
 * used empty, it still draws that icon.
 */
export function Frame({
  src,
  alt = "",
  width,
  height,
  caption,
  plain = false,
  className,
  children,
  ...props
}: FrameProps) {
  if (!src && children == null) {
    return <PictureFrame aria-hidden className={className} />;
  }
  return (
    <FrameShell caption={caption} className={className} {...props}>
      <div
        className={cn(
          "flex items-center justify-center",
          !plain && "p-2 sm:p-3",
        )}
      >
        {src ? (
          <ImageZoom
            alt={alt}
            caption={typeof caption === "string" ? caption : undefined}
            src={src}
          >
            {/* A plain <img>: docs images are files as they are (next.config: images.unoptimized). */}
            <img
              alt={alt}
              className={cn(
                "block h-auto max-w-full",
                !plain && "rounded-lg border bg-fd-background",
              )}
              decoding="async"
              height={height}
              loading="lazy"
              src={src}
              width={width}
            />
          </ImageZoom>
        ) : (
          children
        )}
      </div>
    </FrameShell>
  );
}

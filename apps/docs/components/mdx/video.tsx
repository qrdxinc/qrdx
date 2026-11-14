"use client";

import { cn } from "@repo/design-system/lib/utils";
import { Pause, Play } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { FrameShell } from "@/components/mdx/frame";

/**
 * A short looping clip in a frame: muted, inline, playing while it is on
 * screen, paused with a click or the button. When the system asks for
 * reduced motion it waits on its poster until the reader presses play.
 */
export function Video({
  src,
  poster,
  title,
  caption,
  width,
  height,
  className,
}: {
  src: string;
  /** The first frame, shown until the clip plays. */
  poster?: string;
  /** What the clip shows, for screen readers and the play button. */
  title: string;
  caption?: ReactNode;
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  const t = useTranslations("docs.shell.video");
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Plays while in view, unless motion should be reduced.
  useEffect(() => {
    const video = ref.current;
    if (!video || reduced) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) video.play().catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduced]);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  };

  return (
    <FrameShell
      caption={
        caption || reduced ? (
          <>
            {caption}
            {reduced ? (
              <span className="block text-xs">{t("reducedMotion")}</span>
            ) : null}
          </>
        ) : undefined
      }
      className={className}
    >
      <div className="relative">
        {/* Silent clips of the interface: `title` describes them, so no caption track. */}
        <video
          aria-label={title}
          className="block w-full cursor-pointer"
          height={height}
          loop
          muted
          onClick={toggle}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          playsInline
          poster={poster}
          preload={reduced ? "none" : "metadata"}
          ref={ref}
          src={src}
          width={width}
        />
        <button
          aria-label={playing ? t("pause", { title }) : t("play", { title })}
          aria-pressed={playing}
          className={cn(
            "absolute end-3 bottom-3 grid size-8 place-items-center rounded-full border bg-fd-background/90 text-fd-foreground shadow-xs backdrop-blur-sm transition-colors hover:bg-fd-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring [&_svg]:size-4",
          )}
          onClick={toggle}
          type="button"
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </button>
      </div>
    </FrameShell>
  );
}

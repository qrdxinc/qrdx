"use client";

import { useTheme } from "next-themes";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

// The player behind <Clip>: a short, silent, looping recording of the app.
// Until it hydrates it shows the poster of the current theme (CSS-switched,
// so no flash); then the video of that theme, loading only once it is near
// the viewport and playing only while it is on screen. With reduced motion
// nothing autoplays: the controls are there for whoever wants to press play.

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => true,
  );
}

export interface ClipPlayerProps {
  alt: string;
  width: number;
  height: number;
  seconds: number;
  poster: { light: string; dark: string };
  light: { webm: string; mp4: string };
  dark: { webm: string; mp4: string };
}

export function ClipPlayer({
  alt,
  width,
  height,
  seconds,
  poster,
  light,
  dark,
}: ClipPlayerProps) {
  const { resolvedTheme } = useTheme();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const theme = mounted && resolvedTheme === "dark" ? "dark" : "light";
  const sources = theme === "dark" ? dark : light;

  // Play while on screen, pause when scrolled away; load nothing before. A
  // callback ref, because the element remounts when the theme changes.
  const watch = useCallback(
    (video: HTMLVideoElement | null) => {
      if (!video || reduced) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          if (entry.isIntersecting) {
            if (video.preload === "none") video.preload = "auto";
            video.play().catch(() => undefined);
          } else {
            video.pause();
          }
        },
        { rootMargin: "200px 0px" },
      );
      observer.observe(video);
      return () => observer.disconnect();
    },
    [reduced],
  );

  if (!mounted) {
    return (
      <>
        <img
          alt={alt}
          className="block h-auto w-full dark:hidden"
          decoding="async"
          height={height}
          loading="lazy"
          src={poster.light}
          width={width}
        />
        <img
          alt={alt}
          className="hidden h-auto w-full dark:block"
          decoding="async"
          height={height}
          loading="lazy"
          src={poster.dark}
          width={width}
        />
      </>
    );
  }

  return (
    <video
      aria-label={`${alt} (${seconds} second clip, no sound)`}
      className="block h-auto w-full"
      controls={reduced}
      height={height}
      key={theme}
      loop
      muted
      playsInline
      poster={theme === "dark" ? poster.dark : poster.light}
      preload={reduced ? "metadata" : "none"}
      ref={watch}
      width={width}
    >
      <source src={sources.webm} type="video/webm" />
      <source src={sources.mp4} type="video/mp4" />
    </video>
  );
}

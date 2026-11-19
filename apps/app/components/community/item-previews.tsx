"use client";

// "How it looks" on a frame's or theme's page: the design in use, drawn in
// code on calm, neutral surfaces. Every design draws in the browser as it
// nears the screen (LazyDesignQr), so the page's HTML carries none of them.

import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import type { AnyQRFrame } from "qrdx/types";
import type { ReactNode } from "react";
import type { ThemeStyles } from "@/types/theme";
import { LazyDesignQr } from "./design-qr";

/** A preview with its caption. */
function Scene({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className="min-w-0 space-y-2">
      <div
        aria-hidden
        className={cn(
          "bg-muted relative aspect-[4/3] overflow-hidden rounded-xl border",
          className,
        )}
      >
        {children}
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {caption}
      </figcaption>
    </figure>
  );
}

/** Light grey bars that stand for text on paper. */
function TextBar({ className }: { className: string }) {
  return <span className={cn("block rounded-full bg-black/10", className)} />;
}

/** White paper: the surface every printed preview sits on. */
const PAPER = "overflow-hidden bg-white shadow-sm ring-1 ring-black/5";

/**
 * A frame in use: on a table tent, a poster and a sticker, each drawn with
 * the frame around a sample code. Sizes inside a surface are shares of the
 * surface (absolute insets), not of the scene.
 */
export function FrameInUse({ style }: { style: ThemeStyles }) {
  const t = useTranslations("community.itemPreviews");
  return (
    <div className="grid gap-x-4 gap-y-6 sm:grid-cols-3">
      <Scene caption={t("onATableTent")}>
        {/* The table, and the tent card standing on it, leaning back */}
        <span className="absolute inset-x-0 bottom-0 h-[18%] border-t bg-black/[0.03] dark:bg-white/[0.04]" />
        <div
          className={cn(
            PAPER,
            "absolute bottom-[18%] left-1/2 aspect-[5/6] h-[74%] -translate-x-1/2 origin-bottom rounded-t-sm [transform:perspective(600px)_rotateX(8deg)]",
          )}
        >
          <LazyDesignQr className="absolute inset-[7%]" style={style} />
        </div>
      </Scene>
      <Scene caption={t("onAPoster")}>
        {/* A sheet on the wall: a heading, a line of text, the code */}
        <div
          className={cn(
            PAPER,
            "absolute top-1/2 left-1/2 aspect-[1/1.414] h-[88%] -translate-x-1/2 -translate-y-1/2 rounded-[2px]",
          )}
        >
          <TextBar className="absolute top-[8%] left-[14%] h-[4%] w-[72%] bg-black/70" />
          <TextBar className="absolute top-[16%] left-[22%] h-[2.2%] w-[56%]" />
          <LazyDesignQr
            className="absolute inset-x-[10%] top-[25%] bottom-[6%]"
            style={style}
          />
        </div>
      </Scene>
      <Scene caption={t("asASticker")}>
        {/* A sticker on the side of a box */}
        <span className="absolute inset-[8%] rounded-lg bg-black/[0.05] dark:bg-white/[0.06]" />
        <div
          className={cn(
            PAPER,
            "absolute top-1/2 left-1/2 aspect-square h-[70%] -translate-x-1/2 -translate-y-1/2 -rotate-3 rounded-2xl",
          )}
        >
          <LazyDesignQr className="absolute inset-[7%]" style={style} />
        </div>
      </Scene>
    </div>
  );
}

/** A code on white paper, centred in a scene. */
function CodeOnPaper({ style }: { style: ThemeStyles }) {
  return (
    <div
      className={cn(
        PAPER,
        "absolute top-1/2 left-1/2 aspect-square h-[76%] -translate-x-1/2 -translate-y-1/2 rounded-lg",
      )}
    >
      <LazyDesignQr className="absolute inset-[8%]" style={style} />
    </div>
  );
}

/**
 * A theme in use: a plain code beside the same code in the theme, on a
 * business card, and in frames (its own first, if it has one).
 */
export function ThemeInUse({
  plain,
  look,
  frames,
}: {
  /** The plain black-and-white code it's compared with */
  plain: ThemeStyles;
  /** The theme without a frame */
  look: ThemeStyles;
  /** Frames to show it in: `name` null for the theme's own frame */
  frames: { name: string | null; frame: AnyQRFrame }[];
}) {
  const t = useTranslations("community.itemPreviews");
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
      <Scene caption={t("plainCode")}>
        <CodeOnPaper style={plain} />
      </Scene>
      <Scene caption={t("withThisTheme")}>
        <CodeOnPaper style={look} />
      </Scene>
      <Scene caption={t("onABusinessCard")}>
        {/* A card: a name and details on the left, the code on the right */}
        <div
          className={cn(
            PAPER,
            "absolute top-1/2 left-1/2 aspect-[1.75] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-md",
          )}
        >
          <TextBar className="absolute top-[22%] left-[8%] h-[7%] w-[34%] bg-black/70" />
          <TextBar className="absolute top-[36%] left-[8%] h-[5%] w-[24%]" />
          <TextBar className="absolute top-[62%] left-[8%] h-[5%] w-[30%]" />
          <TextBar className="absolute top-[72%] left-[8%] h-[5%] w-[26%]" />
          <LazyDesignQr
            className="absolute top-[14%] right-[6%] aspect-square h-[72%]"
            style={look}
          />
        </div>
      </Scene>
      {frames.map(({ name, frame }) => (
        <Scene
          caption={name ? t("inTheFrame", { name }) : t("withItsOwnFrame")}
          key={name ?? "own"}
        >
          <LazyDesignQr
            className="absolute inset-y-[9%] inset-x-0 drop-shadow-sm"
            style={{ ...look, frame }}
          />
        </Scene>
      ))}
    </div>
  );
}

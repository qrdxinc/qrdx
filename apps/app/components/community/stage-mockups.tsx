// A page on a light phone, standing on the community's stage (no "use
// client": the page renders on the server and never goes to the browser).
// A thin white bezel, a hairline edge and a small island, so the page is
// what you see. The /templates gallery and landing pages keep their own
// phone (components/landing/template-preview.tsx).

import { cn } from "@repo/design-system/lib/utils";
import { TemplatePreview } from "@/components/landing/template-preview";
import type { LandingPageContent } from "@/types/landing";
import stage from "./stage.module.css";

/**
 * `content` on a light phone. Size and place it with `className` (a width,
 * or a height: it keeps a phone's shape); its bezel, corners and island
 * scale with it (container units of its own width). On a card its page
 * scrolls a little when the card is hovered (./stage.module.css); `still`
 * keeps it put.
 */
export function LightPhone({
  content,
  className,
  still = false,
}: {
  content: LandingPageContent;
  className?: string;
  still?: boolean;
}) {
  const background = content.theme.colors.background;
  return (
    <div
      className={cn(
        "aspect-[9/19.5] [container-type:inline-size]",
        stage.phone,
        className,
      )}
      data-light-phone=""
    >
      <div className="size-full rounded-[15cqw] bg-white p-[4cqw] ring-1 ring-black/[0.07]">
        <div
          className="relative size-full overflow-hidden rounded-[11cqw] ring-1 ring-black/[0.06]"
          style={{ backgroundColor: background }}
        >
          <div
            className={cn(
              "absolute inset-x-0 top-[12cqw] bottom-0",
              !still && stage.pageScroll,
            )}
            data-page-scroll=""
          >
            <TemplatePreview className="size-full" content={content} />
          </div>
          {/* The status bar stays put as the page scrolls under it */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 z-[1] h-[12cqw]"
            style={{ backgroundColor: background }}
          >
            <span className="absolute top-[3.5cqw] left-1/2 h-[6cqw] w-[28%] -translate-x-1/2 rounded-full bg-zinc-900" />
          </div>
        </div>
      </div>
    </div>
  );
}

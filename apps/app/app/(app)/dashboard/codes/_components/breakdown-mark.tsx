import "server-only";

import { QrdxLogo } from "@repo/design-system/components/brand/qrdx-logo";
import { LinkedinLogo } from "@repo/design-system/components/icons";
// Every country's square flag (~1 MB of SVG): server-only, so pages only
// ship the few flags they draw.
import * as FLAGS from "country-flag-icons/string/1x1";
import {
  Call,
  Devices,
  Global,
  type Icon,
  Message,
  Mobile,
  Monitor,
  Scan,
  Sms,
} from "iconsax-reactjs";
import type {
  BreakdownIcon,
  BreakdownMark as Mark,
} from "@/app/(app)/dashboard/codes/_lib/breakdown-marks";
import { BrandLogo } from "@/lib/brand-logos/brand-logo";

const ICONS: Record<BreakdownIcon, Icon> = {
  mobile: Mobile,
  // iconsax has no tablet: a phone on its side.
  tablet: Mobile,
  desktop: Monitor,
  devices: Devices,
  globe: Global,
  scan: Scan,
  call: Call,
  mail: Sms,
  message: Message,
};

const flagSvg = (country: string): string | undefined =>
  (FLAGS as Record<string, string | undefined>)[country];

function Letter({ letter }: { letter: string }) {
  return (
    <span className="bg-foreground/10 text-foreground/70 flex size-4 items-center justify-center rounded-full text-[9px] leading-none font-semibold">
      {letter}
    </span>
  );
}

/**
 * The 16 px mark before a breakdown row's label: a round flag, a brand's
 * mark in the text colour, an iconsax icon or a letter. Decorative: the
 * label names the row.
 */
export function BreakdownMark({ mark }: { mark: Mark }) {
  switch (mark.kind) {
    case "flag": {
      const svg = flagSvg(mark.country);
      if (!svg) return <Global aria-hidden className="size-4" />;
      // An <img>, so flags that share ids inside their SVG can't clash.
      return (
        <img
          alt=""
          className="size-4 rounded-full object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.08)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.14)]"
          height={16}
          src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
          width={16}
        />
      );
    }
    case "brand":
      return (
        <BrandLogo
          className="size-4"
          color="currentColor"
          inset={1}
          slug={mark.slug}
        />
      );
    case "linkedin":
      // Same air as the Simple Icons marks (inset 1).
      return <LinkedinLogo className="size-4" viewBox="-1 -1 26 26" />;
    case "qrdx":
      return <QrdxLogo className="size-4" />;
    case "icon": {
      const IconComponent = ICONS[mark.icon];
      return (
        <IconComponent
          aria-hidden
          className={mark.icon === "tablet" ? "size-4 -rotate-90" : "size-4"}
        />
      );
    }
    default:
      return <Letter letter={mark.letter} />;
  }
}

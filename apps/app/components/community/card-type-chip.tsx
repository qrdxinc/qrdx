"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { cn } from "@repo/design-system/lib/utils";
import { Box, Brush2, Folder2, Mobile, Scan } from "iconsax-reactjs";
import Link from "next/link";
import type { CommunityItemType } from "@/lib/community/types";
import { TYPE_CHIP } from "./card-layout";

/** Each type's mark on a card's stage. */
const TYPE_ICONS = {
  frame: Scan,
  theme: Brush2,
  "page-template": Mobile,
  kit: Box,
  collection: Folder2,
} as const satisfies Record<CommunityItemType, unknown>;

/**
 * A card's type as a mark on its stage, with its name in a tooltip ("Frame",
 * "Collection · 5"). It sits above the card's link so it can be hovered, and
 * goes where the card goes when clicked. Screen readers hear the type in the
 * card's own link, so the mark is hidden from them and from the tab order.
 */
export function CardTypeChip({
  type,
  label,
  href,
  className,
}: {
  type: CommunityItemType;
  label: string;
  href: string;
  className?: string;
}) {
  const Icon = TYPE_ICONS[type];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          aria-hidden
          className={cn(TYPE_CHIP, className)}
          data-type-label={label}
          href={href}
          tabIndex={-1}
        >
          <Icon aria-hidden className="size-3.5" variant="Linear" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

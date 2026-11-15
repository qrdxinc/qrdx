// A member in the overview's "Top makers" row: their avatar, name, handle,
// and how many items they published and how often those were saved. The
// whole card links to their profile. A server component.

import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { profilePath } from "@/lib/community/handles";
import type { CommunityMaker } from "@/lib/community/types";
import { MAKER_CARD, RAIL_MAKER } from "./card-layout";
import { CardRail } from "./card-rail";
import { CreatorAvatar } from "./creator-line";

export function MakerCard({ maker }: { maker: CommunityMaker }) {
  const t = useTranslations("community.makerCard");
  const { creator } = maker;
  if (!creator.handle) return null;
  return (
    <Link
      className={cn(
        MAKER_CARD,
        "hover:border-foreground/20 focus-visible:ring-ring/50 transition-[border-color,box-shadow] outline-none hover:shadow-sm focus-visible:ring-[3px]",
      )}
      href={profilePath(creator.handle)}
    >
      <CreatorAvatar
        className="size-14"
        creator={creator}
        initialsClassName="text-base font-medium"
      />
      <span className="flex w-full min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">
          {creator.displayName}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          @{creator.handle}
        </span>
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {t("itemsAndSaves", {
          items: maker.itemCount,
          saves: maker.saveCount,
        })}
      </span>
    </Link>
  );
}

/** The makers' row. */
export function MakerRowCards({
  makers,
  label,
}: {
  makers: CommunityMaker[];
  label: string;
}) {
  return (
    <CardRail label={label}>
      {makers.map((maker) => (
        <li className={RAIL_MAKER} key={maker.creator.profileId}>
          <MakerCard maker={maker} />
        </li>
      ))}
    </CardRail>
  );
}

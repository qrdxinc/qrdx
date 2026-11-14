"use client";

import { QrdxLogo } from "@repo/design-system/components/brand/qrdx-logo";
import { cn } from "@repo/design-system/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "facehash";
import { Verify } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { profilePath } from "@/lib/community/handles";
import type { CommunityCreator } from "@/lib/community/types";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** A creator's avatar: QRdx's mark, their picture, or their initials. */
export function CreatorAvatar({
  creator,
  className,
  initialsClassName = "text-[9px]",
}: {
  creator: CommunityCreator;
  /** Its size ("size-5") */
  className?: string;
  /** The initials' size, for larger avatars */
  initialsClassName?: string;
}) {
  if (creator.official) {
    return (
      <span
        className={cn(
          "bg-foreground text-background grid shrink-0 place-items-center rounded-full",
          className,
        )}
      >
        <QrdxLogo className="size-[60%]" />
      </span>
    );
  }
  return (
    <Avatar className={cn("shrink-0 overflow-hidden rounded-full", className)}>
      {creator.avatarUrl && (
        <AvatarImage
          alt=""
          referrerPolicy="no-referrer"
          src={creator.avatarUrl}
        />
      )}
      <AvatarFallback
        className={cn(
          "bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full ring-1 ring-black/5 dark:ring-white/10",
          initialsClassName,
        )}
      >
        {initials(creator.displayName)}
      </AvatarFallback>
    </Avatar>
  );
}

/** Avatar, name, @handle and the verified mark of a creator. */
export function CreatorLine({
  creator,
  size = "sm",
  link = true,
  handle: showHandle = true,
  className,
}: {
  creator: CommunityCreator;
  size?: "sm" | "md" | "lg";
  /** Link the handle to the profile (off inside another link) */
  link?: boolean;
  /** Show the @handle after the name (off on cards, where room is short) */
  handle?: boolean;
  className?: string;
}) {
  const t = useTranslations("community.creatorLine");
  const avatar =
    size === "lg" ? "size-12" : size === "md" ? "size-8" : "size-5";
  const handle = showHandle && creator.handle ? `@${creator.handle}` : null;
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2",
        size === "lg"
          ? "gap-3 text-base"
          : size === "md"
            ? "text-sm"
            : "text-xs",
        className,
      )}
    >
      <CreatorAvatar className={avatar} creator={creator} />
      <span
        className={cn(
          "truncate font-medium",
          size === "lg" && "text-2xl font-semibold tracking-tight",
        )}
      >
        {creator.displayName}
      </span>
      {creator.verified && (
        <Verify
          aria-label={t("verified")}
          className="text-foreground size-3.5 shrink-0"
          variant="Bold"
        />
      )}
      {handle &&
        (link && creator.handle ? (
          <Link
            className="text-muted-foreground hover:text-foreground truncate"
            href={profilePath(creator.handle)}
          >
            {handle}
          </Link>
        ) : (
          <span className="text-muted-foreground truncate">{handle}</span>
        ))}
    </span>
  );
}

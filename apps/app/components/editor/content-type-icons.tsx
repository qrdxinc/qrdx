"use client";

import { Star } from "@repo/design-system/components/icons";
import {
  Bag2,
  Bank,
  Call,
  CardSend,
  Coin1,
  Hashtag,
  type Icon,
  Link,
  Link2,
  Location,
  MessageText,
  Mobile,
  MoneySend,
  Personalcard,
  Shop,
  ShoppingCart,
  Sms,
  TaskSquare,
  Text,
  WalletMoney,
  Wifi,
} from "iconsax-reactjs";
import type { ComponentType } from "react";
import { TypeMark } from "@/components/editor/type-mark";
import { LinkedinIcon } from "@/components/landing/social-networks";
import { brandIcon } from "@/lib/brand-logos/brand-logo";
import { CONTENT_TYPE_BRANDS } from "@/lib/brand-logos/content-types";
import type { ContentType } from "@/types/qr-content";

type AnyIcon = Icon | ComponentType<{ className?: string }>;

/**
 * Icon names used by CONTENT_TYPES_METADATA and CONTENT_CATEGORIES: iconsax
 * names, and "brand:<type>" for a type's real brand mark.
 */
const ICONS: Record<string, AnyIcon> = {
  Bag2,
  Bank,
  Call,
  CardSend,
  Coin1,
  Hashtag,
  Link,
  Link2,
  LinkedinLogo: LinkedinIcon,
  Location,
  MessageText,
  Mobile,
  MoneySend,
  Personalcard,
  Shop,
  ShoppingCart,
  Sms,
  Star1: Star,
  TaskSquare,
  Text,
  WalletMoney,
  Wifi,
  ...Object.fromEntries(
    Object.entries(CONTENT_TYPE_BRANDS).map(([type, slug]) => [
      `brand:${type}`,
      brandIcon(slug),
    ]),
  ),
};

export function getTypeIcon(name: string | undefined): AnyIcon {
  return (name && ICONS[name]) || Link;
}

/**
 * A QR type's mark at list size (36 px): its colour and real mark, or the
 * neutral tile with its icon for a type without an entry yet.
 */
export function TypeIconTile({
  type,
  icon,
  className,
}: {
  type?: ContentType;
  icon?: string;
  className?: string;
}) {
  return (
    <TypeMark
      className={className}
      fallbackIcon={getTypeIcon(icon)}
      type={type}
    />
  );
}

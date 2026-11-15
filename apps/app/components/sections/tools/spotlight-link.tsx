"use client";

import type { AuthPromptReason } from "@repo/analytics/auth-prompt";
import type { ComponentProps } from "react";
import { useSignInGate } from "@/components/auth/sign-in-link";
import { SpotlightCard } from "@/components/fx";
import {
  LocaleLink as Link,
  useLocalizeHref,
} from "@/components/i18n/locale-link";

type SpotlightLinkProps = Omit<ComponentProps<typeof Link>, "as"> & {
  /** The target needs an account: signed-out visitors sign in first. */
  requireSignIn?: boolean;
  /** Why it needs one (the dialog's line). */
  signInReason?: AuthPromptReason;
};

/**
 * A next/link card with the FX cursor spotlight. Lives in a client module so
 * server pages can render it (they can't pass `Link` itself as a prop).
 * Keeps the visitor's language (components/i18n/locale-link.tsx).
 */
export function SpotlightLink({
  requireSignIn,
  signInReason = "nav",
  onClick,
  href,
  ...props
}: SpotlightLinkProps) {
  const localize = useLocalizeHref();
  const target = typeof href === "string" ? localize(href) : href;
  const gate = useSignInGate(String(target), onClick, signInReason);
  return (
    <SpotlightCard
      as={Link}
      href={target}
      {...props}
      onClick={requireSignIn ? gate : onClick}
    />
  );
}

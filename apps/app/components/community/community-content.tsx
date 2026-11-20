import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";
import styles from "./community-shell.module.css";

/**
 * A tabbed community view's content, under the shared header
 * (./community-shell.tsx): it fades in when it arrives after a navigation.
 */
export function CommunityContent({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn(styles.content, className)}>{children}</div>;
}

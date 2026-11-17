import { cn } from "@repo/design-system/lib/utils";
import {
  CloseCircle,
  Crown1,
  InfoCircle,
  Lamp,
  TickCircle,
  Warning2,
} from "iconsax-reactjs";
import type { ComponentProps, CSSProperties, ReactNode } from "react";

/**
 * `info` (the accent), `tip` (neutral), `warn`, `error`, `success` and
 * `plan` (a paid plan or a role is needed; see <PlanNote />). `warning`
 * and `idea` are fumadocs' names for `warn` and `tip`.
 */
export type CalloutType =
  | "info"
  | "tip"
  | "idea"
  | "warn"
  | "warning"
  | "error"
  | "success"
  | "plan";

type Variant = "info" | "tip" | "warn" | "error" | "success" | "plan";

const VARIANT: Record<CalloutType, Variant> = {
  info: "info",
  tip: "tip",
  idea: "tip",
  warn: "warn",
  warning: "warn",
  error: "error",
  success: "success",
  plan: "plan",
};

/** The colour token of each variant (styles/styles.css maps them). */
const COLOR: Record<Variant, string> = {
  info: "var(--color-fd-info)",
  tip: "var(--color-fd-idea)",
  warn: "var(--color-fd-warning)",
  error: "var(--color-fd-error)",
  success: "var(--color-fd-success)",
  plan: "var(--color-fd-info)",
};

const ICON: Record<Variant, typeof InfoCircle> = {
  info: InfoCircle,
  tip: Lamp,
  warn: Warning2,
  error: CloseCircle,
  success: TickCircle,
  plan: Crown1,
};

/** A callout whose title starts with "Plan" is a plan requirement. */
function resolveVariant(
  type: CalloutType | undefined,
  title: unknown,
): Variant {
  if (type && type in VARIANT) return VARIANT[type];
  if (typeof title === "string" && /^plans?\b/i.test(title)) return "plan";
  return "info";
}

export interface CalloutProps extends Omit<ComponentProps<"div">, "title"> {
  type?: CalloutType;
  title?: ReactNode;
  /** Replaces the variant's icon. */
  icon?: ReactNode;
}

/**
 * A quiet note in the flow of a page: an icon, a hairline border and a
 * faint tint in the variant's colour, the text in the foreground. Content
 * writes `<Callout type="info" title="...">`; Markdown blockquotes render
 * through it too (app/docs/[[...slug]]/page.tsx).
 */
export function Callout({
  type,
  title,
  icon,
  className,
  style,
  children,
  ...props
}: CalloutProps) {
  const variant = resolveVariant(type, title);
  const Icon = ICON[variant];
  return (
    <div
      data-callout={variant}
      role="note"
      {...props}
      className={cn(
        "my-6 flex gap-3 rounded-xl border border-(--callout-color)/25 bg-(--callout-color)/6 px-4 py-3.5 text-sm leading-relaxed",
        className,
      )}
      style={{ "--callout-color": COLOR[variant], ...style } as CSSProperties}
    >
      <span
        aria-hidden
        className="mt-px shrink-0 text-(--callout-color) [&_svg]:size-4.5"
      >
        {icon ?? <Icon />}
      </span>
      <div className="min-w-0 flex-1 text-fd-foreground/85 prose-no-margin [&_li]:my-0.5 [&_ol]:my-1.5 [&_p]:my-1.5 [&_ul]:my-1.5">
        {title ? (
          <p className="mb-1 font-medium text-fd-foreground">{title}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

import "server-only";

import Link from "fumadocs-core/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Callout } from "@/components/mdx/callout";

type PlanId = "pro" | "business" | "enterprise";
const PLAN_IDS: readonly PlanId[] = ["pro", "business", "enterprise"];

const isPlanId = (value: string): value is PlanId =>
  (PLAN_IDS as readonly string[]).includes(value);

/**
 * "Needs Pro or Business", directly under a page's first paragraph. `plans`
 * lists the plan ids that include the feature ("pro,business"). The note
 * links to the plans page; pass children to say more (which role, which
 * setting) instead of the default sentence.
 */
export async function PlanNote({
  plans,
  children,
}: {
  plans: string;
  children?: ReactNode;
}) {
  const t = await getTranslations("docs.shell.plan");
  const names = plans
    .split(",")
    .map((plan) => plan.trim().toLowerCase())
    .filter(Boolean)
    .map((plan) => (isPlanId(plan) ? t(plan) : plan));
  const list =
    names.length > 1
      ? t("or", { a: names.slice(0, -1).join(", "), b: names.at(-1) ?? "" })
      : (names[0] ?? "");

  return (
    <Callout title={t("title", { plans: list })} type="plan">
      {children ?? (
        <p>
          {t("body")} <Link href="/docs/plans-and-limits">{t("link")}</Link>.
        </p>
      )}
    </Callout>
  );
}

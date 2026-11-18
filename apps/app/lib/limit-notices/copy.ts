// A notice's words in the recipient's language (emails.limitNotice in
// messages/en.json). The reason says, sentence for sentence, what Plan &
// usage says about the limit (app/(app)/settings/usage/_lib/limit-copy.ts,
// English only): tests/lib/limit-notice-copy.test.ts checks that the
// English stays the same. Pure, so it's tested for every plan.

import {
  type CheckoutOpen,
  type MeterCap,
  upgradeTo,
} from "@/app/(app)/settings/usage/_lib/meters";
import { formatBytes } from "@/lib/files/types";
import { type EmailIntl, ENGLISH_EMAIL } from "@/lib/i18n/email";
import type { Plan } from "@/lib/pricing";
import type { NoticeLimitId } from "./levels";

export interface NoticeUsage {
  limitId: NoticeLimitId;
  used: number;
  /** The cap (a notice is only sent under one) */
  limit: number;
  /** When a monthly allowance starts over (ISO string) */
  resetsAt?: string;
  /** The workspace's plan */
  plan: Plan;
  /** The recipients may change the plan (owners; not a per-person allowance) */
  canUpgrade: boolean;
  checkoutOpen: CheckoutOpen;
  /** The cap here and the plan that lifts it (resolveMeterCaps) */
  cap: MeterCap | undefined;
}

export interface NoticeCopy {
  /** "Dynamic QR codes" */
  label: string;
  /** "dynamic QR codes" */
  noun: string;
  /** "9 of 10", "48 MB of 50 MB" */
  value: string;
  /** "Free" */
  planName: string;
  /** "1 active dynamic code left on Free.", or what's included and what to do */
  reason: string;
}

/** Allowances that start over every month. */
const MONTHLY: ReadonlySet<NoticeLimitId> = new Set(["formResponses", "aiArt"]);

/** formatBytes's size, with the number written the locale's way. */
function size(bytes: number, locale: string): string {
  const [number, unit] = formatBytes(bytes).split(" ");
  const formatted = new Intl.NumberFormat(locale, {
    useGrouping: false,
    maximumFractionDigits: 1,
  }).format(Number(number));
  return `${formatted} ${unit}`;
}

/** "Dec 1", the day a monthly allowance starts over; null without one. */
function resetDay(resetsAt: string | undefined, locale: string) {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function noticeCopy(
  usage: NoticeUsage,
  intl: EmailIntl = ENGLISH_EMAIL,
): NoticeCopy {
  const { t, locale } = intl;
  const id = usage.limitId;
  const storage = id === "storage";
  const monthly = MONTHLY.has(id) ? "yes" : "no";
  const planName = (plan: Plan) => t("limitNotice.planName", { plan });
  const plan = planName(usage.plan);
  const amount = (value: number) =>
    storage
      ? t("limitNotice.storageAmount", { size: size(value, locale) })
      : t("limitNotice.amount", { limit: id, count: value });
  const counted = (value: number) =>
    storage ? size(value, locale) : new Intl.NumberFormat(locale).format(value);

  const sentences: string[] = [];
  const reset = resetDay(usage.resetsAt, locale);
  if (usage.used < usage.limit) {
    const remaining = Math.max(0, usage.limit - usage.used);
    const left = storage
      ? t("limitNotice.storageLeft", { size: size(remaining, locale) })
      : t("limitNotice.amountLeft", { limit: id, count: remaining });
    sentences.push(t("limitNotice.left", { monthly, left, plan }));
    if (monthly === "yes" && reset) {
      sentences.push(t("limitNotice.resets", { date: reset }));
    }
  } else {
    sentences.push(
      t("limitNotice.includes", {
        monthly,
        plan,
        amount: amount(usage.limit),
      }),
    );
    const lift = usage.cap?.lift ?? null;
    const upgrade = upgradeTo(
      lift?.plan ?? null,
      usage.canUpgrade,
      usage.checkoutOpen,
    );
    let remedy: string;
    if (lift && upgrade) {
      let liftText: string;
      if (lift.limit === null) {
        liftText = t("limitNotice.liftUnlimited", { limit: id });
      } else if (storage) {
        liftText = size(lift.limit, locale);
      } else {
        liftText = t("limitNotice.liftCount", { limit: id, count: lift.limit });
      }
      if (lift.shared && !storage) {
        liftText = t("limitNotice.liftShared", { lift: liftText });
      }
      remedy = t("limitNotice.upgrade", {
        limit: id,
        plan: planName(lift.plan),
        lift: liftText,
      });
    } else if (lift && !usage.canUpgrade) {
      remedy = t("limitNotice.askOwner", {
        limit: id,
        plan: planName(lift.plan),
      });
    } else {
      remedy = t("limitNotice.makeRoom", { limit: id });
    }
    if (remedy) sentences.push(remedy);
    if (monthly === "yes" && reset) {
      sentences.push(t("limitNotice.resets", { date: reset }));
    }
    const keeps = t("limitNotice.keeps", { limit: id });
    if (keeps) sentences.push(keeps);
  }

  return {
    label: t("limitNotice.label", { limit: id }),
    noun: t("limitNotice.noun", { limit: id }),
    value: t("limitNotice.value", {
      used: counted(usage.used),
      cap: counted(usage.limit),
    }),
    planName: plan,
    reason: sentences.join(" "),
  };
}

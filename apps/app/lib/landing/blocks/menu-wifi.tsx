import { cn } from "@repo/design-system/lib/utils";
import { Wifi } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { z } from "zod";
import {
  lineText,
  mutedTextClass,
  surfaceClass,
} from "@/components/landing/block-kit";
import { LpHeading } from "@/components/landing/heading";
import type { Translator } from "@/lib/i18n/translator";
import { type BlockRenderProps, registerBlock } from "../registry";
import { CopyButton } from "./coupon-copy";
import { WifiEditor } from "./menu-wifi-editor";

export const wifiSchema = z
  .object({
    title: lineText(60).default("Wi-Fi"),
    ssid: lineText(32).min(1, "Enter the network name"),
    // Not trimmed: spaces can be part of a password.
    password: z.string().max(63).default(""),
    security: z.enum(["WPA", "WEP", "nopass"]).default("WPA"),
    hidden: z.boolean().default(false),
    note: lineText(160).default(""),
    /** A row naming the security type (for networks people add by hand) */
    showSecurity: z.boolean().default(false),
    /** Steps to join on iPhone and Android, in the visitor's language */
    showSteps: z.boolean().default(false),
  })
  .refine((wifi) => wifi.security === "nopass" || wifi.password.length > 0, {
    message: "Enter the Wi-Fi password",
    path: ["password"],
  });

export type WifiProps = z.output<typeof wifiSchema>;

function Row({
  label,
  value,
  copyLabel,
  copyText,
  mono,
}: {
  label: string;
  value: string;
  copyLabel: string;
  copyText: { copy: string; copied: string };
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <dt className={cn(mutedTextClass, "text-xs")}>{label}</dt>
        <dd className={cn("font-medium break-all", mono && "font-mono")}>
          {value}
        </dd>
      </div>
      <CopyButton label={copyLabel} text={copyText} value={value} />
    </div>
  );
}

/** How the editor names each security type; technical names stay as they are. */
const SECURITY_NAMES = { WPA: "WPA/WPA2/WPA3", WEP: "WEP" } as const;

/**
 * Joining by hand, in the words of Apple's and Google's own help: Settings →
 * Wi-Fi on iPhone (Other for a hidden network), Settings → Network &
 * internet → Internet on Android (Add network for a hidden one). A web page
 * can't join a network for the visitor.
 */
export function wifiJoinSteps(
  props: Pick<WifiProps, "ssid" | "security" | "hidden">,
  t: Translator<"scanPages.hosted">,
): { iphone: string[]; android: string[] } {
  const ssid = props.ssid;
  const password = props.security !== "nopass";
  const copy = password ? [t("wifi.steps.copy")] : [];
  const iphone = [
    ...copy,
    t("wifi.steps.iphoneOpen"),
    props.hidden
      ? t("wifi.steps.iphoneHidden", { ssid })
      : t("wifi.steps.pick", { ssid }),
  ];
  const android = [
    ...copy,
    t("wifi.steps.androidOpen"),
    props.hidden
      ? t("wifi.steps.androidHidden", { ssid })
      : t("wifi.steps.pick", { ssid }),
  ];
  if (password) {
    iphone.push(t("wifi.steps.iphonePassword"));
    android.push(
      props.hidden
        ? t("wifi.steps.androidPasswordSave")
        : t("wifi.steps.androidPassword"),
    );
  } else if (props.hidden) {
    iphone.push(t("wifi.steps.iphoneJoin"));
    android.push(t("wifi.steps.androidSave"));
  }
  return { iphone, android };
}

function JoinSteps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{title}</p>
      <ol className="list-decimal space-y-1 ps-5 text-sm leading-relaxed marker:text-(--lp-muted-fg)">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

export function WifiBlock({ id, props, context }: BlockRenderProps<WifiProps>) {
  const t = useTranslations("scanPages.hosted");
  const steps = props.showSteps ? wifiJoinSteps(props, t) : null;
  const copyText = { copy: t("coupon.copy"), copied: t("coupon.copied") };
  const titleId = `${id}-title`;
  return (
    <section
      aria-labelledby={titleId}
      className={cn(surfaceClass, "space-y-4 p-5")}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-(--lp-primary) text-(--lp-primary-fg)">
          <Wifi aria-hidden="true" className="size-5" />
        </span>
        <LpHeading
          as="h2"
          preview={context.thumbnail}
          className="text-lg font-semibold"
          id={titleId}
        >
          {props.title || "Wi-Fi"}
        </LpHeading>
      </div>
      <dl className="space-y-3">
        <Row
          copyLabel={t("wifi.copyNetwork")}
          copyText={copyText}
          label={props.hidden ? t("wifi.networkHidden") : t("wifi.network")}
          value={props.ssid}
        />
        {props.security === "nopass" ? (
          <div>
            <dt className={cn(mutedTextClass, "text-xs")}>
              {t("wifi.password")}
            </dt>
            <dd className="font-medium">{t("wifi.noPassword")}</dd>
          </div>
        ) : (
          <Row
            copyLabel={t("wifi.copyPassword")}
            copyText={copyText}
            label={t("wifi.password")}
            mono
            value={props.password}
          />
        )}
        {props.showSecurity && props.security !== "nopass" && (
          <div>
            <dt className={cn(mutedTextClass, "text-xs")}>
              {t("wifi.security")}
            </dt>
            <dd className="font-medium">{SECURITY_NAMES[props.security]}</dd>
          </div>
        )}
      </dl>
      {props.note && (
        <p className={cn(mutedTextClass, "text-sm")}>{props.note}</p>
      )}
      {steps && (
        <div className="space-y-3 border-t border-(--lp-fg)/10 pt-4">
          <p className="font-semibold">{t("wifi.steps.title")}</p>
          <JoinSteps steps={steps.iphone} title={t("wifi.steps.iphone")} />
          <JoinSteps steps={steps.android} title={t("wifi.steps.android")} />
        </div>
      )}
    </section>
  );
}

registerBlock({
  type: "wifi",
  category: "contact",
  label: "Wi-Fi",
  description: "Network name and password with copy buttons",
  icon: Wifi,
  schema: wifiSchema,
  defaults: { ssid: "Guest Wi-Fi", password: "", security: "nopass" },
  Render: WifiBlock,
  Editor: WifiEditor,
});

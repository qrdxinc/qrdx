import { cn } from "@repo/design-system/lib/utils";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { CustomDomain } from "@/components/mdx/shot-diagrams/custom-domain";
import { DynamicRedirect } from "@/components/mdx/shot-diagrams/dynamic-redirect";
import { ImageApi } from "@/components/mdx/shot-diagrams/image-api";
import type { DiagramProps } from "@/components/mdx/shot-diagrams/parts";
import { SmartRouting } from "@/components/mdx/shot-diagrams/smart-routing";
import { StaticVsDynamic } from "@/components/mdx/shot-diagrams/static-vs-dynamic";
import { WebhookDelivery } from "@/components/mdx/shot-diagrams/webhook-delivery";

// Concept drawings for the docs: hand-written SVG (components/mdx/
// shot-diagrams), monochrome with the one accent, theme-aware through CSS
// variables. Every word in them comes from the messages file
// (docs.shots.diagrams.<id>.* in apps/app/messages/en.json), so translated
// pages get translated drawings.
//
//   <Diagram id="dynamic-redirect" />
//   <Diagram id="webhook-delivery" caption="…" />
//
// Each diagram lists the label keys it reads; a key the catalog lacks shows
// as the key, which the docs' placeholder test catches.

export const DIAGRAMS = {
  "dynamic-redirect": {
    component: DynamicRedirect,
    keys: [
      "scan",
      "scanNote",
      "shortLink",
      "shortLinkNote",
      "rules",
      "rulesNote",
      "destination",
      "destinationNote",
      "recorded",
      "recordedNote",
    ],
  },
  "static-vs-dynamic": {
    component: StaticVsDynamic,
    keys: [
      "static",
      "dynamic",
      "printed",
      "printedNote",
      "content",
      "contentNote",
      "staticEnd",
      "shortLink",
      "shortLinkNote",
      "destination",
      "destinationNote",
    ],
  },
  "smart-routing": {
    component: SmartRouting,
    keys: [
      "scan",
      "scanNote",
      "rule1",
      "rule2",
      "rule3",
      "firstMatch",
      "firstMatchNote",
      "noMatch",
      "noMatchNote",
      "footnote",
    ],
  },
  "custom-domain": {
    component: CustomDomain,
    keys: [
      "scan",
      "scanNote",
      "dns",
      "dnsNote",
      "record",
      "qrdx",
      "qrdxNote",
      "destination",
      "destinationNote",
      "footnote",
    ],
  },
  "webhook-delivery": {
    component: WebhookDelivery,
    keys: [
      "event",
      "eventNote",
      "post",
      "postNote",
      "delivered",
      "deliveredNote",
      "retry",
      "retryNote",
      "schedule",
      "failed",
      "failedNote",
      "footnote",
    ],
  },
  "image-api": {
    component: ImageApi,
    keys: [
      "request",
      "requestNote",
      "encode",
      "encodeNote",
      "render",
      "renderNote",
      "response",
      "responseNote",
      "example",
      "noKey",
      "footnote",
    ],
  },
} satisfies Record<
  string,
  { component: (props: DiagramProps) => ReactNode; keys: readonly string[] }
>;

export type DiagramId = keyof typeof DIAGRAMS;

export async function Diagram({
  id,
  caption,
  className,
}: {
  id: string;
  caption?: ReactNode;
  className?: string;
}) {
  const spec = DIAGRAMS[id as DiagramId];
  if (!spec) {
    throw new Error(
      `<Diagram id="${id}" />: no diagram with this id. The ids are ${Object.keys(DIAGRAMS).join(", ")} (components/mdx/shot-diagram.tsx).`,
    );
  }
  // The docs' catalogs fall back to English for missing keys (lib/i18n/messages.ts).
  const messages = (await getMessages()) as {
    docs?: { shots?: { diagrams?: Record<string, Record<string, string>> } };
  };
  const catalog = messages.docs?.shots?.diagrams?.[id] ?? {};
  const labels = Object.fromEntries(
    [...spec.keys, "title"].map((key) => [
      key,
      catalog[key] ?? `docs.shots.diagrams.${id}.${key}`,
    ]),
  );
  const Drawing = spec.component;
  return (
    <figure className={cn("not-prose my-6", className)} data-diagram={id}>
      <div className="rounded-xl border border-fd-border bg-fd-card px-4 py-5 sm:px-6">
        <Drawing labels={labels} />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-fd-muted-foreground text-sm">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

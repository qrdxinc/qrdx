import { cn } from "@repo/design-system/lib/utils";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { ClientPortalAccess } from "@/components/mdx/shot-diagrams/client-portal-access";
import { CustomDomain } from "@/components/mdx/shot-diagrams/custom-domain";
import { DynamicRedirect } from "@/components/mdx/shot-diagrams/dynamic-redirect";
import { FileDelivery } from "@/components/mdx/shot-diagrams/file-delivery";
import { HostedPageAnatomy } from "@/components/mdx/shot-diagrams/hosted-page-anatomy";
import { ImageApi } from "@/components/mdx/shot-diagrams/image-api";
import { ImportFlow } from "@/components/mdx/shot-diagrams/import-flow";
import { NfcLink } from "@/components/mdx/shot-diagrams/nfc-link";
import type { DiagramProps } from "@/components/mdx/shot-diagrams/parts";
import { PreciseLocationFlow } from "@/components/mdx/shot-diagrams/precise-location-flow";
import { SelfHostingStack } from "@/components/mdx/shot-diagrams/self-hosting-stack";
import { SmartRouting } from "@/components/mdx/shot-diagrams/smart-routing";
import { StaticVsDynamic } from "@/components/mdx/shot-diagrams/static-vs-dynamic";
import { TrackingPaths } from "@/components/mdx/shot-diagrams/tracking-paths";
import { WebhookDelivery } from "@/components/mdx/shot-diagrams/webhook-delivery";
import {
  WontScanContrast,
  WontScanEyes,
  WontScanPrintSize,
  WontScanQuietZone,
} from "@/components/mdx/shot-diagrams/wont-scan";

// Concept drawings for the docs: hand-written SVG (components/mdx/
// shot-diagrams), monochrome with the one accent, theme-aware through CSS
// variables. Every word in them comes from the messages file
// (docs.shots.diagrams.<id>.* in apps/app/messages/en.json).
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
  "hosted-page-anatomy": {
    component: HostedPageAnatomy,
    keys: [
      "editor",
      "editorNote",
      "publish",
      "page",
      "pageNote",
      "code",
      "codeNote",
      "scan",
      "block1",
      "block2",
      "block3",
      "block4",
      "footnote",
    ],
  },
  "import-flow": {
    component: ImportFlow,
    keys: [
      "importing",
      "source",
      "sourceNote",
      "import",
      "importNote",
      "codes",
      "codesNote",
      "keeping",
      "printed",
      "printedNote",
      "newLink",
      "newLinkNote",
      "destination",
      "destinationNote",
      "footnote",
    ],
  },
  "precise-location-flow": {
    component: PreciseLocationFlow,
    keys: [
      "scan",
      "scanNote",
      "ask",
      "askNote",
      "skip",
      "allow",
      "destination",
      "destinationNote",
      "stored",
      "storedNote",
      "rule",
      "ruleNote",
      "footnote",
    ],
  },
  "nfc-link": {
    component: NfcLink,
    keys: [
      "tap",
      "tapNote",
      "tag",
      "tagNote",
      "link",
      "linkNote",
      "example",
      "counted",
      "countedNote",
      "destination",
      "destinationNote",
      "footnote",
    ],
  },
  "file-delivery": {
    component: FileDelivery,
    keys: [
      "browser",
      "browserNote",
      "bucket",
      "bucketNote",
      "check",
      "checkNote",
      "link",
      "linkNote",
      "visitor",
      "visitorNote",
      "footnote",
    ],
  },
  "tracking-paths": {
    component: TrackingPaths,
    keys: [
      "scan",
      "scanNote",
      "pagePath",
      "sitePath",
      "page",
      "pageNote",
      "consent",
      "consentNote",
      "pixels",
      "pixelsNote",
      "site",
      "siteNote",
      "convert",
      "convertNote",
      "report",
      "reportNote",
      "footnote",
    ],
  },
  "client-portal-access": {
    component: ClientPortalAccess,
    keys: [
      "workspace",
      "folder1",
      "folder2",
      "folder3",
      "folder4",
      "invite",
      "inviteNote",
      "portal",
      "portalName",
      "readOnly",
      "footnote",
    ],
  },
  "self-hosting-stack": {
    component: SelfHostingStack,
    keys: [
      "browser",
      "browserNote",
      "compose",
      "app",
      "appNote",
      "proxy",
      "proxyNote",
      "db",
      "dbNote",
      "migrate",
      "migrateNote",
      "footnote",
    ],
  },
  "wont-scan-contrast": {
    fits: true,
    component: WontScanContrast,
    keys: ["good", "bad", "ratio"],
  },
  "wont-scan-quiet-zone": {
    fits: true,
    component: WontScanQuietZone,
    keys: ["bad", "badNote", "good", "goodNote"],
  },
  "wont-scan-print-size": {
    fits: true,
    component: WontScanPrintSize,
    keys: [
      "cardWidth",
      "cardDistance",
      "cardNote",
      "posterWidth",
      "posterDistance",
      "posterNote",
      "footnote",
    ],
  },
  "wont-scan-eyes": {
    fits: true,
    component: WontScanEyes,
    keys: ["good", "bad", "square", "rounded", "gear", "circle", "curly"],
  },
} satisfies Record<
  string,
  {
    component: (props: DiagramProps) => ReactNode;
    keys: readonly string[];
    /** A comparison narrow enough to show whole on a phone (no sideways scroll). */
    fits?: boolean;
  }
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
  const spec: (typeof DIAGRAMS)[DiagramId] & { fits?: boolean } =
    DIAGRAMS[id as DiagramId];
  if (!spec) {
    throw new Error(
      `<Diagram id="${id}" />: no diagram with this id. The ids are ${Object.keys(DIAGRAMS).join(", ")} (components/mdx/shot-diagram.tsx).`,
    );
  }
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
      {/* On a phone a flow keeps a readable size and scrolls sideways inside
          its card; a side-by-side comparison (`fits`) is narrow enough to show whole. */}
      <div className="overflow-x-auto rounded-xl border border-fd-border bg-fd-card px-4 py-5 sm:px-6">
        <div className={spec.fits ? undefined : "min-w-[36rem]"}>
          <Drawing labels={labels} />
        </div>
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-fd-muted-foreground text-sm">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

import type { IntegrationDefinition } from "../../registry/types";

/**
 * Segment: a source's write key, no OAuth app. Scans and form responses go
 * out as Track calls through the HTTP Tracking API.
 */
export const segmentIntegration: IntegrationDefinition = {
  slug: "segment",
  name: "Segment",
  description:
    "Send every scan and form response to a Segment source as a Track event",
  // Served from R2 through lib/media-manifest.json, not committed (Twilio's
  // trademark guidelines; apps/app/tests/repo/hosted-logos.test.ts).
  logos: {
    light: "/integrations/segment.svg",
    dark: "/integrations/segment.svg",
  },
  category: ["analytics"],
  type: "api_key",
  apiKey: {
    label: "Write key",
    placeholder: "Paste your source's write key",
    helpUrl: "https://app.segment.com",
    helpText:
      "In Segment, add an HTTP API source, open its Settings → API Keys and copy the write key.",
    check: "format",
  },
  capabilities: [
    {
      kind: "event-sink",
      id: "segment-scans",
      label: "Scans as Track events",
      description:
        "Each scan of the workspace's codes becomes a Track call with the code, country, region, city, device, OS, browser, referrer, language, A/B variant and whether it was a QR scan or an NFC tap.",
      surfaces: ["settings-detail"],
      requiresConnection: true,
      data: ["scans"],
      modes: ["sync"],
    },
    {
      kind: "event-sink",
      id: "segment-responses",
      label: "Form responses as Track events",
      description:
        "Each form response on the workspace's hosted pages becomes a Track call with the page, the form and every answered question.",
      surfaces: ["settings-detail"],
      requiresConnection: true,
      data: ["form-responses"],
      modes: ["sync"],
    },
  ],
  features: [
    "Event names you choose, for scans and for form responses",
    "US or EU workspaces",
    "Batched and retried with backoff, a stable messageId on every event, last sync shown in settings",
  ],
  configurable: true,
  developedBy: "QRdx",
  website: "https://segment.com",
};

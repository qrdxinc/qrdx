// Every hosted page type (landing_page.type), as plain ids: what copy
// counts ({facts.hostedPageTypes}) without loading the template registry,
// which pulls in React components. tests/lib/landing-templates.test.ts
// fails when this list and the registry (lib/landing/templates) disagree.

export const PAGE_TYPE_IDS = [
  "links",
  "social",
  "business",
  "location",
  "vcard",
  "resume",
  "menu",
  "wifi",
  "coupon",
  "event",
  "invitation",
  "apps",
  "feedback",
  "form",
  "product",
  "booking",
  "payment",
  "real-estate",
  "pet",
  "medical",
  "asset-tag",
  "pdf",
  "images",
  "mp3",
  "video",
  "playlist",
  "message",
  "custom",
] as const;

export type PageTypeIdentifier = (typeof PAGE_TYPE_IDS)[number];

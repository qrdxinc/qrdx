// The colours and glyphs of the type marks (components/editor/type-mark.tsx):
// the app-icon tile every QR content type and hosted page type is drawn with
// in the type picker, the editor's type row and the /qr-code-generator hub.
//
// Adding a type: add one entry here, keyed by its id.
// - fill: the tile's colour as #RRGGBB.
// - glyph: "brand:<simple-icons slug>" for a brand's real mark (the slug must
//   be in UI_SLUGS, scripts/brand-logos/generate-marks.mjs), an iconsax icon
//   name the mark knows (TYPE_MARK_GLYPHS in the component), or
//   "integration:<slug>" for an editor integration's own logo.
// - ink (brands only): the glyph's colour, "white" unless the brand's own
//   icon draws a dark mark on that colour ("dark": Snapchat's ghost).
//
// Brands use their official Simple Icons colour (BRAND_MARKS[slug].hex) and
// draw their mark the way the brand does: logos are exempt from contrast
// rules. Every other glyph is white, so a generic fill must be dark enough
// for white to reach 3:1 (WCAG non-text): keep the hue, lower its OKLCH
// lightness until it does. tests/editor/type-marks.test.tsx checks both, and
// that every type has an entry. A type without one draws a neutral slate tile
// with its own icon, so a new type never breaks the UI.
//
// Colour lives only inside the marks (and the soft washes behind big ones);
// everything around them stays monochrome.

import type { PageTypeIdentifier } from "@/lib/landing/page-type-ids";
import type { ContentType } from "@/types/qr-content";

export interface TypeMarkEntry {
  /** Tile colour, #RRGGBB. */
  fill: string;
  /** "brand:<slug>", "integration:<slug>" or an iconsax icon name. */
  glyph: string;
  /** Brands only: the glyph's colour as the brand draws it (white by default). */
  ink?: "white" | "dark";
}

/** The tile of a type with no entry: neutral slate. */
export const FALLBACK_FILL = "#6E6E78";

/** Marks for the QR content types (CONTENT_TYPES_METADATA), by type id. */
export const CONTENT_TYPE_MARKS: Partial<Record<ContentType, TypeMarkEntry>> = {
  // Links & files
  url: { fill: "#5B5BD6", glyph: "Link" },
  text: { fill: "#6E6E78", glyph: "Text" },
  "google-drive": { fill: "#4285F4", glyph: "brand:googledrive" },
  dubsh: { fill: "#000000", glyph: "integration:dub" },

  // Contact & connect
  vcard: { fill: "#14A3B8", glyph: "Personalcard" },
  phone: { fill: "#18AB4D", glyph: "Call" },
  email: { fill: "#D48209", glyph: "Sms" },
  sms: { fill: "#0BA790", glyph: "MessageText1" },
  whatsapp: { fill: "#25D366", glyph: "brand:whatsapp" },
  wifi: { fill: "#0A84FF", glyph: "Wifi" },
  telegram: { fill: "#26A5E4", glyph: "brand:telegram" },
  signal: { fill: "#3B45FD", glyph: "brand:signal" },
  line: { fill: "#00C300", glyph: "brand:line" },

  // Social & media
  instagram: { fill: "#FF0069", glyph: "brand:instagram" },
  facebook: { fill: "#0866FF", glyph: "brand:facebook" },
  twitter: { fill: "#000000", glyph: "brand:x" },
  linkedin: { fill: "#0A66C2", glyph: "LinkedinLogo" },
  tiktok: { fill: "#000000", glyph: "brand:tiktok" },
  youtube: { fill: "#FF0000", glyph: "brand:youtube" },
  threads: { fill: "#000000", glyph: "brand:threads" },
  snapchat: { fill: "#FFFC00", glyph: "brand:snapchat", ink: "dark" },
  pinterest: { fill: "#BD081C", glyph: "brand:pinterest" },
  reddit: { fill: "#FF4500", glyph: "brand:reddit" },
  // Spotify's guidelines: the black logo on light colours like its green.
  spotify: { fill: "#1ED760", glyph: "brand:spotify", ink: "dark" },
  discord: { fill: "#5865F2", glyph: "brand:discord" },
  bluesky: { fill: "#1185FE", glyph: "brand:bluesky" },
  mastodon: { fill: "#6364FF", glyph: "brand:mastodon" },
  twitch: { fill: "#9146FF", glyph: "brand:twitch" },
  soundcloud: { fill: "#FF5500", glyph: "brand:soundcloud" },

  // Business
  "google-review": { fill: "#4285F4", glyph: "brand:google" },
  calcom: { fill: "#292929", glyph: "brand:caldotcom" },
  attendance: { fill: "#8E5CF0", glyph: "TaskSquare" },
  maps: { fill: "#F04438", glyph: "Location" },
  // Waze's own icon draws its character in black lines on this blue.
  waze: { fill: "#33CCFF", glyph: "brand:waze", ink: "dark" },
  zoom: { fill: "#0B5CFF", glyph: "brand:zoom" },
  "google-meet": { fill: "#00897B", glyph: "brand:googlemeet" },

  // Payments (UPI, PayNow, PromptPay and VietQR have no Simple Icons mark)
  upi: { fill: "#F26B21", glyph: "MoneySend" },
  pix: { fill: "#77B6A8", glyph: "brand:pix" },
  sepa: { fill: "#2350A9", glyph: "brand:sepa" },
  paynow: { fill: "#7B3FA0", glyph: "CardSend" },
  // #1B4F9C in the first table; it read as SEPA's navy right above it.
  promptpay: { fill: "#14A3B8", glyph: "Mobile" },
  vietqr: { fill: "#D7263D", glyph: "Bank" },
  paypal: { fill: "#002991", glyph: "brand:paypal" },
  venmo: { fill: "#008CFF", glyph: "brand:venmo" },
  cashapp: { fill: "#00C244", glyph: "brand:cashapp" },
  revolut: { fill: "#191C1F", glyph: "brand:revolut" },

  // Crypto
  bitcoin: { fill: "#F7931A", glyph: "brand:bitcoin" },
  ethereum: { fill: "#3C3C3D", glyph: "brand:ethereum" },
  solana: { fill: "#9945FF", glyph: "brand:solana" },
  litecoin: { fill: "#A6A9AA", glyph: "brand:litecoin" },
  dogecoin: { fill: "#C2A633", glyph: "brand:dogecoin" },
  bitcoincash: { fill: "#0AC18E", glyph: "brand:bitcoincash" },
  monero: { fill: "#FF6600", glyph: "brand:monero" },

  // Shopping (Amazon and Flipkart have no Simple Icons mark)
  amazon: { fill: "#D48102", glyph: "ShoppingCart" },
  flipkart: { fill: "#2874F0", glyph: "Bag2" },
  etsy: { fill: "#F16521", glyph: "brand:etsy" },
};

/** Marks for the hosted page types (lib/landing/page-type-ids.ts), by id. */
export const PAGE_TYPE_MARKS: Partial<
  Record<PageTypeIdentifier, TypeMarkEntry>
> = {
  links: { fill: "#5B5BD6", glyph: "Link21" },
  social: { fill: "#8E5CF0", glyph: "Profile2User" },
  business: { fill: "#14A3B8", glyph: "Shop" },
  // A folded map, not the Maps type's red pin.
  location: { fill: "#18AB4D", glyph: "Map1" },
  vcard: { fill: "#0A84FF", glyph: "UserTag" },
  resume: { fill: "#1B4F9C", glyph: "Briefcase" },
  menu: { fill: "#D48209", glyph: "Reserve" },
  // Not the Wi-Fi type's blue Wifi: they show together in search results.
  wifi: { fill: "#0BA790", glyph: "WifiSquare" },
  coupon: { fill: "#E5407A", glyph: "TicketDiscount" },
  event: { fill: "#F0603C", glyph: "Calendar1" },
  invitation: { fill: "#7B3FA0", glyph: "Lovely" },
  apps: { fill: "#18AB4D", glyph: "Mobile" },
  feedback: { fill: "#8E5CF0", glyph: "MessageFavorite" },
  form: { fill: "#F26B21", glyph: "UserEdit" },
  product: { fill: "#1B4F9C", glyph: "Box" },
  booking: { fill: "#0A84FF", glyph: "CalendarEdit" },
  payment: { fill: "#18AB4D", glyph: "Moneys" },
  "real-estate": { fill: "#14A3B8", glyph: "House" },
  pet: { fill: "#F26B21", glyph: "Pet" },
  // Blue, not red: red sat between the pet page's orange and the PDF page.
  medical: { fill: "#0A84FF", glyph: "Health" },
  "asset-tag": { fill: "#5B5BD6", glyph: "TagUser" },
  pdf: { fill: "#E5484D", glyph: "DocumentText" },
  images: { fill: "#0BA790", glyph: "Gallery" },
  mp3: { fill: "#EE46BC", glyph: "Music" },
  video: { fill: "#7B3FA0", glyph: "Video" },
  // Green, not purple: it sits next to the video page.
  playlist: { fill: "#18AB4D", glyph: "MusicPlaylist" },
  message: { fill: "#E5407A", glyph: "SmsStar" },
  custom: { fill: "#6E6E78", glyph: "Element4" },
};

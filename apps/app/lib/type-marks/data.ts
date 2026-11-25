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
  // A person on a card, not the Contact type's teal Personalcard.
  mecard: { fill: "#F26B21", glyph: "UserSquare" },

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
  discord: { fill: "#5865F2", glyph: "brand:discord" },
  bluesky: { fill: "#1185FE", glyph: "brand:bluesky" },
  mastodon: { fill: "#6364FF", glyph: "brand:mastodon" },
  twitch: { fill: "#9146FF", glyph: "brand:twitch" },

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
  // No Simple Icons marks for these four schemes. QR Platba and KHQR don't
  // use their metadata icons (MoneyRecive, CardReceive): those mirror UPI's
  // MoneySend and PayNow's CardSend in the same list.
  "swiss-qr-bill": { fill: "#F04438", glyph: "ReceiptText" },
  "czech-spd": { fill: "#1B4F9C", glyph: "ArrangeHorizontalSquare" },
  swish: { fill: "#0BA790", glyph: "Wallet2" },
  khqr: { fill: "#5B5BD6", glyph: "ScanBarcode" },

  // Crypto
  bitcoin: { fill: "#F7931A", glyph: "brand:bitcoin" },
  ethereum: { fill: "#3C3C3D", glyph: "brand:ethereum" },
  solana: { fill: "#9945FF", glyph: "brand:solana" },
  litecoin: { fill: "#A6A9AA", glyph: "brand:litecoin" },
  dogecoin: { fill: "#C2A633", glyph: "brand:dogecoin" },
  bitcoincash: { fill: "#0AC18E", glyph: "brand:bitcoincash" },
  monero: { fill: "#FF6600", glyph: "brand:monero" },
  // Simple Icons' "lightning" is another product; Tron isn't there.
  lightning: { fill: "#7B3FA0", glyph: "Flash" },
  xrp: { fill: "#25A768", glyph: "brand:xrp" },
  cardano: { fill: "#0133AD", glyph: "brand:cardano" },
  tron: { fill: "#D7263D", glyph: "Coin" },
  ton: { fill: "#0098EA", glyph: "brand:ton" },
  // Stellar's guidelines draw its mark in black on Stellar gold.
  stellar: { fill: "#FDDA24", glyph: "brand:stellar", ink: "dark" },

  // Shopping (Amazon and Flipkart have no Simple Icons mark)
  amazon: { fill: "#D48102", glyph: "ShoppingCart" },
  flipkart: { fill: "#2874F0", glyph: "Bag2" },
  etsy: { fill: "#F16521", glyph: "brand:etsy" },

  // Added 2026-11-22 (links), by picker category. Simple Icons has no
  // FaceTime, Microsoft Teams, Microsoft Forms, Amazon Music or Canva mark:
  // those take the type's own icon (CONTENT_TYPES_METADATA) as the glyph, on
  // a fill near the product's own colour.

  // Links & files
  "google-docs": { fill: "#4285F4", glyph: "brand:googledocs" },
  "google-sheets": { fill: "#34A853", glyph: "brand:googlesheets" },
  "google-slides": { fill: "#FBBC04", glyph: "brand:googleslides" },
  "google-forms": { fill: "#7248B9", glyph: "brand:googleforms" },
  "microsoft-forms": { fill: "#0BA790", glyph: "Task" },
  notion: { fill: "#000000", glyph: "brand:notion" },
  canva: { fill: "#8E5CF0", glyph: "Brush2" },
  "app-store": { fill: "#0D96F6", glyph: "brand:appstore" },
  "google-play": { fill: "#414141", glyph: "brand:googleplay" },

  // Contact & connect
  messenger: { fill: "#0866FF", glyph: "brand:messenger" },
  viber: { fill: "#7360F2", glyph: "brand:viber" },
  // KakaoTalk's icon draws its speech bubble dark on the yellow.
  kakaotalk: { fill: "#FFCD00", glyph: "brand:kakaotalk", ink: "dark" },
  zalo: { fill: "#0068FF", glyph: "brand:zalo" },
  // FaceTime's green is the Phone app's green.
  facetime: { fill: "#18AB4D", glyph: "Video" },

  // Social & media
  vk: { fill: "#0077FF", glyph: "brand:vk" },
  weibo: { fill: "#E6162D", glyph: "brand:sinaweibo" },
  tumblr: { fill: "#36465D", glyph: "brand:tumblr" },
  medium: { fill: "#000000", glyph: "brand:medium" },
  substack: { fill: "#FF6719", glyph: "brand:substack" },
  github: { fill: "#181717", glyph: "brand:github" },
  behance: { fill: "#1769FF", glyph: "brand:behance" },
  dribbble: { fill: "#EA4C89", glyph: "brand:dribbble" },
  // Linktree's icon draws its mark in black on the green.
  linktree: { fill: "#43E55E", glyph: "brand:linktree", ink: "dark" },
  patreon: { fill: "#000000", glyph: "brand:patreon" },
  kofi: { fill: "#FF6433", glyph: "brand:kofi" },
  // Buy Me a Coffee's icon draws its cup in black on the yellow.
  buymeacoffee: {
    fill: "#FFDD00",
    glyph: "brand:buymeacoffee",
    ink: "dark",
  },

  // Music & podcasts (Spotify and SoundCloud moved here from Social & media)
  // Spotify's guidelines: the black logo on light colours like its green.
  spotify: { fill: "#1ED760", glyph: "brand:spotify", ink: "dark" },
  soundcloud: { fill: "#FF5500", glyph: "brand:soundcloud" },
  "apple-music": { fill: "#FA243C", glyph: "brand:applemusic" },
  "youtube-music": { fill: "#FF0000", glyph: "brand:youtubemusic" },
  "apple-podcasts": { fill: "#9933CC", glyph: "brand:applepodcasts" },
  "amazon-music": { fill: "#14A3B8", glyph: "MusicSquare" },
  deezer: { fill: "#A238FF", glyph: "brand:deezer" },
  tidal: { fill: "#000000", glyph: "brand:tidal" },
  bandcamp: { fill: "#408294", glyph: "brand:bandcamp" },

  // Business
  "microsoft-teams": { fill: "#5B5BD6", glyph: "People" },
  webex: { fill: "#000000", glyph: "brand:webex" },
  calendly: { fill: "#006BFF", glyph: "brand:calendly" },
  "google-classroom": { fill: "#0F9D58", glyph: "brand:googleclassroom" },
  // Tripadvisor's icon draws its owl in black on the green.
  tripadvisor: { fill: "#34E0A1", glyph: "brand:tripadvisor", ink: "dark" },
  trustpilot: { fill: "#00B67A", glyph: "brand:trustpilot" },
  yelp: { fill: "#FF1A1A", glyph: "brand:yelp" },
  airbnb: { fill: "#FF5A5F", glyph: "brand:airbnb" },
  "booking-com": { fill: "#003A9A", glyph: "brand:bookingdotcom" },
  // Added 2026-11-25. A calendar with a plus on red, not the event page's
  // orange Calendar1: they show together in search results.
  "calendar-event": { fill: "#D7263D", glyph: "CalendarAdd" },
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
  // A tag with writing on it, not the vCard page's person in a tag.
  "asset-tag": { fill: "#5B5BD6", glyph: "Tag2" },
  pdf: { fill: "#E5484D", glyph: "DocumentText" },
  images: { fill: "#0BA790", glyph: "Gallery" },
  mp3: { fill: "#EE46BC", glyph: "Music" },
  video: { fill: "#7B3FA0", glyph: "Video" },
  // Green, not purple: it sits next to the video page.
  playlist: { fill: "#18AB4D", glyph: "MusicPlaylist" },
  message: { fill: "#E5407A", glyph: "SmsStar" },
  custom: { fill: "#6E6E78", glyph: "Element4" },
};

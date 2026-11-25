/**
 * Zod validation schemas for QR content types
 */

import { z } from "zod";
import type { HandleLinkType, PastedLinkType } from "@/types/qr-content";
// Added 2026-11-25
import { calendarEventIssue } from "@/utils/calendar-event";
import {
  cardanoIssue,
  cryptoAmount,
  evmNetwork,
  isTokenContract,
  lightningIssue,
  STABLECOIN_DECIMALS,
  stellarIssue,
  tonIssue,
  tronIssue,
  xrpIssue,
} from "@/utils/crypto-payments";
import { czechSpdIssue } from "@/utils/czech-spd";
import { type LinkType, linkTypeIssue } from "@/utils/link-types";
// Added 2026-11-22 (payments)
import { meCardIssue } from "@/utils/mecard";
import {
  khqrIssue,
  payNowIssue,
  pixIssue,
  promptPayIssue,
  sepaIssue,
  vietQrIssue,
} from "@/utils/payment-qr-codes";
import {
  blueskyIssue,
  type ContentIssue,
  cashAppIssue,
  cryptoIssue,
  discordIssue,
  googleMeetIssue,
  lineIssue,
  mastodonIssue,
  revolutIssue,
  signalIssue,
  soundCloudIssue,
  telegramIssue,
  twitchIssue,
  WIFI_EAP_METHODS,
  WIFI_PHASE2_METHODS,
  wazeIssue,
  wifiIssue,
  zoomIssue,
} from "@/utils/qr-content-encoder";
import { swishIssue } from "@/utils/swish";
import { swissQrBillContentIssue } from "@/utils/swiss-qr-bill";
import {
  isAmazonUrl,
  isGoogleDriveFileUrl,
  isOnDomain,
  parseWebUrl,
} from "@/utils/url-host";

/** True when `value` is an http(s) address on one of `domains` (or below). */
const onDomain =
  (...domains: string[]) =>
  (value: string) =>
    isOnDomain(parseWebUrl(value), ...domains);

// URL/Plain Text
export const urlSchema = z.object({
  url: z.string().min(1, "URL or text is required"),
});

// Email
export const emailSchema = z.object({
  recipient: z.email("Invalid email address"),
  subject: z.string().optional(),
  body: z.string().optional(),
});

// Phone
export const phoneSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^[+\d\s()-]+$/, "Invalid phone number format"),
});

// SMS
export const smsSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^[+\d\s()-]+$/, "Invalid phone number format"),
  message: z.string().optional(),
});

// WhatsApp
export const whatsappSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^[+\d\s()-]+$/, "Invalid phone number format"),
  message: z.string().optional(),
});

// WiFi
export const wifiSchema = z
  .object({
    ssid: z.string().min(1, "WiFi SSID is required"),
    password: z.string(),
    encryption: z.enum(["WPA", "WEP", "nopass", "SAE", "WPA2-EAP"]),
    hidden: z.boolean().optional(),
    // Added 2026-11-22 (payments): WPA2/WPA3-Enterprise sign-in
    eapMethod: z.enum(WIFI_EAP_METHODS).optional(),
    phase2: z.enum(WIFI_PHASE2_METHODS).optional(),
    identity: z.string().optional(),
    anonymousIdentity: z.string().optional(),
  })
  .superRefine(checkedBy(wifiIssue));

// vCard
export const vcardSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  organization: z.string().optional(),
  phone: z.string().optional(),
  email: z.email("Invalid email address").optional().or(z.literal("")),
  url: z.string().url("Invalid URL").optional().or(z.literal("")),
  address: z.string().optional(),
  note: z.string().optional(),
});

// Maps
export const mapsSchema = z.object({
  location: z.string().min(1, "Location is required"),
});

// Facebook
export const facebookSchema = z.object({
  profileUrl: z
    .string()
    .min(1, "Facebook profile URL is required")
    .url("Invalid URL"),
});

// Instagram
export const instagramSchema = z.object({
  username: z
    .string()
    .min(1, "Instagram username is required")
    .regex(/^@?[\w.]+$/, "Invalid Instagram username"),
});

// Reddit
export const redditSchema = z
  .object({
    username: z
      .string()
      .regex(/^u\/[\w-]+$|^[\w-]+$/, "Invalid Reddit username")
      .optional()
      .or(z.literal("")),
    subreddit: z
      .string()
      .regex(/^r\/[\w-]+$|^[\w-]+$/, "Invalid subreddit name")
      .optional()
      .or(z.literal("")),
  })
  .refine((data) => data.username || data.subreddit, {
    message: "Either username or subreddit is required",
  });

// TikTok
export const tiktokSchema = z.object({
  username: z
    .string()
    .min(1, "TikTok username is required")
    .regex(/^@?[\w.]+$/, "Invalid TikTok username"),
});

// Twitter/X
export const twitterSchema = z.object({
  username: z
    .string()
    .min(1, "Twitter username is required")
    .regex(/^@?[\w]+$/, "Invalid Twitter username"),
});

// LinkedIn
export const linkedinSchema = z.object({
  profileUrl: z
    .string()
    .min(1, "LinkedIn profile URL is required")
    .url("Invalid URL"),
});

// YouTube
export const youtubeSchema = z
  .object({
    channelUrl: z
      .string()
      .url("Invalid channel URL")
      .optional()
      .or(z.literal("")),
    videoUrl: z.string().url("Invalid video URL").optional().or(z.literal("")),
  })
  .refine((data) => data.channelUrl || data.videoUrl, {
    message: "Either channel or video URL is required",
  });

// Pinterest
export const pinterestSchema = z.object({
  username: z
    .string()
    .min(1, "Pinterest username is required")
    .regex(/^[\w-]+$/, "Invalid Pinterest username"),
});

// Snapchat
export const snapchatSchema = z.object({
  username: z
    .string()
    .min(1, "Snapchat username is required")
    .regex(/^[\w.-]+$/, "Invalid Snapchat username"),
});

// Threads
export const threadsSchema = z.object({
  username: z
    .string()
    .min(1, "Threads username is required")
    .regex(/^@?[\w.]+$/, "Invalid Threads username"),
});

// UPI
export const upiSchema = z.object({
  upiId: z
    .string()
    .min(1, "UPI ID is required")
    .regex(/^[\w.-]+@[\w.-]+$/, "Invalid UPI ID format (e.g., user@bank)"),
  name: z.string().optional(),
  amount: z
    .string()
    .regex(/^\d*\.?\d*$/, "Invalid amount format")
    .optional()
    .or(z.literal("")),
  note: z.string().optional(),
});

// PayPal
export const paypalSchema = z.object({
  paypalUrl: z
    .string()
    .min(1, "PayPal URL is required")
    .url("Invalid PayPal URL"),
});

// Plain Text
export const textSchema = z.object({
  text: z.string().min(1, "Text is required"),
});

// Google Review
export const googleReviewSchema = z.object({
  placeId: z.string().min(1, "Place ID is required"),
});

// Venmo
export const venmoSchema = z.object({
  username: z
    .string()
    .min(1, "Venmo username is required")
    .regex(/^@?[\w-]+$/, "Invalid Venmo username"),
  amount: z
    .string()
    .regex(/^\d*\.?\d*$/, "Invalid amount format")
    .optional()
    .or(z.literal("")),
  note: z.string().optional(),
});

// Spotify
export const spotifySchema = z.object({
  uri: z
    .string()
    .min(1, "Spotify URI or URL is required")
    .refine(
      (val) =>
        val.startsWith("spotify:") ||
        onDomain("spotify.com")(val) ||
        val.startsWith("https://"),
      "Invalid Spotify URI or URL",
    ),
});

// Bitcoin
export const bitcoinSchema = z.object({
  address: z
    .string()
    .min(26, "Invalid Bitcoin address")
    .max(62, "Invalid Bitcoin address"),
  amount: z
    .string()
    .regex(/^\d*\.?\d*$/, "Invalid amount format")
    .optional()
    .or(z.literal("")),
  label: z.string().optional(),
  message: z.string().optional(),
});

// Ethereum
export const ethereumSchema = z
  .object({
    address: z
      .string()
      .min(1, "Ethereum address is required")
      .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
    amount: z
      .string()
      .regex(/^\d*\.?\d*$/, "Invalid amount format")
      .optional()
      .or(z.literal("")),
    gas: z
      .string()
      .regex(/^\d*\.?\d*$/, "Invalid gas format")
      .optional()
      .or(z.literal("")),
    // Added 2026-11-22 (payments): network and stablecoin
    network: z.string().optional(),
    token: z.enum(["USDT", "USDC"]).optional(),
  })
  .superRefine((value, ctx) => {
    const network = evmNetwork(value.network);
    if (!network) {
      ctx.addIssue({
        code: "custom",
        message: "Pick a network",
        path: ["network"],
      });
      return;
    }
    if (isTokenContract(value.address)) {
      ctx.addIssue({
        code: "custom",
        message:
          "This is a token contract, not a wallet. Paste the address that receives the payment.",
        path: ["address"],
      });
    }
    if (value.token && !network.tokens[value.token]) {
      ctx.addIssue({
        code: "custom",
        message: `${value.token} isn't issued on ${network.name} by its issuer. Pick another network.`,
        path: ["token"],
      });
    }
    if (
      value.token &&
      value.amount?.trim() &&
      !cryptoAmount(value.amount, STABLECOIN_DECIMALS)
    ) {
      ctx.addIssue({
        code: "custom",
        message: `Enter an amount with up to ${STABLECOIN_DECIMALS} decimals`,
        path: ["amount"],
      });
    }
  });

// Etsy
export const etsySchema = z.object({
  shopUrl: z.string().min(1, "Etsy shop URL is required").url("Invalid URL"),
});

// Dub.sh
export const dubshSchema = z.object({
  shortUrl: z.string().min(1, "Short URL is required").url("Invalid URL"),
  source: z.enum(["manual", "dub-selected", "dub-created"]).optional(),
  dubLinkId: z.string().optional(),
  domain: z.string().optional(),
  key: z.string().optional(),
  destinationUrl: z.string().url("Invalid URL").optional(),
  qrCodeUrl: z.string().url("Invalid URL").optional(),
});

// Google Drive
export const googleDriveSchema = z.object({
  url: z
    .string()
    .min(1, "Google Drive URL is required")
    .url("Invalid URL")
    .refine(
      (val) => isGoogleDriveFileUrl(parseWebUrl(val)),
      "Must be a Google Drive URL",
    ),
  name: z.string().optional(),
  fileId: z.string().optional(),
  mimeType: z.string().optional(),
  source: z.enum(["manual", "drive-selected"]).optional(),
});

// Attendance (Google Form)
export const attendanceSchema = z.object({
  formUrl: z
    .string()
    .min(1, "Google Form URL is required")
    .url("Invalid URL")
    .refine((val) => {
      const url = parseWebUrl(val);
      return (
        (isOnDomain(url, "google.com") &&
          url?.pathname.startsWith("/forms") === true) ||
        isOnDomain(url, "forms.gle")
      );
    }, "Must be a Google Forms URL"),
});

// Amazon
export const amazonSchema = z.object({
  productUrl: z
    .string()
    .min(1, "Amazon product URL is required")
    .url("Invalid URL")
    .refine((val) => isAmazonUrl(parseWebUrl(val)), "Must be an Amazon URL"),
});

// Flipkart
export const flipkartSchema = z.object({
  productUrl: z
    .string()
    .min(1, "Flipkart product URL is required")
    .url("Invalid URL")
    .refine(onDomain("flipkart.com"), "Must be a Flipkart URL"),
});

// Cal.com
export const calcomSchema = z.object({
  bookingUrl: z
    .string()
    .min(1, "Cal.com booking URL is required")
    .url("Invalid URL")
    .refine(onDomain("cal.com"), "Must be a Cal.com URL"),
});

// ─── Content types added 2026-11-11 ─────────────────────────────────────────
// Each schema shapes the fields, then runs the encoder's own check
// (utils/qr-content-encoder.ts, utils/payment-qr-codes.ts), so the form, the
// AI chat and MCP report the same problem on the same field.

/** Reports the encoder's check on the field it names. */
function checkedBy<T>(check: (value: T) => ContentIssue | null) {
  return (value: T, ctx: z.RefinementCtx) => {
    const found = check(value);
    if (found) {
      ctx.addIssue({
        code: "custom",
        message: found.message,
        path: found.field ? [found.field] : [],
      });
    }
  };
}

const optionalText = z.string().optional();

// Pix (Brazil)
export const pixSchema = z
  .object({
    pixKey: z.string().min(1, "Pix key is required"),
    name: z.string().min(1, "Receiver name is required"),
    city: z.string().min(1, "City is required"),
    amount: optionalText,
    txid: optionalText,
    message: optionalText,
  })
  .superRefine(checkedBy(pixIssue));

// SEPA credit transfer (EPC069-12)
export const sepaSchema = z
  .object({
    name: z.string().min(1, "Beneficiary name is required"),
    iban: z.string().min(1, "IBAN is required"),
    bic: optionalText,
    amount: optionalText,
    reference: optionalText,
    remittance: optionalText,
  })
  .superRefine(checkedBy(sepaIssue));

// PayNow (Singapore)
export const paynowSchema = z
  .object({
    proxyType: z.enum(["mobile", "uen"]).optional(),
    proxy: z.string().min(1, "Mobile number or UEN is required"),
    amount: optionalText,
    editable: z.boolean().optional(),
    reference: optionalText,
    expiry: optionalText,
    name: optionalText,
  })
  .superRefine(checkedBy((value) => payNowIssue(value)));

// PromptPay (Thailand)
export const promptpaySchema = z
  .object({
    proxyType: z.enum(["mobile", "id", "ewallet"]).optional(),
    proxy: z.string().min(1, "Mobile number or ID is required"),
    amount: optionalText,
  })
  .superRefine(checkedBy(promptPayIssue));

// VietQR (Vietnam)
export const vietqrSchema = z
  .object({
    bankBin: z.string().min(1, "Bank is required"),
    accountType: z.enum(["account", "card"]).optional(),
    accountNumber: z.string().min(1, "Account number is required"),
    amount: optionalText,
    message: optionalText,
  })
  .superRefine(checkedBy(vietQrIssue));

// Cash App
export const cashappSchema = z
  .object({ username: z.string().min(1, "$Cashtag is required") })
  .superRefine(checkedBy(cashAppIssue));

// Revolut
export const revolutSchema = z
  .object({ username: z.string().min(1, "Revolut username is required") })
  .superRefine(checkedBy(revolutIssue));

// Telegram: a username (or t.me link), or a phone number
export const telegramSchema = z
  .object({ username: optionalText, phoneNumber: optionalText })
  .superRefine(checkedBy(telegramIssue));

// Signal: a phone number, or a username or group link
export const signalSchema = z
  .object({ phoneNumber: optionalText, link: optionalText })
  .superRefine(checkedBy(signalIssue));

// Discord
export const discordSchema = z
  .object({
    invite: z.string().min(1, "Discord invite link or code is required"),
  })
  .superRefine(checkedBy(discordIssue));

// LINE
export const lineSchema = z
  .object({ username: z.string().min(1, "LINE ID is required") })
  .superRefine(checkedBy(lineIssue));

// Bluesky
export const blueskySchema = z
  .object({ handle: z.string().min(1, "Bluesky handle is required") })
  .superRefine(checkedBy(blueskyIssue));

// Mastodon
export const mastodonSchema = z
  .object({ handle: z.string().min(1, "Mastodon handle is required") })
  .superRefine(checkedBy(mastodonIssue));

// Twitch
export const twitchSchema = z
  .object({ username: z.string().min(1, "Twitch username is required") })
  .superRefine(checkedBy(twitchIssue));

// SoundCloud
export const soundcloudSchema = z
  .object({
    username: z.string().min(1, "SoundCloud profile or link is required"),
  })
  .superRefine(checkedBy(soundCloudIssue));

// Zoom
export const zoomSchema = z
  .object({ meeting: z.string().min(1, "Zoom meeting ID or link is required") })
  .superRefine(checkedBy(zoomIssue));

// Google Meet
export const googleMeetSchema = z
  .object({
    meeting: z.string().min(1, "Google Meet code or link is required"),
  })
  .superRefine(checkedBy(googleMeetIssue));

// Waze
export const wazeSchema = z
  .object({
    location: z.string().min(1, "Address or coordinates are required"),
    navigate: z.boolean().optional(),
  })
  .superRefine(checkedBy(wazeIssue));

/** A crypto payment request: address, optional amount, label and message. */
function cryptoSchema(
  type: "litecoin" | "dogecoin" | "bitcoincash" | "solana" | "monero",
  name: string,
) {
  return z
    .object({
      address: z.string().min(1, `${name} address is required`),
      amount: optionalText,
      label: optionalText,
      message: optionalText,
      // Added 2026-11-22 (payments): Solana Pay's SPL stablecoins
      ...(type === "solana" && {
        token: z.enum(["SOL", "USDC", "USDT"]).optional(),
      }),
    })
    .superRefine(
      checkedBy((value) =>
        cryptoIssue({ ...value, type } as Parameters<typeof cryptoIssue>[0]),
      ),
    );
}

export const litecoinSchema = cryptoSchema("litecoin", "Litecoin");
export const dogecoinSchema = cryptoSchema("dogecoin", "Dogecoin");
export const bitcoincashSchema = cryptoSchema("bitcoincash", "Bitcoin Cash");
export const solanaSchema = cryptoSchema("solana", "Solana");
export const moneroSchema = cryptoSchema("monero", "Monero");

// ─── end of the 2026-11-11 schemas ──────────────────────────────────────────

// ─── Added 2026-11-22 (payments) ────────────────────────────────────────────

// MeCard
export const mecardSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: optionalText,
    reading: optionalText,
    nickname: optionalText,
    phone: optionalText,
    email: optionalText,
    url: optionalText,
    birthday: optionalText,
    address: optionalText,
    note: optionalText,
  })
  .superRefine(checkedBy((value) => meCardIssue(value)));

// Swiss QR-bill
export const swissQrBillSchema = z
  .object({
    iban: z.string().min(1, "IBAN is required"),
    name: z.string().min(1, "Name is required"),
    street: optionalText,
    buildingNumber: optionalText,
    postalCode: z.string().min(1, "Postcode is required"),
    town: z.string().min(1, "Town is required"),
    country: z.string().min(1, "Country is required"),
    currency: z.enum(["CHF", "EUR"]).optional(),
    amount: optionalText,
    reference: optionalText,
    message: optionalText,
    billingInfo: optionalText,
    payableBy: z.boolean().optional(),
    debtorName: optionalText,
    debtorStreet: optionalText,
    debtorBuildingNumber: optionalText,
    debtorPostalCode: optionalText,
    debtorTown: optionalText,
    debtorCountry: optionalText,
  })
  .superRefine(checkedBy(swissQrBillContentIssue));

// Czech QR Platba
export const czechSpdSchema = z
  .object({
    account: z.string().min(1, "Account is required"),
    bic: optionalText,
    amount: optionalText,
    name: optionalText,
    message: optionalText,
    variableSymbol: optionalText,
    specificSymbol: optionalText,
    constantSymbol: optionalText,
    dueDate: optionalText,
    instant: z.boolean().optional(),
  })
  .superRefine(checkedBy((value) => czechSpdIssue(value)));

// Swish
export const swishSchema = z
  .object({
    payee: z.string().min(1, "Swish number is required"),
    amount: optionalText,
    message: optionalText,
    amountEditable: z.boolean().optional(),
    messageEditable: z.boolean().optional(),
  })
  .superRefine(checkedBy(swishIssue));

// KHQR (Cambodia)
export const khqrSchema = z
  .object({
    bakongId: z.string().min(1, "Bakong account ID is required"),
    name: z.string().min(1, "Name is required"),
    city: optionalText,
    currency: z.enum(["KHR", "USD"]).optional(),
    amount: optionalText,
    expiry: optionalText,
    billNumber: optionalText,
    mobile: optionalText,
  })
  .superRefine(checkedBy((value) => khqrIssue(value)));

// Lightning
export const lightningSchema = z
  .object({
    request: z
      .string()
      .min(1, "Invoice, LNURL or Lightning Address is required"),
  })
  .superRefine(checkedBy(lightningIssue));

// XRP Ledger
export const xrpSchema = z
  .object({
    address: z.string().min(1, "XRP address is required"),
    destinationTag: optionalText,
  })
  .superRefine(checkedBy(xrpIssue));

// Cardano
export const cardanoSchema = z
  .object({
    address: z.string().min(1, "Cardano address is required"),
    amount: optionalText,
  })
  .superRefine(checkedBy(cardanoIssue));

// Tron
export const tronSchema = z
  .object({ address: z.string().min(1, "Tron address is required") })
  .superRefine(checkedBy(tronIssue));

// TON
export const tonSchema = z
  .object({
    address: z.string().min(1, "TON address is required"),
    amount: optionalText,
    message: optionalText,
    token: z.enum(["TON", "USDT"]).optional(),
  })
  .superRefine(checkedBy(tonIssue));

// Stellar
export const stellarSchema = z
  .object({
    address: z.string().min(1, "Stellar address is required"),
    amount: optionalText,
    memo: optionalText,
    token: z.enum(["XLM", "USDC"]).optional(),
  })
  .superRefine(checkedBy(stellarIssue));

// ─── end of the 2026-11-22 (payments) schemas ───────────────────────────────
// ─── Added 2026-11-22 (links) ───────────────────────────────────────────────
// The link and app types: their fields, checked by utils/link-types.ts.

/** The message a type's check gives for empty content. */
const requiredFor = (type: LinkType) =>
  linkTypeIssue({ type } as Parameters<typeof linkTypeIssue>[0])?.message ??
  "Required";

function linkSchema<Shape extends z.ZodRawShape>(type: LinkType, shape: Shape) {
  return z
    .object(shape)
    .superRefine(
      checkedBy((value) =>
        linkTypeIssue({ ...value, type } as Parameters<
          typeof linkTypeIssue
        >[0]),
      ),
    );
}

/** A username or a pasted profile link. */
const handleSchema = (type: HandleLinkType) =>
  linkSchema(type, { username: z.string().min(1, requiredFor(type)) });

/** A link pasted from the app or site. */
const pastedSchema = (type: PastedLinkType) =>
  linkSchema(type, { url: z.string().min(1, requiredFor(type)) });

export const LINK_TYPE_SCHEMAS = {
  messenger: handleSchema("messenger"),
  viber: linkSchema("viber", {
    phoneNumber: optionalText,
    message: optionalText,
    link: optionalText,
  }),
  kakaotalk: pastedSchema("kakaotalk"),
  zalo: pastedSchema("zalo"),
  facetime: linkSchema("facetime", {
    contact: optionalText,
    url: optionalText,
    audioOnly: z.boolean().optional(),
  }),
  "microsoft-teams": linkSchema("microsoft-teams", {
    url: optionalText,
    users: optionalText,
    message: optionalText,
  }),
  webex: pastedSchema("webex"),
  vk: pastedSchema("vk"),
  weibo: pastedSchema("weibo"),
  tumblr: handleSchema("tumblr"),
  medium: handleSchema("medium"),
  substack: handleSchema("substack"),
  github: handleSchema("github"),
  behance: handleSchema("behance"),
  dribbble: handleSchema("dribbble"),
  linktree: handleSchema("linktree"),
  patreon: handleSchema("patreon"),
  kofi: handleSchema("kofi"),
  buymeacoffee: handleSchema("buymeacoffee"),
  "apple-music": pastedSchema("apple-music"),
  "youtube-music": pastedSchema("youtube-music"),
  "apple-podcasts": pastedSchema("apple-podcasts"),
  "amazon-music": pastedSchema("amazon-music"),
  deezer: pastedSchema("deezer"),
  tidal: pastedSchema("tidal"),
  bandcamp: handleSchema("bandcamp"),
  "google-docs": pastedSchema("google-docs"),
  "google-sheets": pastedSchema("google-sheets"),
  "google-slides": pastedSchema("google-slides"),
  "google-forms": pastedSchema("google-forms"),
  "microsoft-forms": pastedSchema("microsoft-forms"),
  notion: pastedSchema("notion"),
  canva: pastedSchema("canva"),
  "google-classroom": pastedSchema("google-classroom"),
  calendly: handleSchema("calendly"),
  "app-store": linkSchema("app-store", {
    app: z.string().min(1, requiredFor("app-store")),
    writeReview: z.boolean().optional(),
  }),
  "google-play": linkSchema("google-play", {
    app: z.string().min(1, requiredFor("google-play")),
  }),
  tripadvisor: pastedSchema("tripadvisor"),
  trustpilot: linkSchema("trustpilot", {
    website: z.string().min(1, requiredFor("trustpilot")),
    writeReview: z.boolean().optional(),
  }),
  yelp: pastedSchema("yelp"),
  airbnb: pastedSchema("airbnb"),
  "booking-com": pastedSchema("booking-com"),
} satisfies Record<LinkType, z.ZodType>;

// ─── end of the 2026-11-22 (links) schemas ──────────────────────────────────

// ─── Added 2026-11-25 ───────────────────────────────────────────────────────

// Calendar event (an iCalendar VEVENT)
export const calendarEventSchema = z
  .object({
    title: z.string().min(1, "Event name is required"),
    allDay: z.boolean().optional(),
    startDate: z.string().min(1, "Pick the day the event starts"),
    startTime: optionalText,
    endDate: optionalText,
    endTime: optionalText,
    timeZone: optionalText,
    location: optionalText,
    description: optionalText,
    url: optionalText,
  })
  .superRefine(checkedBy((value) => calendarEventIssue(value)));

// Export type inference helpers
export type UrlFormData = z.infer<typeof urlSchema>;
export type TextFormData = z.infer<typeof textSchema>;
export type EmailFormData = z.infer<typeof emailSchema>;
export type PhoneFormData = z.infer<typeof phoneSchema>;
export type SmsFormData = z.infer<typeof smsSchema>;
export type WhatsAppFormData = z.infer<typeof whatsappSchema>;
export type WifiFormData = z.infer<typeof wifiSchema>;
export type VCardFormData = z.infer<typeof vcardSchema>;
export type MapsFormData = z.infer<typeof mapsSchema>;
export type FacebookFormData = z.infer<typeof facebookSchema>;
export type InstagramFormData = z.infer<typeof instagramSchema>;
export type RedditFormData = z.infer<typeof redditSchema>;
export type TikTokFormData = z.infer<typeof tiktokSchema>;
export type TwitterFormData = z.infer<typeof twitterSchema>;
export type LinkedInFormData = z.infer<typeof linkedinSchema>;
export type YouTubeFormData = z.infer<typeof youtubeSchema>;
export type PinterestFormData = z.infer<typeof pinterestSchema>;
export type SnapchatFormData = z.infer<typeof snapchatSchema>;
export type ThreadsFormData = z.infer<typeof threadsSchema>;
export type UPIFormData = z.infer<typeof upiSchema>;
export type PayPalFormData = z.infer<typeof paypalSchema>;
export type GoogleReviewFormData = z.infer<typeof googleReviewSchema>;
export type VenmoFormData = z.infer<typeof venmoSchema>;
export type SpotifyFormData = z.infer<typeof spotifySchema>;
export type BitcoinFormData = z.infer<typeof bitcoinSchema>;
export type EthereumFormData = z.infer<typeof ethereumSchema>;
export type EtsyFormData = z.infer<typeof etsySchema>;
export type DubshFormData = z.infer<typeof dubshSchema>;
export type GoogleDriveFormData = z.infer<typeof googleDriveSchema>;
export type AttendanceFormData = z.infer<typeof attendanceSchema>;
export type AmazonFormData = z.infer<typeof amazonSchema>;
export type FlipkartFormData = z.infer<typeof flipkartSchema>;
export type CalcomFormData = z.infer<typeof calcomSchema>;

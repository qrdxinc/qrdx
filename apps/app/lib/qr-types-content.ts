import type { ContentType } from "@/types/qr-content";
import type { HostedTypeSlug } from "./qr-types-content-hosted";
import { LINK_QR_TYPES } from "./qr-types-content-links";

/**
 * Copy for the /qr-code-generator/[type] pages. One entry per content type the
 * editor supports. Payload descriptions must match what
 * utils/qr-content-encoder.ts (plus the page-level fixes in
 * components/sections/tools/type-generator.tsx) actually produces.
 */

export type QrTypeGroup =
  | "social"
  | "music"
  | "contact"
  | "payments"
  | "business"
  | "shopping"
  | "utilities";

export interface QrTypeFaq {
  question: string;
  answer: string;
}

export interface QrTypeContent {
  type: ContentType;
  /** Display name used in "Free <name> QR Code Generator". */
  name: string;
  group: QrTypeGroup;
  /** One line for hub cards. */
  summary: string;
  metaDescription: string;
  intro: [string, string];
  steps: string[];
  payload: {
    format: string;
    example: string;
    notes: string[];
  };
  faqs: QrTypeFaq[];
  related: ContentType[];
  /** The hosted page that does the same job and can change after printing */
  hosted?: HostedTypeSlug;
  /** A section specific to this type: compatibility, gotchas, edge cases */
  details?: { title: string; paragraphs: string[] };
}

export const QR_TYPE_GROUPS: {
  id: QrTypeGroup;
  title: string;
  description: string;
}[] = [
  {
    id: "utilities",
    title: "Links, text and Wi-Fi",
    description:
      "Websites, plain text, Wi-Fi logins, shared documents and forms, app store pages and short links.",
  },
  {
    id: "contact",
    title: "Contact and messaging",
    description:
      "Save a contact, call, text or email, or open a chat in WhatsApp, Telegram, Messenger, LINE or KakaoTalk.",
  },
  {
    id: "social",
    title: "Social media",
    description:
      "Send people to a profile, channel, Discord server, newsletter, portfolio or creator page.",
  },
  {
    id: "music",
    title: "Music and podcasts",
    description:
      "Songs, albums, playlists, artist pages and podcasts on Spotify, Apple Music, SoundCloud, Bandcamp and other services.",
  },
  {
    id: "payments",
    title: "Payments",
    description:
      "Bank payment codes (UPI, Pix, SEPA, PayNow, PromptPay, VietQR), payment links and crypto wallets.",
  },
  {
    id: "business",
    title: "Business and events",
    description:
      "Reviews, listings, directions, bookings, meetings, classes and attendance check-ins.",
  },
  {
    id: "shopping",
    title: "Shopping",
    description: "Link packaging and displays to your marketplace listings.",
  },
];

export const QR_TYPES: QrTypeContent[] = [
  {
    type: "url",
    name: "URL",
    group: "utilities",
    summary: "Open any web page with one scan.",
    metaDescription:
      "Turn any link into a QR code for free. Static URL QR codes never expire and have no scan limits. Live preview, PNG and SVG download, no signup.",
    intro: [
      "A URL QR code stores a web address. When someone points a phone camera at it, the phone shows the link and opens it in the browser with one tap, so nobody has to type a long address from a poster, menu or business card. It is the most common kind of QR code and works for any page: a landing page, an online menu, a sign-up form or a product page.",
      "By default the code is static: the address is written into the pattern itself, so it keeps working for as long as the page exists, needs no account and never expires. The trade-off is that a static code cannot be changed after printing. If the destination may change, or you want scan counts, switch on 'Make it dynamic' (it needs a free QRdx account). The code then points to a short link whose destination you can edit later from your dashboard.",
    ],
    steps: [
      "Paste the full address, including https://, into the URL field.",
      "Watch the preview update as you type, then scan it with your phone to confirm it opens the right page.",
      "Keep the quiet zone switched on if the code will sit on a busy or dark background.",
      "Download a PNG for screens and documents or an SVG for print, or open the full editor to add colors, a logo and custom patterns.",
    ],
    payload: {
      format: "https://example.com/path?query",
      example: "https://qrdx.dev/pricing",
      notes: [
        "The code contains exactly the text you enter. QRdx does not add redirects or tracking parameters to static codes.",
        "Include the scheme (https://). Without it, some scanners treat the content as plain text instead of a link.",
        "Shorter addresses make a less dense code that scans from further away, so remove tracking parameters you don't need.",
        "Most URLs contain lowercase letters, so they are stored in byte mode: one byte per character, up to 2,953 bytes at error-correction level L.",
      ],
    },
    faqs: [
      {
        question: "Do URL QR codes expire?",
        answer:
          "No. A static QR code is the address encoded as a pattern. It works for as long as the web page it points to is online, and nothing on QRdx's side has to keep running for it to scan.",
      },
      {
        question: "Can I change the link after printing?",
        answer:
          "Not with a static code, because the address is part of the pattern. Switch on 'Make it dynamic' before downloading, or create a dynamic code from your dashboard, to get a code whose destination you can edit and whose scans are counted.",
      },
      {
        question: "How long can the URL be?",
        answer:
          "Up to 2,953 bytes at the lowest error-correction level, but long URLs create dense codes that must be printed larger. Under about 100 characters is comfortable for print.",
      },
      {
        question: "Is there a scan limit?",
        answer:
          "No. Static codes have no scan limits, and QRdx never sees the scans: the phone opens your link directly.",
      },
    ],
    related: ["text", "dubsh", "google-drive", "wifi", "vcard"],
  },
  {
    type: "text",
    name: "Plain Text",
    group: "utilities",
    summary: "Show a short message, code or note.",
    metaDescription:
      "Create a plain text QR code for notes, serial numbers and instructions. Works offline, supports any language and emoji. Free PNG and SVG download.",
    intro: [
      "A plain text QR code stores a message with no special meaning attached: a serial number, a short note, assembly instructions, a clue for a treasure hunt or a product code for a warehouse. When scanned, the phone simply displays the text, and most scanner apps let the reader copy or search it.",
      "Because the text lives inside the code, nothing needs to be online for it to work, which makes it useful for equipment labels, offline events and inventory tags. Keep messages short: every character adds modules to the pattern, and long text makes the code denser and harder to scan from a distance.",
    ],
    steps: [
      "Type or paste your text into the text box. Line breaks are kept.",
      "If you paste a link, QRdx detects it and switches to the matching generator, so the code opens as a link instead of showing text.",
      "Scan the preview to check how the text appears on your phone.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "<your text>",
      example: "Locker 14 - code 2741. Please return the key to reception.",
      notes: [
        "The text is stored as-is in UTF-8, so accents, emoji and non-Latin scripts work. Each non-ASCII character takes 2 to 4 bytes.",
        "Text made only of digits is stored in numeric mode, which fits about 2.4 times as many characters as byte mode.",
        "One code holds up to 2,953 bytes at error-correction level L and 1,663 at level Q, the QRdx default.",
      ],
    },
    faqs: [
      {
        question: "What happens when someone scans a text QR code?",
        answer:
          "The phone shows the text, usually with options to copy or search it. No internet connection is needed to read it.",
      },
      {
        question: "How much text fits in a QR code?",
        answer:
          "In theory 2,953 bytes (about 2,900 English characters) at error-correction level L. In practice, keep it under 300 characters so the code stays easy to scan at normal print sizes.",
      },
      {
        question: "Can I put a link in a text QR code?",
        answer:
          "Use the URL generator instead. Scanners recognize a link most reliably when the code holds only the address, starting with https://.",
      },
      {
        question: "Can I format the text?",
        answer:
          "No. QR codes store plain characters, so bold text, colors and clickable words are not possible. Line breaks are kept.",
      },
    ],
    related: ["url", "vcard", "wifi", "email"],
    hosted: "message",
  },
  {
    type: "email",
    name: "Email",
    group: "contact",
    summary: "Open a pre-addressed email draft.",
    metaDescription:
      "Make an email QR code that opens a pre-filled draft with recipient, subject and message. Standard mailto: format, free PNG and SVG download.",
    intro: [
      "An email QR code opens the scanner's email app with a new message already addressed to you, plus a subject line and body text if you add them. It removes the most error-prone part of getting in touch: typing an email address correctly from print.",
      "Use it on support signs, event badges, feedback cards or product packaging. The reader still has to press send, so nothing is sent without their consent, and the message comes from their own account so you can reply directly.",
    ],
    steps: [
      "Enter the recipient address.",
      "Optionally add a subject and a message, for example 'Feedback: table 12', so incoming emails are easy to sort.",
      "Scan the preview: your mail app should open a draft with the fields filled in.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "mailto:<address>?subject=<subject>&body=<message>",
      example:
        "mailto:support@example.com?subject=Order%20help&body=Order%20number%3A%20",
      notes: [
        "This is a standard mailto: URI (RFC 6068). The subject and body are percent-encoded, so spaces become %20 and line breaks %0A.",
        "Subject and body are optional. With neither, the code holds only mailto: and the address.",
        "Prefilled text makes the code denser, so a short subject and a one-line body keep it easy to scan.",
        "Some older scanners also read the DoCoMo MATMSG: format, but mailto: is the most widely supported.",
      ],
    },
    faqs: [
      {
        question: "Will the email send automatically?",
        answer:
          "No. Scanning opens a draft in the reader's mail app. They can edit it and must tap send themselves.",
      },
      {
        question: "Which email app opens?",
        answer:
          "Whatever the phone uses as its default mail app, such as Apple Mail, Gmail or Outlook.",
      },
      {
        question: "Can I add CC, BCC or several recipients?",
        answer:
          "The mailto: standard supports them, but this generator fills in one recipient plus the subject and body.",
      },
    ],
    related: ["phone", "sms", "whatsapp", "vcard"],
    hosted: "contact-form",
  },
  {
    type: "phone",
    name: "Phone Number",
    group: "contact",
    summary: "Show a number ready to call.",
    metaDescription:
      "Create a phone number QR code in the standard tel: format. One scan shows the number ready to call. Free, no signup, PNG and SVG download.",
    intro: [
      "A phone QR code holds a telephone number in the standard tel: format. Scanning it brings up the number ready to call, and the reader just taps the call button. It saves people from misdialing a number copied from a flyer, a van, a storefront or a printed invoice.",
      "Phones never place the call on their own: the scanner shows the number and the user decides. Always include the country code (for example +44 or +91) so the code also works for visitors and for people whose phone is registered in another country.",
    ],
    steps: [
      "Enter the number with its country code, for example +1 415 555 0132.",
      "Don't worry about formatting: QRdx removes spaces, brackets and dashes and keeps the digits and the leading +.",
      "Scan the preview and confirm the dialer shows the right number.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "tel:<+country code><number>",
      example: "tel:+14155550132",
      notes: [
        "tel: URIs are defined in RFC 3966. A leading + marks the number as international.",
        "QRdx strips every character except digits and +, so the formatting you type doesn't end up in the code.",
        "Extensions and dialing pauses are not added by this generator.",
      ],
    },
    faqs: [
      {
        question: "Does scanning start the call automatically?",
        answer:
          "No. The phone shows the number and the user has to confirm before it dials.",
      },
      {
        question: "Should I include the country code?",
        answer:
          "Yes. With a + and the country code the number works from anywhere; without it, the phone treats it as a local number.",
      },
      {
        question: "Can it open WhatsApp instead of the dialer?",
        answer:
          "No, a tel: code always opens the phone app. To start a WhatsApp chat, use the WhatsApp QR code generator.",
      },
    ],
    related: ["sms", "whatsapp", "vcard", "email"],
    hosted: "lost-and-found",
  },
  {
    type: "sms",
    name: "SMS",
    group: "contact",
    summary: "Open a text message with number and text filled in.",
    metaDescription:
      "Generate an SMS QR code that opens a text message with the number and message pre-filled. Great for text-to-join keywords. Free PNG and SVG.",
    intro: [
      "An SMS QR code opens the messaging app with a phone number and, optionally, a message already typed in. It is used for text-to-join lists and opt-in keywords ('Text JOIN to...'), support lines, votes and contests, where getting the number and the keyword exactly right matters.",
      "The reader still presses send, and their own carrier rates apply. Keep the prefilled message short and clear: it is exactly what you will receive, so it should tell you what the person wants.",
    ],
    steps: [
      "Enter the destination number with its country code.",
      "Optionally type the message, such as a keyword like JOIN.",
      "Scan the preview to confirm the messaging app opens with the number and text.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "SMSTO:<number>:<message>   or   sms:<number>",
      example: "SMSTO:+14155550132:JOIN",
      notes: [
        "With a message, QRdx uses the SMSTO:number:message form, which phone cameras and scanner apps widely recognize. Without a message it writes a plain sms: URI (RFC 5724).",
        "The number is reduced to digits and a leading +.",
        "The message is stored as you type it, without URL encoding.",
      ],
    },
    faqs: [
      {
        question: "Does the text send automatically?",
        answer:
          "No. The messaging app opens with a draft, and the person has to tap send.",
      },
      {
        question: "Who pays for the message?",
        answer:
          "The sender pays whatever their plan charges for texts. Short codes and international numbers may cost more.",
      },
      {
        question: "Why SMSTO: instead of sms:?",
        answer:
          "SMSTO: is a de-facto QR format that carries the message body in a way scanners understand; sms: is the IETF URI scheme. QRdx uses SMSTO: only when there is a message.",
      },
      {
        question: "Can one code text several numbers?",
        answer:
          "No. A code holds one destination number. Text-to-join services use a single number or short code plus a keyword, which works well with this format.",
      },
    ],
    related: ["phone", "whatsapp", "email", "vcard"],
  },
  {
    type: "whatsapp",
    name: "WhatsApp",
    group: "contact",
    summary: "Start a WhatsApp chat with a prefilled message.",
    metaDescription:
      "Create a WhatsApp QR code using the official wa.me click-to-chat link, with an optional prefilled message. Free, no signup, PNG and SVG.",
    intro: [
      "A WhatsApp QR code opens a chat with your number in WhatsApp, without the person having to save you as a contact first. Add a prefilled message and they can send it with one tap, which suits order enquiries, bookings, customer support and WhatsApp Business catalogs.",
      "The code uses WhatsApp's own click-to-chat link format (wa.me), so it works on Android and iPhone. If WhatsApp isn't installed, the link opens in the browser, where WhatsApp offers to continue to the chat or get the app.",
    ],
    steps: [
      "Enter your WhatsApp number in international format, starting with the country code.",
      "Optionally write the message people will send, for example 'Hi, I want to book a table'.",
      "Scan the preview to check that the chat opens with your number.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://wa.me/<number>?text=<url-encoded message>",
      example: "https://wa.me/14155550132?text=Hi%2C%20I%20want%20to%20book",
      notes: [
        "WhatsApp expects the full number in international format with no +, spaces, brackets or dashes. QRdx removes them for you.",
        "Drop your national trunk prefix: a UK number written 07700 900123 becomes 447700900123.",
        "The message is URL-encoded (spaces become %20), as the click-to-chat format requires.",
      ],
    },
    faqs: [
      {
        question: "Does it work with WhatsApp Business?",
        answer:
          "Yes. wa.me links open chats with both personal and WhatsApp Business numbers.",
      },
      {
        question: "Do people need to save my number first?",
        answer: "No. The link opens a chat with your number directly.",
      },
      {
        question: "Is the message sent automatically?",
        answer:
          "No. WhatsApp fills in the message box; the person reviews it and taps send.",
      },
      {
        question: "Can I link to a WhatsApp group instead?",
        answer:
          "Not with this generator. Group admins can copy an invite link (chat.whatsapp.com/...) from the group's info screen and put it in the URL generator. Anyone with that link can join, so share it carefully.",
      },
    ],
    related: ["phone", "sms", "vcard", "instagram"],
    hosted: "invitation",
  },
  {
    type: "wifi",
    name: "Wi-Fi",
    group: "utilities",
    summary: "Join a Wi-Fi network without typing the password.",
    metaDescription:
      "Make a Wi-Fi QR code so guests join your network with one scan. WPA/WPA2, WPA3, WEP and open networks, hidden SSIDs, correct escaping. Free.",
    intro: [
      "A Wi-Fi QR code lets guests join your network by pointing their camera at it, instead of reading out a 20-character password. The camera apps on iPhone and on most Android phones (or Google Lens) recognize the format and offer to join the network.",
      "It's popular in homes, cafés, holiday rentals, offices and event venues. The network name and password are stored in the code itself, so it works without an internet connection. Anyone who can photograph the code can read the password, so put guest-network codes where only guests can see them.",
    ],
    steps: [
      "Enter the network name (SSID) exactly as it appears, including capital letters and spaces.",
      "Choose the security type: WPA/WPA2 for almost every modern router (including ones in WPA2/WPA3 mode), WPA3 only for networks that refuse WPA2, WEP for very old ones, or No password for open networks.",
      "Enter the password, and switch on Hidden network only if your router doesn't broadcast its name.",
      "Scan the preview with your phone to test that it joins, then download and print.",
    ],
    payload: {
      format:
        "WIFI:T:<WPA|SAE|WEP|nopass>;S:<ssid>;P:<password>;H:<true|false>;;",
      example: "WIFI:T:WPA;S:Cafe Guest;P:latte\\;art;H:false;;",
      notes: [
        "This is the de-facto Wi-Fi format documented by the ZXing project. Fields can appear in any order, each ends with a semicolon, and the record ends with an extra semicolon.",
        'The characters \\ ; , : and " in the network name or password must be escaped with a backslash. QRdx does it for you, so a password of latte;art is stored as latte\\;art.',
        "T:nopass marks an open network and the password field is left out.",
        "H:true tells the phone the network is hidden, so it connects even though the name isn't broadcast.",
        "T:SAE marks a network that accepts only WPA3, as the Wi-Fi Alliance's WPA3 specification writes it. Android's Wi-Fi settings scanner reads it from Android 10; Apple doesn't document it for the iPhone Camera, so a network that also accepts WPA2 is better written as T:WPA.",
        "T:WPA2-EAP marks a WPA2/WPA3-Enterprise network, with ZXing's E: (EAP method), PH2: (phase 2), A: (anonymous identity) and I: (identity) fields. Scanner apps built on ZXing read them; phone camera apps don't join enterprise networks from a code.",
      ],
    },
    faqs: [
      {
        question: "Is it safe to put my Wi-Fi password in a QR code?",
        answer:
          "The password is stored in plain text inside the code, so anyone who scans or photographs it can read it. Use a separate guest network, and change the password and reprint the code if it leaks.",
      },
      {
        question: "Why won't my phone connect?",
        answer:
          "Check that the network name matches exactly (it is case-sensitive), that the security type is right and that you're in range. For enterprise networks that need a username (WPA2/WPA3-Enterprise), QRdx can write the sign-in details, but phone camera apps don't join from them: Android's Wi-Fi scanner reads only personal and open networks, and iPhones set up enterprise Wi-Fi with a configuration profile. Networks that need a certificate can't be put in a code at all.",
      },
      {
        question: "Does the code still work if I change the password?",
        answer:
          "No. The password is inside the code, so after changing it on the router you need to generate and print a new code.",
      },
      {
        question: "Is my password sent to QRdx?",
        answer:
          "No. The code is generated in your browser. The details you type are remembered only in this browser so you can continue in the full editor.",
      },
    ],
    related: ["vcard", "url", "text", "maps"],
    hosted: "guest-wifi",
  },
  {
    type: "vcard",
    name: "vCard",
    group: "contact",
    summary: "Save a full contact card to the phone.",
    metaDescription:
      "Create a vCard QR code for business cards: name, company, phone, email, website and address in vCard 3.0. Scans straight into contacts. Free.",
    intro: [
      "A vCard QR code holds a complete contact card: name, company, phone, email, website, address and a note. Scanning it shows a contact preview with an option to save it straight to the phone's address book, so nobody has to retype your details from a business card.",
      "Print it on business cards, name badges, conference lanyards or the back of a brochure, or add it to an email signature. Because the details are stored inside the code, it works offline and never expires; the catch is that you need a new code when your number or job changes.",
    ],
    steps: [
      "Enter at least a first name, then add the details you want to share.",
      "Write the phone number in international format, such as +44 20 7946 0000, so it works for everyone.",
      "Scan the preview: your phone should offer to create a new contact.",
      "Download an SVG for business-card printing or a PNG for digital use.",
    ],
    payload: {
      format:
        "BEGIN:VCARD\nVERSION:3.0\nFN:<full name>\nN:<last>;<first>;;;\nORG:<company>\nTEL;TYPE=CELL:<phone>\nEMAIL:<email>\nURL:<website>\nADR:;;<address>;;;;\nNOTE:<note>\nEND:VCARD",
      example:
        "BEGIN:VCARD\nVERSION:3.0\nFN:Ada Lovelace\nN:Lovelace;Ada;;;\nORG:Analytical Engines Ltd\nTEL;TYPE=CELL:+442079460000\nEMAIL:ada@example.com\nEND:VCARD",
      notes: [
        "QRdx writes vCard 3.0 (RFC 2426), which phone contact apps import reliably. FN (formatted name) and N (structured name) are required by the spec and always included.",
        "Only the fields you fill in are written, which keeps the code small. Every extra field makes it denser.",
        "ADR has seven parts separated by semicolons. QRdx puts your whole address in the street part, which contacts apps display as one block.",
        "If the code gets too dense to scan at business-card size, leave out the note or the address.",
      ],
    },
    faqs: [
      {
        question: "Does a vCard QR code work on iPhone and Android?",
        answer:
          "Yes. The iPhone Camera app and Android cameras or Google Lens recognize vCard codes and offer to add the contact.",
      },
      {
        question: "Can I add a profile photo?",
        answer:
          "No. A photo would make the card far larger than a scannable code can hold, so this generator doesn't include one.",
      },
      {
        question: "What's the difference between vCard and MECARD?",
        answer:
          "MECARD is a shorter format created by NTT DoCoMo. vCard is the standard every contacts app understands and supports more fields, so QRdx uses vCard 3.0.",
      },
      {
        question: "Can I update the contact after printing?",
        answer:
          "No, the details are inside the code. For one code that always shows your current details, make a digital business card instead: a hosted contact page with your photo and a Save contact button that you can edit after printing.",
      },
    ],
    related: ["linkedin", "phone", "email", "whatsapp", "url"],
    hosted: "business-card",
  },
  {
    type: "maps",
    name: "Google Maps",
    group: "business",
    summary: "Open an address or coordinates in Google Maps.",
    metaDescription:
      "Make a Google Maps QR code from an address or GPS coordinates. Opens the location ready for directions on Android and iPhone. Free PNG and SVG.",
    intro: [
      "A Google Maps QR code opens a location, such as a shop, venue, parking entrance or meeting point, in Google Maps ready for directions. Enter a street address, a place name or exact latitude and longitude coordinates.",
      "Use it on event invitations, delivery instructions, hotel welcome cards and property signs. The code holds a Google Maps link, so it opens in the Google Maps app when it's installed and in the phone's browser otherwise, on both Android and iPhone.",
    ],
    steps: [
      "Type an address or place name, or enter coordinates as latitude, longitude (for example 48.8584, 2.2945).",
      "Use coordinates for places without a street address, like a trailhead, a gate or a festival entrance.",
      "Scan the preview to confirm the right pin appears.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format:
        "https://www.google.com/maps/search/?api=1&query=<url-encoded address>\nhttps://www.google.com/maps?q=<latitude>,<longitude>",
      example:
        "https://www.google.com/maps/search/?api=1&query=Eiffel%20Tower%2C%20Paris",
      notes: [
        "Addresses use Google's documented Maps URLs format (api=1), which works across platforms and browsers.",
        "Coordinates are written as q=latitude,longitude in decimal degrees; south and west are negative.",
        "An alternative is the geo: URI from RFC 5870, such as geo:48.8584,2.2945, which opens the phone's default maps app (Apple Maps on iPhone). Type it into the plain text generator if you prefer that behavior.",
      ],
    },
    faqs: [
      {
        question: "Will it open Apple Maps on iPhone?",
        answer:
          "This code holds a Google Maps link, so it opens Google Maps if installed, or Google Maps in the browser. For Apple Maps, use a geo: URI in a plain text code.",
      },
      {
        question: "Should I use an address or coordinates?",
        answer:
          "Coordinates point to an exact spot. Addresses are easier to read, but Google may match ambiguous text to a different place, so always test-scan an address code.",
      },
      {
        question: "Can I link to my business listing instead?",
        answer:
          "Yes. Copy the share link of your listing in Google Maps and use the URL generator; it opens the listing with your reviews and opening hours.",
      },
    ],
    related: ["google-review", "wifi", "vcard", "calcom"],
    hosted: "location",
  },
  {
    type: "facebook",
    name: "Facebook",
    group: "social",
    summary: "Open a Facebook page, profile, group or event.",
    metaDescription:
      "Create a Facebook QR code that opens your page, profile, group or event. Paste the link, preview, and download PNG or SVG for free.",
    intro: [
      "A Facebook QR code takes people straight to your Facebook page, profile, group or event, where they can follow, message you or check in. It's a quick bridge from a printed menu, shop window or event poster to your community on Facebook.",
      "Paste the full facebook.com address of the page you want. On phones with Facebook installed the link usually opens in the app; otherwise it opens in the browser.",
    ],
    steps: [
      "Open your page, group or event on Facebook and copy its address, or use Share and then Copy link.",
      "Paste the full URL, starting with https://, into the field.",
      "Scan the preview to check that it opens the right page.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://www.facebook.com/<page-or-profile>",
      example: "https://www.facebook.com/YourBakery",
      notes: [
        "The code holds the link exactly as you paste it.",
        "Prefer your page's username URL (facebook.com/yourname) over long links with ID numbers or tracking parameters, which make the code denser.",
        "Make sure the page is public; people can't see private profiles or groups after scanning unless they have access.",
      ],
    },
    faqs: [
      {
        question: "Can I link to a Facebook event or group?",
        answer:
          "Yes. Any facebook.com URL works, including pages, profiles, groups, events and posts.",
      },
      {
        question: "Do people need the Facebook app?",
        answer:
          "No. Without the app the link opens in the browser, though Facebook may ask some visitors to log in.",
      },
      {
        question: "Can I see how many people scanned it?",
        answer:
          "Not with a static code. Use a dynamic code from the QRdx dashboard if you want scan counts.",
      },
      {
        question: "Can I link to a Messenger chat?",
        answer:
          "Yes. A Messenger link (m.me/yourpage) opens a chat with your page. Put it in the URL generator, since this form is meant for facebook.com addresses.",
      },
    ],
    related: ["instagram", "threads", "whatsapp", "google-review"],
  },
  {
    type: "instagram",
    name: "Instagram",
    group: "social",
    summary: "Open your Instagram profile from your username.",
    metaDescription:
      "Make an Instagram QR code from your username. Opens your profile so people can follow you in one tap. Custom colors and logo, PNG and SVG.",
    intro: [
      "An Instagram QR code opens your Instagram profile so people can follow you in one tap. Enter just your username and QRdx builds the profile link for you.",
      "Use it on product packaging, shop counters, event stands and flyers. Instagram also has its own QR code inside the app; a QRdx code is a regular QR code with your own colors, logo and patterns, exportable as SVG for print, and it works with any camera.",
    ],
    steps: [
      "Type your username, with or without the @.",
      "Check that the encoded link matches instagram.com/yourname.",
      "Scan the preview to make sure your profile opens.",
      "Download a PNG, SVG, WebP, GIF, BMP or ICO, or style the code in the full editor.",
    ],
    payload: {
      format: "https://www.instagram.com/<username>",
      example: "https://www.instagram.com/natgeo",
      notes: [
        "QRdx removes a leading @ and adds the username to Instagram's profile URL.",
        "Usernames can contain letters, numbers, periods and underscores.",
        "To link a specific post or reel, copy its link and use the URL generator.",
      ],
    },
    faqs: [
      {
        question: "Will it open the Instagram app?",
        answer:
          "On phones with Instagram installed, profile links usually open in the app; otherwise they open in the browser.",
      },
      {
        question: "What if I change my username?",
        answer:
          "The old username is part of the link, so the code stops pointing to you. Generate a new code after renaming.",
      },
      {
        question: "How is this different from Instagram's own QR code?",
        answer:
          "Both open your profile. With QRdx you choose the colors, logo and dot patterns and can download a vector SVG for print.",
      },
      {
        question: "Does it work for business and creator accounts?",
        answer:
          "Yes. Personal, business and creator accounts all use the same instagram.com/username profile URL. Private accounts show the profile header, but people must request to follow before they see posts.",
      },
    ],
    related: ["threads", "tiktok", "facebook", "snapchat"],
  },
  {
    type: "reddit",
    name: "Reddit",
    group: "social",
    summary: "Open a subreddit or Reddit profile.",
    metaDescription:
      "Generate a Reddit QR code for a subreddit or user profile. Great for meetups, stickers and posters. Free, no signup, PNG and SVG download.",
    intro: [
      "A Reddit QR code opens a subreddit or a Reddit user profile. Communities use it at meetups, on stickers and on posters to grow their subreddit; creators use it to point people to their profile. Subreddit links are short, so the codes stay simple enough to print on small stickers.",
      "Enter a subreddit name or a username and QRdx builds the reddit.com link. It opens in the Reddit app when installed, or on Reddit's website otherwise.",
    ],
    steps: [
      "Enter a subreddit (with or without r/) or a username (with or without u/).",
      "Fill in only one of the two fields so the code points where you expect.",
      "Scan the preview to check that it opens the right community or profile.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format:
        "https://www.reddit.com/r/<subreddit>\nhttps://www.reddit.com/user/<username>",
      example: "https://www.reddit.com/r/webdev",
      notes: [
        "QRdx strips the r/ or u/ prefix if you type one.",
        "Subreddit names and usernames can contain letters, numbers, underscores and hyphens.",
        "To share a specific post, copy its link and use the URL generator.",
        "Subreddit names are not case-sensitive, so r/WebDev and r/webdev open the same community.",
      ],
    },
    faqs: [
      {
        question: "Can I link a private subreddit?",
        answer:
          "Yes, but only approved members can see its posts after scanning.",
      },
      {
        question: "Does it work without the Reddit app?",
        answer: "Yes. It opens reddit.com in the browser.",
      },
      {
        question: "Can one code link a user and a subreddit?",
        answer:
          "No, a QR code has one destination. Make two codes if you need both.",
      },
      {
        question: "Do people need a Reddit account?",
        answer:
          "Not to read public communities and profiles. Voting, commenting and joining a subreddit require logging in, and Reddit may suggest opening its app.",
      },
    ],
    related: ["twitter", "youtube", "threads", "url"],
  },
  {
    type: "tiktok",
    name: "TikTok",
    group: "social",
    summary: "Open your TikTok profile from your username.",
    metaDescription:
      "Create a TikTok QR code from your username that opens your profile for new followers. Custom styles, free PNG and SVG download, no signup.",
    intro: [
      "A TikTok QR code opens your TikTok profile so viewers can follow you and watch your videos. Enter your username and QRdx builds the profile link.",
      "Creators and brands put it on merch, packaging, stage screens and printed ads: anywhere a tappable link isn't possible, like a product box, a busking sign or a slide in a live talk. TikTok has its own in-app QR code too; QRdx gives you a standard QR code you can restyle and export as SVG for large prints.",
    ],
    steps: [
      "Type your TikTok username, with or without the @.",
      "Check that the encoded link ends in /@yourname.",
      "Scan the preview to make sure your profile opens.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://www.tiktok.com/@<username>",
      example: "https://www.tiktok.com/@nasa",
      notes: [
        "TikTok profile URLs include the @. QRdx removes any @ you type and adds it back in the right place.",
        "Usernames can contain letters, numbers, underscores and periods.",
        "To link one video, copy its share link and use the URL generator.",
      ],
    },
    faqs: [
      {
        question: "Will it open the TikTok app?",
        answer:
          "When TikTok is installed, profile links usually open in the app; otherwise they open in the browser.",
      },
      {
        question: "What if I change my username?",
        answer:
          "The username is part of the link, so you'll need a new code after renaming.",
      },
      {
        question: "Can I link to a single video?",
        answer:
          "Yes. Copy the video's share link in TikTok and paste it into the URL generator.",
      },
      {
        question: "Can people follow me without the TikTok app?",
        answer:
          "They can watch your public videos in the browser, but following, liking and commenting require a TikTok account, and TikTok often suggests opening the app.",
      },
    ],
    related: ["instagram", "youtube", "snapchat", "spotify"],
  },
  {
    type: "twitter",
    name: "X (Twitter)",
    group: "social",
    summary: "Open your X profile from your handle.",
    metaDescription:
      "Make an X (Twitter) QR code from your handle that opens your profile. Works with twitter.com and x.com. Free PNG and SVG, no signup.",
    intro: [
      "An X (formerly Twitter) QR code opens your profile so people can follow you from a poster, a conference slide or a business card. Enter your handle and QRdx builds the link.",
      "The code uses a twitter.com profile link, which X redirects to x.com, and it opens in the X app when installed. Handles are short, so these codes stay simple and scan easily even when printed small, for example on a conference badge or the corner of a slide.",
    ],
    steps: [
      "Type your handle, with or without the @.",
      "Check that the encoded link ends with your handle.",
      "Scan the preview to make sure your profile opens.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://twitter.com/<handle>",
      example: "https://twitter.com/NASA",
      notes: [
        "QRdx removes a leading @ from the handle.",
        "Handles contain letters, numbers and underscores, up to 15 characters.",
        "To share a single post, copy its link and use the URL generator.",
        "Handles are not case-sensitive, so twitter.com/nasa and twitter.com/NASA open the same profile.",
        "Links to an X Community or List also work: copy the link and use the URL generator.",
      ],
    },
    faqs: [
      {
        question: "Why does the code use twitter.com instead of x.com?",
        answer:
          "Both work, because twitter.com links redirect to x.com. If you want x.com in the code, paste https://x.com/yourhandle into the URL generator.",
      },
      {
        question: "What if I change my handle?",
        answer:
          "The handle is part of the link, so generate a new code after changing it.",
      },
      {
        question: "Can I link to a specific post?",
        answer:
          "Yes. Copy the post's link and use the URL generator instead of this one.",
      },
      {
        question: "Do people need an X account?",
        answer:
          "X may limit what logged-out visitors can see and ask them to sign in. Following you always requires an account.",
      },
    ],
    related: ["threads", "linkedin", "reddit", "instagram"],
  },
  {
    type: "linkedin",
    name: "LinkedIn",
    group: "social",
    summary: "Open a LinkedIn profile or company page.",
    metaDescription:
      "Create a LinkedIn QR code for your profile or company page. Ideal for business cards, résumés and conference badges. Free PNG and SVG.",
    intro: [
      "A LinkedIn QR code opens your LinkedIn profile or company page, so new contacts at a conference, interview or client meeting can connect without searching for your name and guessing which result is you.",
      "Paste the full URL of a personal profile (linkedin.com/in/...) or a company page (linkedin.com/company/...). It fits naturally on business cards, résumés, name badges and the last slide of a talk, where people want to connect before they forget your name.",
    ],
    steps: [
      "Open your profile or company page on LinkedIn and copy the URL.",
      "Paste the full link, starting with https://, into the field.",
      "Scan the preview to make sure the right profile opens.",
      "Download an SVG for printing or a PNG for slides.",
    ],
    payload: {
      format: "https://www.linkedin.com/in/<profile>",
      example: "https://www.linkedin.com/in/your-name",
      notes: [
        "QRdx encodes the link exactly as pasted.",
        "Set a custom public profile URL in LinkedIn for a shorter, cleaner link; shorter links make simpler codes.",
        "Remove tracking parameters (anything after ?) before generating.",
      ],
    },
    faqs: [
      {
        question: "Profile or company page: which should I use?",
        answer:
          "Use your personal profile on business cards and résumés, and the company page on packaging, stands and marketing material.",
      },
      {
        question: "Do people need a LinkedIn account?",
        answer:
          "Logged-out visitors see a limited public profile. To connect or follow, they need to sign in.",
      },
      {
        question: "LinkedIn has its own QR code. Why use this one?",
        answer:
          "Both open your profile. A QRdx code lets you match your brand colors, add a logo and export vector files for print.",
      },
      {
        question: "Can I link a post, event or newsletter?",
        answer:
          "Yes. Copy the link of the post, event or newsletter and paste it here or into the URL generator; any linkedin.com URL works.",
      },
    ],
    related: ["vcard", "twitter", "calcom", "email"],
    hosted: "resume",
  },
  {
    type: "youtube",
    name: "YouTube",
    group: "social",
    summary: "Open a YouTube video or channel.",
    metaDescription:
      "Create a YouTube QR code for a video, Short, playlist or channel. Opens in the YouTube app or browser. Free PNG and SVG download, no signup.",
    intro: [
      "A YouTube QR code opens a video or a channel. Put a setup tutorial on product packaging, a trailer on a poster, a talk recording on your slides or your channel on merch and business cards.",
      "Paste a video URL, a channel URL or both. If you fill in both, the code opens the video. On phones with YouTube installed the link opens in the app; otherwise it plays in the browser.",
    ],
    steps: [
      "Copy the link of your video (Share, then Copy link) or your channel page.",
      "Paste it into the Video URL or Channel URL field.",
      "Scan the preview to check that the right video or channel opens.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format:
        "https://www.youtube.com/watch?v=<id>   or   https://youtu.be/<id>",
      example: "https://www.youtube.com/@NASA",
      notes: [
        "QRdx encodes the URL exactly as pasted. The video link takes priority over the channel link.",
        "youtu.be share links are shorter and produce a simpler code.",
        "To start at a moment in the video, add ?t= and the number of seconds to a youtu.be link, for example ?t=90.",
        "Unlisted videos play for anyone with the code; private videos don't.",
        "Shorts links look like youtube.com/shorts/<id> and open in the Shorts player.",
      ],
    },
    faqs: [
      {
        question: "Can I link a playlist or a Short?",
        answer:
          "Yes. Any YouTube URL works in the video field, including playlists and Shorts.",
      },
      {
        question: "Will it open the YouTube app?",
        answer:
          "When the app is installed, YouTube links usually open in it; otherwise they open in the browser.",
      },
      {
        question: "Can I make the video start at a specific time?",
        answer:
          "Yes. Add ?t=90 (for 90 seconds) to a youtu.be link, or &t=90 to a watch?v= link.",
      },
    ],
    related: ["spotify", "tiktok", "instagram", "url"],
  },
  {
    type: "pinterest",
    name: "Pinterest",
    group: "social",
    summary: "Open your Pinterest profile and boards.",
    metaDescription:
      "Make a Pinterest QR code from your username to grow followers from packaging, catalogs and craft fairs. Free PNG and SVG, no signup.",
    intro: [
      "A Pinterest QR code opens your Pinterest profile, where people can browse your boards and follow you. Makers, designers, wedding planners and shops use it on packaging, catalogs, mood boards and craft-fair tables. It suits anything people discover visually, such as recipes, home décor, fashion, weddings and DIY projects.",
      "Enter your Pinterest username and QRdx builds the profile link. It opens in the Pinterest app when installed, or on pinterest.com otherwise. With a business account, Pinterest's analytics show what people do once they arrive, such as saves and outbound clicks.",
    ],
    steps: [
      "Find your username in your Pinterest profile URL (pinterest.com/username): open your profile in a browser and look at the address bar.",
      "Type it into the field.",
      "Scan the preview to make sure your profile opens.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://www.pinterest.com/<username>",
      example: "https://www.pinterest.com/pinterest",
      notes: [
        "Usernames can contain letters, numbers, hyphens and underscores.",
        "To link one board, paste https://www.pinterest.com/username/board-name into the URL generator.",
        "The code opens your profile, so boards and Pins you add later appear without changing the code.",
      ],
    },
    faqs: [
      {
        question: "Can I link a single board or Pin?",
        answer:
          "Yes. Copy the board or Pin link and use the URL generator; this one builds profile links.",
      },
      {
        question: "Does it work for business accounts?",
        answer:
          "Yes. Business and personal accounts have the same profile URL format.",
      },
      {
        question: "Does Pinterest need to be installed?",
        answer: "No. Without the app, the profile opens on pinterest.com.",
      },
      {
        question: "What if I change my Pinterest username?",
        answer:
          "The username is part of the link, so the code stops pointing to your profile. Generate a new code after changing it.",
      },
    ],
    related: ["instagram", "etsy", "facebook", "tiktok"],
  },
  {
    type: "snapchat",
    name: "Snapchat",
    group: "social",
    summary: "Open your Snapchat add-friend page.",
    metaDescription:
      "Create a Snapchat QR code that opens your add-friend page from any phone camera, not just inside Snapchat. Free PNG and SVG download.",
    intro: [
      "A Snapchat QR code opens your Snapchat 'add friend' page, so people can add you without searching for your username and picking the right account. Creators, campus clubs and event hosts use it on posters, name tags and projected slides.",
      "Snapchat's own Snapcode only scans inside the Snapchat app. A QRdx code is a normal QR code that any phone camera can read; it opens snapchat.com/add/yourname, which hands off to the Snapchat app when it's installed and shows your profile on the web when it isn't.",
    ],
    steps: [
      "Type your Snapchat username (not your display name).",
      "Check that the encoded link ends with /add/yourname.",
      "Scan the preview to make sure your add-friend page opens.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://www.snapchat.com/add/<username>",
      example: "https://www.snapchat.com/add/teamsnapchat",
      notes: [
        "QRdx removes a leading @ from the username.",
        "Usernames can contain letters, numbers, periods, hyphens and underscores.",
        "Use your username, not your display name. Display names can contain spaces and emoji and are not part of the link.",
      ],
    },
    faqs: [
      {
        question: "What's the difference from a Snapcode?",
        answer:
          "A Snapcode is Snapchat's own code format and only scans inside Snapchat. A QR code works with the normal camera app as well.",
      },
      {
        question: "Where do I find my username?",
        answer:
          "In Snapchat, open your profile; the username appears under your display name.",
      },
      {
        question: "What if Snapchat isn't installed?",
        answer:
          "The link opens snapchat.com in the browser, which shows your profile and offers to open or get the app.",
      },
      {
        question: "What if I change my Snapchat username?",
        answer:
          "Snapchat allows occasional username changes, and the old username stops pointing to you. Generate a new code after changing it.",
      },
    ],
    related: ["instagram", "tiktok", "threads", "whatsapp"],
  },
  {
    type: "threads",
    name: "Threads",
    group: "social",
    summary: "Open your Threads profile from your username.",
    metaDescription:
      "Generate a Threads QR code from your username that opens your Threads profile. Free, no signup, custom colors, PNG and SVG download.",
    intro: [
      "A Threads QR code opens your Threads profile so people can follow you after seeing a talk, a poster or your packaging. Threads uses the same username as your Instagram account, so a Threads code pairs naturally with an Instagram code on the same flyer or badge.",
      "Enter your username and QRdx builds the profile link. It opens in the Threads app when installed, or on the Threads website otherwise. Profile links are short, so the code prints well even on stickers and name badges.",
    ],
    steps: [
      "Type your Threads username, with or without the @. It is the same as your Instagram username.",
      "Check that the encoded link ends in /@yourname.",
      "Scan the preview to make sure your profile opens.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://www.threads.net/@<username>",
      example: "https://www.threads.net/@zuck",
      notes: [
        "Threads moved its website to threads.com in April 2025 and redirects threads.net links, so codes using either domain open your profile, in the app or the browser.",
        "QRdx removes any @ you type and adds it back in the profile path.",
        "Usernames follow Instagram's rules: letters, numbers, periods and underscores.",
      ],
    },
    faqs: [
      {
        question: "Is my Threads username the same as my Instagram one?",
        answer: "Yes. Threads profiles use your Instagram username.",
      },
      {
        question: "Why does the link use threads.net?",
        answer:
          "That was the original Threads domain. It redirects to threads.com, so the code keeps working.",
      },
      {
        question: "Can I link to one post?",
        answer: "Yes. Copy the post's link and use the URL generator instead.",
      },
      {
        question: "Do people need the Threads app?",
        answer:
          "No. Public profiles can be viewed in the browser. Following and replying require logging in to Threads.",
      },
    ],
    related: ["instagram", "twitter", "facebook", "tiktok"],
  },
  {
    type: "spotify",
    name: "Spotify",
    group: "music",
    summary: "Open a song, album, playlist or podcast.",
    metaDescription:
      "Create a Spotify QR code for a song, album, playlist, artist or podcast. Works with any camera, unlike Spotify Codes. Free PNG and SVG.",
    intro: [
      "A Spotify QR code opens a song, album, playlist, podcast or artist page in Spotify. Musicians put it on posters, flyers and merch; cafés, gyms and shops use it to share the playlist that's playing; couples print it on wedding invitations.",
      "Paste a share link (open.spotify.com/...) or a Spotify URI (spotify:track:...). Share links work for everyone, opening in the app if it's installed and in Spotify's web player otherwise, while spotify: URIs only open when the Spotify app is installed.",
    ],
    steps: [
      "In Spotify, open the song, album, playlist or podcast and choose Share, then Copy link.",
      "Paste the link into the field.",
      "Scan the preview to check that it opens the right item.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://open.spotify.com/<type>/<id>   or   spotify:<type>:<id>",
      example: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      notes: [
        "QRdx stores the link exactly as pasted.",
        "Share links often end in ?si=..., a share identifier. You can delete it for a shorter code and the link still works.",
        "Spotify Codes (the sound-wave codes in the app) only scan inside Spotify; a QR code works with any camera.",
        "Podcast shows and single episodes have share links too, so you can link one episode.",
      ],
    },
    faqs: [
      {
        question: "Share link or Spotify URI: which should I use?",
        answer:
          "Use the share link. It works with or without the Spotify app installed; a spotify: URI does nothing on phones without the app.",
      },
      {
        question: "Do people need a Spotify account?",
        answer:
          "Spotify may ask them to log in or sign up to listen, depending on the content and their country.",
      },
      {
        question: "Can I link my artist profile?",
        answer:
          "Yes. Copy the link from your artist page with Share, then Copy link, and paste it here.",
      },
    ],
    related: ["apple-music", "youtube-music", "soundcloud", "apple-podcasts"],
  },
  {
    type: "upi",
    name: "UPI",
    group: "payments",
    summary: "Receive money in any UPI app in India.",
    metaDescription:
      "Make a UPI QR code for Google Pay, PhonePe, Paytm and BHIM. Set your UPI ID, name, optional amount and note in NPCI's upi://pay format. Free.",
    intro: [
      "A UPI QR code lets anyone in India pay you from Google Pay, PhonePe, Paytm, BHIM or any other UPI app. Scanning it opens the payment screen with your UPI ID and name filled in. Add an amount to request a fixed sum, or leave it blank and the payer enters it.",
      "It is how small shops, freelancers, tutors and event organizers in India commonly accept payments. The code contains your UPI ID (VPA) and name, not your bank account number, and money moves from the payer's bank to yours over the UPI network. QRdx never handles the payment.",
    ],
    steps: [
      "Enter your UPI ID, such as yourname@okhdfcbank or 9876543210@paytm.",
      "Enter the payee name as it appears on your bank account; payers see it before paying.",
      "Optionally set an amount in rupees and a note, such as 'Invoice 104'.",
      "Scan the code with your own UPI app to check the name and amount, cancel before paying, then download.",
    ],
    payload: {
      format: "upi://pay?pa=<upi-id>&pn=<name>&am=<amount>&tn=<note>",
      example:
        "upi://pay?pa=shop%40okaxis&pn=Corner%20Store&am=150.00&tn=Order%2042",
      notes: [
        "This follows NPCI's UPI linking specification: pa (payee address) and pn (payee name) are mandatory; am (amount) and tn (transaction note) are optional.",
        "Without am, the payer can type any amount, which is the usual setup for a shop counter.",
        "QRdx percent-encodes each value, so @ becomes %40 and spaces become %20.",
        "The optional cu=INR currency parameter is not added; INR is the only currency UPI supports. Merchant-only parameters (mc, tr and signatures) are not added either.",
      ],
    },
    faqs: [
      {
        question: "Does QRdx take a fee?",
        answer:
          "No. QRdx doesn't charge for the code or touch the payment. Any charges come from your bank or payment provider.",
      },
      {
        question: "Which apps can scan it?",
        answer:
          "UPI apps such as Google Pay, PhonePe, Paytm and BHIM read the upi://pay format. A phone's camera app may also pass the link to an installed UPI app.",
      },
      {
        question: "Can I request a fixed amount?",
        answer:
          "Yes. Fill in the amount and it is pre-filled on the payer's screen. Leave it empty for a reusable code where the payer enters the amount.",
      },
      {
        question: "Is the payee name required?",
        answer:
          "QRdx lets you leave it out, but the NPCI specification marks pn as mandatory, so fill it in for the widest compatibility.",
      },
    ],
    related: ["paypal", "phone", "whatsapp", "flipkart"],
  },
  {
    type: "paypal",
    name: "PayPal",
    group: "payments",
    summary: "Open your PayPal.Me or payment link.",
    metaDescription:
      "Create a PayPal QR code from your PayPal.Me link, with an optional amount and currency. For stalls, tips, invoices and donations. Free.",
    intro: [
      "A PayPal QR code opens your PayPal.Me page or a PayPal payment link, so people can pay you from their phone. It's handy for market stalls, tip jars, freelance invoices, club fees and donations.",
      "Paste your PayPal.Me link (paypal.me/yourname) or another PayPal payment link. You can set up a PayPal.Me link in your PayPal account if you don't have one yet. The payment itself happens on PayPal, so PayPal's usual options and fees apply. PayPal also shows a QR code in its app; a QRdx code is a regular QR code you can style and print at any size.",
    ],
    steps: [
      "Copy your PayPal.Me link from your PayPal account.",
      "To request a set amount, add it to the end of the link, for example paypal.me/yourname/25.",
      "Paste the link and scan the preview to check the payment page.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://paypal.me/<name>/<amount><currency code>",
      example: "https://paypal.me/yourname/25",
      notes: [
        "PayPal.Me links accept an optional amount after the name: paypal.me/yourname/25 asks for 25 in your default currency, and paypal.me/yourname/25EUR asks for euros.",
        "QRdx encodes the link as pasted, so add the amount to the link yourself.",
        "Other PayPal links, such as payment buttons or invoice links, work too.",
      ],
    },
    faqs: [
      {
        question: "Does QRdx charge anything?",
        answer:
          "No. The QR code is free; PayPal's own fees apply to payments as usual.",
      },
      {
        question: "Can I change the amount later?",
        answer:
          "The amount is part of the link, so a new amount means a new code. Leave the amount out for a reusable code.",
      },
      {
        question: "Do payers need the PayPal app?",
        answer:
          "No. PayPal.Me links also open in the browser, where payers log in to PayPal to complete the payment.",
      },
    ],
    related: ["venmo", "upi", "bitcoin", "url"],
  },
  {
    type: "google-review",
    name: "Google Review",
    group: "business",
    summary: "Open your Google 'write a review' box.",
    metaDescription:
      "Make a Google review QR code that opens the write-a-review box for your business from its Place ID. For receipts, tables and counters. Free.",
    intro: [
      "A Google review QR code opens the 'write a review' box for your business on Google, skipping the search-click-scroll that loses most would-be reviewers. Put it on receipts, table tents, packaging and the reception desk.",
      "It needs your business's Google Place ID, a unique identifier Google gives every place on Google Maps. Find it with Google's Place ID Finder, paste it in, and the code links straight to your review form.",
    ],
    steps: [
      "Open Google's Place ID Finder (linked under the field), search for your business and copy its ID, which usually begins with ChIJ.",
      "Paste the Place ID into the field.",
      "Scan the preview and check that the review box opens for your business.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://search.google.com/local/writereview?placeid=<place-id>",
      example:
        "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
      notes: [
        "This link format is widely used to open Google's review dialog directly. Google doesn't document it as a formal API, so test-scan your code after generating it.",
        "Google Business Profile also offers a short 'Ask for reviews' link. You can encode that with the URL generator instead.",
        "Reviewers must be signed in to a Google account to post.",
      ],
    },
    faqs: [
      {
        question: "Is it OK to ask for reviews with a QR code?",
        answer:
          "Asking is fine. Google's policies prohibit offering incentives for reviews and selectively asking only happy customers.",
      },
      {
        question: "Where do I find my Place ID?",
        answer:
          "Use Google's Place ID Finder on developers.google.com: search for your business and the ID appears on the map.",
      },
      {
        question: "Does it work for service-area businesses?",
        answer:
          "Yes. Any business listed on Google Maps has a Place ID, including businesses that hide their address.",
      },
    ],
    related: ["maps", "url", "facebook", "calcom"],
  },
  {
    type: "venmo",
    name: "Venmo",
    group: "payments",
    summary: "Request a Venmo payment with amount and note.",
    metaDescription:
      "Create a Venmo QR code that opens a payment to you with an optional amount and note. For stalls, tips and shared bills in the US. Free.",
    intro: [
      "A Venmo QR code opens a Venmo payment to you, with an amount and note filled in if you add them. It suits bake sales, market stalls, tutors, shared bills and tip jars. Venmo is available only in the United States.",
      "Venmo has a personal QR code in its app; a QRdx code points to your venmo.com profile link with payment parameters, so you can style it, print it at any size and scan it with the normal phone camera.",
    ],
    steps: [
      "Enter your Venmo username, with or without the @.",
      "Optionally add an amount in US dollars and a note, such as 'Lemonade'.",
      "Scan the preview with your phone to check what Venmo shows.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format:
        "https://venmo.com/<username>?txn=pay&amount=<amount>&note=<note>",
      example: "https://venmo.com/your-name?txn=pay&amount=12.50&note=Lemonade",
      notes: [
        "txn=pay asks the scanner to pay you; amount is in US dollars and the note is URL-encoded.",
        "Venmo doesn't publish a formal specification for these link parameters, so whether the amount and note are pre-filled can vary by app version. Always test-scan before printing.",
        "QRdx removes a leading @ from the username.",
        "If the amount isn't pre-filled on a payer's phone, they can still type it in before paying.",
      ],
    },
    faqs: [
      {
        question: "Does QRdx charge a fee?",
        answer:
          "No. The QR code is free; Venmo's own fees apply, for example on business profiles.",
      },
      {
        question: "Does the payer need Venmo?",
        answer: "Yes. Paying through Venmo requires a Venmo account.",
      },
      {
        question: "Can I reuse the code for different amounts?",
        answer:
          "Leave the amount empty and the payer types it in, so one code works for every payment.",
      },
      {
        question: "Is it safe to share my Venmo QR code?",
        answer:
          "It contains only your username plus the optional amount and note, so it reveals no more than sharing your Venmo username. Payers should check your name and photo on the payment screen.",
      },
    ],
    related: ["paypal", "upi", "bitcoin", "sms"],
  },
  {
    type: "bitcoin",
    name: "Bitcoin",
    group: "payments",
    summary: "Share a BIP21 Bitcoin payment request.",
    metaDescription:
      "Create a Bitcoin QR code in the BIP21 bitcoin: format with optional amount, label and message. Works with SegWit and Taproot addresses. Free.",
    intro: [
      "A Bitcoin QR code holds your wallet address, and optionally an amount, a label and a message, in the BIP21 bitcoin: URI format. Scanning it with a Bitcoin wallet fills in the payment, so the sender doesn't have to copy a long address by hand, where one wrong character would send coins to the wrong place.",
      "Use it for donations, invoices, point-of-sale signs or receiving from a friend. The code contains only public information, your receiving address, never your private keys or seed phrase. Payments to a reused address are publicly linkable on the blockchain, which is why many wallets suggest a fresh address for each invoice.",
    ],
    steps: [
      "Copy a receiving address from your wallet and paste it into the address field.",
      "Optionally enter an amount in BTC (with a period as the decimal point), a label such as your name and a message.",
      "Scan the preview with a wallet and check that the address matches exactly.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "bitcoin:<address>?amount=<btc>&label=<label>&message=<message>",
      example:
        "bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.0015&label=Donation&message=Thanks%20for%20the%20podcast",
      notes: [
        "Defined by BIP21. The amount is in BTC as a decimal number with a period, never with commas or in satoshis.",
        "label (who is being paid) and message (what for) are percent-encoded.",
        "Legacy (1...), P2SH (3...) and SegWit or Taproot (bc1...) addresses all work. QRdx accepts addresses of 26 to 62 characters.",
      ],
    },
    faqs: [
      {
        question: "Is it safe to share my Bitcoin QR code?",
        answer:
          "Yes. It contains your receiving address, which is meant to be shared. Never put a private key or seed phrase in a QR code.",
      },
      {
        question: "Which wallets can read it?",
        answer:
          "Most Bitcoin wallets read bitcoin: URIs. Support for the optional label and message varies between wallets.",
      },
      {
        question: "Can I request an amount in dollars?",
        answer:
          "No. BIP21 amounts are always in BTC. Convert at the current rate, or leave the amount empty so the sender enters it.",
      },
    ],
    related: ["ethereum", "paypal", "upi", "text"],
    details: {
      title: "Lightning, testnet and address checks",
      paragraphs: [
        "This is an on-chain request: the wallet pays your address on the Bitcoin blockchain. Lightning-only wallets can't pay it, and this generator doesn't add a lightning= invoice to the URI, so for Lightning payments make a Lightning code from your wallet's invoice, LNURL or Lightning Address instead.",
        "The generator checks the address's length (26 to 62 characters), not its checksum, and it can't tell mainnet from testnet: a testnet address (starting with tb1, m, n or 2) makes a code no ordinary wallet can pay. Scan the preview with the wallet that will pay before you print.",
      ],
    },
  },
  {
    type: "ethereum",
    name: "Ethereum",
    group: "payments",
    summary: "Request ETH, USDC or USDT on Ethereum and other EVM networks.",
    metaDescription:
      "Make an Ethereum QR code in the EIP-681 format for ETH, USDC or USDT on Ethereum, Base, Polygon, Arbitrum and three more EVM networks. Free.",
    intro: [
      "An Ethereum QR code holds a payment request in the EIP-681 ethereum: format: your wallet address, the network and, if you like, an amount. Scanning it with a compatible wallet opens a transfer to your address with those values filled in.",
      "Pick Ethereum or another EVM network (BNB Smart Chain, Polygon, Arbitrum One, OP Mainnet, Base or Avalanche C-Chain) and ask for the network's own coin, or for USDT or USDC where Tether and Circle list the contract themselves. Addresses are 42-character hexadecimal strings that are easy to mistype, so a code is safer than copying one by hand. It contains only your public address; private keys and recovery phrases must never go into a QR code.",
    ],
    steps: [
      "Copy your address (starting with 0x) from your wallet and paste it in.",
      "Pick the network, then the network's own coin, USDC or USDT.",
      "Optionally enter an amount, and a gas limit for a coin payment.",
      "Scan the preview with your wallet, check the address, network and amount, and download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format:
        "ethereum:<address>[@<chainId>]?value=<amount>e18&gas=<gas limit>, or for a token: ethereum:<token contract>@<chainId>/transfer?address=<recipient>&uint256=<amount in base units>",
      example:
        "ethereum:0xfb6916095ca1df60bb79Ce92ce3ea74c37c5d359?value=2.014e18",
      notes: [
        "Coin amounts (value) are in wei, the smallest unit: 1 ETH is 10^18 wei. This page converts the amount you type by adding the e18 exponent, so 0.05 ETH is written as value=0.05e18.",
        "Other networks are named with @chainId: BNB Smart Chain 56, Polygon 137, Arbitrum One 42161, OP Mainnet 10, Base 8453 and Avalanche C-Chain 43114. On Ethereum itself (chain 1) no @1 is added.",
        "A USDC or USDT request is a transfer on the token's contract, with the amount in base units (6 decimals). 1.5 USDC on Base is ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=<recipient>&uint256=1500000.",
        "gas is a synonym for gasLimit, a suggested limit the payer can edit. A plain ETH transfer uses 21000.",
        "Wallet support for EIP-681 parameters varies; test with the wallet your payers use.",
      ],
    },
    faqs: [
      {
        question: "Can I request USDC or USDT?",
        answer:
          "Yes, on the networks where Tether and Circle list the contract themselves: USDT on Ethereum and Avalanche, USDC on Ethereum, Polygon, Arbitrum, OP Mainnet, Base and Avalanche. QRdx refuses a token contract pasted as the recipient.",
      },
      {
        question: "Does every wallet read the network and token?",
        answer:
          "No. MetaMask Mobile reads @chainId and /transfer, but some wallets fill in only the recipient and drop the token and amount. Print the token, network and amount next to the code so the payer can check them.",
      },
      {
        question: "Is it safe to share?",
        answer:
          "Yes. The code contains your public address only. Never encode a private key or recovery phrase.",
      },
    ],
    related: ["bitcoin", "paypal", "venmo", "text"],
    details: {
      title: "Networks, address checks and ENS names",
      paragraphs: [
        "The network's own coin is ETH on Ethereum, Arbitrum One, OP Mainnet and Base, BNB on BNB Smart Chain, POL on Polygon and AVAX on Avalanche C-Chain. The same 0x address works on all of them, so pick the network your payer will send on.",
        "The generator checks that the address is 0x followed by 40 hexadecimal characters. It doesn't check the mixed-case EIP-55 checksum; wallets check that when they scan, so paste the address exactly as your wallet shows it rather than typing it.",
        "ENS names such as name.eth aren't accepted. EIP-681 allows them, but the payer's wallet would have to look the name up; a 0x address works in every wallet that reads the code.",
      ],
    },
  },
  {
    type: "etsy",
    name: "Etsy",
    group: "shopping",
    summary: "Open your Etsy shop or a listing.",
    metaDescription:
      "Create an Etsy QR code for your shop or a listing. Add it to packaging inserts, thank-you cards and craft fairs. Free PNG and SVG download.",
    intro: [
      "An Etsy QR code sends customers to your Etsy shop or a specific listing. Sellers add it to packaging inserts, thank-you cards, craft-fair booths and business cards to turn one-off buyers into repeat customers. An insert is one of the few places you reach a buyer after the sale, and a code turns the follow-up into one scan instead of a search.",
      "Paste your shop URL (etsy.com/shop/YourShopName) or any listing URL. The link opens in the Etsy app when installed, or on etsy.com otherwise.",
    ],
    steps: [
      "Open your shop or listing on Etsy and copy the URL.",
      "Remove tracking parameters such as ?ref=... from the end of the link.",
      "Paste it and scan the preview to check the right page opens.",
      "Download an SVG for printed inserts or a PNG for digital use.",
    ],
    payload: {
      format: "https://www.etsy.com/shop/<shop-name>",
      example: "https://www.etsy.com/shop/YourShopName",
      notes: [
        "QRdx encodes the link exactly as pasted after checking it is a valid URL.",
        "Linking the shop rather than a single listing keeps the code useful after an item sells out.",
        "Shorter links without tracking parameters make simpler codes that print well on small inserts.",
        "Shop URLs follow etsy.com/shop/ShopName; listing URLs contain /listing/ followed by a numeric ID.",
      ],
    },
    faqs: [
      {
        question: "Shop or listing: which should I link?",
        answer:
          "Link the shop on inserts and business cards. Link a listing for product-specific material, such as a refill or matching item.",
      },
      {
        question: "Will it open the Etsy app?",
        answer:
          "When the Etsy app is installed, links usually open in it; otherwise they open on etsy.com.",
      },
      {
        question: "What if I rename my shop?",
        answer:
          "The shop name is part of the URL, so test-scan the code after a rename and generate a new one if needed.",
      },
    ],
    related: ["amazon", "flipkart", "instagram", "pinterest"],
  },
  {
    type: "dubsh",
    name: "Dub.sh",
    group: "utilities",
    summary: "Encode a Dub short link you can edit later.",
    metaDescription:
      "Create a QR code for a Dub short link, so you can change the destination and see click analytics in Dub without reprinting. Free.",
    intro: [
      "A Dub QR code encodes a short link you created with Dub, on dub.sh or your own branded domain. Because the code contains the short link rather than the final page, you can change the destination in Dub later and see click analytics there; the printed code stays the same. That suits printed material with a long life, like packaging and signage.",
      "On this page, paste an existing Dub short link. In the full QRdx editor you can also connect your Dub account to pick from your links or create a new one without leaving QRdx.",
    ],
    steps: [
      "Create a short link in Dub, or copy one you already have.",
      "Paste it into the field, including https://.",
      "Scan the preview to check that it redirects to your destination.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://dub.sh/<key>   or   https://<your-domain>/<key>",
      example: "https://dub.sh/qrdx",
      notes: [
        "QRdx encodes the short link as entered; redirects and analytics are handled by Dub.",
        "Short links make low-density codes that scan easily even when printed small.",
        "Dub itself can also generate QR codes; use QRdx when you want custom colors, patterns, a logo or SVG output for the same link.",
      ],
    },
    faqs: [
      {
        question: "Do I need a Dub account?",
        answer:
          "Yes, to create short links. Encoding an existing link here doesn't require connecting it.",
      },
      {
        question: "Can I change where the code goes after printing?",
        answer:
          "Yes. Edit the short link's destination in Dub and the printed code follows it.",
      },
      {
        question: "Where do I see scan statistics?",
        answer:
          "In your Dub dashboard, which counts clicks on the short link, including those from scans.",
      },
      {
        question: "Can I use my own domain?",
        answer:
          "Yes. If your Dub workspace has a custom domain, paste the short link on that domain; it works the same way.",
      },
    ],
    related: ["url", "google-drive", "text", "attendance"],
  },
  {
    type: "google-drive",
    name: "Google Drive",
    group: "utilities",
    summary: "Open a Drive file, folder, Doc or Sheet.",
    metaDescription:
      "Make a Google Drive QR code for a file, folder, Doc, Sheet or Slides deck. Update the file without reprinting the code. Free PNG and SVG.",
    intro: [
      "A Google Drive QR code opens a file or folder from Google Drive: a PDF menu, a price list, a photo album, course materials, or a shared folder for event photos.",
      "Paste a Drive, Docs, Sheets, Slides or Drawings link. Before printing, set sharing to 'Anyone with the link', otherwise people who scan it will see a request-access screen. In the full editor you can also connect Google Drive and pick a file from your account.",
    ],
    steps: [
      "In Google Drive, open Share, set General access to 'Anyone with the link' and copy the link.",
      "Paste the link into the field.",
      "Scan the preview on a phone that isn't signed in to your account to check access.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://drive.google.com/file/d/<file-id>/view",
      example: "https://drive.google.com/file/d/<file-id>/view?usp=sharing",
      notes: [
        "QRdx accepts drive.google.com links and Docs, Sheets, Slides and Drawings links from docs.google.com.",
        "The link stays the same when you edit the file, so you can update a menu or schedule without reprinting, as long as you edit the same file.",
        "Uploading a replacement file creates a new link. For PDFs and images, use Manage versions in Drive to keep the existing link.",
      ],
    },
    faqs: [
      {
        question: "Why do people see 'You need access'?",
        answer:
          "The file isn't shared publicly. Set General access to 'Anyone with the link' in the Share dialog.",
      },
      {
        question: "Can I update the file without a new code?",
        answer:
          "Yes. Edit the same file, or upload a new version with Manage versions, and the link keeps working.",
      },
      {
        question: "Does QRdx access my Google Drive?",
        answer:
          "Not on this page; pasting a link doesn't connect anything. Only if you connect Google Drive in the full editor can QRdx list files for you to pick.",
      },
    ],
    related: ["url", "attendance", "dubsh", "text"],
    hosted: "pdf",
  },
  {
    type: "attendance",
    name: "Attendance",
    group: "business",
    summary: "Check people in with a Google Form.",
    metaDescription:
      "Create an attendance QR code that opens a Google Form check-in. Responses are timestamped in Google Sheets. For classes, trainings and events.",
    intro: [
      "An attendance QR code opens a Google Form where people check in: students in a lecture, staff at a training session, volunteers at an event. Instead of passing a sign-in sheet around, attendees scan the code on the projector or the door and submit their name in seconds.",
      "Google Forms stores each response with a timestamp and can send them to a Google Sheet, so you get an attendance log without retyping anything. Create the form in Google Forms first, then paste its link here.",
    ],
    steps: [
      "Create a Google Form with the fields you need, such as name and ID number.",
      "Click Send, choose the link tab and copy the link (shortened forms.gle links work too).",
      "Paste it here and scan the preview to submit a test response.",
      "Download the code and show it on screen or print it at the entrance.",
    ],
    payload: {
      format: "https://docs.google.com/forms/d/e/<form-id>/viewform",
      example: "https://forms.gle/<short-id>",
      notes: [
        "QRdx accepts docs.google.com/forms and forms.gle links.",
        "Google Forms timestamps every response. In the form settings you can collect email addresses or limit each person to one response, which requires respondents to sign in to Google.",
        "A static code can be photographed and shared, so people could check in remotely. Close the form after each session if that matters.",
      ],
    },
    faqs: [
      {
        question: "How do I stop duplicate check-ins?",
        answer:
          "Turn on 'Limit to 1 response' in the form's settings. Respondents then need to sign in with a Google account.",
      },
      {
        question: "Where do I see who attended?",
        answer:
          "In the form's Responses tab, or in a linked Google Sheet with one row per check-in.",
      },
      {
        question: "Can I use one code for every session?",
        answer:
          "Yes, if you keep the same form. Use the timestamps or add a date question, and switch off 'Accepting responses' between sessions.",
      },
    ],
    related: ["google-drive", "calcom", "url", "vcard"],
  },
  {
    type: "amazon",
    name: "Amazon",
    group: "shopping",
    summary: "Open an Amazon product or store page.",
    metaDescription:
      "Create an Amazon QR code for a product, brand store or book page on any Amazon marketplace. For packaging, inserts and posters. Free.",
    intro: [
      "An Amazon QR code links to a product, a brand store or an author page. Sellers put it on packaging and inserts so customers can reorder or find accessories, and authors put it on bookmarks and posters to link their book.",
      "Paste a link from any Amazon marketplace, such as amazon.com, amazon.co.uk, amazon.in or amazon.de. It opens in the Amazon app when installed, or in the browser otherwise.",
    ],
    steps: [
      "Open the product or store page on Amazon and copy the URL.",
      "Shorten product links to amazon.com/dp/ followed by the 10-character product ID (ASIN).",
      "Paste the link and scan the preview to check the right page opens.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://www.amazon.com/dp/<ASIN>",
      example: "https://www.amazon.com/dp/B08N5WRWNW",
      notes: [
        "QRdx checks that the link is an Amazon URL and encodes it as pasted.",
        "The short /dp/ASIN form drops tracking parameters and makes a simpler code that prints well on small packaging.",
        "ASINs are 10 characters long. For books, the ASIN is usually the ISBN-10.",
      ],
    },
    faqs: [
      {
        question: "Which Amazon link is best on packaging?",
        answer:
          "The short /dp/ link with the product's ASIN. It is stable and much shorter than a search or shared link.",
      },
      {
        question: "Can I link my brand store?",
        answer: "Yes. Copy your store's URL and paste it here.",
      },
      {
        question: "What do customers in other countries see?",
        answer:
          "The link opens the marketplace in the URL. Availability and prices depend on that marketplace, so use a regional link for regional packaging.",
      },
      {
        question: "What happens if the listing is removed?",
        answer:
          "The code leads to an unavailable page. For packaging that stays in circulation for years, consider linking your brand store instead of a single product.",
      },
    ],
    related: ["flipkart", "etsy", "google-review", "url"],
  },
  {
    type: "flipkart",
    name: "Flipkart",
    group: "shopping",
    summary: "Open a Flipkart product or seller page.",
    metaDescription:
      "Make a Flipkart QR code for a product or seller page. For boxes, inserts and in-store displays in India. Free, no signup, PNG and SVG.",
    intro: [
      "A Flipkart QR code takes customers to a Flipkart product page or your brand's store. Indian brands and sellers print it on boxes, inserts and in-store displays so customers can reorder, find related products or leave a review on Flipkart.",
      "Paste the product or store link from Flipkart. It opens in the Flipkart app when installed, or on flipkart.com otherwise, so customers land on the exact listing instead of searching among similar products.",
    ],
    steps: [
      "Open the product on Flipkart and copy its link (or use Share in the app).",
      "Paste the link into the field.",
      "Scan the preview to check that the right product opens.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://www.flipkart.com/<product-path>/p/<item-id>?pid=<id>",
      example: "https://www.flipkart.com/<product-name>/p/<item-id>",
      notes: [
        "QRdx checks that the link is a flipkart.com URL and encodes it as pasted.",
        "Flipkart links can be long, which makes denser codes. Test-scan at the size you'll print, and print larger if needed.",
        "Pick the exact size or color on Flipkart before copying the link, since variants usually have their own product link.",
      ],
    },
    faqs: [
      {
        question: "Can I link my seller or brand store?",
        answer:
          "Yes, any flipkart.com link works, including brand and category pages.",
      },
      {
        question: "Will it open the Flipkart app?",
        answer:
          "When the app is installed, Flipkart links usually open in it; otherwise they open in the browser.",
      },
      {
        question: "The code looks very dense. What can I do?",
        answer:
          "Print it larger, use error-correction level L or M in the full editor, or shorten the link with a link shortener first.",
      },
      {
        question: "Does it work outside India?",
        answer:
          "The code opens anywhere, but Flipkart sells to customers in India, so it is most useful on products sold there.",
      },
    ],
    related: ["amazon", "upi", "etsy", "google-review"],
  },
  {
    type: "calcom",
    name: "Cal.com",
    group: "business",
    summary: "Open your Cal.com booking page.",
    metaDescription:
      "Create a Cal.com QR code that opens your booking page so people can schedule a meeting in a few taps. For cards, slides and booths. Free.",
    intro: [
      "A Cal.com QR code opens your booking page so people can pick a time that suits you both, without back-and-forth emails. Consultants, coaches, recruiters and salespeople put it on business cards, conference slides and event booths.",
      "Paste your Cal.com link: your profile (cal.com/yourname) to show all event types, or a specific event (cal.com/yourname/30min) to go straight to it. Cal.com handles time zones, availability and calendar invites, so the person scanning sees open slots in their own time zone.",
    ],
    steps: [
      "Copy your profile or event link from Cal.com.",
      "Paste it into the field.",
      "Scan the preview to check that the booking page opens.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://cal.com/<username>/<event>",
      example: "https://cal.com/yourname/30min",
      notes: [
        "QRdx encodes the link as pasted. This form expects a link containing cal.com; for a self-hosted or custom domain, use the URL generator.",
        "An event link skips a step for the person scanning, so use it when you mainly offer one meeting type.",
      ],
    },
    faqs: [
      {
        question: "Profile or event link?",
        answer:
          "Use the event link for a single meeting type, such as an intro call, and the profile link when people should choose between several.",
      },
      {
        question: "Does the person scanning need a Cal.com account?",
        answer:
          "No. They pick a time and enter their name and email; Cal.com sends the invite.",
      },
      {
        question: "Can I use Calendly or another scheduler?",
        answer:
          "Yes. Paste any booking link into the URL generator; this one is set up for Cal.com links.",
      },
      {
        question: "Can I control when people can book?",
        answer:
          "Yes, in Cal.com. Each event type has its own duration, availability, buffer times and booking limits; the QR code just opens the page.",
      },
    ],
    related: ["linkedin", "vcard", "attendance", "email"],
  },
  // ── Content types added 2026-11-11 ──
  {
    type: "pix",
    name: "Pix",
    group: "payments",
    summary: "Get paid by Pix from any Brazilian bank app.",
    metaDescription:
      "Make a static Pix QR code (BR Code) for your Pix key, with an optional amount and message. Built to the Banco Central rules, in your browser. Free.",
    intro: [
      "A Pix QR code lets anyone in Brazil pay you from their bank app: they scan, check the name and amount, and confirm. It works with every kind of Pix key: CPF, CNPJ, phone number, email or a random key.",
      "QRdx makes a static BR Code, the format the Banco Central do Brasil defines for Pix. Static codes can be paid many times, so one printed code works at a counter, on an invoice or on a tip jar. Leave the amount empty to let each payer type it, or set one for a fixed price. The same text also works as Pix copia e cola.",
    ],
    steps: [
      "Enter your Pix key exactly as it is registered at your bank. Phone keys start with +55.",
      "Add the receiver name and city as they should appear to the payer (up to 25 and 15 characters).",
      "Optionally set an amount, a message and a transaction ID to match payments in your statement.",
      "Scan the preview with your own bank app to check the details, then download the code.",
    ],
    payload: {
      format:
        "EMV TLV: 00 format · 26 Pix account (br.gov.bcb.pix, key, message) · 52 0000 · 53 986 · 54 amount · 58 BR · 59 name · 60 city · 62 txid · 63 CRC",
      example:
        "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
      notes: [
        "The code is a string of data objects, each an ID, a two-digit length and a value, ending with a CRC16-CCITT checksum that bank apps verify.",
        "Names, cities and messages are written without accents (São Paulo becomes Sao Paulo), as the format only takes plain letters.",
        "Without a transaction ID the code uses ***, the value the rules give for codes that aren't tied to one charge.",
        "The key and the message share one data object of 99 characters, so a long email key leaves less room for the message.",
      ],
    },
    faqs: [
      {
        question: "Can people pay the same Pix code more than once?",
        answer:
          "Yes. A static Pix code can be paid any number of times, which suits shops, stalls and donations. Use a transaction ID if you want to tell payments apart.",
      },
      {
        question: "Does QRdx see my payments?",
        answer:
          "No. The code is made in your browser and payments go from the payer's bank to yours. QRdx never receives the key or the money.",
      },
      {
        question: "Can I make a dynamic Pix charge with an expiry?",
        answer:
          "Not here. Dynamic Pix codes point to a charge your bank or payment provider hosts, so they come from that provider's API. QRdx makes static codes.",
      },
    ],
    related: ["upi", "sepa", "paypal", "vcard"],
  },
  {
    type: "sepa",
    name: "SEPA Transfer",
    group: "payments",
    summary: "Fill in a euro bank transfer with IBAN, amount and reference.",
    metaDescription:
      "Create a SEPA credit transfer QR code (EPC QR, also called GiroCode) with IBAN, amount and reference. Built to the EPC069-12 guidelines. Free.",
    intro: [
      "A SEPA transfer QR code fills in a bank transfer for the person paying: your name, IBAN, the amount and the payment reference. They scan it with their banking app, check the details and confirm, so nobody retypes a 22-character IBAN from an invoice.",
      "The format comes from the European Payments Council's guidelines, EPC069-12, and is often called a GiroCode. Banking apps in several euro countries read it, Germany and Austria especially. It suits invoices, rent, club fees and donation posters.",
    ],
    steps: [
      "Enter the beneficiary name and IBAN. QRdx checks the IBAN's length and check digits.",
      "Add the BIC only if your bank asks for it; inside the EEA it's optional.",
      "Optionally set an amount in euros and a payment reference, or a structured RF creditor reference.",
      "Switch the design to error correction level M if the form asks, then scan the preview with a banking app.",
    ],
    payload: {
      format:
        "BCD\n002\n1\nSCT\n<BIC>\n<name>\n<IBAN>\nEUR<amount>\n<purpose>\n<RF reference>\n<reference text>",
      example:
        "BCD\n002\n1\nSCT\n\nBloom Cafe\nDE58123456780123456789\nEUR12.50\n\n\nInvoice 1024",
      notes: [
        "Each field is one line, in a fixed order. QRdx writes version 002 with UTF-8 text and leaves empty trailing lines out.",
        "The whole code holds at most 331 bytes. Names are up to 70 characters and reference texts up to 140.",
        "A transfer takes either a structured RF creditor reference or free reference text, never both. RF references are checked with their check digits.",
        "The guidelines ask for error correction level M, and the form offers to switch the design to it.",
      ],
    },
    faqs: [
      {
        question: "Which banking apps read SEPA QR codes?",
        answer:
          "Many apps in Germany and Austria, and a number in other euro countries, read EPC codes. Some apps call it GiroCode or photo transfer. Test with the apps your payers use.",
      },
      {
        question: "Does the code pay automatically?",
        answer:
          "No. It only fills in the transfer form. The payer checks the details and confirms in their banking app.",
      },
      {
        question: "Is my IBAN sent to QRdx?",
        answer:
          "No. The code is made in your browser, and the playground never puts bank details in a link.",
      },
    ],
    related: ["pix", "paypal", "revolut", "vcard"],
  },
  {
    type: "paynow",
    name: "PayNow",
    group: "payments",
    summary: "Get paid by PayNow to a mobile number or UEN.",
    metaDescription:
      "Make a PayNow QR code for a Singapore mobile number or company UEN, with an optional amount, reference and expiry date. SGQR format, free.",
    intro: [
      "A PayNow QR code lets people in Singapore pay you from their banking app. It can pay a mobile number, for personal payments, or a business UEN, for shops and companies.",
      "QRdx builds the code in the SGQR format that Singapore banking apps scan. Leave the amount empty for a code anyone can pay any amount, or set one and choose whether the payer may change it. A reference shows up with the payment, and an expiry date makes the code stop working after a given day.",
    ],
    steps: [
      "Choose whether the payment goes to a mobile number or a UEN, and enter it.",
      "Optionally add the name payers should see, an amount and a reference such as an invoice number.",
      "Set an expiry date if the code should only work for a while, for an invoice say.",
      "Scan the preview with your banking app to check the details, then download the code.",
    ],
    payload: {
      format:
        "EMV TLV: 00 format · 01 static/dynamic · 26 PayNow account (SG.PAYNOW, proxy type, proxy, editable, expiry) · 52 0000 · 53 702 · 54 amount · 58 SG · 59 name · 60 Singapore · 62 reference · 63 CRC",
      example:
        "00020101021226370009SG.PAYNOW010120210T00XX0000X03010520400005303702540512.505802SG5910Bloom Cafe6009Singapore62110107INV10246304F9D7",
      notes: [
        "Proxy type 0 is a mobile number (+65 and 8 digits) and 2 is a UEN.",
        "A code with an amount or an expiry date is marked dynamic (point of initiation 12); others are static (11).",
        "The checksum is CRC16-CCITT over the whole payload, as in every EMV payment code.",
      ],
    },
    faqs: [
      {
        question: "Can I use PayNow with my personal mobile number?",
        answer:
          "Yes, if your number is registered for PayNow with your bank. Payers see the name your bank registered.",
      },
      {
        question: "What does the expiry date do?",
        answer:
          "Banking apps refuse to pay the code after that day. Leave it empty for a code you print once and keep.",
      },
      {
        question: "Does QRdx take a fee?",
        answer:
          "No. The money moves between the two banks through PayNow. QRdx only draws the code, in your browser.",
      },
    ],
    related: ["promptpay", "vietqr", "upi", "pix"],
  },
  {
    type: "promptpay",
    name: "PromptPay",
    group: "payments",
    summary: "Get paid by PromptPay to a phone number or ID.",
    metaDescription:
      "Create a PromptPay QR code for a Thai mobile number, national ID, tax ID or e-wallet ID, with an optional amount. Thai QR standard, free.",
    intro: [
      "A PromptPay QR code lets anyone with a Thai banking app pay you by scanning. It pays the mobile number, national ID, tax ID or e-wallet ID linked to your PromptPay account.",
      "QRdx makes the code to the Thai QR Code Payment Standard. Without an amount, payers type what they owe, which suits a stall or a shop counter. With an amount, the code is marked dynamic, as the standard asks for a code made for one payment.",
    ],
    steps: [
      "Choose mobile number, national or tax ID, or e-wallet ID.",
      "Enter the number linked to your PromptPay account.",
      "Optionally set an amount in baht.",
      "Scan the preview with your banking app to check the name, then download the code.",
    ],
    payload: {
      format:
        "EMV TLV: 00 format · 01 static/dynamic · 29 PromptPay (A000000677010111, proxy) · 53 764 · 54 amount · 58 TH · 63 CRC",
      example:
        "00020101021229370016A0000006770101110213000000000000053037645406120.005802TH6304E112",
      notes: [
        "Mobile numbers are written as 0066 and the number without its leading 0, 13 digits in all. National and tax IDs are 13 digits, e-wallet IDs 15.",
        "Point of initiation 11 means a reusable code; 12, used when there's an amount, means a code for one payment.",
        "The code ends with a CRC16-CCITT checksum that banking apps check before they pay.",
      ],
    },
    faqs: [
      {
        question: "Which number should I use?",
        answer:
          "The one you registered for PromptPay at your bank. Most people use their mobile number; businesses often use their tax ID.",
      },
      {
        question: "Can foreign visitors pay with it?",
        answer:
          "Only with an app that pays Thai QR codes, such as a Thai banking app. Some foreign wallets support Thai QR through partner networks; check before you rely on it.",
      },
      {
        question: "Is my ID number stored by QRdx?",
        answer:
          "No. The code is made in your browser and the playground never puts payment details in a link.",
      },
    ],
    related: ["paynow", "vietqr", "upi", "pix"],
  },
  {
    type: "vietqr",
    name: "VietQR",
    group: "payments",
    summary: "Get a bank transfer in Vietnam with one scan.",
    metaDescription:
      "Make a VietQR code for a Vietnamese bank account or card, with an optional amount and message. NAPAS format, works with VietQR banking apps. Free.",
    intro: [
      "A VietQR code fills in a bank transfer in Vietnamese banking apps: the bank, your account or card number and, if you like, the amount and a message. The payer scans, checks the name their bank shows and confirms.",
      "QRdx builds the code to the NAPAS VietQR specification. Pick your bank from the list (it maps each bank to the 6-digit number the code needs), enter the account or card, and the code is ready for a shop counter, an invoice or a tip jar.",
    ],
    steps: [
      "Choose your bank from the list.",
      "Enter your account number, or switch to card and enter the card number.",
      "Optionally add an amount in dong and a short message, without accents.",
      "Scan the preview with your banking app, then download the code.",
    ],
    payload: {
      format:
        "EMV TLV: 00 format · 01 static/dynamic · 38 VietQR (A000000727, bank BIN and account, QRIBFTTA or QRIBFTTC) · 53 704 · 54 amount · 58 VN · 62 message · 63 CRC",
      example:
        "00020101021238540010A00000072701240006970436011000000000000208QRIBFTTA53037045405500005802VN62230819Thanh toan don hang6304789D",
      notes: [
        "QRIBFTTA pays an account and QRIBFTTC a card.",
        "Amounts are whole dong. Messages are up to 25 characters, and Vietnamese accents are removed as banks expect.",
        "The bank list comes from the public VietQR bank directory.",
      ],
    },
    faqs: [
      {
        question: "Is my bank on the list?",
        answer:
          "The list has every bank the VietQR directory marks as taking transfers. If yours is missing, it may not accept VietQR transfers yet.",
      },
      {
        question: "Can people pay more than once?",
        answer:
          "Yes. A code without an amount works for any number of transfers. With an amount, it's marked for one payment, though banks may still accept it again.",
      },
      {
        question: "Is my account number sent to QRdx?",
        answer:
          "No. The code is made in your browser, and the playground never puts bank details in a link.",
      },
    ],
    related: ["promptpay", "paynow", "upi", "pix"],
  },
  {
    type: "cashapp",
    name: "Cash App",
    group: "payments",
    summary: "Open your $Cashtag so people can pay you.",
    metaDescription:
      "Create a Cash App QR code that opens your $Cashtag page, so people can pay you in a few taps. For tip jars, stalls and splitting bills. Free.",
    intro: [
      "A Cash App QR code opens your $Cashtag page, where people send you money in Cash App. It saves them from spelling your $Cashtag right from a sign.",
      "Type your $Cashtag and QRdx builds the cash.app link. The payer picks the amount in the app, so one printed code works for tips, a market stall or club fees.",
    ],
    steps: [
      "Enter your $Cashtag, with or without the $.",
      "Scan the preview to check it opens your page.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://cash.app/$<cashtag>",
      example: "https://cash.app/$yourcashtag",
      notes: [
        "$Cashtags are up to 20 letters and digits and must include a letter.",
        "The link opens Cash App when it's installed, or your cash.app page in the browser.",
      ],
    },
    faqs: [
      {
        question: "Can I set an amount?",
        answer:
          "No. The code opens your page and the payer enters the amount. For a fixed amount, send a request from Cash App instead.",
      },
      {
        question: "Can I change my $Cashtag later?",
        answer:
          "Cash App limits changes, and a new $Cashtag needs a new code. A dynamic QRdx code lets you change where the code points without reprinting.",
      },
    ],
    related: ["venmo", "paypal", "revolut", "upi"],
  },
  {
    type: "revolut",
    name: "Revolut",
    group: "payments",
    summary: "Open your revolut.me page so people can pay you.",
    metaDescription:
      "Make a Revolut QR code that opens your revolut.me link, so friends and customers can pay you. Type your username and download. Free.",
    intro: [
      "A Revolut QR code opens your revolut.me page, where people can send you money. It suits paying back a shared dinner, a trip kitty or small freelance invoices.",
      "Type your Revolut username (your Revtag) and QRdx builds the revolut.me link. The payer chooses the amount.",
    ],
    steps: [
      "Enter your Revolut username, with or without the @.",
      "Scan the preview to check it opens your revolut.me page.",
      "Download the code.",
    ],
    payload: {
      format: "https://revolut.me/<username>",
      example: "https://revolut.me/yourname",
      notes: [
        "Find your username in the Revolut app under your profile.",
        "The link opens Revolut when it's installed, or revolut.me in the browser.",
      ],
    },
    faqs: [
      {
        question: "Do payers need Revolut?",
        answer:
          "Your revolut.me page tells them which ways to pay are open to them. People with Revolut pay in the app.",
      },
      {
        question: "Can the code include an amount?",
        answer:
          "Not this one. The payer picks the amount on your revolut.me page.",
      },
    ],
    related: ["sepa", "paypal", "cashapp", "venmo"],
  },
  {
    type: "telegram",
    name: "Telegram",
    group: "contact",
    summary: "Open a Telegram chat, channel or group.",
    metaDescription:
      "Create a Telegram QR code for a username, channel, group or phone number, using t.me links. For signs, posters and business cards. Free.",
    intro: [
      "A Telegram QR code opens a chat, channel or group in Telegram. Businesses use it for support chats, creators for their channels and communities for their groups.",
      "Enter a public username and QRdx builds the t.me link, or paste an invite link for a private group. You can also start a chat with a phone number, which opens only if that person lets people find them by number.",
    ],
    steps: [
      "Choose whether the code opens a username, channel or group, or a chat with a phone number.",
      "Enter the username (5 to 32 letters, digits and underscores) or paste a t.me link.",
      "Scan the preview to check the right chat opens.",
      "Download the code as PNG, SVG, WebP, GIF, BMP or ICO.",
    ],
    payload: {
      format: "https://t.me/<username>   or   https://t.me/+<phone number>",
      example: "https://t.me/telegram",
      notes: [
        "t.me links open the Telegram app when it's installed, or a page that offers to open it.",
        "Phone numbers need the country code. Whether the chat opens depends on the person's privacy settings.",
        "Private group invite links (t.me/+…) are kept as pasted.",
      ],
    },
    faqs: [
      {
        question: "Can I link a private group?",
        answer:
          "Yes. Copy the group's invite link in Telegram and paste it. Anyone who scans the code can join, so revoke the link in Telegram if it spreads too far.",
      },
      {
        question: "Why doesn't the phone number open a chat?",
        answer:
          "Telegram opens a chat by number only when that person allows it in Privacy and Security, under Phone Number. A username always works.",
      },
      {
        question: "Is this the QRdx Telegram bot?",
        answer:
          "No. This code opens your own Telegram chat or channel. The QRdx bot is a separate integration that makes codes inside Telegram.",
      },
    ],
    related: ["whatsapp", "signal", "line", "discord"],
  },
  {
    type: "signal",
    name: "Signal",
    group: "contact",
    summary: "Start a Signal chat with a number or username link.",
    metaDescription:
      "Make a Signal QR code that opens a chat with a phone number or your Signal username link. For cards, newsrooms and tip lines. Free.",
    intro: [
      "A Signal QR code opens a chat in Signal, the private messaging app. Journalists use it for tip lines, organizers for group sign-ups, and people on business cards.",
      "With a phone number, QRdx builds a signal.me link. For a username or a group, copy the link from the Signal app and paste it: usernames can't be turned into links outside Signal.",
    ],
    steps: [
      "Choose a phone number, or a username or group link.",
      "Enter the number with its country code, or paste the link from Signal (Settings › Profile › Username › QR code or link).",
      "Scan the preview to check that Signal opens the chat.",
      "Download the code.",
    ],
    payload: {
      format:
        "https://signal.me/#p/+<phone number>   or   https://signal.me/#eu/…",
      example: "https://signal.me/#p/+14155550132",
      notes: [
        "The number sits after the #, a part of the link browsers never send to a server.",
        "A number opens a chat only if its owner lets people find them by number in Signal's privacy settings.",
        "Username links (#eu/…) and group links (signal.group) are kept as pasted.",
      ],
    },
    faqs: [
      {
        question: "Should I share my number or a username?",
        answer:
          "A username link keeps your number private, and you can reset the link in Signal at any time, which stops the old code from working.",
      },
      {
        question: "Does it work without Signal installed?",
        answer:
          "The link opens a signal.me page that offers to install Signal. The chat opens once the app is there.",
      },
    ],
    related: ["telegram", "whatsapp", "sms", "vcard"],
  },
  {
    type: "discord",
    name: "Discord",
    group: "social",
    summary: "Invite people to your Discord server.",
    metaDescription:
      "Create a Discord QR code from a server invite link or code. For streams, events, posters and merch. Make the invite permanent first. Free.",
    intro: [
      "A Discord QR code opens an invite to your server, so people join from a poster, a stream overlay, a sticker or a game box.",
      "Paste an invite link (discord.gg or discord.com/invite) or just its code. Invites expire after 7 days by default, so set Expire after to Never when you create one for print.",
    ],
    steps: [
      "In Discord, open Invite People, choose Edit invite link and set Expire after to Never.",
      "Copy the invite link and paste it here.",
      "Scan the preview to check the invite opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://discord.gg/<invite code>",
      example: "https://discord.gg/yourserver",
      notes: [
        "QRdx writes every invite as a discord.gg link, the shortest form, which makes a less dense code.",
        "Servers with a vanity URL can use it as the code.",
        "An expired or deleted invite stops working, and the code with it.",
      ],
    },
    faqs: [
      {
        question: "Why did my Discord QR code stop working?",
        answer:
          "The invite probably expired or reached its use limit. Create one that never expires, then make a new code, or use a dynamic QRdx code you can repoint.",
      },
      {
        question: "Is this the QRdx Discord bot?",
        answer:
          "No. This code opens an invite to your own server. The QRdx bot is a separate integration that makes codes inside Discord.",
      },
    ],
    related: ["twitch", "telegram", "youtube", "reddit"],
  },
  {
    type: "line",
    name: "LINE",
    group: "contact",
    summary: "Add you as a friend on LINE.",
    metaDescription:
      "Make a LINE QR code that adds you or your official account as a friend, from a LINE ID or link. For shops, menus and cards. Free.",
    intro: [
      "A LINE QR code opens LINE and offers to add you as a friend. Shops and restaurants in Japan, Thailand and Taiwan use it for their official accounts, and people put it on cards.",
      "Enter your LINE ID, or an official account's ID starting with @. You can also paste a line.me or lin.ee link from the app.",
    ],
    steps: [
      "Enter your LINE ID. Official accounts start with @.",
      "For a personal ID, check that Allow others to add me by ID is on in LINE's privacy settings.",
      "Scan the preview to check LINE opens your profile.",
      "Download the code.",
    ],
    payload: {
      format:
        "https://line.me/ti/p/~<LINE ID>   or   https://line.me/R/ti/p/@<official ID>",
      example: "https://line.me/R/ti/p/@yourshop",
      notes: [
        "LINE IDs are letters, digits, dots, dashes and underscores.",
        "Pasted line.me and lin.ee links are kept as they are.",
      ],
    },
    faqs: [
      {
        question: "Why does the code say the user can't be found?",
        answer:
          "Personal IDs work only when the owner allows people to add them by ID. Turn it on in LINE under Settings › Privacy.",
      },
      {
        question: "Can I use the QR code LINE gives me?",
        answer:
          "Yes. Copy the link behind it in LINE and paste it here to restyle it with your colors and logo.",
      },
    ],
    related: ["telegram", "whatsapp", "signal", "instagram"],
  },
  {
    type: "bluesky",
    name: "Bluesky",
    group: "social",
    summary: "Open a Bluesky profile.",
    metaDescription:
      "Create a Bluesky QR code for your handle, including custom domain handles. Opens your bsky.app profile. For talks, cards and posters. Free.",
    intro: [
      "A Bluesky QR code opens your profile so people can follow you from a slide, a badge or a poster.",
      "Type your handle, such as yourname.bsky.social or your own domain, and QRdx builds the bsky.app profile link. A bare name gets .bsky.social added.",
    ],
    steps: [
      "Enter your handle, with or without the @.",
      "Scan the preview to check your profile opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://bsky.app/profile/<handle>",
      example: "https://bsky.app/profile/bsky.app",
      notes: [
        "Handles are domain names, so they're written in lower case.",
        "A profile link with a DID (did:plc:…) also works, and keeps working if you change your handle.",
      ],
    },
    faqs: [
      {
        question: "What happens if I change my handle?",
        answer:
          "A code with the old handle stops finding you. Use your DID in the code, or a dynamic QRdx code you can repoint.",
      },
      {
        question: "Does it open the Bluesky app?",
        answer:
          "bsky.app links open the app when it's installed, or the profile in the browser.",
      },
    ],
    related: ["mastodon", "threads", "twitter", "linkedin"],
  },
  {
    type: "mastodon",
    name: "Mastodon",
    group: "social",
    summary: "Open a Mastodon profile on its server.",
    metaDescription:
      "Make a Mastodon QR code from your full handle, like @you@mastodon.social. Opens your profile on your server. For talks and cards. Free.",
    intro: [
      "A Mastodon QR code opens your profile on your server, where people can follow you from their own account, on any server.",
      "Enter your full handle with the server, such as @you@mastodon.social, or paste your profile link. QRdx builds the profile address from it.",
    ],
    steps: [
      "Enter your handle, server included.",
      "Scan the preview to check your profile opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://<server>/@<username>",
      example: "https://mastodon.social/@Mastodon",
      notes: [
        "A handle without its server can't be found, because the same name can exist on many servers.",
        "Other fediverse servers that use /@username profile links work the same way.",
      ],
    },
    faqs: [
      {
        question: "How do people follow me from another server?",
        answer:
          "Your profile page has a Follow button that asks for their own server and sends them there to confirm.",
      },
      {
        question: "What if I move to another server?",
        answer:
          "Mastodon can redirect your old profile, but print a new code for the new server, or use a dynamic QRdx code you can repoint.",
      },
    ],
    related: ["bluesky", "threads", "twitter", "reddit"],
  },
  {
    type: "twitch",
    name: "Twitch",
    group: "social",
    summary: "Open a Twitch channel.",
    metaDescription:
      "Create a Twitch QR code that opens your channel. For stream overlays, merch, posters and event badges. Type your username. Free.",
    intro: [
      "A Twitch QR code opens your channel so people can follow and watch live. Streamers put it on overlays, merch, posters and convention badges.",
      "Type your Twitch username, or paste your channel link, and QRdx builds the twitch.tv address.",
    ],
    steps: [
      "Enter your Twitch username.",
      "Scan the preview to check your channel opens.",
      "Download the code, as SVG for merch and print.",
    ],
    payload: {
      format: "https://www.twitch.tv/<username>",
      example: "https://www.twitch.tv/twitch",
      notes: [
        "Twitch usernames are 4 to 25 letters, digits and underscores.",
        "The link opens the Twitch app when it's installed.",
      ],
    },
    faqs: [
      {
        question: "Can the code open a specific stream or clip?",
        answer:
          "This one opens your channel. For a clip or video, paste its link into the URL generator.",
      },
      {
        question: "Will a code on a stream overlay scan?",
        answer:
          "Yes, if it's big enough on screen. Test it from a phone at viewing distance before you go live.",
      },
    ],
    related: ["youtube", "discord", "tiktok", "instagram"],
  },
  {
    type: "soundcloud",
    name: "SoundCloud",
    group: "music",
    summary: "Play a SoundCloud profile, track or playlist.",
    metaDescription:
      "Make a SoundCloud QR code for your profile, a track or a playlist. For flyers, merch, demo CDs and gig posters. Free, no signup.",
    intro: [
      "A SoundCloud QR code opens your profile, a track or a playlist, so people can listen from a gig poster, a flyer or a merch tag.",
      "Type your profile name and QRdx builds the link, or paste a track or playlist link to open it directly.",
    ],
    steps: [
      "Enter your SoundCloud profile name, or paste a track or playlist link.",
      "Scan the preview to check it opens and plays.",
      "Download the code.",
    ],
    payload: {
      format: "https://soundcloud.com/<profile>[/<track>]",
      example: "https://soundcloud.com/soundcloud",
      notes: [
        "Profile names are 3 to 25 letters, digits, underscores and dashes.",
        "Pasted soundcloud.com and on.soundcloud.com links are kept as they are.",
      ],
    },
    faqs: [
      {
        question: "Can I link a private track?",
        answer:
          "Yes, with its secret link. Anyone who scans the code can listen, so share it only where you mean to.",
      },
      {
        question: "Does it open the SoundCloud app?",
        answer:
          "SoundCloud links open the app when it's installed, or the page in the browser.",
      },
    ],
    related: ["spotify", "bandcamp", "apple-music", "youtube"],
  },
  {
    type: "zoom",
    name: "Zoom",
    group: "business",
    summary: "Join a Zoom meeting with one scan.",
    metaDescription:
      "Create a Zoom QR code from a meeting ID or invite link. People join from slides, room signs and printed agendas. Keep the passcode. Free.",
    intro: [
      "A Zoom QR code opens a meeting in Zoom, so people join from a slide, a room sign or a printed agenda without typing an 11-digit ID.",
      "Paste the meeting's invite link to keep its passcode, or type just the meeting ID, and Zoom asks for the passcode when people join.",
    ],
    steps: [
      "Copy the invite link in Zoom (Copy invitation, or the link in the calendar event).",
      "Paste it here, or type the meeting ID.",
      "Scan the preview to check the meeting opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://zoom.us/j/<meeting ID>[?pwd=…]",
      example: "https://zoom.us/j/12345678901",
      notes: [
        "An invite link's pwd value is an encoded passcode Zoom generates. QRdx keeps it as pasted; it can't build one from the passcode.",
        "Personal meeting links (zoom.us/my/…) and webinar links work too.",
      ],
    },
    faqs: [
      {
        question: "Can I use one code for a recurring meeting?",
        answer:
          "Yes. Recurring meetings and personal meeting rooms keep their ID, so the code keeps working.",
      },
      {
        question: "Can strangers join with the code?",
        answer:
          "Anyone who scans it can try. Turn on the waiting room in Zoom if the meeting is private.",
      },
    ],
    related: ["google-meet", "calcom", "attendance", "email"],
  },
  {
    type: "google-meet",
    name: "Google Meet",
    group: "business",
    summary: "Join a Google Meet call with one scan.",
    metaDescription:
      "Make a Google Meet QR code from a meeting code or link. People join from room signs, slides and handouts. Free, no signup.",
    intro: [
      "A Google Meet QR code opens a call in Meet, so people join from a meeting room sign, a slide or a class handout.",
      "Paste the meeting link or type its code (three letters, four, then three, like abc-defg-hij), and QRdx builds the meet.google.com link.",
    ],
    steps: [
      "Copy the meeting link from Google Calendar or Meet.",
      "Paste it here, or type the code.",
      "Scan the preview to check the call opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://meet.google.com/<abc-defg-hij>",
      example: "https://meet.google.com/abc-defg-hij",
      notes: [
        "Meeting codes are 10 letters; QRdx adds the dashes if you leave them out.",
        "Whether people join right away or wait to be let in depends on the meeting's settings in Google.",
      ],
    },
    faqs: [
      {
        question: "Does a Meet code expire?",
        answer:
          "Codes from calendar events and recurring meetings last as long as the meeting. Instant meetings can expire when they end, so make the code from a scheduled one.",
      },
      {
        question: "Do people need a Google account?",
        answer:
          "That depends on the host's Workspace settings. Many meetings let guests ask to join without signing in.",
      },
    ],
    related: ["zoom", "calcom", "attendance", "email"],
  },
  {
    type: "waze",
    name: "Waze",
    group: "business",
    summary: "Open directions to a place in Waze.",
    metaDescription:
      "Create a Waze QR code that starts directions to an address or coordinates. For shop windows, event signs and delivery notes. Free.",
    intro: [
      "A Waze QR code opens directions in Waze to your shop, venue, parking entrance or loading dock. It suits places that are easy to miss in a maps search.",
      "Enter an address or coordinates. With directions on, Waze starts navigating when the code is scanned; without, it shows the place first.",
    ],
    steps: [
      "Enter the address, or coordinates as latitude, longitude for an exact spot.",
      "Choose whether directions start right away.",
      "Scan the preview to check Waze finds the place.",
      "Download the code.",
    ],
    payload: {
      format:
        "https://waze.com/ul?ll=<lat>,<long>&navigate=yes   or   https://waze.com/ul?q=<address>",
      example: "https://waze.com/ul?ll=48.8584,2.2945&navigate=yes",
      notes: [
        "Coordinates point at the exact spot, which is best for gates and car park entrances. An address is searched in Waze.",
        "The link opens Waze when it's installed, or waze.com in the browser.",
      ],
    },
    faqs: [
      {
        question: "Waze or Google Maps?",
        answer:
          "Waze suits drivers. For walkers or a general audience, the Location generator opens Google Maps.",
      },
      {
        question: "How do I get coordinates?",
        answer:
          "In Google Maps or Waze, press and hold the spot and copy the numbers shown.",
      },
    ],
    related: ["maps", "google-review", "calcom", "vcard"],
  },
  {
    type: "litecoin",
    name: "Litecoin",
    group: "payments",
    summary: "Receive Litecoin with an optional amount.",
    metaDescription:
      "Make a Litecoin QR code (litecoin: URI) with your wallet address and an optional amount, label and message. Made in your browser. Free.",
    intro: [
      "A Litecoin QR code holds a payment request: your wallet address and, if you like, an amount in LTC and a note. Wallets fill in the payment when they scan it.",
      "QRdx writes the litecoin: URI in the same form as Bitcoin's BIP-21, which Litecoin wallets read. It's made in your browser, and the address never leaves it.",
    ],
    steps: [
      "Copy a receiving address from your Litecoin wallet and paste it.",
      "Optionally add an amount in LTC, a label and a message.",
      "Scan the preview with your wallet and check every character of the address.",
      "Download the code.",
    ],
    payload: {
      format: "litecoin:<address>?amount=<LTC>&label=<label>&message=<message>",
      example:
        "litecoin:ltc1qexampleexampleexampleexampleexample0?amount=0.25&label=Bloom%20Cafe",
      notes: [
        "Amounts are in LTC with up to 8 decimals.",
        "QRdx checks the address's shape (ltc1, L, M or 3) but not its checksum. Your wallet does that when it scans.",
      ],
    },
    faqs: [
      {
        question: "Can a payment be reversed?",
        answer:
          "No. Crypto payments are final, so check the address before you print.",
      },
      {
        question: "Can I reuse the code?",
        answer:
          "Yes. A code without an amount can be paid any number of times. Some wallets give you a new address for privacy; reuse is your choice.",
      },
    ],
    related: ["bitcoin", "dogecoin", "bitcoincash", "ethereum"],
    details: {
      title: "Which Litecoin addresses work",
      paragraphs: [
        "Addresses starting with L (legacy), M (P2SH), 3 (older P2SH) and ltc1 (SegWit) are accepted. M and 3 are the same kind of address: Litecoin moved P2SH addresses from 3 to M so they aren't mistaken for Bitcoin addresses, and some older wallets still show 3.",
        "MWEB addresses (starting with ltcmweb1), used for Litecoin's private payments, aren't accepted here. Use one of your wallet's regular receiving addresses for a printed code.",
      ],
    },
  },
  {
    type: "dogecoin",
    name: "Dogecoin",
    group: "payments",
    summary: "Receive Dogecoin with an optional amount.",
    metaDescription:
      "Create a Dogecoin QR code (dogecoin: URI) with your wallet address and an optional amount. For tip jars and stalls. Free.",
    intro: [
      "A Dogecoin QR code holds a payment request with your wallet address and, if you like, an amount in DOGE. It's popular for tip jars and small stalls.",
      "QRdx writes the dogecoin: URI that Dogecoin wallets read, in the browser, so the address stays with you.",
    ],
    steps: [
      "Paste a receiving address from your Dogecoin wallet.",
      "Optionally add an amount, a label and a message.",
      "Scan the preview with a wallet to check the address.",
      "Download the code.",
    ],
    payload: {
      format:
        "dogecoin:<address>?amount=<DOGE>&label=<label>&message=<message>",
      example: "dogecoin:DTestDemoWa11etTestDemoWa11etTestD?amount=42",
      notes: [
        "Amounts are in DOGE with up to 8 decimals.",
        "QRdx checks the address's shape (it starts with D, A or 9) but not its checksum.",
      ],
    },
    faqs: [
      {
        question: "Can I take back a payment sent to the wrong address?",
        answer:
          "No. Crypto payments are final, so check the address before you print.",
      },
    ],
    related: ["litecoin", "bitcoin", "solana", "ethereum"],
    details: {
      title: "Which Dogecoin addresses work",
      paragraphs: [
        "Standard Dogecoin addresses start with D, and multisig (P2SH) addresses with A or 9; the generator accepts these. Testnet addresses, which start with n or 2, are rejected, so a test address can't end up on a printed sign by mistake.",
        "For a tip jar, leave the amount empty: each person types what they want to give, and one printed code takes any number of payments.",
      ],
    },
  },
  {
    type: "bitcoincash",
    name: "Bitcoin Cash",
    group: "payments",
    summary: "Receive Bitcoin Cash with an optional amount.",
    metaDescription:
      "Make a Bitcoin Cash QR code (bitcoincash: URI) with your CashAddr address and an optional amount. Made in your browser. Free.",
    intro: [
      "A Bitcoin Cash QR code holds a payment request: your address and, if you like, an amount in BCH and a note.",
      "QRdx writes the bitcoincash: URI with your CashAddr address (starting with q or p), which Bitcoin Cash wallets read.",
    ],
    steps: [
      "Paste a receiving address from your Bitcoin Cash wallet, with or without bitcoincash:.",
      "Optionally add an amount, a label and a message.",
      "Scan the preview with your wallet to check the address.",
      "Download the code.",
    ],
    payload: {
      format:
        "bitcoincash:<address>?amount=<BCH>&label=<label>&message=<message>",
      example:
        "bitcoincash:qexampleexampleexampleexampleexampleexampl?amount=0.1",
      notes: [
        "Amounts are in BCH with up to 8 decimals.",
        "Legacy addresses starting with 1 or 3 are accepted too, but CashAddr avoids mixing them up with Bitcoin addresses.",
      ],
    },
    faqs: [
      {
        question: "Is this the same as a Bitcoin code?",
        answer:
          "No. Bitcoin Cash is a separate coin with its own wallets. For bitcoin, use the Bitcoin generator.",
      },
    ],
    related: ["bitcoin", "litecoin", "dogecoin", "ethereum"],
    details: {
      title: "CashAddr, legacy and token addresses",
      paragraphs: [
        "Paste the address with or without its bitcoincash: prefix. The generator removes a pasted prefix and writes it once, as the start of the URI.",
        "Token-aware addresses (starting with z or r), used for CashTokens, aren't accepted. Use your wallet's regular q address for BCH payments.",
        "Legacy addresses starting with 1 or 3 look exactly like Bitcoin addresses, which makes it easy to send coins from the wrong network. Prefer CashAddr on anything you print.",
      ],
    },
  },
  {
    type: "solana",
    name: "Solana",
    group: "payments",
    summary: "Receive SOL, USDC or USDT with a Solana Pay request.",
    metaDescription:
      "Create a Solana Pay QR code for SOL, USDC or USDT to your wallet, with an optional amount, label and message, in the transfer request format. Free.",
    intro: [
      "A Solana QR code holds a Solana Pay transfer request: your wallet address and, if you like, an amount, a label and a message. It can ask for SOL, or for USDC or USDT with the mints Circle and Tether list. Wallets that support Solana Pay fill in the payment.",
      "QRdx writes the solana: URI from the Solana Pay specification, in your browser.",
    ],
    steps: [
      "Paste your Solana wallet address.",
      "Pick SOL, USDC or USDT, and optionally add an amount, a label and a message.",
      "Scan the preview with a Solana Pay wallet to check it.",
      "Download the code.",
    ],
    payload: {
      format:
        "solana:<address>?amount=<amount>&spl-token=<mint>&label=<label>&message=<message>",
      example:
        "solana:mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN?amount=0.01&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      notes: [
        "Amounts are in SOL with up to 9 decimals, or in USDC or USDT with up to 6.",
        "spl-token names the token's mint, as Circle and Tether list them: USDC is EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v and USDT is Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB. Without spl-token the code requests SOL.",
      ],
    },
    faqs: [
      {
        question: "Which wallets read Solana Pay codes?",
        answer:
          "Most mobile Solana wallets scan them. Test with the wallets your customers use.",
      },
      {
        question: "Can I request USDC or USDT?",
        answer:
          "Yes. Pick one and the code adds Solana Pay's spl-token with the mint Circle or Tether lists, and the amount is in that token.",
      },
    ],
    related: ["ethereum", "bitcoin", "litecoin", "monero"],
    details: {
      title: "What this Solana Pay code includes",
      paragraphs: [
        "It's a Solana Pay transfer request: the recipient, an amount, spl-token for USDC or USDT, a label and a message. Solana Pay also defines reference for matching a payment to an order; this generator doesn't add it, so use your point-of-sale tool when you need it.",
        "Solana Pay transaction requests, where the code holds a link to your server and the server builds the transaction, aren't made here either.",
      ],
    },
  },
  {
    type: "monero",
    name: "Monero",
    group: "payments",
    summary: "Receive Monero with an optional amount.",
    metaDescription:
      "Make a Monero QR code (monero: URI) with your address and an optional amount, recipient name and description. Made in your browser. Free.",
    intro: [
      "A Monero QR code holds a payment request: your address and, if you like, an amount in XMR, your name and a description.",
      "QRdx writes the monero: URI that Monero wallets read, in your browser. Monero addresses are 95 characters long, so the code is denser than most; print it a little larger.",
    ],
    steps: [
      "Paste a receiving address or subaddress from your Monero wallet.",
      "Optionally add an amount, a recipient name and a description.",
      "Scan the preview with your wallet to check the address.",
      "Download the code.",
    ],
    payload: {
      format:
        "monero:<address>?tx_amount=<XMR>&recipient_name=<name>&tx_description=<text>",
      example:
        "monero:4DemoWa11etAddressForTheQRdxExamp1eDemoWa11etAddressForTheQRdxExamp1eDemoWa11etAddressForTheQRd?tx_amount=0.1&recipient_name=Bloom%20Cafe",
      notes: [
        "Amounts are in XMR with up to 12 decimals.",
        "Standard addresses start with 4, subaddresses with 8; integrated addresses are 106 characters.",
      ],
    },
    faqs: [
      {
        question: "Should I use a subaddress?",
        answer:
          "Many wallets suggest a new subaddress for each code you publish, so payments to different codes aren't linked.",
      },
    ],
    related: ["bitcoin", "litecoin", "solana", "ethereum"],
    details: {
      title: "Standard address, subaddress or integrated address",
      paragraphs: [
        "Standard addresses start with 4 and are 95 characters long, subaddresses start with 8, and integrated addresses start with 4 and are 106 characters because they carry a payment ID. The generator accepts all three.",
        "Separate payment IDs are deprecated in Monero, so the generator doesn't add one. Use a subaddress for each customer or code, or the integrated address an exchange or shop gives you.",
      ],
    },
  },
  // ─── Added 2026-11-22 (payments) ──────────────────────────────────────────
  {
    type: "mecard",
    name: "MeCard",
    group: "contact",
    summary: "Share a contact in a smaller code than a vCard.",
    metaDescription:
      "Make a MeCard QR code: name, phone, email, website, address, birthday and a note in the compact MECARD format, so the code stays small. Free.",
    intro: [
      "A MeCard QR code holds a contact in one short line of text: your name, phone number, email, website, address, birthday and a note. Phones that read it offer to save the contact, the same way a vCard code works.",
      "The format comes from NTT Docomo and needs fewer characters than a vCard for the same details, so the code has fewer, larger modules and scans from further away. Android phones read it; Apple doesn't document MeCard for the iPhone Camera, so test with an iPhone, or use a vCard when the contact has to reach everyone.",
    ],
    steps: [
      "Enter your first name, and your last name if you want it saved.",
      "Add the details people need: a phone number, an email, a website or an address.",
      "Scan the preview with an Android phone and an iPhone to see that both offer to save it.",
      "Download the code for a badge, a card or a flyer.",
    ],
    payload: {
      format:
        "MECARD:N:<last>,<first>;TEL:<phone>;EMAIL:<email>;BDAY:<YYYYMMDD>;ADR:<address>;URL:<website>;NOTE:<note>;;",
      example:
        "MECARD:N:Sample,Sam;TEL:+12025550142;EMAIL:sam@example.com;URL:https\\://example.com;;",
      notes: [
        "Each field is NAME:value and ends with a semicolon; the record ends with two.",
        "The name is written last name, a comma, then first name.",
        "The characters \\ ; : and , inside a value are escaped with a backslash, as the format asks, so a web address is written https\\://.",
        "The birthday is 8 digits: year, month and day. SOUND holds how the name is read (kana for a Japanese name) and NICKNAME a familiar name.",
      ],
    },
    faqs: [
      {
        question: "MeCard or vCard?",
        answer:
          "A vCard can hold more (a company, a job title, several numbers) and is the format every phone documents. A MeCard holds the basics in fewer characters, so the code is smaller. Use MeCard when the code has to be small and most people scanning it use Android.",
      },
      {
        question: "Does the iPhone camera read MeCard codes?",
        answer:
          "Apple doesn't document which contact formats the Camera app reads. Scan the preview with an iPhone before you print, and switch to a vCard if it shows the text instead of offering to save the contact.",
      },
      {
        question: "Is my contact sent to QRdx?",
        answer:
          "No. The code is made in your browser, and the details you type are remembered only in this browser.",
      },
    ],
    related: ["vcard", "phone", "email", "sms"],
  },
  {
    type: "swiss-qr-bill",
    name: "Swiss QR-bill",
    group: "payments",
    summary: "Make the payment code of a Swiss QR-bill, with the Swiss cross.",
    metaDescription:
      "Create the Swiss QR Code of a QR-bill: IBAN or QR-IBAN, address, amount in CHF or EUR, QR or RF reference with check digits, and the Swiss cross. Free.",
    intro: [
      "A Swiss QR-bill carries its payment details in a QR code with a Swiss cross in the middle: your IBAN or QR-IBAN, your name and address, the amount and the reference. The person paying scans it with the QR scanner in their Swiss or Liechtenstein banking app, checks the payment and confirms it.",
      "QRdx writes the code to SIX's Swiss Implementation Guidelines for the QR-bill: the Swiss Payments Code version 0200, a structured address, and a QR reference or RF creditor reference with its check digits checked. It draws the code at error correction level M with the 7 mm Swiss cross on top, as the guidelines ask. This is the code for the payment part; the receipt and the rest of the printed bill are up to your invoicing.",
    ],
    steps: [
      "Enter your IBAN or QR-IBAN and your name and address as they appear on the account.",
      "Choose francs or euros and, if you like, an amount.",
      "With a QR-IBAN, add the 27-digit QR reference from your invoicing; with an IBAN, an RF creditor reference or none.",
      "Scan the preview with your banking app, then print the code at least 46 × 46 mm, black on white.",
    ],
    payload: {
      format:
        "SPC\n0200\n1\n<IBAN>\nS\n<name>\n<street>\n<number>\n<postcode>\n<town>\n<country>\n(7 empty lines)\n<amount>\n<CHF|EUR>\n(payer: S and 6 lines, or 7 empty)\n<QRR|SCOR|NON>\n<reference>\n<message>\nEPD",
      example:
        "SPC\n0200\n1\nCH4431999123000889012\nS\nRobert Schneider AG\nRue du Lac\n1268\n2501\nBiel\nCH\n\n\n\n\n\n\n\n1949.75\nCHF\n\n\n\n\n\n\n\nQRR\n210000000003139471430009017\nOrder of 15 June 2026\nEPD",
      notes: [
        "Every line up to EPD is written, empty ones included, and nothing follows the last line. QRdx joins the lines with line feeds, which the guidelines allow.",
        "A QR-IBAN (institution ID 30000 to 31999) always takes a 27-digit QR reference, checked with its modulo 10 recursive check digit, and francs only. An IBAN takes an RF creditor reference (ISO 11649) or no reference.",
        "Amounts are written with two decimals, from 0.01 to 999,999,999.99. Leave the amount empty and the payer enters it.",
        "Text uses the Latin character set the guidelines list. Curly quotes and dashes are written as plain ones; anything else outside the set is refused.",
        "The code holds at most 997 bytes and is drawn at error correction M with the Swiss cross at 7/46 of its width.",
      ],
    },
    faqs: [
      {
        question: "Which apps read a Swiss QR-bill code?",
        answer:
          "Swiss and Liechtenstein banking apps and e-banking scan it with their QR scanner, depending on the bank. A phone's camera app only shows the text, because the code holds payment data, not a link.",
      },
      {
        question: "QR-IBAN or IBAN?",
        answer:
          "A QR-IBAN comes with a QR reference that your bank uses to match payments to invoices automatically. A normal IBAN works with an RF creditor reference or none. Your bank tells you which one your account has.",
      },
      {
        question: "Can I change the colours?",
        answer:
          "The guidelines describe the Swiss QR Code in black and white with the Swiss cross, at 46 × 46 mm. Keep it that way on bills you send, so every banking app reads it.",
      },
      {
        question: "Is my IBAN sent to QRdx?",
        answer:
          "No. The code is made in your browser, and the playground never puts payment details in a link.",
      },
    ],
    related: ["sepa", "czech-spd", "pix", "vcard"],
  },
  {
    type: "czech-spd",
    name: "QR Platba",
    group: "payments",
    summary: "Fill in a Czech bank transfer with account, amount and symbols.",
    metaDescription:
      "Create a QR Platba code for Czech bank transfers: IBAN or account number, amount in CZK, message and variable symbol, to ČBA standard no. 26. Free.",
    intro: [
      "A QR Platba code fills in a Czech bank transfer for the person paying: your account, the amount in koruna, a message and the variable symbol. They scan it with the QR scanner in their banking app, check the payment and confirm it, so nobody retypes an account number from an invoice.",
      "The format is the Short Payment Descriptor from the Czech Banking Association's standard no. 26 (ČBA, version 1.2), and most banks on the Czech market offer QR Platba in their apps. A phone's camera app only shows the text. Slovakia uses a different format, PAY by square, which QRdx doesn't make.",
    ],
    steps: [
      "Enter your Czech IBAN, or a domestic account number like 19-2000145399/0800, which QRdx checks and turns into the IBAN.",
      "Optionally add an amount in CZK, a message and a variable symbol such as an invoice number.",
      "Add a due date, a specific or constant symbol, or ask for an instant payment, if you need them.",
      "Use error correction level M for print, as the standard asks, and scan the preview with a Czech banking app.",
    ],
    payload: {
      format:
        "SPD*1.0*ACC:<IBAN>[+<BIC>]*AM:<amount>*CC:CZK*RN:<name>*DT:<YYYYMMDD>*PT:IP*MSG:<message>*X-VS:<variable symbol>*X-SS:<specific symbol>*X-KS:<constant symbol>",
      example:
        "SPD*1.0*ACC:CZ9106000000000000000123*AM:450.00*CC:CZK*MSG:PLATBA ZA ZBOZI*X-VS:1234567890",
      notes: [
        "Each field is KEY:value and the fields are separated by *. Only the account is required, and QRdx leaves empty fields out.",
        "Amounts are in CZK with two decimals, up to 9,999,999.99. Messages are up to 60 characters and names up to 35.",
        "Variable, specific and constant symbols are up to 10 digits each, and leading zeros are kept.",
        "Text is written in upper case without diacritics, the way the standard's reference generator does by default, so the code stays compact (QR alphanumeric mode) and every bank reads it. A * inside a value is written %2A.",
        "PT:IP asks for an instant payment, for banks that support it.",
      ],
    },
    faqs: [
      {
        question: "Which apps read QR Platba codes?",
        answer:
          "The QR scanners in Czech banking apps; most banks on the Czech market offer QR Platba. A phone's camera app only shows the text, because the code holds payment details, not a link.",
      },
      {
        question: "Why is my message in capital letters?",
        answer:
          "QRdx writes text in upper case without diacritics, as the standard's reference generator does by default. The code stays smaller and every bank reads it.",
      },
      {
        question: "Does it work for payments in Slovakia?",
        answer:
          "No. Slovak banks use a different format, PAY by square, which QRdx doesn't make.",
      },
      {
        question: "Is my account number sent to QRdx?",
        answer:
          "No. The code is made in your browser, and the playground never puts bank details in a link.",
      },
    ],
    related: ["sepa", "swiss-qr-bill", "pix", "vcard"],
    details: {
      title: "Account numbers and check digits",
      paragraphs: [
        "A domestic account number has an optional prefix, the number and the four-digit bank code, as in 19-2000145399/0800. QRdx checks the prefix and the number with their mod 11 check, turns them into the IBAN and checks its check digits, so a mistyped account is caught before you print.",
        "A Czech IBAN is checked with its check digits and written as typed. Add the BIC only if your bank asks for it; it follows the IBAN after a +.",
      ],
    },
  },
  {
    type: "swish",
    name: "Swish",
    group: "payments",
    summary: "Get paid with Swish to a mobile or business number.",
    metaDescription:
      "Make a Swish QR code for a Swedish mobile or 123 business number, with an optional amount and message you can lock or let the payer change. Free.",
    intro: [
      "A Swish QR code opens a payment in the Swish app with your number filled in, and an amount and a message if you add them. It's a link, so a phone's camera opens the Swish app, and the scanner inside Swish reads it too.",
      "QRdx writes the link in the format Swish's developer documentation describes. It takes a Swedish mobile number or a 10-digit business number starting with 123. An amount or message in the code is locked unless you let the payer change it.",
    ],
    steps: [
      "Enter your Swish number: a Swedish mobile like 070 123 45 67, or your 123 business number.",
      "Optionally add an amount from 1 to 150,000 kronor and a message of up to 50 characters.",
      "Choose whether the payer may change the amount or the message.",
      "Scan the preview with your phone's camera to check that Swish opens with the right details, then download the code.",
    ],
    payload: {
      format:
        "https://app.swish.nu/1/p/sw/?sw=<number>[&amt=<amount>][&msg=<message>][&edit=amt|msg|amt,msg]",
      example:
        "https://app.swish.nu/1/p/sw/?sw=1231181189&amt=100&msg=Fika%20for%20two&edit=amt",
      notes: [
        'The format is from Swish\'s developer documentation, "Create QR code from specification".',
        "A mobile number is written 46 and 9 digits, so 070 123 45 67 becomes 46701234567. Business numbers are 10 digits starting with 123.",
        "Amounts are in kronor, 1 to 150,000 with up to 2 decimals, the range Swish's own generator takes. Messages are up to 50 characters and percent-encoded.",
        "edit lists what the payer may change: amt, msg or both. An amount or message that isn't listed is locked.",
      ],
    },
    faqs: [
      {
        question: "Does the phone camera open Swish?",
        answer:
          "Yes. The code is a link on app.swish.nu, the Swish app's verified link domain on iOS and Android, so the camera opens the app. The scanner in the Swish app reads it too.",
      },
      {
        question: "Can I put the Swish symbol in the middle?",
        answer:
          "Swish's guidelines ask for the code in black and white with the Swish symbol in the centre on a white circle, 25% of the code's width. QRdx doesn't add the symbol; if you want it, take it from Swish's marketing toolbox and add it as the code's logo.",
      },
      {
        question: "Is my Swish number sent to QRdx?",
        answer:
          "No. The code is made in your browser, and the playground never puts payment details in a link.",
      },
    ],
    related: ["revolut", "paypal", "sepa", "vcard"],
  },
  {
    type: "khqr",
    name: "KHQR",
    group: "payments",
    summary: "Get paid in riel or dollars from Cambodian banking apps.",
    metaDescription:
      "Make a KHQR code for a Bakong account in riel or US dollars, with an optional amount, expiry day and bill number. National Bank of Cambodia format. Free.",
    intro: [
      "A KHQR code lets people in Cambodia pay you from their banking app. It holds your Bakong account ID, your name and city, and the currency, riel or US dollars. KHQR is the National Bank of Cambodia's payment code on Bakong, and Cambodian banking apps that accept KHQR scan it.",
      "Leave the amount empty for a static code anyone can pay any amount, which you can print once and keep. With an amount it becomes a dynamic KHQR, which Bakong requires to carry a creation time and an expiry, so QRdx asks for an expiry day and the code stops working after it.",
    ],
    steps: [
      "Copy your Bakong account ID (name@bank) from your bank app or the Bakong app and paste it in.",
      "Enter the name payers should see and your city, and pick KHR or USD.",
      "Optionally add an amount with an expiry day, a bill number or a mobile number.",
      "Scan the preview with a banking app that accepts KHQR, then download the code.",
    ],
    payload: {
      format:
        "000201 010211 29[00 <Bakong ID>] 52 5999 53 <116|840> [54 <amount>] 58 KH 59 <name> 60 <city> [62 …] [99 …] 6304<CRC>",
      example:
        "00020101021129180014jonhsmith@nbcq5204599953031165802KH5910Jonh Smith6010Phnom Penh6304856B",
      notes: [
        "Tag 29 holds the person's own Bakong account ID, up to 32 characters. The merchant category is 5999 and the country KH.",
        "Currency 116 is riel and 840 is US dollars. Riel amounts are whole numbers; dollar amounts have up to 2 decimals.",
        "Names are up to 25 characters and cities up to 15; the city is Phnom Penh unless you change it. Tag 62 holds the bill number and mobile number.",
        "A code with an amount carries its creation time and expiry in tag 99. The checksum is CRC16-CCITT over the whole payload, as in every EMV payment code.",
      ],
    },
    faqs: [
      {
        question: "Why does a code with an amount expire?",
        answer:
          "Bakong requires a KHQR with an amount to carry a creation time and an expiry, so the code stops working after the day you pick. For a sign you print once, leave the amount empty.",
      },
      {
        question: "Where do I find my Bakong account ID?",
        answer:
          "In your bank app or the Bakong app; it looks like name@bank. QRdx can't check that an ID exists, so copy it rather than typing it, and scan the preview with a banking app before you print.",
      },
      {
        question: "Is my account sent to QRdx?",
        answer:
          "No. The code is made in your browser, and the playground never puts payment details in a link.",
      },
    ],
    related: ["promptpay", "vietqr", "paynow", "upi"],
  },
  {
    type: "lightning",
    name: "Lightning",
    group: "payments",
    summary: "Share a Lightning invoice, LNURL or Lightning Address.",
    metaDescription:
      "Make a Lightning QR code from a BOLT 11 invoice, an LNURL or a Lightning Address. Invoices are checked; an address becomes its LNURL-pay code. Free.",
    intro: [
      "A Lightning QR code lets a Bitcoin Lightning wallet pay you. Paste one of three things: a BOLT 11 invoice from your wallet (lnbc…), an LNURL (lnurl1…), or a Lightning Address such as name@domain.com.",
      "An invoice can be paid once and expires, after an hour by BOLT 11's default, so a printed invoice code goes stale. For a sign, a sticker or anything else you print, use an LNURL or a Lightning Address: QRdx turns an address into its LNURL-pay, which wallets that support LNURL-pay scan.",
    ],
    steps: [
      "Copy an invoice, an LNURL or your Lightning Address from your wallet and paste it in.",
      "QRdx checks an invoice's or LNURL's checksum; only mainnet invoices (lnbc…) are accepted.",
      "Scan the preview with the wallet that will pay to check it.",
      "Download the code, and print a Lightning Address as text beside it.",
    ],
    payload: {
      format: "lightning:<INVOICE> or LNURL1…",
      example:
        "LNURL1DP68GURN8GHJ7CNFW33K76TW9EHHYEE09EMK2MRV944KUMMHDCHKCMN4WFK8QTMNV96X7UMGDY227A3J",
      notes: [
        "An invoice is written lightning:<INVOICE> with the invoice in upper case, as BOLT 11 asks for QR codes. Its Bech32 checksum and prefix are checked, and only mainnet (lnbc) invoices are accepted.",
        "A Lightning Address is turned into its LNURL-pay (LUD-16 and LUD-01): https://domain/.well-known/lnurlp/name, Bech32-encoded. The example is satoshi@bitcoin.org.",
        "The code holds the bare upper case LNURL, which LNURL-pay wallets scan (LUD-06). No spec defines a QR form for name@domain itself.",
        "Invoices are 200 to 600 characters or more, so an invoice code is dense; print it larger.",
      ],
    },
    faqs: [
      {
        question: "Can I print an invoice code?",
        answer:
          "Not for long. An invoice can be paid once and expires, after an hour by BOLT 11's default. Use an LNURL or a Lightning Address for anything printed.",
      },
      {
        question: "Why doesn't the code hold my Lightning Address?",
        answer:
          "No spec defines a QR form for name@domain, so QRdx writes the address's LNURL-pay, which LNURL-pay wallets scan. Print the address as text beside the code for people who'd rather type it.",
      },
      {
        question: "Is my invoice sent to QRdx?",
        answer:
          "No. The code is made in your browser, and QRdx doesn't contact your Lightning Address's server to make it.",
      },
    ],
    related: ["bitcoin", "ethereum", "solana", "monero"],
  },
  {
    type: "xrp",
    name: "XRP",
    group: "payments",
    summary:
      "Share an XRP Ledger address, with a destination tag if you need one.",
    metaDescription:
      "Make an XRP QR code with your XRP Ledger address, checked with its checksum. Add a destination tag and the code holds an X-address that keeps both. Free.",
    intro: [
      "An XRP QR code holds your XRP Ledger address, so the payer's wallet reads it instead of someone typing it. The XRP Ledger has no finished payment URI standard, so the code holds the plain classic address (r…), which XRPL wallets read.",
      "With a destination tag, QRdx writes the X-address instead (XLS-5, final), which packs the address and the tag together under one checksum. A wallet that doesn't understand an X-address refuses it rather than sending without the tag. Print the classic address and the tag as text too, since some exchanges ask for them separately.",
    ],
    steps: [
      "Paste your classic XRP Ledger address (r…) from your wallet or exchange.",
      "If you were given a destination tag, enter it in its own field.",
      "Scan the preview with the wallet that will pay to check it.",
      "Download the code, and print the address and tag as text beside it.",
    ],
    payload: {
      format: "<classic address> or, with a destination tag, <X-address>",
      example: "rDTXLQ7ZKZVKz33zJbHjgVShjsBnqMBhmN",
      notes: [
        "The classic address is checked with its Base58 checksum (a double SHA-256).",
        "With a destination tag the code holds the X-address (XLS-5): rGWrZyQqhTp9Xu7G5Pkayo7bXjH4k4QYpf with tag 276 is XVLhHMPHU98es4dbozjVtdWzVrDjtVoKj3MnFGMXEFMnvJV.",
        "Tag 0 and no tag are different, so enter 0 only if you were given 0.",
        "There's no amount: no amount format works across XRP wallets.",
      ],
    },
    faqs: [
      {
        question: "Can I request an amount?",
        answer:
          "No. No amount format works across XRP wallets, so the payer enters the amount.",
      },
      {
        question: "When do I need a destination tag?",
        answer:
          "When your exchange or service gives you one. Copy it exactly: tag 0 and no tag are different.",
      },
      {
        question: "Is my address sent to QRdx?",
        answer:
          "No. The code is made in your browser, and the playground never puts payment details in a link.",
      },
    ],
    related: ["stellar", "bitcoin", "ethereum", "litecoin"],
  },
  {
    type: "cardano",
    name: "Cardano",
    group: "payments",
    summary: "Request ADA with a CIP-13 Cardano payment link.",
    metaDescription:
      "Make a Cardano QR code in the CIP-13 web+cardano: format with your addr1 address and an optional amount in ADA. Address checked with its checksum. Free.",
    intro: [
      "A Cardano QR code holds your payment address and, if you like, an amount in ADA, in the web+cardano: format from CIP-13. Wallets that implement CIP-13 payment URIs fill in the payment when they scan it.",
      "CIP-13's status is proposed, and it lists Yoroi and Begin as wallets implementing payment URIs. Other wallets may only read a plain address, so scan the preview with the wallets your payers use before you print.",
    ],
    steps: [
      "Paste a mainnet payment address (addr1…) from your wallet.",
      "Optionally enter an amount in ADA, with up to 6 decimals.",
      "Scan the preview with the wallets your payers use.",
      "Download the code.",
    ],
    payload: {
      format: "web+cardano:<address>?amount=<ADA>",
      example:
        "web+cardano:addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8?amount=12.5",
      notes: [
        "Defined by CIP-13. The amount is decimal ADA with up to 6 decimals.",
        "CIP-13 defines only the amount, so there's no label or message.",
        "QRdx takes mainnet Shelley payment addresses (addr1…) and checks their Bech32 checksum. Stake addresses and testnet addresses are refused, and older Byron addresses aren't accepted.",
      ],
    },
    faqs: [
      {
        question: "Which wallets read it?",
        answer:
          "CIP-13 lists Yoroi and Begin as implementing payment URIs. Other wallets may read only plain addresses, so test with your payers' wallets.",
      },
      {
        question: "Why is my address refused?",
        answer:
          "QRdx takes mainnet Shelley payment addresses starting with addr1. A stake address, a testnet address or an older Byron address isn't accepted.",
      },
      {
        question: "Is my address sent to QRdx?",
        answer:
          "No. The code is made in your browser, and the playground never puts payment details in a link.",
      },
    ],
    related: ["solana", "ethereum", "bitcoin", "stellar"],
  },
  {
    type: "tron",
    name: "Tron",
    group: "payments",
    summary: "Share a Tron address for TRX or USDT (TRC-20).",
    metaDescription:
      "Make a Tron QR code with your T… address for TRX or USDT on TRC-20, checked with its Base58Check checksum. Print the coin and network beside it. Free.",
    intro: [
      "A Tron QR code holds your Tron address, the T… address your wallet shows on its own receive screen. No static payment URI is documented for Tron wallets: the documented transfer deep link needs the payer's own address and a callback, so it can't be printed.",
      'TRX, TRC-10 tokens and TRC-20 tokens such as USDT all use the same address, so the code can\'t say which coin or network you expect. Print it next to the code: "USDT (TRC-20, Tron network)" or "TRX".',
    ],
    steps: [
      "Copy the address from your wallet's receive screen and paste it in.",
      "QRdx checks its checksum, and refuses Tether's USDT contract address if it's pasted by mistake.",
      "Scan the preview with your wallet to check the address.",
      "Download the code and print the coin and network beside it.",
    ],
    payload: {
      format: "<T… address>",
      example: "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
      notes: [
        "The address is checked with its Base58Check checksum and its 0x41 prefix byte.",
        "Tether's USDT contract (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t) is refused as a recipient: it's the token's contract, not a wallet.",
        "There's no amount: no static request format is documented for Tron wallets.",
      ],
    },
    faqs: [
      {
        question: "Can I ask for USDT?",
        answer:
          'The same address receives TRX and TRC-20 USDT, and the code can\'t say which. Print "USDT (TRC-20, Tron network)" next to it so payers send on the right network.',
      },
      {
        question: "Can I add an amount?",
        answer:
          "No. Tron wallets document no static request format with an amount, so the payer enters it.",
      },
      {
        question: "Is my address sent to QRdx?",
        answer:
          "No. The code is made in your browser, and the playground never puts payment details in a link.",
      },
    ],
    related: ["ton", "ethereum", "solana", "bitcoin"],
  },
  {
    type: "ton",
    name: "TON",
    group: "payments",
    summary: "Request TON or USDT with a ton://transfer link.",
    metaDescription:
      "Make a TON QR code with a ton://transfer link: your address, an amount in TON or USDT and a comment. Address checked with its CRC-16 checksum. Free.",
    intro: [
      "A TON QR code holds a ton://transfer link from TON's deep link docs: your address and, if you like, an amount and a comment. It can ask for TON or for USDT, Tether's own jetton on TON.",
      "TON's docs note that the ton:// link works across TON wallets, but whether a wallet honours the USDT jetton parameter is up to the wallet. Scan a USDT code with the wallets your payers use before you print it.",
    ],
    steps: [
      "Paste the address your wallet shows (UQ… or EQ…).",
      "Pick TON or USDT and, if you like, an amount.",
      "Optionally add a comment, such as an order number.",
      "Scan the preview with a TON wallet to check it, then download the code.",
    ],
    payload: {
      format:
        "ton://transfer/<address>?amount=<base units>&text=<message>, and for USDT ton://transfer/<address>?jetton=EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs&amount=<micro-USDT>&text=<message>",
      example:
        "ton://transfer/UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K?amount=5000000&text=hello",
      notes: [
        "Amounts are typed in TON (up to 9 decimals) or USDT (up to 6) and written in base units: amount=5000000 in the example is 0.005 TON.",
        "For USDT the link adds jetton= with Tether's USDT on TON, and the amount is in millionths: ton://transfer/UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K?jetton=EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs&amount=5000&text=hello is 0.005 USDT.",
        "The address must be a user-friendly mainnet address, UQ… (non-bounceable, recommended for wallets) or EQ…, and is checked with its CRC-16. Raw 0:… addresses have no checksum, so QRdx asks for the form your wallet shows.",
        "text is the transfer's comment, percent-encoded.",
      ],
    },
    faqs: [
      {
        question: "Do all TON wallets pay USDT from the code?",
        answer:
          "TON's docs leave the jetton parameter to each wallet, so test a USDT code with the wallets your payers use. A code for TON works across TON wallets.",
      },
      {
        question: "UQ or EQ address?",
        answer:
          "Both work. UQ… is the non-bounceable form, which is recommended for wallets; EQ… is the bounceable one. Paste the one your wallet shows.",
      },
      {
        question: "Is my address sent to QRdx?",
        answer:
          "No. The code is made in your browser, and the playground never puts payment details in a link.",
      },
    ],
    related: ["tron", "solana", "ethereum", "bitcoin"],
  },
  {
    type: "stellar",
    name: "Stellar",
    group: "payments",
    summary: "Request XLM or USDC with a SEP-0007 Stellar link.",
    metaDescription:
      "Make a Stellar QR code in the SEP-0007 web+stellar:pay format for XLM or Circle's USDC, with an optional amount and a text memo for exchanges. Free.",
    intro: [
      "A Stellar QR code holds a SEP-0007 payment request: your account and, if you like, an amount, the asset and a memo. It can ask for XLM or for USDC from the issuer Circle lists.",
      "Exchanges often need a memo to match a deposit to your account, so the code can carry one. Wallet support for SEP-7 varies, so scan the preview with the wallets your payers use before you print.",
    ],
    steps: [
      "Paste your Stellar address (G…).",
      "Pick XLM or USDC and, if you like, an amount.",
      "Add a text memo if your exchange or service gave you one.",
      "Scan the preview with a Stellar wallet to check it, then download the code.",
    ],
    payload: {
      format:
        "web+stellar:pay?destination=<G…>&amount=<amount>[&asset_code=USDC&asset_issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN][&memo=<text>&memo_type=MEMO_TEXT]",
      example:
        "web+stellar:pay?destination=GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO&amount=120.1234567&memo=skdjfasf&memo_type=MEMO_TEXT",
      notes: [
        "Defined by SEP-0007, which is active. Amounts have up to 7 decimals.",
        "For USDC the link names asset_code=USDC and the issuer Circle lists. The receiving account needs a USDC trustline to receive it.",
        "Memos are text (MEMO_TEXT) of up to 28 bytes, percent-encoded.",
        "The address is checked as a StrKey: Base32 with a CRC-16 checksum.",
      ],
    },
    faqs: [
      {
        question: "Can I receive USDC?",
        answer:
          "Yes, if your account has a USDC trustline for Circle's issuer. Without one the account can't receive USDC, so add the trustline in your wallet first.",
      },
      {
        question: "Do I need a memo?",
        answer:
          "Add one when your exchange or service gives you one, exactly as given. Text memos are up to 28 bytes.",
      },
      {
        question: "Which wallets read it?",
        answer:
          "Wallet support for SEP-7 varies. Test with the wallets your payers use.",
      },
      {
        question: "Is my address sent to QRdx?",
        answer:
          "No. The code is made in your browser, and the playground never puts payment details in a link.",
      },
    ],
    related: ["xrp", "cardano", "solana", "ethereum"],
  },
  // Added 2026-11-22 (links)
  ...LINK_QR_TYPES,
];

export const QR_TYPE_SLUGS: ContentType[] = QR_TYPES.map((t) => t.type);

const byType = new Map(QR_TYPES.map((t) => [t.type as string, t]));

export function getQrType(slug: string): QrTypeContent | undefined {
  return byType.get(slug);
}

export function getQrTypeTitle(content: Pick<QrTypeContent, "name">): string {
  return `Free ${content.name} QR Code Generator`;
}

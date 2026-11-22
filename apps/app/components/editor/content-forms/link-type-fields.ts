// The forms of the link and app types added on 2026-11-22 (utils/link-types.ts):
// each type's fields, the choice between ways to fill it, and what scanning
// does. The copy is English in data, so SchemaForm looks it up in
// editor.contentForms.schemaForm.fields by its englishKey. The builder's
// "More types" forms (components/code-builder) take the same fields.

import type { LinkType } from "@/utils/link-types";
import type { FormField, FormModes } from "./schema-form";

export interface LinkTypeForm {
  fields: readonly FormField[];
  modes?: FormModes;
  /** What scanning does */
  note: string;
}

const PHONE = "+1 202 555 0142";

/** A username, or a pasted profile link. */
const username = (
  label: string,
  placeholder: string,
  note: string,
  hint?: string,
): LinkTypeForm => ({
  fields: [
    {
      name: "username",
      label,
      required: true,
      placeholder,
      ...(hint ? { hint } : {}),
    },
  ],
  note,
});

/** A link copied from the app or site. */
const pasted = (
  label: string,
  placeholder: string,
  note: string,
  hint?: string,
): LinkTypeForm => ({
  fields: [
    {
      name: "url",
      label,
      required: true,
      placeholder,
      inputMode: "url",
      ...(hint ? { hint } : {}),
    },
  ],
  note,
});

const SHARING_HINT =
  "Under Share, set General access to Anyone with the link, or people are asked to sign in and request access.";

export const LINK_TYPE_FORMS: Record<LinkType, LinkTypeForm> = {
  // ── Messaging and calls ──
  messenger: username(
    "Facebook username or m.me link",
    "yourname or m.me/yourname",
    "Scanning opens a chat with you in Messenger.",
    "The username of your Facebook profile or Page.",
  ),
  viber: {
    fields: [
      {
        name: "phoneNumber",
        label: "Viber Business number",
        required: true,
        placeholder: PHONE,
        inputMode: "tel",
        hint: "With the country code. Chat links by number are for Viber Business accounts.",
      },
      {
        name: "message",
        label: "Message (optional)",
        placeholder: "Hi! I'd like to know more.",
      },
      {
        name: "link",
        label: "Invite URL",
        required: true,
        placeholder: "https://invite.viber.com/…",
        inputMode: "url",
        hint: "Copy the community's or channel's Invite URL in Viber.",
      },
    ],
    modes: {
      label: "Open",
      options: [
        {
          value: "phone",
          label: "A chat with a business",
          fields: ["phoneNumber", "message"],
        },
        {
          value: "link",
          label: "A community or channel",
          fields: ["link"],
        },
      ],
    },
    note: "Scanning opens Viber.",
  },
  kakaotalk: pasted(
    "Open chat or channel link",
    "https://open.kakao.com/o/…",
    "Scanning opens KakaoTalk.",
    "A channel ID, like _AbCdEf, works too.",
  ),
  zalo: pasted(
    "Official Account ID or link",
    "https://zalo.me/…",
    "Scanning opens Zalo.",
    "Paste the zalo.me link of your Official Account or group, or enter the account's numeric ID.",
  ),
  facetime: {
    fields: [
      {
        name: "contact",
        label: "Phone number or email",
        required: true,
        placeholder: PHONE,
        hint: "The number or email of the Apple Account to call. Calls start on iPhone, iPad and Mac only.",
      },
      { name: "audioOnly", label: "Audio call only", kind: "switch" },
      {
        name: "url",
        label: "FaceTime link",
        required: true,
        placeholder: "https://facetime.apple.com/join#…",
        inputMode: "url",
        hint: "Make one in FaceTime with Create Link. People on Android and Windows can join it in their browser.",
      },
    ],
    modes: {
      label: "Open",
      options: [
        {
          value: "contact",
          label: "A call to a number or email",
          fields: ["contact", "audioOnly"],
        },
        { value: "link", label: "A FaceTime link", fields: ["url"] },
      ],
    },
    note: "Scanning starts FaceTime on Apple devices.",
  },
  "microsoft-teams": {
    fields: [
      {
        name: "url",
        label: "Meeting link",
        required: true,
        placeholder: "https://teams.microsoft.com/meet/…",
        inputMode: "url",
        hint: "Copy it from the meeting invite. Meeting links can expire, so use a scheduled or recurring meeting.",
      },
      {
        name: "users",
        label: "Work or school email",
        required: true,
        placeholder: "name@company.com",
        inputMode: "email",
        hint: "Separate several addresses with commas. Chats work between work or school accounts.",
      },
      {
        name: "message",
        label: "Message (optional)",
        placeholder: "Hi! Scanned your poster.",
      },
    ],
    modes: {
      label: "Open",
      options: [
        { value: "meeting", label: "A meeting", fields: ["url"] },
        {
          value: "chat",
          label: "A chat with people",
          fields: ["users", "message"],
        },
      ],
    },
    note: "Scanning opens the meeting or chat in Teams.",
  },
  webex: pasted(
    "Meeting link",
    "https://yoursite.webex.com/meet/yourname",
    "Scanning opens the meeting in Webex.",
    "Your Personal Room link, or the link in a meeting invite.",
  ),

  // ── Social and creators ──
  vk: pasted(
    "Profile, page or group link",
    "https://vk.com/yourpage",
    "Scanning opens VK.",
  ),
  weibo: pasted(
    "Profile link",
    "https://weibo.com/u/…",
    "Scanning opens Weibo.",
  ),
  tumblr: username(
    "Blog name or link",
    "yourblog",
    "Scanning opens your blog on Tumblr.",
  ),
  medium: username(
    "Username or link",
    "@yourname",
    "Scanning opens Medium.",
    "Paste a story or publication link to open it instead.",
  ),
  substack: username(
    "Publication name or link",
    "yourname",
    "Scanning opens Substack.",
    "The part before .substack.com. Type @handle for your profile instead.",
  ),
  github: username(
    "Username, repository or link",
    "octocat or octocat/hello-world",
    "Scanning opens GitHub.",
  ),
  behance: username(
    "Username or link",
    "yourname",
    "Scanning opens your portfolio on Behance.",
  ),
  dribbble: username(
    "Username or link",
    "yourname",
    "Scanning opens your profile on Dribbble.",
  ),
  linktree: username(
    "Linktree username or link",
    "yourname",
    "Scanning opens your Linktree.",
  ),
  patreon: username(
    "Page name or link",
    "yourname",
    "Scanning opens your Patreon page.",
  ),
  kofi: username(
    "Page name or link",
    "yourname",
    "Scanning opens your Ko-fi page.",
  ),
  buymeacoffee: username(
    "Page name or link",
    "yourname",
    "Scanning opens your Buy Me a Coffee page.",
  ),

  // ── Music and podcasts ──
  "apple-music": pasted(
    "Apple Music link",
    "https://music.apple.com/…",
    "Scanning opens Apple Music, or its web player.",
    "In Apple Music, use Share, then Copy Link.",
  ),
  "youtube-music": pasted(
    "YouTube Music link",
    "https://music.youtube.com/…",
    "Scanning opens YouTube Music.",
    "Use Share, then Copy link.",
  ),
  "apple-podcasts": pasted(
    "Show or episode link",
    "https://podcasts.apple.com/…",
    "Scanning opens Apple Podcasts.",
    "In Apple Podcasts, use Share, then Copy Link.",
  ),
  "amazon-music": pasted(
    "Amazon Music link",
    "https://music.amazon.com/…",
    "Scanning opens Amazon Music.",
  ),
  deezer: pasted(
    "Deezer link",
    "https://www.deezer.com/…",
    "Scanning opens Deezer.",
    "Share links (link.deezer.com) work too.",
  ),
  tidal: pasted(
    "TIDAL link",
    "https://tidal.com/browse/…",
    "Scanning opens TIDAL.",
  ),
  bandcamp: username(
    "Bandcamp name or link",
    "yourband",
    "Scanning opens Bandcamp.",
    "The part before .bandcamp.com, or paste an album or track link.",
  ),

  // ── Documents, forms and classes ──
  "google-docs": pasted(
    "Document link",
    "https://docs.google.com/document/d/…",
    "Scanning opens the document.",
    SHARING_HINT,
  ),
  "google-sheets": pasted(
    "Spreadsheet link",
    "https://docs.google.com/spreadsheets/d/…",
    "Scanning opens the spreadsheet.",
    SHARING_HINT,
  ),
  "google-slides": pasted(
    "Presentation link",
    "https://docs.google.com/presentation/d/…",
    "Scanning opens the presentation.",
    SHARING_HINT,
  ),
  "google-forms": pasted(
    "Form link",
    "https://forms.gle/…",
    "Scanning opens the form.",
    "In your form, use Send, then the link tab.",
  ),
  "microsoft-forms": pasted(
    "Form link",
    "https://forms.office.com/r/…",
    "Scanning opens the form.",
    "In your form, use Collect responses, then Copy link.",
  ),
  notion: pasted(
    "Public page link",
    "https://yourname.notion.site/…",
    "Scanning opens the page.",
    "Publish the page to the web in Notion first.",
  ),
  canva: pasted(
    "Design link",
    "https://www.canva.com/design/…",
    "Scanning opens the design.",
    "In Canva, use Share, then Public view link.",
  ),
  "google-classroom": pasted(
    "Class invite link",
    "https://classroom.google.com/c/…",
    "Scanning opens the class in Google Classroom.",
    "Use Copy invite link in your class. Students sign in with the account the class allows.",
  ),
  calendly: username(
    "Calendly name or link",
    "yourname or yourname/30min",
    "Scanning opens your booking page.",
  ),

  // ── App stores ──
  "app-store": {
    fields: [
      {
        name: "app",
        label: "App Store link or app ID",
        required: true,
        placeholder: "https://apps.apple.com/app/id…",
        inputMode: "url",
        hint: "The ID is the number after id in the app's link.",
      },
      {
        name: "writeReview",
        label: "Open the review form",
        kind: "switch",
      },
    ],
    note: "Scanning opens the app's page in the App Store.",
  },
  "google-play": {
    fields: [
      {
        name: "app",
        label: "Google Play link or package name",
        required: true,
        placeholder: "com.example.app",
        hint: "The package name is the id in the app's Google Play link.",
      },
    ],
    note: "Scanning opens the app's page in Google Play.",
  },

  // ── Reviews and stays ──
  tripadvisor: pasted(
    "Listing link",
    "https://www.tripadvisor.com/…",
    "Scanning opens your listing on Tripadvisor.",
    "Open your listing on Tripadvisor and copy its address.",
  ),
  trustpilot: {
    fields: [
      {
        name: "website",
        label: "Your website",
        required: true,
        placeholder: "example.com",
        hint: "The domain your Trustpilot page is for.",
      },
      {
        name: "writeReview",
        label: "Open the review form",
        kind: "switch",
        initial: true,
      },
    ],
    note: "Scanning opens Trustpilot.",
  },
  yelp: pasted(
    "Business page link",
    "https://www.yelp.com/biz/…",
    "Scanning opens your page on Yelp.",
    "Yelp asks businesses not to ask for reviews, so this opens your page.",
  ),
  airbnb: pasted(
    "Listing link",
    "https://www.airbnb.com/rooms/…",
    "Scanning opens the listing in Airbnb.",
    "Use Share on the listing, then Copy link.",
  ),
  "booking-com": pasted(
    "Property link",
    "https://www.booking.com/hotel/…",
    "Scanning opens your property on Booking.com.",
  ),
};

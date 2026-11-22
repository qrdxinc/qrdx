import type { LinkType } from "@/utils/link-types";
import { framed, official, type TileSpec, tile } from "./build";
import type { CodeFrame } from "./model";
import { demoAs, generatorAs, type SampleValue } from "./values";

/**
 * The four sample codes on the generator page of each link and app type
 * added on 2026-11-22: QRdx demo pages drawn as the type, like the other
 * services QRdx can't sample. Each tile's theme was picked to scan at every
 * size the pages draw, with no theme twice on a page and each slot differing
 * from the page before it (tests/page-codes).
 */

type Demo = "generator" | `links:${string}` | `page:${string}:${string}`;
type TileRow = readonly [
  label: string,
  demo: Demo,
  frame: CodeFrame | null,
  preset: string,
];

const ROWS: Record<LinkType, readonly TileRow[]> = {
  messenger: [
    [
      "Chat with us",
      "links:shop",
      framed("chat-bubble", "Message us"),
      "classic",
    ],
    [
      "Shop help",
      "page:business:local-shop",
      framed("speech-bubble", "Ask us anything"),
      "monochrome",
    ],
    [
      "Market stall",
      "page:business:florist",
      framed("tag", "Chat on Messenger"),
      "emerald",
    ],
    ["Page", "generator", null, "sunset"],
  ],
  viber: [
    [
      "Customer help",
      "page:business:professional",
      framed("chat-bubble", "Chat on Viber"),
      "vibrant",
    ],
    [
      "Community",
      "links:creator",
      official("follow-us", "Join our community"),
      "gradientSunset",
    ],
    [
      "Orders",
      "page:business:local-shop",
      framed("speech-bubble", "Order by chat"),
      "fog",
    ],
    ["Channel", "generator", null, "seafoam"],
  ],
  kakaotalk: [
    [
      "Open chat",
      "links:creator",
      framed("chat-bubble", "Join the chat"),
      "harbor",
    ],
    [
      "Channel",
      "page:business:studio",
      official("follow-us", "Add our channel"),
      "nature",
    ],
    [
      "Event chat",
      "page:event:party",
      framed("ticket", "Join the open chat"),
      "rainbow",
    ],
    ["Shop", "generator", framed("tag", "Ask on KakaoTalk"), "fern"],
  ],
  zalo: [
    [
      "Official Account",
      "page:business:local-shop",
      official("follow-us", "Follow us on Zalo"),
      "boldTech",
    ],
    [
      "Group",
      "links:creator",
      framed("chat-bubble", "Join the group"),
      "folio",
    ],
    [
      "Bookings",
      "page:booking:salon",
      framed("speech-bubble", "Message us on Zalo"),
      "popsicle",
    ],
    ["Shop", "generator", null, "lavender"],
  ],
  facetime: [
    ["Call me", "page:vcard:minimal", framed("phone", "FaceTime me"), "rose"],
    [
      "Studio call",
      "page:business:studio",
      framed("speech-bubble", "Call on FaceTime"),
      "electric",
    ],
    [
      "Family call",
      "page:event:wedding",
      framed("polaroid", "Join the call"),
      "seafoam",
    ],
    ["Support", "generator", null, "eventTicket"],
  ],
  "microsoft-teams": [
    [
      "Team meeting",
      "page:event:webinar",
      framed("banner-bottom", "Join on Teams"),
      "slate",
    ],
    [
      "Room sign",
      "page:custom:announcement",
      official("table-tent", "Join from here"),
      "gilt",
    ],
    [
      "Office hours",
      "page:booking:coach",
      framed("speech-bubble", "Chat with us"),
      "glacier",
    ],
    [
      "Training",
      "generator",
      official("check-in", "Join the training"),
      "amberMinimal",
    ],
  ],
  webex: [
    [
      "Webinar",
      "page:event:conference",
      framed("ticket", "Join on Webex"),
      "gradientOcean",
    ],
    [
      "Personal room",
      "page:booking:coach",
      framed("rounded-border", "Join my room"),
      "retro",
    ],
    [
      "All-hands",
      "page:event:webinar",
      framed("banner-bottom", "Join the meeting"),
      "modern",
    ],
    ["Meeting", "generator", null, "terracotta"],
  ],
  calendly: [
    [
      "Book a call",
      "page:booking:coach",
      official("book-now"),
      "gradientForest",
    ],
    [
      "Consultation",
      "page:business:professional",
      framed("banner-bottom", "Book a time"),
      "periwinkle",
    ],
    [
      "Office hours",
      "page:booking:salon",
      framed("speech-bubble", "Pick a slot"),
      "candyland",
    ],
    ["Booking", "generator", null, "fire"],
  ],
  "google-classroom": [
    [
      "First day",
      "page:event:webinar",
      official("check-in", "Join the class"),
      "butter",
    ],
    [
      "Classroom door",
      "page:custom:announcement",
      framed("banner-bottom", "Join our class"),
      "amethystHaze",
    ],
    [
      "Workshop",
      "page:event:conference",
      framed("ticket", "Sign up for class"),
      "bubblegum",
    ],
    ["Class", "generator", null, "ice"],
  ],
  vk: [
    [
      "Community",
      "links:creator",
      official("follow-us", "Follow us on VK"),
      "minimal",
    ],
    ["Shop page", "links:shop", framed("tag", "Find us on VK"), "slate"],
    ["Event", "page:event:party", framed("ticket", "See the event"), "gilt"],
    ["Profile", "generator", null, "glacier"],
  ],
  weibo: [
    [
      "Profile",
      "links:creator",
      official("follow-us", "Follow us on Weibo"),
      "gradientBlue",
    ],
    [
      "Brand page",
      "page:business:studio",
      framed("banner-bottom", "Find us on Weibo"),
      "gradientOcean",
    ],
    [
      "Launch",
      "page:apps:app-launch",
      framed("sticker", "Follow the launch"),
      "retro",
    ],
    ["Account", "generator", null, "modern"],
  ],
  tumblr: [
    [
      "Blog",
      "links:creator",
      framed("sticker", "Read the blog"),
      "pastelDream",
    ],
    [
      "Zine",
      "links:minimal",
      framed("polaroid", "More on Tumblr"),
      "gradientForest",
    ],
    [
      "Art blog",
      "page:business:studio",
      official("follow-us", "Follow the blog"),
      "periwinkle",
    ],
    ["Posts", "generator", null, "candyland"],
  ],
  medium: [
    [
      "Article",
      "links:minimal",
      framed("banner-bottom", "Read the story"),
      "message",
    ],
    [
      "Talk slides",
      "page:event:conference",
      framed("speech-bubble", "Read the write-up"),
      "butter",
    ],
    [
      "Author",
      "links:creator",
      official("follow-us", "Follow on Medium"),
      "amethystHaze",
    ],
    ["Stories", "generator", null, "bubblegum"],
  ],
  substack: [
    [
      "Newsletter",
      "links:creator",
      framed("banner-bottom", "Subscribe free"),
      "bordeaux",
    ],
    [
      "Zine",
      "links:minimal",
      framed("sticker", "Get the newsletter"),
      "graphite",
    ],
    [
      "Book table",
      "page:event:conference",
      official("follow-us", "Subscribe"),
      "classic",
    ],
    ["Publication", "generator", null, "monochrome"],
  ],
  github: [
    [
      "Repository",
      "page:apps:app-launch",
      framed("banner-bottom", "Star on GitHub"),
      "mint",
    ],
    [
      "Talk slide",
      "page:event:conference",
      framed("speech-bubble", "Get the code"),
      "orchid",
    ],
    ["Sticker", "links:creator", framed("sticker", "Open source"), "vibrant"],
    ["Profile", "generator", null, "gradientSunset"],
  ],
  behance: [
    [
      "Portfolio",
      "links:creator",
      framed("banner-bottom", "See my work"),
      "caffeine",
    ],
    [
      "Business card",
      "page:vcard:minimal",
      framed("border", "Portfolio"),
      "ultramarine",
    ],
    [
      "Exhibition",
      "page:business:studio",
      framed("polaroid", "More projects"),
      "harbor",
    ],
    ["Projects", "generator", null, "nature"],
  ],
  dribbble: [
    [
      "Portfolio",
      "links:creator",
      framed("banner-bottom", "See my shots"),
      "sweetheart",
    ],
    [
      "Resume",
      "page:vcard:minimal",
      framed("rounded-border", "Design work"),
      "cobalt",
    ],
    [
      "Studio",
      "page:business:studio",
      framed("sticker", "Follow on Dribbble"),
      "boldTech",
    ],
    ["Shots", "generator", null, "folio"],
  ],
  linktree: [
    ["Link in bio", "links:creator", framed("phone", "All my links"), "sunset"],
    [
      "Merch table",
      "links:shop",
      framed("tag", "Find everything"),
      "gradientPurple",
    ],
    ["Band poster", "links:musician", framed("sticker", "Links here"), "rose"],
    ["Profile", "generator", null, "electric"],
  ],
  patreon: [
    [
      "Membership",
      "links:creator",
      official("donate", "Become a member"),
      "seafoam",
    ],
    [
      "Podcast",
      "links:podcast",
      framed("banner-bottom", "Support the show"),
      "minimal",
    ],
    ["Zine", "links:minimal", framed("sticker", "Join on Patreon"), "slate"],
    ["Page", "generator", null, "gilt"],
  ],
  kofi: [
    [
      "Tip jar",
      "page:payment:tip-jar",
      framed("speech-bubble", "Leave a tip"),
      "fern",
    ],
    [
      "Stream",
      "links:creator",
      framed("sticker", "Support on Ko-fi"),
      "gradientBlue",
    ],
    [
      "Commissions",
      "page:business:studio",
      framed("tag", "Order art"),
      "gradientOcean",
    ],
    ["Page", "generator", null, "retro"],
  ],
  buymeacoffee: [
    [
      "Tip jar",
      "page:payment:tip-jar",
      framed("speech-bubble", "Leave a tip"),
      "lavender",
    ],
    [
      "Podcast",
      "links:podcast",
      official("donate", "Support the show"),
      "pastelDream",
    ],
    [
      "Blog",
      "links:minimal",
      framed("sticker", "Thanks for reading"),
      "gradientForest",
    ],
    ["Page", "generator", null, "tangerine"],
  ],
  "apple-music": [
    [
      "New single",
      "links:musician",
      official("audio-guide", "Listen now"),
      "eventTicket",
    ],
    [
      "Playlist",
      "links:podcast",
      framed("circle", "Play the playlist"),
      "message",
    ],
    [
      "Album",
      "links:creator",
      framed("polaroid", "Stream the album"),
      "butter",
    ],
    ["Track", "generator", null, "amethystHaze"],
  ],
  "youtube-music": [
    [
      "New track",
      "links:musician",
      framed("banner-bottom", "Listen now"),
      "amberMinimal",
    ],
    [
      "Gig poster",
      "page:event:party",
      framed("ticket", "Hear the set"),
      "bordeaux",
    ],
    ["Mixtape", "links:creator", framed("circle", "Play it"), "graphite"],
    ["Playlist", "generator", null, "classic"],
  ],
  "apple-podcasts": [
    [
      "Podcast",
      "links:podcast",
      official("audio-guide", "Listen to the show"),
      "terracotta",
    ],
    ["Episode", "links:creator", framed("phone", "New episode"), "mint"],
    [
      "Live taping",
      "page:event:conference",
      framed("ticket", "Follow the show"),
      "orchid",
    ],
    ["Show", "generator", null, "vibrant"],
  ],
  "amazon-music": [
    [
      "Album",
      "links:musician",
      framed("banner-bottom", "Stream the album"),
      "fire",
    ],
    [
      "Podcast",
      "links:podcast",
      framed("phone", "Listen on the go"),
      "caffeine",
    ],
    ["Merch tag", "links:shop", framed("tag", "Hear it"), "ultramarine"],
    ["Playlist", "generator", null, "harbor"],
  ],
  deezer: [
    [
      "New release",
      "links:musician",
      official("audio-guide", "Listen now"),
      "ice",
    ],
    [
      "Party",
      "page:event:party",
      framed("circle", "Play the playlist"),
      "graphite",
    ],
    ["Podcast", "links:podcast", framed("phone", "Listen on Deezer"), "cobalt"],
    ["Track", "generator", null, "boldTech"],
  ],
  tidal: [
    [
      "Album",
      "links:musician",
      framed("polaroid", "Stream the album"),
      "emerald",
    ],
    [
      "Listening bar",
      "page:menu:juice-bar",
      framed("tag", "Now playing"),
      "sunset",
    ],
    [
      "Single",
      "links:creator",
      framed("circle", "Listen now"),
      "gradientPurple",
    ],
    ["Playlist", "generator", null, "rose"],
  ],
  bandcamp: [
    ["Merch table", "links:shop", framed("tag", "Buy the album"), "fog"],
    [
      "Gig poster",
      "page:event:party",
      framed("ticket", "Get the music"),
      "seafoam",
    ],
    [
      "Record",
      "links:musician",
      framed("polaroid", "Listen and buy"),
      "minimal",
    ],
    ["Artist", "generator", null, "slate"],
  ],
  "google-docs": [
    [
      "Handout",
      "page:custom:announcement",
      framed("banner-bottom", "Read the notes"),
      "rainbow",
    ],
    [
      "Meeting notes",
      "page:event:webinar",
      framed("rounded-border", "Open the doc"),
      "fern",
    ],
    [
      "Instructions",
      "links:minimal",
      official("product-info", "Read the guide"),
      "gradientBlue",
    ],
    ["Document", "generator", null, "gradientOcean"],
  ],
  "google-sheets": [
    [
      "Sign-up sheet",
      "page:feedback:sign-up",
      framed("banner-bottom", "Add your name"),
      "popsicle",
    ],
    [
      "Price list",
      "page:business:local-shop",
      framed("tag", "See prices"),
      "lavender",
    ],
    [
      "Schedule",
      "page:event:conference",
      framed("rounded-border", "See the schedule"),
      "pastelDream",
    ],
    ["Spreadsheet", "generator", null, "gradientForest"],
  ],
  "google-slides": [
    [
      "Talk slides",
      "page:event:conference",
      framed("speech-bubble", "Get the slides"),
      "tangerine",
    ],
    [
      "Class deck",
      "page:event:webinar",
      framed("banner-bottom", "Open the slides"),
      "eventTicket",
    ],
    [
      "Pitch",
      "page:business:professional",
      framed("rounded-border", "See the deck"),
      "message",
    ],
    ["Presentation", "generator", null, "butter"],
  ],
  "google-forms": [
    [
      "Sign-up",
      "page:feedback:sign-up",
      official("feedback-bubble", "Sign up here"),
      "glacier",
    ],
    [
      "Survey",
      "page:feedback:nps-survey",
      framed("speech-bubble", "Take the survey"),
      "amberMinimal",
    ],
    [
      "Quiz",
      "page:event:webinar",
      framed("badge", "Start the quiz"),
      "bordeaux",
    ],
    ["Form", "generator", null, "graphite"],
  ],
  "microsoft-forms": [
    [
      "Feedback",
      "page:feedback:guest-feedback",
      official("feedback-bubble"),
      "modern",
    ],
    [
      "Registration",
      "page:event:conference",
      framed("banner-bottom", "Register here"),
      "terracotta",
    ],
    ["Quiz", "page:feedback:sign-up", framed("badge", "Take the quiz"), "mint"],
    ["Form", "generator", null, "orchid"],
  ],
  notion: [
    [
      "Wiki",
      "links:minimal",
      framed("banner-bottom", "Read the wiki"),
      "candyland",
    ],
    [
      "Event guide",
      "page:event:conference",
      framed("rounded-border", "Event guide"),
      "fire",
    ],
    ["Menu", "page:menu:juice-bar", framed("tag", "See the page"), "caffeine"],
    ["Page", "generator", null, "ultramarine"],
  ],
  canva: [
    [
      "Flyer",
      "page:custom:announcement",
      framed("banner-bottom", "See the flyer"),
      "bubblegum",
    ],
    [
      "Portfolio",
      "links:creator",
      framed("polaroid", "View the design"),
      "ice",
    ],
    [
      "Menu",
      "page:menu:juice-bar",
      framed("tag", "View the menu"),
      "sweetheart",
    ],
    ["Design", "generator", null, "cobalt"],
  ],
  "app-store": [
    ["Download", "page:apps:app-launch", official("get-the-app"), "terracotta"],
    [
      "Rate us",
      "page:business:studio",
      official("review-us", "Rate us on the App Store"),
      "emerald",
    ],
    [
      "Shop window",
      "page:business:local-shop",
      framed("banner-bottom", "Get the iPhone app"),
      "sunset",
    ],
    ["App page", "generator", null, "gradientPurple"],
  ],
  "google-play": [
    [
      "Download",
      "page:apps:app-launch",
      official("get-the-app", "Get it on Google Play"),
      "gradientSunset",
    ],
    [
      "Launch",
      "page:event:conference",
      framed("banner-bottom", "Get the Android app"),
      "fog",
    ],
    [
      "Store counter",
      "page:business:local-shop",
      framed("tag", "Download free"),
      "seafoam",
    ],
    ["App page", "generator", null, "minimal"],
  ],
  tripadvisor: [
    [
      "Restaurant",
      "page:menu:juice-bar",
      official("review-us", "Find us on Tripadvisor"),
      "graphite",
    ],
    [
      "Hotel desk",
      "page:business:professional",
      framed("banner-bottom", "See our reviews"),
      "classic",
    ],
    [
      "Tour",
      "page:event:party",
      framed("ticket", "Review the tour"),
      "monochrome",
    ],
    ["Listing", "generator", null, "emerald"],
  ],
  trustpilot: [
    ["Review us", "page:business:local-shop", official("review-us"), "orchid"],
    [
      "Receipt",
      "page:payment:invoice",
      framed("banner-bottom", "Rate your order"),
      "vibrant",
    ],
    [
      "Packing slip",
      "page:coupon:store-discount",
      framed("tag", "Tell us how we did"),
      "gradientSunset",
    ],
    ["Reviews", "generator", null, "fog"],
  ],
  yelp: [
    [
      "Find us",
      "page:business:local-shop",
      framed("banner-bottom", "Find us on Yelp"),
      "ultramarine",
    ],
    ["Menu", "page:menu:juice-bar", framed("tag", "See us on Yelp"), "harbor"],
    [
      "Window",
      "page:business:florist",
      framed("sticker", "Check us out"),
      "nature",
    ],
    ["Business page", "generator", null, "rainbow"],
  ],
  airbnb: [
    [
      "Welcome book",
      "page:custom:announcement",
      framed("rounded-border", "Our listing"),
      "classic",
    ],
    [
      "Book again",
      "page:booking:salon",
      official("book-now", "Book your next stay"),
      "boldTech",
    ],
    [
      "Experience",
      "page:event:party",
      framed("ticket", "Book the experience"),
      "folio",
    ],
    ["Listing", "generator", null, "popsicle"],
  ],
  "booking-com": [
    [
      "Front desk",
      "page:business:professional",
      official("book-now", "Book on Booking.com"),
      "gradientPurple",
    ],
    [
      "Guest book",
      "page:custom:announcement",
      framed("rounded-border", "See our property"),
      "rose",
    ],
    [
      "Flyer",
      "page:event:wedding",
      framed("banner-bottom", "Book your room"),
      "electric",
    ],
    ["Property", "generator", null, "tangerine"],
  ],
};

function sample(type: LinkType, demo: Demo): SampleValue {
  if (demo === "generator") return generatorAs(type);
  const [kind, pageType, id] = demo.split(":") as [string, string, string?];
  return kind === "links"
    ? demoAs(type, "links", pageType)
    : demoAs(type, pageType, id as string);
}

/** Each type's four tiles. */
export const LINK_TYPE_TILES = Object.fromEntries(
  (Object.entries(ROWS) as [LinkType, readonly TileRow[]][]).map(
    ([type, rows]) => [
      type,
      rows.map(([label, demo, frame, preset]) =>
        tile(label, sample(type, demo), preset, frame),
      ),
    ],
  ),
) as Record<LinkType, TileSpec[]>;

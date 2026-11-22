import type { QrTypeContent } from "./qr-types-content";

/**
 * Generator page copy for the link and app types added on 2026-11-22
 * (utils/link-types.ts), appended to QR_TYPES. Each payload line matches
 * what the encoder writes, and tests/encoders/link-types.test.ts encodes
 * every example.
 */
export const LINK_QR_TYPES: QrTypeContent[] = [
  // ── Contact and messaging ──
  {
    type: "messenger",
    name: "Messenger",
    group: "contact",
    summary: "Open a Messenger chat with you or your Page.",
    metaDescription:
      "Make a Messenger QR code from your Facebook username. People scan to start a chat with you or your Page. m.me link, free, no signup.",
    intro: [
      "A Messenger QR code opens a chat with you, or with your business's Facebook Page, so customers can ask a question from a shop window, a flyer or a receipt.",
      "Type the username of your Facebook profile or Page and QRdx builds the m.me link Meta gives every username, or paste the m.me link itself.",
    ],
    steps: [
      "Enter your Facebook username, or paste your m.me link.",
      "Scan the preview to check the chat opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://m.me/<username>",
      example: "https://m.me/bloomandleafstudio",
      notes: [
        "Facebook usernames are letters, digits and dots.",
        "m.me links open the Messenger app when it's installed, or Messenger in the browser.",
      ],
    },
    faqs: [
      {
        question: "Where do I find my username?",
        answer:
          "It's the last part of your profile's or Page's address on Facebook, after facebook.com/. A Page without a username can set one in its settings.",
      },
      {
        question: "Does it work for a business Page?",
        answer:
          "Yes. A Page's m.me link opens a chat with the Page, and the messages arrive in the Page's inbox.",
      },
    ],
    related: ["whatsapp", "facebook", "instagram", "telegram"],
  },
  {
    type: "viber",
    name: "Viber",
    group: "contact",
    summary: "Open a Viber business chat, community or channel.",
    metaDescription:
      "Create a Viber QR code for a business chat by number, or to invite people to your community or channel. viber.me and invite links. Free.",
    intro: [
      "A Viber QR code opens a chat with your business, or invites people to your Viber community or channel, from a shop counter, a menu or a poster.",
      "For a chat, enter your Viber Business account's number and an optional first message; QRdx builds the viber.me link Viber gives business accounts. For a community or channel, paste its Invite URL from the app.",
    ],
    steps: [
      "Choose a business chat, or a community or channel.",
      "Enter the business number with its country code, or paste the Invite URL.",
      "Scan the preview with Viber installed to check it opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://viber.me/<number>[?draft=<message>]",
      example: "https://viber.me/12025550142?draft=Hi!",
      notes: [
        "The number is written in full international format, digits only, as Viber asks.",
        "Invite URLs are kept exactly as Viber gives them.",
      ],
    },
    faqs: [
      {
        question: "Can I make a chat code for a personal number?",
        answer:
          "Viber's chat links by number are for Viber Business accounts. For a personal number, share a community or channel, or use a WhatsApp or Telegram code.",
      },
      {
        question: "Will the community link keep working?",
        answer:
          "As long as the Invite URL does. If an admin resets the link in Viber, make a new code.",
      },
    ],
    related: ["whatsapp", "telegram", "messenger", "signal"],
  },
  {
    type: "kakaotalk",
    name: "KakaoTalk",
    group: "contact",
    summary: "Open a KakaoTalk open chat or channel.",
    metaDescription:
      "Make a KakaoTalk QR code that opens your open chat room or Kakao Talk Channel. Paste the link from the app or enter your channel ID. Free.",
    intro: [
      "A KakaoTalk QR code opens your open chat room, or your business's Kakao Talk Channel where people can add you and send a message.",
      "Paste the open chat link (open.kakao.com/o/…) or the channel link (pf.kakao.com/_…), or type the channel ID that starts with an underscore.",
    ],
    steps: [
      "Copy the open chat's share link, or your channel's link from the Kakao Talk Channel partner center.",
      "Paste it here, or type the channel ID, like _AbCdEf.",
      "Scan the preview to check KakaoTalk opens.",
      "Download the code.",
    ],
    payload: {
      format:
        "https://open.kakao.com/o/<code> or https://pf.kakao.com/_<channel ID>",
      example: "https://pf.kakao.com/_AbCdEf",
      notes: [
        "A typed channel ID becomes its pf.kakao.com link.",
        "Pasted links are kept as they are.",
      ],
    },
    faqs: [
      {
        question: "Where is my channel ID?",
        answer:
          "In the Kakao Talk Channel partner center, with your channel's details. It starts with an underscore.",
      },
      {
        question: "Can people join an open chat without the app?",
        answer:
          "No. The link opens KakaoTalk, which people need to join the room.",
      },
    ],
    related: ["line", "telegram", "whatsapp", "discord"],
  },
  {
    type: "zalo",
    name: "Zalo",
    group: "contact",
    summary: "Open a Zalo Official Account or group.",
    metaDescription:
      "Create a Zalo QR code for your Official Account or group. Paste the zalo.me link or enter the account's numeric ID. Free, no signup.",
    intro: [
      "A Zalo QR code opens your business's Zalo Official Account, where people can follow you and send a message, or a Zalo group.",
      "Paste the zalo.me link from your Official Account or group, or type the account's numeric ID, and QRdx writes the zalo.me link.",
    ],
    steps: [
      "Copy your Official Account's or group's zalo.me link.",
      "Paste it here, or type the account's ID.",
      "Scan the preview with Zalo installed to check it opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://zalo.me/<Official Account ID or name>",
      example: "https://zalo.me/1234567890123456789",
      notes: [
        "A typed numeric ID becomes its zalo.me link.",
        "Custom names (zalo.me/yourname) and group links are kept as pasted.",
      ],
    },
    faqs: [
      {
        question: "Can group links stop working?",
        answer:
          "Yes. A group admin can turn off or reset the join link, and then the code needs the new one.",
      },
      {
        question: "Can I use a custom name instead of the ID?",
        answer:
          "Yes, once Zalo approves a custom link for your Official Account. Paste the zalo.me link with the name.",
      },
    ],
    related: ["whatsapp", "viber", "messenger", "telegram"],
  },
  {
    type: "facetime",
    name: "FaceTime",
    group: "contact",
    summary: "Start a FaceTime call, or join a FaceTime link.",
    metaDescription:
      "Make a FaceTime QR code that calls a phone number or Apple Account email, or opens a FaceTime link anyone can join. Video or audio. Free.",
    intro: [
      "A FaceTime QR code starts a FaceTime call to a phone number or the email of an Apple Account. It works on iPhone, iPad and Mac; other phones can't open it.",
      "For a call anyone can join, including people on Android and Windows in their browser, make a link in FaceTime with Create Link and paste it instead.",
    ],
    steps: [
      "Choose a call to a number or email, or a FaceTime link.",
      "Enter the number or email (and turn on audio only if you like), or paste the link.",
      "Scan the preview on an iPhone to check FaceTime opens.",
      "Download the code.",
    ],
    payload: {
      format:
        "facetime:<number or email>, facetime-audio:<…> or https://facetime.apple.com/join#…",
      example: "facetime:+12025550142",
      notes: [
        "facetime: and facetime-audio: are Apple's URL schemes for FaceTime calls; Apple devices ask before they call.",
        "FaceTime links can't be built from a number: make one in the FaceTime app.",
      ],
    },
    faqs: [
      {
        question: "Can Android phones scan it?",
        answer:
          "A call code only works on Apple devices. A FaceTime link opens on Android and Windows too, where people join from Chrome or Edge.",
      },
      {
        question: "Does the code call right away?",
        answer:
          "No. The device shows who it's about to call and waits for a tap.",
      },
    ],
    related: ["phone", "whatsapp", "zoom", "google-meet"],
    details: {
      title: "Which devices open a FaceTime code",
      paragraphs: [
        "facetime: and facetime-audio: links open FaceTime on iPhone, iPad and Mac. Android phones and Windows PCs have no FaceTime app, so they can't use them; Apple documents the audio scheme for iPhone and iPad.",
        "A FaceTime link (facetime.apple.com/join…) is made in the FaceTime app with Create Link. People on Apple devices join in FaceTime, and others join from a current Chrome or Edge browser, but they can't start calls. FaceTime links aren't available in mainland China.",
      ],
    },
  },
  // ── Business and events ──
  {
    type: "microsoft-teams",
    name: "Microsoft Teams",
    group: "business",
    summary: "Join a Teams meeting or start a Teams chat.",
    metaDescription:
      "Create a Microsoft Teams QR code that joins a meeting from its link, or starts a chat with people by work email. For rooms and slides. Free.",
    intro: [
      "A Microsoft Teams QR code opens a meeting, so people join from a room sign, a slide or a printed agenda, or starts a chat with colleagues by their work email.",
      "Paste the meeting's join link from the invite, or enter one or more work or school email addresses and an optional message. QRdx builds the chat link from Microsoft's deep link format.",
    ],
    steps: [
      "Choose a meeting or a chat.",
      "Paste the join link, or enter the email addresses and a message.",
      "Scan the preview to check Teams opens.",
      "Download the code.",
    ],
    payload: {
      format:
        "https://teams.microsoft.com/l/chat/0/0?users=<emails>&message=<text>, or a pasted meeting link",
      example:
        "https://teams.microsoft.com/l/chat/0/0?users=hello@example.com&message=Hi!",
      notes: [
        "Chat links take work or school accounts, separated by commas.",
        "Meeting links are kept as pasted, with their passcode.",
      ],
    },
    faqs: [
      {
        question: "Do meeting links expire?",
        answer:
          "Newer Teams meeting links can expire some time after the meeting. Use a recurring or scheduled meeting for a printed code, and test it before an event.",
      },
      {
        question: "Can guests outside my organization join?",
        answer:
          "They can join meetings that allow guests, from the Teams app or the browser. Chats need a work or school account.",
      },
    ],
    related: ["zoom", "google-meet", "webex", "email"],
  },
  {
    type: "webex",
    name: "Webex",
    group: "business",
    summary: "Join a Webex meeting with one scan.",
    metaDescription:
      "Make a Webex QR code from your Personal Room or meeting link. People join from room signs, slides and agendas. Free, no signup.",
    intro: [
      "A Webex QR code opens a meeting in Webex, so people join from a slide, a room sign or a printed agenda without typing a meeting number.",
      "Paste your Personal Room link (yoursite.webex.com/meet/yourname) or the link in a meeting invite. QRdx keeps it as it is.",
    ],
    steps: [
      "Copy your Personal Room link or the meeting's link.",
      "Paste it here.",
      "Scan the preview to check the meeting opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://<site>.webex.com/meet/<name> or a pasted meeting link",
      example: "https://example.webex.com/meet/bloomandleaf",
      notes: [
        "A Personal Room link stays the same for every meeting you host there.",
        "Invite links for scheduled meetings can differ per person, so use a Personal Room for a printed code.",
      ],
    },
    faqs: [
      {
        question: "Which link is best for a room sign?",
        answer:
          "Your Personal Room link. It never changes, so one code works for every meeting you hold there.",
      },
      {
        question: "Do people need the Webex app?",
        answer:
          "No. The link offers to open the app, or to join from the browser.",
      },
    ],
    related: ["microsoft-teams", "zoom", "google-meet", "calendly"],
  },
  {
    type: "calendly",
    name: "Calendly",
    group: "business",
    summary: "Let people book time with you on Calendly.",
    metaDescription:
      "Create a Calendly QR code for your scheduling page or one event type. People scan to book a meeting from cards, signs and slides. Free.",
    intro: [
      "A Calendly QR code opens your scheduling page, or one event type, so people book a call or an appointment from a business card, a sign or a slide.",
      "Type your Calendly name, like yourname or yourname/30min, or paste any calendly.com booking link.",
    ],
    steps: [
      "Enter your Calendly name, or paste a booking link.",
      "Scan the preview to check your booking page opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://calendly.com/<name>[/<event>]",
      example: "https://calendly.com/bloomandleaf-example/30min",
      notes: [
        "Pasted links, including shared event links (calendly.com/d/…), are kept as they are.",
        "If you rename your Calendly link, the old one stops working, so print a new code.",
      ],
    },
    faqs: [
      {
        question: "Can the code open one meeting type?",
        answer:
          "Yes. Add the event's part after your name, like yourname/30min, or paste the event's own link.",
      },
      {
        question: "Can I change the booking page later?",
        answer:
          "The event settings, yes. The link itself is in the code, so make the code dynamic if the link might change.",
      },
    ],
    related: ["calcom", "google-meet", "zoom", "vcard"],
  },
  {
    type: "google-classroom",
    name: "Google Classroom",
    group: "business",
    summary: "Invite students to a Google Classroom class.",
    metaDescription:
      "Make a Google Classroom QR code from your class invite link. Students scan to join from a slide, a handout or the classroom door. Free.",
    intro: [
      "A Google Classroom QR code opens your class's invite link, so students join from a slide on the first day, a handout or a sign on the door.",
      "Copy the class invite link in Classroom and paste it here. Students still sign in with the Google account your school allows.",
    ],
    steps: [
      "In your class, use Copy invite link.",
      "Paste it here.",
      "Scan the preview to check the class opens.",
      "Download the code, as SVG for posters.",
    ],
    payload: {
      format: "https://classroom.google.com/… (the class invite link)",
      example: "https://classroom.google.com/c/ExampleClass1234",
      notes: [
        "QRdx keeps the invite link exactly as Classroom gives it.",
        "Turning the class code off or resetting it in Classroom stops the old link.",
      ],
    },
    faqs: [
      {
        question: "Can students join with a personal Google account?",
        answer:
          "That depends on your school's settings. Classes in a school's Google Workspace often allow only school accounts.",
      },
      {
        question: "Can the code hold just the class code?",
        answer:
          "Google doesn't publish a link for a class code alone, so the code holds the invite link. Students can still type the class code in Classroom.",
      },
    ],
    related: ["google-forms", "google-docs", "google-meet", "attendance"],
  },
  {
    type: "tripadvisor",
    name: "Tripadvisor",
    group: "business",
    summary: "Open your listing on Tripadvisor.",
    metaDescription:
      "Create a Tripadvisor QR code that opens your hotel, restaurant or attraction listing, where guests can read and write reviews. Free.",
    intro: [
      "A Tripadvisor QR code opens your hotel's, restaurant's or attraction's listing, where guests can read reviews and write one.",
      "Open your listing on Tripadvisor, copy its address and paste it here. Links on Tripadvisor's country sites work too.",
    ],
    steps: [
      "Open your listing on Tripadvisor and copy its address.",
      "Paste it here.",
      "Scan the preview to check the listing opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://www.tripadvisor.com/<listing page>",
      example:
        "https://www.tripadvisor.com/Restaurant_Review-g60713-d1234567-Reviews-Bloom_Cafe_Example-San_Francisco_California.html",
      notes: [
        "QRdx keeps the listing link as pasted.",
        "Tripadvisor also offers free review tools for businesses in its Management Center.",
      ],
    },
    faqs: [
      {
        question: "Can I offer a discount for a review?",
        answer:
          "No. Tripadvisor doesn't allow incentives for reviews. Ask guests to share their experience, good or bad.",
      },
      {
        question: "Does it open the review form?",
        answer: "It opens your listing, which has a button to write a review.",
      },
    ],
    related: ["google-review", "trustpilot", "yelp", "booking-com"],
  },
  {
    type: "trustpilot",
    name: "Trustpilot",
    group: "business",
    summary: "Ask customers for a Trustpilot review.",
    metaDescription:
      "Make a Trustpilot QR code that opens your write-a-review page, or your reviews. Enter your website's domain. For receipts and packaging. Free.",
    intro: [
      "A Trustpilot QR code opens the page where customers write a review of your business, or your Trustpilot reviews page. Print it on receipts, packing slips and counters.",
      "Enter the website domain your Trustpilot page is for, like example.com, or paste your Trustpilot link. QRdx builds Trustpilot's evaluate link for reviews.",
    ],
    steps: [
      "Enter your website's domain.",
      "Keep 'Open the review form' on to collect reviews, or turn it off to show your reviews.",
      "Scan the preview to check your page opens.",
      "Download the code.",
    ],
    payload: {
      format:
        "https://www.trustpilot.com/evaluate/<domain> or https://www.trustpilot.com/review/<domain>",
      example: "https://www.trustpilot.com/evaluate/example.com",
      notes: [
        "evaluate opens the review form; review opens your reviews page.",
        "www. is dropped from the domain, as Trustpilot names pages.",
      ],
    },
    faqs: [
      {
        question: "Do customers need an account?",
        answer:
          "Trustpilot asks reviewers to sign in or sign up before they post.",
      },
      {
        question: "What if my business isn't on Trustpilot yet?",
        answer:
          "Claim your page on Trustpilot first, so the domain has a page to open.",
      },
    ],
    related: ["google-review", "tripadvisor", "yelp", "app-store"],
  },
  {
    type: "yelp",
    name: "Yelp",
    group: "business",
    summary: "Open your business page on Yelp.",
    metaDescription:
      "Create a Yelp QR code that opens your business page, with your hours, photos and reviews. For windows, menus and counters. Free.",
    intro: [
      "A Yelp QR code opens your business page on Yelp, with your hours, photos and reviews, from a window sticker, a menu or a counter card.",
      "Paste your page's link (yelp.com/biz/…). Yelp asks businesses not to ask for reviews, so the code opens your page and leaves the rest to your customers.",
    ],
    steps: [
      "Open your business page on Yelp and copy its address.",
      "Paste it here.",
      "Scan the preview to check your page opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://www.yelp.com/biz/<your business>",
      example: "https://www.yelp.com/biz/bloom-cafe-example-san-francisco",
      notes: [
        "Links on Yelp's country sites (yelp.ca, yelp.co.uk…) work too.",
        "QRdx keeps the link as pasted.",
      ],
    },
    faqs: [
      {
        question: "Can I use the code to ask for reviews?",
        answer:
          "Yelp's guidelines ask businesses not to ask anyone for reviews. Use wording like 'Find us on Yelp' next to the code.",
      },
      {
        question: "Does it open the Yelp app?",
        answer:
          "Yelp links open the app when it's installed, or the page in the browser.",
      },
    ],
    related: ["google-review", "tripadvisor", "maps", "trustpilot"],
    details: {
      title: "Yelp and review requests",
      paragraphs: [
        "Yelp's policy is 'Don't ask for reviews': reviews it thinks were solicited can be filtered, and a business that pushes for them can get a notice on its page. That's why this code opens your business page, not a review form.",
        "A sign that says 'Find us on Yelp', with Yelp's own branding guidelines, is fine.",
      ],
    },
  },
  {
    type: "airbnb",
    name: "Airbnb",
    group: "business",
    summary: "Open an Airbnb listing or experience.",
    metaDescription:
      "Make an Airbnb QR code that opens your listing or experience. For welcome books, flyers and repeat guests. Paste the link. Free.",
    intro: [
      "An Airbnb QR code opens your listing or experience, so guests can book again from your welcome book, a fridge magnet or a flyer.",
      "Use Share on the listing and copy the link, or copy its address (airbnb.com/rooms/…), and paste it here.",
    ],
    steps: [
      "Copy your listing's link from Airbnb.",
      "Paste it here.",
      "Scan the preview to check the listing opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://www.airbnb.com/rooms/<listing number>",
      example: "https://www.airbnb.com/rooms/12345678",
      notes: [
        "Share links from the Airbnb app (abnb.me) and Airbnb's country sites work too.",
        "QRdx keeps the link as pasted.",
      ],
    },
    faqs: [
      {
        question: "Does it open the Airbnb app?",
        answer:
          "Airbnb links open the app when it's installed, or the listing in the browser.",
      },
      {
        question: "Can I link the Wi-Fi or house rules too?",
        answer:
          "Use a separate Wi-Fi code for the network, and a hosted page for house rules you may want to change.",
      },
    ],
    related: ["booking-com", "wifi", "maps", "tripadvisor"],
  },
  {
    type: "booking-com",
    name: "Booking.com",
    group: "business",
    summary: "Open your property's page on Booking.com.",
    metaDescription:
      "Create a Booking.com QR code that opens your hotel's or rental's property page. For flyers, front desks and partners. Free, no signup.",
    intro: [
      "A Booking.com QR code opens your hotel's or rental's property page, with rooms, prices and guest reviews.",
      "Open your property on Booking.com, copy its address (booking.com/hotel/…) and paste it here.",
    ],
    steps: [
      "Copy your property page's address from Booking.com.",
      "Paste it here.",
      "Scan the preview to check the page opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://www.booking.com/hotel/<country>/<property>.html",
      example: "https://www.booking.com/hotel/us/bloom-inn-example.html",
      notes: [
        "Search and date parameters in a pasted link are kept, so remove them for a code that always shows today's prices.",
        "Booking.com share links work too.",
      ],
    },
    faqs: [
      {
        question: "Can guests leave a review from the code?",
        answer:
          "Booking.com collects reviews only from guests who booked through it, by email after the stay.",
      },
      {
        question: "Does it open the Booking.com app?",
        answer:
          "When it's installed, usually; otherwise the page opens in the browser.",
      },
    ],
    related: ["airbnb", "tripadvisor", "maps", "google-review"],
  },
  // ── Social, creators and music ──
  {
    type: "vk",
    name: "VK",
    group: "social",
    summary: "Open a VK profile, community or group.",
    metaDescription:
      "Make a VK QR code that opens your profile, community or group on vk.com. Paste the link. For posters, packaging and events. Free.",
    intro: [
      "A VK QR code opens your profile, community or group, so people can follow you from a poster, a shop window or a product box.",
      "Copy the address of your page on vk.com, or use Share in the VK app, and paste it here.",
    ],
    steps: [
      "Copy your page's link from VK.",
      "Paste it here.",
      "Scan the preview to check the page opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://vk.com/<page>",
      example: "https://vk.com/bloomandleafexample",
      notes: [
        "QRdx keeps the link as pasted; vk.ru links work too.",
        "A link with your numeric ID (vk.com/id…) stays the same if you change your page's short name.",
      ],
    },
    faqs: [
      {
        question: "Does it open the VK app?",
        answer:
          "VK links open the app when it's installed, or the page in the browser.",
      },
    ],
    related: ["telegram", "instagram", "youtube", "weibo"],
  },
  {
    type: "weibo",
    name: "Weibo",
    group: "social",
    summary: "Open a Weibo profile.",
    metaDescription:
      "Create a Weibo QR code that opens your Weibo profile, for packaging, events and posters aimed at audiences in China. Paste the link. Free.",
    intro: [
      "A Weibo QR code opens your Weibo profile, so people can follow you from packaging, a trade fair stand or a poster.",
      "Copy your profile's link (weibo.com/u/… or your custom weibo.com address) and paste it here.",
    ],
    steps: [
      "Copy your Weibo profile's link.",
      "Paste it here.",
      "Scan the preview to check the profile opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://weibo.com/u/<UID> or https://weibo.com/<name>",
      example: "https://weibo.com/u/1234567890",
      notes: [
        "QRdx keeps the link as pasted; m.weibo.cn links work too.",
        "The numeric UID link keeps working if you change your nickname.",
      ],
    },
    faqs: [
      {
        question: "Which link should I use?",
        answer:
          "The weibo.com/u/ link with your numeric UID never changes, so it's the safest for print.",
      },
    ],
    related: ["vk", "instagram", "tiktok", "twitter"],
  },
  {
    type: "tumblr",
    name: "Tumblr",
    group: "social",
    summary: "Open a Tumblr blog or post.",
    metaDescription:
      "Make a Tumblr QR code that opens your blog or one post. Type your blog name or paste a link. For zines, stickers and art prints. Free.",
    intro: [
      "A Tumblr QR code opens your blog, or one post, from a zine, a sticker or the back of an art print.",
      "Type your blog's name and QRdx builds the tumblr.com link, or paste a blog or post link.",
    ],
    steps: [
      "Enter your blog name, or paste a link.",
      "Scan the preview to check your blog opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://www.tumblr.com/<blog>",
      example: "https://www.tumblr.com/bloomandleaf-example",
      notes: [
        "Blog names are up to 32 letters, digits and hyphens.",
        "Pasted links, including yourblog.tumblr.com, are kept as they are.",
      ],
    },
    faqs: [
      {
        question: "What happens if I rename my blog?",
        answer:
          "The old name stops pointing to you, and someone else can take it, so print a new code.",
      },
    ],
    related: ["instagram", "pinterest", "medium", "linktree"],
  },
  {
    type: "medium",
    name: "Medium",
    group: "social",
    summary: "Open a Medium profile, publication or story.",
    metaDescription:
      "Create a Medium QR code for your profile, a publication or one story. For talk slides, books and handouts. Type your @username. Free.",
    intro: [
      "A Medium QR code opens your profile, a publication or one story, so readers find your writing from a talk slide, a book or a handout.",
      "Type your @username and QRdx builds the medium.com link, or paste any Medium link.",
    ],
    steps: [
      "Enter your @username, or paste a story or publication link.",
      "Scan the preview to check it opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://medium.com/@<username>",
      example: "https://medium.com/@bloomandleafexample",
      notes: [
        "Pasted links, including publications on their own subdomains, are kept as they are.",
        "If you change your username, the old profile link breaks.",
      ],
    },
    faqs: [
      {
        question: "Can the code open one article?",
        answer: "Yes. Paste the story's link instead of your username.",
      },
    ],
    related: ["substack", "linkedin", "twitter", "url"],
  },
  {
    type: "substack",
    name: "Substack",
    group: "social",
    summary: "Open a Substack newsletter or profile.",
    metaDescription:
      "Make a Substack QR code that opens your newsletter so readers can subscribe. For talks, books, zines and events. Free, no signup.",
    intro: [
      "A Substack QR code opens your newsletter, where people can subscribe, from a talk, a book, a zine or an event table.",
      "Type your publication's name (the part before .substack.com) and QRdx builds the link. Type @handle for your Substack profile, or paste any substack.com link.",
    ],
    steps: [
      "Enter your publication name or @handle, or paste a link.",
      "Scan the preview to check it opens.",
      "Download the code.",
    ],
    payload: {
      format:
        "https://<publication>.substack.com or https://substack.com/@<handle>",
      example: "https://bloomandleafexample.substack.com",
      notes: [
        "A publication on its own domain works in the URL generator.",
        "Pasted substack.com links are kept as they are.",
      ],
    },
    faqs: [
      {
        question: "Can the code open the subscribe page?",
        answer:
          "Paste your publication's /subscribe link, and the code opens that page.",
      },
    ],
    related: ["medium", "linktree", "patreon", "email"],
  },
  {
    type: "github",
    name: "GitHub",
    group: "social",
    summary: "Open a GitHub profile, organization or repository.",
    metaDescription:
      "Create a GitHub QR code for your profile, organization or a repository. For talk slides, stickers, READMEs and conference badges. Free.",
    intro: [
      "A GitHub QR code opens a profile, an organization or a repository, so people find your code from a talk slide, a laptop sticker or a conference badge.",
      "Type a username, or owner/repository, and QRdx builds the github.com link. Or paste any GitHub link.",
    ],
    steps: [
      "Enter a username or owner/repository, or paste a link.",
      "Scan the preview to check it opens.",
      "Download the code, as SVG for stickers.",
    ],
    payload: {
      format: "https://github.com/<user>[/<repository>]",
      example: "https://github.com/bloomandleaf-example/garden-planner",
      notes: [
        "Usernames are up to 39 letters, digits and single hyphens.",
        "Pasted links to issues, releases and files are kept as they are.",
      ],
    },
    faqs: [
      {
        question: "Can it link a private repository?",
        answer:
          "Yes, but only people with access can see it; others get a page that isn't found.",
      },
    ],
    related: ["linkedin", "url", "dribbble", "discord"],
  },
  {
    type: "behance",
    name: "Behance",
    group: "social",
    summary: "Open a Behance portfolio or project.",
    metaDescription:
      "Make a Behance QR code that opens your portfolio or one project. For business cards, CVs and exhibitions. Type your username. Free.",
    intro: [
      "A Behance QR code opens your portfolio, or one project, from a business card, a printed CV or an exhibition label.",
      "Type your Behance username and QRdx builds the behance.net link, or paste a project link.",
    ],
    steps: [
      "Enter your Behance username, or paste a link.",
      "Scan the preview to check your portfolio opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://www.behance.net/<username>",
      example: "https://www.behance.net/bloomandleafexample",
      notes: [
        "Usernames are 3 to 40 letters, digits, underscores and hyphens.",
        "Behance doesn't redirect an old username, so print a new code if you change it.",
      ],
    },
    faqs: [
      {
        question: "Can the code open one project?",
        answer: "Yes. Paste the project's link instead of your username.",
      },
    ],
    related: ["dribbble", "linkedin", "instagram", "vcard"],
  },
  {
    type: "dribbble",
    name: "Dribbble",
    group: "social",
    summary: "Open a Dribbble profile or shot.",
    metaDescription:
      "Create a Dribbble QR code for your design profile or one shot. For business cards, CVs and portfolio prints. Type your username. Free.",
    intro: [
      "A Dribbble QR code opens your design profile, or one shot, from a business card, a CV or a printed portfolio.",
      "Type your Dribbble username and QRdx builds the dribbble.com link, or paste a shot link.",
    ],
    steps: [
      "Enter your Dribbble username, or paste a link.",
      "Scan the preview to check your profile opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://dribbble.com/<username>",
      example: "https://dribbble.com/bloomandleafexample",
      notes: [
        "Pasted dribbble.com links are kept as they are.",
        "If you change your username, print a new code.",
      ],
    },
    faqs: [
      {
        question: "Can I link a specific shot?",
        answer: "Yes. Paste the shot's link instead of your username.",
      },
    ],
    related: ["behance", "instagram", "linkedin", "github"],
  },
  {
    type: "linktree",
    name: "Linktree",
    group: "social",
    summary: "Open your Linktree page.",
    metaDescription:
      "Make a QR code for your Linktree page, with all your links in one scan. For merch, posters, cards and stream overlays. Free, no signup.",
    intro: [
      "A Linktree QR code opens your Linktree page, so one scan reaches every link you keep there, from merch, a poster or a business card.",
      "Type your Linktree username and QRdx builds the linktr.ee link, or paste it.",
    ],
    steps: [
      "Enter your Linktree username, or paste your link.",
      "Scan the preview to check your page opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://linktr.ee/<username>",
      example: "https://linktr.ee/bloomandleafexample",
      notes: [
        "Linktree lets you change your username, which changes the link; print a new code if you do.",
        "Your page's links can change any time without a new code.",
      ],
    },
    faqs: [
      {
        question: "Can QRdx host a links page instead?",
        answer:
          "Yes. A QRdx links page is a hosted page you edit in your dashboard, with a dynamic code you can repoint.",
      },
    ],
    related: ["instagram", "tiktok", "url", "patreon"],
  },
  {
    type: "patreon",
    name: "Patreon",
    group: "social",
    summary: "Open your Patreon creator page.",
    metaDescription:
      "Create a Patreon QR code that opens your creator page, so fans can become members. For streams, merch, books and podcasts. Free.",
    intro: [
      "A Patreon QR code opens your creator page, where fans can become members, from a stream overlay, merch, the back of a book or a podcast cover.",
      "Type your page name (the part after patreon.com/) and QRdx builds the link, or paste it.",
    ],
    steps: [
      "Enter your Patreon page name, or paste your link.",
      "Scan the preview to check your page opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://www.patreon.com/<page name>",
      example: "https://www.patreon.com/bloomandleafexample",
      notes: [
        "Pasted patreon.com links are kept as they are.",
        "Patreon doesn't redirect an old page name, so print a new code if you change it.",
      ],
    },
    faqs: [
      {
        question: "Can the code open a tier or post?",
        answer: "Yes. Paste that page's link instead of your name.",
      },
    ],
    related: ["kofi", "buymeacoffee", "youtube", "twitch"],
  },
  {
    type: "kofi",
    name: "Ko-fi",
    group: "social",
    summary: "Get tips and support on your Ko-fi page.",
    metaDescription:
      "Make a Ko-fi QR code that opens your page for tips, memberships and commissions. For streams, stalls and zines. Free, no signup.",
    intro: [
      "A Ko-fi QR code opens your Ko-fi page, where people can leave a tip, join a membership or order a commission, from a stream, a market stall or a zine.",
      "Type your Ko-fi page name and QRdx builds the ko-fi.com link, or paste it.",
    ],
    steps: [
      "Enter your Ko-fi page name, or paste your link.",
      "Scan the preview to check your page opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://ko-fi.com/<page name>",
      example: "https://ko-fi.com/bloomandleafexample",
      notes: [
        "Payments happen on Ko-fi; the code only opens your page.",
        "Pasted ko-fi.com links are kept as they are.",
      ],
    },
    faqs: [
      {
        question: "Can the code take a payment by itself?",
        answer:
          "No. It opens your page, and people pay there with the methods you set up in Ko-fi.",
      },
    ],
    related: ["buymeacoffee", "patreon", "paypal", "twitch"],
  },
  {
    type: "buymeacoffee",
    name: "Buy Me a Coffee",
    group: "social",
    summary: "Get tips on your Buy Me a Coffee page.",
    metaDescription:
      "Create a Buy Me a Coffee QR code that opens your page for tips and memberships. For podcasts, blogs, streams and stalls. Free.",
    intro: [
      "A Buy Me a Coffee QR code opens your page, where fans can leave a tip or join a membership, from a podcast cover, a blog post, a stream or a stall.",
      "Type your page name and QRdx builds the buymeacoffee.com link, or paste it.",
    ],
    steps: [
      "Enter your page name, or paste your link.",
      "Scan the preview to check your page opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://buymeacoffee.com/<page name>",
      example: "https://buymeacoffee.com/bloomandleafexample",
      notes: [
        "Payments happen on Buy Me a Coffee; the code only opens your page.",
        "Pasted links, with or without www., are kept as they are.",
      ],
    },
    faqs: [
      {
        question: "Do supporters need an account?",
        answer:
          "No. Supporters can pay on your page without making an account.",
      },
    ],
    related: ["kofi", "patreon", "paypal", "linktree"],
  },
  {
    type: "apple-music",
    name: "Apple Music",
    group: "social",
    summary: "Play a song, album, artist or playlist on Apple Music.",
    metaDescription:
      "Make an Apple Music QR code that plays a song, album or playlist, or opens an artist. For posters, merch and record sleeves. Free.",
    intro: [
      "An Apple Music QR code opens a song, an album, a playlist or an artist page, from a gig poster, merch or a record sleeve.",
      "In Apple Music, use Share and Copy Link, then paste the music.apple.com link here.",
    ],
    steps: [
      "Copy the link in Apple Music (Share, Copy Link).",
      "Paste it here.",
      "Scan the preview to check it opens.",
      "Download the code.",
    ],
    payload: {
      format:
        "https://music.apple.com/<country>/<album|song|playlist|artist>/…",
      example: "https://music.apple.com/us/album/example/1234567890",
      notes: [
        "QRdx keeps the link as pasted.",
        "People without Apple Music get a preview page in the browser.",
      ],
    },
    faqs: [
      {
        question: "Does it work on Android?",
        answer:
          "It opens the Apple Music app for Android when it's installed, or the web player.",
      },
    ],
    related: ["spotify", "youtube-music", "apple-podcasts", "soundcloud"],
  },
  {
    type: "youtube-music",
    name: "YouTube Music",
    group: "social",
    summary: "Play a song, album or playlist on YouTube Music.",
    metaDescription:
      "Create a YouTube Music QR code that plays a song, album or playlist. For gig posters, merch and flyers. Paste the share link. Free.",
    intro: [
      "A YouTube Music QR code opens a song, an album, a playlist or an artist in YouTube Music, from a gig poster, merch or a flyer.",
      "Use Share and Copy link in YouTube Music, then paste the music.youtube.com link here.",
    ],
    steps: [
      "Copy the link in YouTube Music (Share, Copy link).",
      "Paste it here.",
      "Scan the preview to check it plays.",
      "Download the code.",
    ],
    payload: {
      format: "https://music.youtube.com/<watch|playlist|browse|channel>…",
      example: "https://music.youtube.com/playlist?list=PLexample",
      notes: [
        "QRdx keeps the link as pasted.",
        "A youtube.com video link works in the YouTube generator.",
      ],
    },
    faqs: [
      {
        question: "Does it need a subscription?",
        answer:
          "No. People can listen free with ads; a subscription removes them.",
      },
    ],
    related: ["youtube", "spotify", "apple-music", "soundcloud"],
  },
  {
    type: "apple-podcasts",
    name: "Apple Podcasts",
    group: "social",
    summary: "Open a podcast or episode on Apple Podcasts.",
    metaDescription:
      "Make an Apple Podcasts QR code that opens your show or one episode, so listeners follow it. For posters, merch and live shows. Free.",
    intro: [
      "An Apple Podcasts QR code opens your show, or one episode, so listeners can follow it from a poster, a sticker or a live taping.",
      "Use Share and Copy Link in Apple Podcasts, then paste the podcasts.apple.com link here.",
    ],
    steps: [
      "Copy the show's or episode's link in Apple Podcasts.",
      "Paste it here.",
      "Scan the preview to check it opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://podcasts.apple.com/<country>/podcast/<name>/id<number>",
      example:
        "https://podcasts.apple.com/us/podcast/bloom-and-leaf/id1234567890",
      notes: [
        "The link holds your show's number (id…), which never changes.",
        "QRdx keeps the link as pasted, with an episode's ?i= part.",
      ],
    },
    faqs: [
      {
        question: "What do Android listeners see?",
        answer: "The show's page in the browser, where they can play episodes.",
      },
    ],
    related: ["spotify", "apple-music", "youtube", "soundcloud"],
  },
  {
    type: "amazon-music",
    name: "Amazon Music",
    group: "social",
    summary: "Play music or a podcast on Amazon Music.",
    metaDescription:
      "Create an Amazon Music QR code for a song, album, playlist or podcast. For posters, merch and flyers. Paste the link. Free.",
    intro: [
      "An Amazon Music QR code opens a song, an album, a playlist, an artist or a podcast in Amazon Music.",
      "Copy the link in Amazon Music and paste it here. Links on Amazon's country music sites work too.",
    ],
    steps: [
      "Copy the link in Amazon Music.",
      "Paste it here.",
      "Scan the preview to check it opens.",
      "Download the code.",
    ],
    payload: {
      format:
        "https://music.amazon.<country>/<albums|artists|playlists|podcasts>/…",
      example: "https://music.amazon.com/albums/B0EXAMPLE1",
      notes: [
        "QRdx keeps the link as pasted.",
        "Each country site opens the catalog of that country.",
      ],
    },
    faqs: [
      {
        question: "Can people listen without Prime?",
        answer:
          "Amazon Music has a free tier with ads in many countries, so many links play for everyone.",
      },
    ],
    related: ["spotify", "apple-music", "youtube-music", "amazon"],
  },
  {
    type: "deezer",
    name: "Deezer",
    group: "social",
    summary: "Play a track, album or playlist on Deezer.",
    metaDescription:
      "Make a Deezer QR code that plays a track, album, playlist or podcast. For gig posters, merch and record sleeves. Free, no signup.",
    intro: [
      "A Deezer QR code opens a track, an album, a playlist, an artist or a podcast in Deezer.",
      "Paste a deezer.com link, or a share link (link.deezer.com) from the app.",
    ],
    steps: [
      "Copy the link in Deezer.",
      "Paste it here.",
      "Scan the preview to check it plays.",
      "Download the code.",
    ],
    payload: {
      format: "https://www.deezer.com/<language>/<track|album|playlist>/<id>",
      example: "https://www.deezer.com/en/album/123456789",
      notes: [
        "QRdx keeps the link as pasted.",
        "Old deezer.page.link share links stopped working in 2025; copy a new link from the app.",
      ],
    },
    faqs: [
      {
        question: "Does it work without the app?",
        answer: "Yes. The link opens Deezer in the browser.",
      },
    ],
    related: ["spotify", "tidal", "apple-music", "soundcloud"],
  },
  {
    type: "tidal",
    name: "TIDAL",
    group: "social",
    summary: "Play a track, album or playlist on TIDAL.",
    metaDescription:
      "Create a TIDAL QR code that plays a track, album or playlist, or opens an artist. For merch, sleeves and posters. Free, no signup.",
    intro: [
      "A TIDAL QR code opens a track, an album, a playlist or an artist on TIDAL.",
      "Copy the link in TIDAL and paste it here.",
    ],
    steps: [
      "Copy the link in TIDAL.",
      "Paste it here.",
      "Scan the preview to check it opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://tidal.com/browse/<track|album|playlist|artist>/<id>",
      example: "https://tidal.com/browse/album/123456789",
      notes: [
        "QRdx keeps the link as pasted; listen.tidal.com links work too.",
        "TIDAL's share page also offers the music on other services.",
      ],
    },
    faqs: [
      {
        question: "What do people without TIDAL see?",
        answer:
          "A page for the music, which can point them to other streaming services.",
      },
    ],
    related: ["spotify", "apple-music", "deezer", "bandcamp"],
  },
  {
    type: "bandcamp",
    name: "Bandcamp",
    group: "social",
    summary: "Open an artist, album or track on Bandcamp.",
    metaDescription:
      "Make a Bandcamp QR code for your artist page, an album or a track, so fans listen and buy. For merch tables and posters. Free.",
    intro: [
      "A Bandcamp QR code opens your artist page, an album or a track, where fans can listen and buy, from a merch table, a gig poster or a record sleeve.",
      "Type the part before .bandcamp.com and QRdx builds the link, or paste an album or track link.",
    ],
    steps: [
      "Enter your Bandcamp name, or paste a link.",
      "Scan the preview to check it opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://<name>.bandcamp.com[/album/<album>]",
      example: "https://bloomandleafexample.bandcamp.com",
      notes: [
        "Pasted bandcamp.com links are kept as they are.",
        "If you change your Bandcamp address, the old one stops working.",
      ],
    },
    faqs: [
      {
        question: "Can I use it for download codes?",
        answer:
          "Print each Bandcamp download code next to the QR code, or link to your redeem page.",
      },
    ],
    related: ["soundcloud", "spotify", "apple-music", "linktree"],
  },
  // ── Links, documents and apps ──
  {
    type: "google-docs",
    name: "Google Docs",
    group: "utilities",
    summary: "Open a shared Google Doc.",
    metaDescription:
      "Create a Google Docs QR code that opens a shared document. For handouts, notes, instructions and menus. Paste the link. Free.",
    intro: [
      "A Google Docs QR code opens a shared document, so people read handouts, meeting notes or instructions on their phone.",
      "Paste the document's link. Under Share, set General access to Anyone with the link first, or people without access are asked to sign in and request it.",
    ],
    steps: [
      "Share the document with Anyone with the link.",
      "Copy its link and paste it here.",
      "Scan the preview on a phone that isn't signed in to check it opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://docs.google.com/document/d/<id>/…",
      example: "https://docs.google.com/document/d/example-document-id/edit",
      notes: [
        "QRdx keeps the link as pasted, including /edit or /view.",
        "Editing the document changes what people see, without a new code.",
      ],
    },
    faqs: [
      {
        question: "Can people edit the document?",
        answer:
          "Only if you share it with edit access. Choose Viewer in the sharing settings for a read-only document.",
      },
    ],
    related: ["google-drive", "google-sheets", "google-slides", "google-forms"],
  },
  {
    type: "google-sheets",
    name: "Google Sheets",
    group: "utilities",
    summary: "Open a shared Google Sheets spreadsheet.",
    metaDescription:
      "Make a Google Sheets QR code that opens a shared spreadsheet: a schedule, a price list or a sign-up sheet. Paste the link. Free.",
    intro: [
      "A Google Sheets QR code opens a shared spreadsheet: a schedule on a door, a price list in a shop, or a sign-up sheet at an event.",
      "Paste the spreadsheet's link, shared with Anyone with the link, so people who scan don't have to request access.",
    ],
    steps: [
      "Share the spreadsheet with Anyone with the link.",
      "Copy its link and paste it here.",
      "Scan the preview to check it opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://docs.google.com/spreadsheets/d/<id>/…",
      example: "https://docs.google.com/spreadsheets/d/example-sheet-id/edit",
      notes: [
        "QRdx keeps the link as pasted, including a #gid= tab.",
        "Updates to the sheet show up for everyone who scans.",
      ],
    },
    faqs: [
      {
        question: "Can the code open one tab?",
        answer:
          "Yes. Open that tab and copy the link; it ends with #gid= and the tab's number.",
      },
    ],
    related: ["google-docs", "google-forms", "google-drive", "google-slides"],
  },
  {
    type: "google-slides",
    name: "Google Slides",
    group: "utilities",
    summary: "Open a shared Google Slides presentation.",
    metaDescription:
      "Create a Google Slides QR code so people get your deck from the screen: talks, classes and pitches. Paste the link. Free.",
    intro: [
      "A Google Slides QR code opens a shared presentation, so the audience gets your slides from the screen at a talk, a class or a pitch.",
      "Paste the presentation's link, shared with Anyone with the link.",
    ],
    steps: [
      "Share the presentation with Anyone with the link.",
      "Copy its link and paste it here.",
      "Scan the preview to check it opens.",
      "Download the code and add it to your last slide.",
    ],
    payload: {
      format: "https://docs.google.com/presentation/d/<id>/…",
      example: "https://docs.google.com/presentation/d/example-deck-id/edit",
      notes: [
        "QRdx keeps the link as pasted.",
        "A link ending in /present opens the slideshow instead of the editor.",
      ],
    },
    faqs: [
      {
        question: "How big should the code be on a slide?",
        answer:
          "Big enough to scan from the back of the room: about a fifth of the slide's height works in most rooms.",
      },
    ],
    related: ["google-docs", "google-drive", "canva", "google-forms"],
  },
  {
    type: "google-forms",
    name: "Google Forms",
    group: "utilities",
    summary: "Open a Google Form: a survey, quiz or sign-up.",
    metaDescription:
      "Make a Google Forms QR code that opens your survey, quiz, sign-up or order form. Paste the form link or forms.gle short link. Free.",
    intro: [
      "A Google Forms QR code opens your form, so people answer a survey, take a quiz or sign up from a poster, a table card or a slide.",
      "In your form, use Send and the link tab, then paste the link here. The short forms.gle link makes a simpler code.",
    ],
    steps: [
      "In the form, use Send, then the link tab, and shorten the URL.",
      "Paste the link here.",
      "Scan the preview to check the form opens.",
      "Download the code.",
    ],
    payload: {
      format:
        "https://forms.gle/<code> or https://docs.google.com/forms/d/e/<id>/viewform",
      example: "https://forms.gle/ExampleForm123",
      notes: [
        "QRdx keeps the link as pasted.",
        "A form limited to your organization asks people to sign in.",
      ],
    },
    faqs: [
      {
        question: "What's the difference from the Attendance generator?",
        answer:
          "Attendance is set up for checking people in. This one opens any Google Form.",
      },
    ],
    related: ["attendance", "microsoft-forms", "google-sheets", "google-docs"],
  },
  {
    type: "microsoft-forms",
    name: "Microsoft Forms",
    group: "utilities",
    summary: "Open a Microsoft Form: a survey, quiz or registration.",
    metaDescription:
      "Create a Microsoft Forms QR code that opens your survey, quiz or registration form. Paste the share link from Forms. Free, no signup.",
    intro: [
      "A Microsoft Forms QR code opens your form, so people answer a survey, a quiz or a registration from a poster, a slide or a handout.",
      "In your form, use Collect responses and Copy link, then paste it here. A shortened forms.office.com/r/ link makes a simpler code.",
    ],
    steps: [
      "In the form, use Collect responses, then Copy link.",
      "Paste the link here.",
      "Scan the preview to check the form opens.",
      "Download the code.",
    ],
    payload: {
      format:
        "https://forms.office.com/r/<code> or a forms.cloud.microsoft link",
      example: "https://forms.office.com/r/Example123",
      notes: [
        "QRdx keeps the link as pasted. Older forms.office.com links keep working.",
        "A form limited to your organization asks people to sign in.",
      ],
    },
    faqs: [
      {
        question: "Can anyone answer the form?",
        answer:
          "If you set it so anyone can respond. Forms limited to your organization need a work or school sign-in.",
      },
    ],
    related: ["google-forms", "microsoft-teams", "attendance", "url"],
  },
  {
    type: "notion",
    name: "Notion",
    group: "utilities",
    summary: "Open a public Notion page.",
    metaDescription:
      "Make a Notion QR code that opens a page you've published to the web: a wiki, guide, menu or portfolio. Paste the link. Free.",
    intro: [
      "A Notion QR code opens a page you've published to the web, like an event guide, a team wiki, a menu or a portfolio.",
      "In Notion, publish the page to the web, copy its link (yourname.notion.site/…) and paste it here.",
    ],
    steps: [
      "Publish the page to the web in Notion.",
      "Copy its link and paste it here.",
      "Scan the preview on a phone that isn't signed in to check it opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://<domain>.notion.site/<page>",
      example: "https://bloomandleaf.notion.site/Example-page",
      notes: [
        "QRdx keeps the link as pasted; older notion.so public links redirect.",
        "If you change your notion.site domain, old links stop working.",
      ],
    },
    faqs: [
      {
        question: "Do people need a Notion account?",
        answer: "No. Published pages open in any browser.",
      },
    ],
    related: ["google-docs", "url", "canva", "linktree"],
  },
  {
    type: "canva",
    name: "Canva",
    group: "utilities",
    summary: "Open a shared Canva design.",
    metaDescription:
      "Create a Canva QR code that opens a design's public view link: a flyer, menu, presentation or portfolio. Paste the link. Free.",
    intro: [
      "A Canva QR code opens a design you've shared, like a flyer, a menu, a presentation or a portfolio.",
      "In Canva, use Share and Public view link, copy it and paste it here.",
    ],
    steps: [
      "In Canva, use Share, then Public view link, and copy it.",
      "Paste the link here.",
      "Scan the preview to check the design opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://www.canva.com/design/<id>/… or a canva.link short link",
      example: "https://www.canva.com/design/DAExample123/view",
      notes: [
        "QRdx keeps the link as pasted.",
        "Deleting the public view link in Canva stops the code from opening the design.",
      ],
    },
    faqs: [
      {
        question: "Will edits to the design show?",
        answer: "Yes. The view link shows the current version of the design.",
      },
    ],
    related: ["google-slides", "notion", "google-drive", "url"],
  },
  {
    type: "app-store",
    name: "App Store",
    group: "utilities",
    summary: "Open an app's page on the App Store.",
    metaDescription:
      "Make an App Store QR code that opens your iPhone or iPad app's page, or its review form. Paste the link or app ID. Free.",
    intro: [
      "An App Store QR code opens your app's page, so people download it from a poster, packaging or your shop counter.",
      "Paste the app's apps.apple.com link, or type its ID (the number after id). Turn on 'Open the review form' to add Apple's write-review action to the link.",
    ],
    steps: [
      "Copy your app's link from the App Store, or find its ID in App Store Connect.",
      "Paste it here; turn on the review form if you're asking for ratings.",
      "Scan the preview on an iPhone to check it opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://apps.apple.com/app/id<number>[?action=write-review]",
      example: "https://apps.apple.com/app/id1234567890",
      notes: [
        "action=write-review is Apple's documented link to an app's review form.",
        "For one code that offers both stores, make a hosted app page instead.",
      ],
    },
    faqs: [
      {
        question: "What happens on Android?",
        answer:
          "The App Store page opens in the browser. Print a Google Play code next to it for Android.",
      },
    ],
    related: ["google-play", "url", "trustpilot", "google-review"],
  },
  {
    type: "google-play",
    name: "Google Play",
    group: "utilities",
    summary: "Open an Android app's page on Google Play.",
    metaDescription:
      "Create a Google Play QR code that opens your Android app's store page. Paste the link or type the package name. Free, no signup.",
    intro: [
      "A Google Play QR code opens your Android app's page in the Play Store, so people install it from a poster, packaging or a shop counter.",
      "Type the app's package name (like com.example.app) and QRdx builds Google's documented store link, or paste the play.google.com link.",
    ],
    steps: [
      "Enter the package name, or paste the app's Google Play link.",
      "Scan the preview on an Android phone to check it opens.",
      "Download the code.",
    ],
    payload: {
      format: "https://play.google.com/store/apps/details?id=<package name>",
      example:
        "https://play.google.com/store/apps/details?id=com.example.bloomandleaf",
      notes: [
        "Package names have two or more parts separated by dots, each starting with a letter.",
        "A developer page link (store/apps/dev?id=…) works too.",
      ],
    },
    faqs: [
      {
        question: "Can the code open the review form?",
        answer:
          "Google Play has no link to its review form; people rate an app from its store page or inside the app.",
      },
    ],
    related: ["app-store", "url", "google-review", "trustpilot"],
  },
];

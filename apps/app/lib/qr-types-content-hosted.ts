import { formatBytes } from "@/lib/files/types";
import { PLAN_LIMITS } from "@/lib/plans";
import type { PageTypeId } from "@/lib/seo-content/page-types";
import type { ContentType } from "@/types/qr-content";
import type { QrTypeFaq } from "./qr-types-content";

/**
 * Copy for the /qr-code-generator/<slug> pages whose code opens a hosted
 * page instead of holding the content: the PDF, the digital business card
 * (vCard Plus) and the page types added since (guest Wi-Fi, location,
 * resume, invitation, contact form, lost and found, message). They need a
 * free account, so the page's button opens
 * the dashboard's New page dialog with that page type picked
 * (app/(app)/dashboard/[workspace]/pages/page.tsx reads `?new=`).
 *
 * Every claim must match the page builder and docs: apps/docs/content/docs/
 * landing-pages.mdx, files.mdx and nfc.mdx. Limits come from lib/plans.ts.
 */

export type HostedTypeSlug =
  | "pdf"
  | "business-card"
  // Added 2026-11-22 (pages)
  | "guest-wifi"
  | "location"
  | "resume"
  | "invitation"
  | "contact-form"
  | "lost-and-found"
  | "message";

export interface HostedQrTypeContent {
  slug: HostedTypeSlug;
  /** The hosted page type the button starts (lib/landing/page-type-ids.ts) */
  page: PageTypeId;
  /** The template the demo link opens (/templates/<page>/<demo>) */
  demo: string;
  /** Display name in cards and breadcrumbs: "PDF" */
  name: string;
  /** H1 and <title> (before the "| QRdx" suffix) */
  title: string;
  /** One line for cards */
  summary: string;
  /** The button that starts the page */
  cta: string;
  /** At most 155 characters */
  metaDescription: string;
  intro: [string, string];
  steps: string[];
  /** What the page shows the people who scan it */
  features: { title: string; description: string }[];
  /** Changing it after the code is printed */
  editing: string[];
  /** The static code that does part of the job without an account */
  compare: {
    title: string;
    staticType: ContentType;
    staticLabel: string;
    staticPoints: string[];
    hostedLabel: string;
    hostedPoints: string[];
  };
  faqs: QrTypeFaq[];
  /** Static generators to link to */
  related: ContentType[];
}

const free = PLAN_LIMITS.free;
const pro = PLAN_LIMITS.pro;
const business = PLAN_LIMITS.business;

const FREE_PLAN = `Yes, with a free QRdx account. The Free plan includes ${free.landingPages} hosted pages, and each uses one of its ${free.dynamicCodes} dynamic codes. Free pages show a small "Made with QRdx" footer; Pro removes it and the page limit.`;

const GUARANTEE =
  "It keeps working. Under the Never-Hostage Guarantee, codes and pages you already have keep working after a downgrade, a failed payment or a cancellation, and scans are never paused. Plan limits only stop you from creating new ones.";

export const HOSTED_QR_TYPES: readonly HostedQrTypeContent[] = [
  {
    slug: "pdf",
    page: "pdf",
    demo: "document",
    name: "PDF",
    title: "Free PDF QR Code Generator",
    summary: "Upload a PDF to a hosted page and replace it any time.",
    cta: "Upload your PDF",
    metaDescription: `Turn a PDF into a QR code: upload it to a free QRdx page that people read or download on their phone. Replace the file later, same code. ${formatBytes(free.maxFileBytes)} on Free.`,
    intro: [
      "A PDF QR code opens your document on the phone that scans it: a menu, a brochure, a manual or a price list. You upload the PDF to a page QRdx hosts for you, and the code points to that page through a short link.",
      "Because the code holds the link, not the file, you can replace the PDF after printing, for next season's menu or a corrected manual, and every printed code opens the new version. It needs a free QRdx account.",
    ],
    steps: [
      "Sign in or create a free account, then start a PDF page: the button above opens it with the PDF type picked.",
      "Upload your PDF, or paste a link to one that's already online, and choose whether people can download it.",
      "Add a title and any buttons you want, such as a link to your website, then publish.",
      "Download the page's QR code, print it and scan it once to check.",
    ],
    features: [
      {
        title: "Reads in the browser",
        description:
          "On tablets and computers the PDF shows on the page; on phones, Open PDF shows it full screen. Nobody installs an app.",
      },
      {
        title: "Download and more files",
        description:
          "A Download button saves a copy, and a Downloads block lists more files with their own labels, such as the menu in a second language.",
      },
      {
        title: "Your page around it",
        description:
          "A title, your colors and logo, and buttons to your website or booking page, from the same blocks as every QRdx page.",
      },
      {
        title: "Fast and private",
        description:
          "Server-rendered for phones, with no QRdx analytics or chat scripts, and hidden from search engines unless you turn that on.",
      },
    ],
    editing: [
      "Replace the file behind the same link: in Dashboard → Files, choose Replace file next to the PDF and upload the new one. Pages and codes that use it show the new version within a minute. A PDF can only be replaced by a PDF.",
      "Change the page itself (its title, buttons and colors) and publish; the printed code stays the same. Every scan is counted without cookies, so you can see when the code is used.",
    ],
    compare: {
      title: "A PDF page, or a code that links to a PDF?",
      staticType: "google-drive",
      staticLabel: "Static code to a PDF link",
      staticPoints: [
        "No account: put the link of a PDF that's already online, in Google Drive or on your website, into a free static code.",
        "The link is written into the code, so printed codes stop working if the file is moved or its sharing is turned off.",
        "No scan counts, and nothing around the PDF.",
      ],
      hostedLabel: "Hosted PDF page",
      hostedPoints: [
        "A free QRdx account, and QRdx stores the file.",
        "Replace the PDF or edit the page any time; printed codes keep working.",
        "Scans counted without cookies, with your title, colors and buttons around the document.",
      ],
    },
    faqs: [
      { question: "Is the PDF QR code free?", answer: FREE_PLAN },
      {
        question: "How big can the PDF be?",
        answer: `Up to ${formatBytes(free.maxFileBytes)} per file on Free, with ${formatBytes(free.storageBytes)} of storage per workspace. Pro takes files up to ${formatBytes(pro.maxFileBytes)} and Business up to ${formatBytes(business.maxFileBytes)}. Big PDFs open slowly on phones, so compress scans and large images before uploading.`,
      },
      {
        question: "Can I change the PDF after printing?",
        answer:
          "Yes. Replace the file in Dashboard → Files and every code and page that uses it shows the new PDF within a minute. The printed code never changes.",
      },
      {
        question: "What happens to my code if I stop paying?",
        answer: GUARANTEE,
      },
      {
        question: "Do people need an app to open it?",
        answer:
          "No. The phone's camera opens the page in the browser, where the PDF can be read, opened full screen or downloaded.",
      },
      {
        question: "Can search engines find my PDF?",
        answer:
          "Not unless you want them to. Hosted pages are hidden from search engines until you turn on Show in search engines in the page's settings.",
      },
      {
        question: "Can I make a PDF QR code without an account?",
        answer:
          "Only for a PDF that's already online: paste its link into the URL or Google Drive generator for a free static code. QRdx only stores the file for you with an account.",
      },
    ],
    related: ["google-drive", "url", "text"],
  },
  {
    slug: "business-card",
    page: "vcard",
    demo: "classic",
    name: "Digital Business Card",
    title: "Digital Business Card QR Code Generator",
    summary: "A contact page with your photo, buttons and Save contact.",
    cta: "Create your card",
    metaDescription: `Make a digital business card with a QR code: your photo, contact buttons and Save contact. Edit it without reprinting. Free account, ${free.landingPages} pages included.`,
    intro: [
      "A digital business card QR code opens a contact page that QRdx hosts for you: your photo, name and job title, buttons to call, email, message or get directions, your links, and a Save contact button that adds you to the phone's contacts.",
      "The code holds a short link, so you can change your number, title or photo after the cards are printed and every card shows the new details. It needs a free QRdx account. For a code that holds the contact itself, with no account, use the vCard QR code generator.",
    ],
    steps: [
      "Sign in or create a free account, then start a vCard Plus page: the button above opens it with that type picked.",
      "Pick a template (Classic, Midnight, Minimal or Real estate agent) and fill in your details, photo and links.",
      "Publish the page, then download its QR code for your business card, email signature or badge.",
      "Scan it once and tap Save contact to check what lands in your contacts.",
    ],
    features: [
      {
        title: "Save contact",
        description:
          "Downloads a vCard 3.0 file that phones open in their contacts app, with your name, company, job title, phones, emails, website, address, bio, social profiles and photo.",
      },
      {
        title: "Quick actions",
        description:
          "Call, WhatsApp, email and directions buttons, so people can reach you before they save anything.",
      },
      {
        title: "Share",
        description:
          "Opens the phone's share sheet, so the person you met can pass your card on.",
      },
      {
        title: "Scan counts",
        description:
          "The code counts scans without cookies, so you can see how many people opened your card and when.",
      },
    ],
    editing: [
      "Change anything on the page and publish: a new number, a new job title, a new photo. Every printed card opens the new version, and each publish is kept as a version.",
      "The same page can go on an NFC card: its code has Put this card on NFC, which writes the page's link to a blank NFC card from Chrome on Android, and taps are counted apart from scans.",
    ],
    compare: {
      title: "vCard QR code or digital business card?",
      staticType: "vcard",
      staticLabel: "vCard QR code (static)",
      staticPoints: [
        "No account, free for good: the contact details are written into the code itself.",
        "Works offline: the phone offers to save the contact without opening a page.",
        "Can't change after printing, has no photo, and every extra field makes the code denser.",
      ],
      hostedLabel: "Digital business card (hosted page)",
      hostedPoints: [
        "A free QRdx account; the code opens a page QRdx hosts.",
        "Edit your details, photo and links any time; printed cards keep working.",
        "Photo, buttons, links and Save contact, plus scan counts.",
      ],
    },
    faqs: [
      { question: "Is the digital business card free?", answer: FREE_PLAN },
      {
        question: "What does Save contact add to the phone?",
        answer:
          "A vCard 3.0 contact with your name, company, job title, phones, emails, website, address, bio, the page's social profiles and your photo. Photos uploaded to QRdx are embedded in the file; photos linked from other sites are included as a link.",
      },
      {
        question: "Can I change my details after printing?",
        answer:
          "Yes. Edit the page and publish; the printed code keeps opening it, now with your new details.",
      },
      {
        question: "What happens to my card if I stop paying?",
        answer: GUARANTEE,
      },
      {
        question: "Should I use a vCard QR code instead?",
        answer:
          "If your details won't change and you don't need a photo or links, yes: a static vCard code needs no account and works offline. If you want to edit the card later or see scans, use the hosted card.",
      },
      {
        question: "Do people need an app?",
        answer:
          "No. The phone's camera opens the card in the browser, and Save contact hands the file to the built-in contacts app.",
      },
      {
        question: "Can I put it on an NFC business card?",
        answer:
          "Yes. QRdx doesn't sell cards: buy blank NFC cards and write the page's link to them from the code's NFC page in Chrome on Android. Editing the page updates every card you've handed out.",
      },
    ],
    related: ["vcard", "linkedin", "email"],
  },
  // Added 2026-11-22 (pages)
  {
    slug: "guest-wifi",
    page: "wifi",
    demo: "cafe",
    name: "Guest Wi-Fi Page",
    title: "Guest Wi-Fi Page QR Code Generator",
    summary: "A Wi-Fi page with the password to copy and steps to join.",
    cta: "Create your Wi-Fi page",
    metaDescription:
      "A guest Wi-Fi page behind a QR code: network name, a password to copy and steps to join on iPhone and Android. Change the password, keep the code.",
    intro: [
      "A guest Wi-Fi page QR code opens a page QRdx hosts for you with your network name, the password with a copy button, and short steps to join on iPhone and Android in each guest's own language. Add house rules, where the router is, or a button to message you.",
      "It helps where a Wi-Fi QR code can't: a scanner app or an older phone that doesn't join networks, a hidden network, or a guest who wants to read the password. The code holds a link, so you can change the password after printing and every printed code shows the new one. It needs a free QRdx account.",
    ],
    steps: [
      "Sign in or create a free account, then start a Guest Wi-Fi page: the button above opens it with that type picked.",
      "Pick a template (Café, Holiday rental or Office visitors) and enter your network name, password and security type.",
      "Add your house rules or a note, then publish.",
      "Download the page's QR code, print it and scan it once to check.",
    ],
    features: [
      {
        title: "Copy buttons",
        description:
          "The network name and the password each have a copy button, so guests paste the password instead of typing it.",
      },
      {
        title: "How to join",
        description:
          "Short steps for iPhone and Android in each guest's language, including how to add a hidden network by name.",
      },
      {
        title: "House rules and notes",
        description:
          "Your own text under the network: quiet hours, check-out time, where the router is, or a button to message you.",
      },
      {
        title: "Scan counts",
        description:
          "The code counts scans without cookies, so you can see how often guests use it.",
      },
    ],
    editing: [
      "Changed the password? Edit the page and publish: every printed code shows the new one, so there's nothing to reprint.",
      "Anyone who opens the page can read the password, just as anyone who scans a Wi-Fi QR code can join. Use a guest network that's kept apart from your own devices.",
    ],
    compare: {
      title: "A Wi-Fi QR code or a guest Wi-Fi page?",
      staticType: "wifi",
      staticLabel: "Wi-Fi QR code (static)",
      staticPoints: [
        "No account: the network name and password are written into the code.",
        "The camera apps on iPhone and most Android phones offer to join in one tap.",
        "A new password means printing a new code, and there's nowhere for house rules.",
      ],
      hostedLabel: "Guest Wi-Fi page",
      hostedPoints: [
        "A free QRdx account; the code opens a page QRdx hosts.",
        "Guests copy the password and follow the steps: a web page can't join the network for them.",
        "Change the password or the rules any time; printed codes keep working.",
      ],
    },
    faqs: [
      { question: "Is the guest Wi-Fi page free?", answer: FREE_PLAN },
      {
        question: "Can the page join the network for my guests?",
        answer:
          "No. Browsers aren't allowed to change a phone's Wi-Fi settings, so the page shows the password with a copy button and the steps to join. For a one-tap join, print a Wi-Fi QR code as well.",
      },
      {
        question: "Can I change the password after printing?",
        answer:
          "Yes. Edit the page and publish; every printed code shows the new password.",
      },
      {
        question: "Is the password private?",
        answer:
          "No. Anyone who scans the code or opens the page's link can read it. Hosted pages are hidden from search engines unless you turn on Show in search engines, but treat the password as shared with everyone who can see the code.",
      },
      {
        question: "Does it work with a hidden network?",
        answer:
          "Yes. Switch on Hidden network and the steps explain how to add the network by its name on iPhone and Android.",
      },
      {
        question: "What happens to my page if I stop paying?",
        answer: GUARANTEE,
      },
    ],
    related: ["wifi", "text", "url"],
  },
  {
    slug: "location",
    page: "location",
    demo: "shop",
    name: "Location Page",
    title: "Location Page QR Code Generator",
    summary: "Your address with a map and buttons for three map apps.",
    cta: "Create your location page",
    metaDescription:
      "A location page behind a QR code: your address, a map, directions in Google Maps, Apple Maps or Waze, and opening hours. Moved? Edit it, keep the code.",
    intro: [
      "A location QR code opens a page QRdx hosts for you with your address, an optional map, and buttons that open directions in Google Maps, Apple Maps or Waze, so people use the app they already have. Add opening hours with an Open now badge, where the entrance is, parking and the nearest stop.",
      "The code holds a short link, so if you move or change your hours, edit the page and every printed code shows the new details. It needs a free QRdx account. For a code that opens Google Maps with no account, use the Google Maps QR code generator.",
    ],
    steps: [
      "Sign in or create a free account, then start a Location page: the button above opens it with that type picked.",
      "Pick a template (Shop, Venue or Meeting point) and enter the address.",
      "Turn the map and the Waze button on or off, add opening hours and notes, then publish.",
      "Download the page's QR code, print it and scan it once to check the directions.",
    ],
    features: [
      {
        title: "Three map apps",
        description:
          "Google Maps, Apple Maps and Waze buttons, each opening the app when it's installed and its website when it isn't.",
      },
      {
        title: "A map on the page",
        description:
          "An embedded Google map of the address when you turn it on. It loads content from Google for visitors, so it stays off until you choose it.",
      },
      {
        title: "Opening hours",
        description:
          "Hours for each day, split shifts included, with an Open now badge that follows the time zone you set.",
      },
      {
        title: "Notes that help",
        description:
          "Where the entrance is, parking, the nearest stop or step-free access, as text or a list of details.",
      },
    ],
    editing: [
      "Moved, or changed your hours? Edit the page and publish; signs, flyers and cards that are already printed open the new details.",
      "Every scan is counted without cookies, so you can see when people look up the way to you.",
    ],
    compare: {
      title: "A Google Maps QR code or a location page?",
      staticType: "maps",
      staticLabel: "Google Maps QR code (static)",
      staticPoints: [
        "No account: the code holds a Google Maps link to the place.",
        "Opens Google Maps, or its website where the app isn't installed.",
        "Can't change after printing, and shows nothing else: no hours or notes.",
      ],
      hostedLabel: "Location page",
      hostedPoints: [
        "A free QRdx account; the code opens a page QRdx hosts.",
        "Google Maps, Apple Maps and Waze, plus a map, hours and notes.",
        "Edit the address or hours any time; printed codes keep working.",
      ],
    },
    faqs: [
      { question: "Is the location page free?", answer: FREE_PLAN },
      {
        question: "Which map apps does it open?",
        answer:
          "Google Maps, Apple Maps and, when you turn its button on, Waze. Each button opens the app when it's installed and the map's website when it isn't.",
      },
      {
        question: "Can I change the address after printing?",
        answer:
          "Yes. Edit the page and publish; every printed code opens the new address.",
      },
      {
        question: "Does the map load anything from Google?",
        answer:
          "The embedded map does: it's a Google map, so it loads content from Google when the page opens. That's why it's off until you turn it on. Without it, the page loads nothing from Google until someone taps the Google Maps button.",
      },
      {
        question: "What happens to my page if I stop paying?",
        answer: GUARANTEE,
      },
    ],
    related: ["maps", "waze", "vcard"],
  },
  {
    slug: "resume",
    page: "resume",
    demo: "designer",
    name: "Resume",
    title: "Resume and CV QR Code Generator",
    summary: "A CV page with your photo, experience, skills and a PDF.",
    cta: "Create your resume page",
    metaDescription:
      "Put your resume behind a QR code: a CV page with your photo, experience, education, skills, links and a PDF to download. Update it, keep the code.",
    intro: [
      "A resume QR code opens a CV page QRdx hosts for you: your photo and headline, a short summary, your experience and education in order, your skills, links to your portfolio, LinkedIn or GitHub, and your CV as a PDF to download.",
      "Print the code on a paper CV, a business card or a portfolio, and whoever scans it sees the latest version: edit the page when you change jobs and every printed code opens it. It needs a free QRdx account.",
    ],
    steps: [
      "Sign in or create a free account, then start a Resume / CV page: the button above opens it with that type picked.",
      "Pick a template (Designer, Developer or Graduate), add your photo and fill in your experience, education and skills.",
      "Add your links and your CV as a PDF, then publish.",
      "Download the page's QR code for your printed CV or card, and scan it once to check.",
    ],
    features: [
      {
        title: "Experience and education",
        description:
          "Each role or course with its dates, the company or school, and a line about what you did, in order.",
      },
      {
        title: "Skills and facts",
        description:
          "Skills, languages or where you're based, as a list or as tiles.",
      },
      {
        title: "Links",
        description: "Your portfolio, LinkedIn, GitHub or email as buttons.",
      },
      {
        title: "Your CV as a PDF",
        description:
          "A download button for the PDF, uploaded to QRdx or linked from where it already lives.",
      },
    ],
    editing: [
      "Edit the page and publish when anything changes: a new job, a new skill, a new photo. Every printed code opens the new version, and each publish is kept as a version.",
      "Replace an uploaded PDF in Dashboard → Files and the page offers the new file within a minute. Scans are counted without cookies, so you can see when someone opens your CV.",
    ],
    compare: {
      title: "A LinkedIn QR code or a resume page?",
      staticType: "linkedin",
      staticLabel: "LinkedIn QR code (static)",
      staticPoints: [
        "No account: the code opens your LinkedIn profile.",
        "The profile stays current as you edit it on LinkedIn.",
        "It shows LinkedIn's layout, and people who aren't signed in may see only part of it.",
      ],
      hostedLabel: "Resume page",
      hostedPoints: [
        "A free QRdx account; the code opens a page QRdx hosts.",
        "Your own layout and colors, a PDF to download, and no sign-in for readers.",
        "Edit it any time; printed codes keep working, and scans are counted.",
      ],
    },
    faqs: [
      { question: "Is the resume page free?", answer: FREE_PLAN },
      {
        question: "Can people download my CV?",
        answer: `Yes. Add the PDF to the page's Downloads block, uploaded to QRdx (up to ${formatBytes(free.maxFileBytes)} per file on Free) or linked from where it's already online.`,
      },
      {
        question: "Can I update it after printing?",
        answer:
          "Yes. Edit the page and publish; every printed code opens the new version.",
      },
      {
        question: "Will my resume show up in search engines?",
        answer:
          "Not unless you want it to. Hosted pages are hidden from search engines until you turn on Show in search engines in the page's settings. Anyone with the code or the link can read it, so leave out your home address and anything you'd rather keep private.",
      },
      {
        question: "What happens to my page if I stop paying?",
        answer: GUARANTEE,
      },
    ],
    related: ["linkedin", "vcard", "email"],
  },
  {
    slug: "invitation",
    page: "invitation",
    demo: "wedding",
    name: "Invitation",
    title: "Invitation QR Code Generator for Weddings and Parties",
    summary: "An invitation page with the day's plan, directions and an RSVP.",
    cta: "Create your invitation",
    metaDescription:
      "Put a QR code on your invitations: a page with the date, directions to the venue, the day's schedule, dress code and an RSVP form. Plans change? Edit it.",
    intro: [
      "An invitation QR code opens a page QRdx hosts for you with what doesn't fit on the card: the date and time with add-to-calendar buttons, the venue with directions in Google Maps, Apple Maps or Waze, the schedule of the day, the dress code and an RSVP form.",
      "Replies arrive in your dashboard, one row per guest, ready to export to a spreadsheet. If the start time or the venue changes, edit the page and every printed card shows the new plan. It needs a free QRdx account.",
    ],
    steps: [
      "Sign in or create a free account, then start an Invitation page: the button above opens it with that type picked.",
      "Pick a template (Wedding, Birthday party or Dinner party), set the date, time and venue, and fill in the schedule.",
      "Choose the RSVP questions, such as meal choices or a plus one, then publish.",
      "Download the QR code, add it to your printed invitations and scan one to check.",
    ],
    features: [
      {
        title: "Add to calendar",
        description:
          "Google Calendar, Outlook and Yahoo buttons, plus an .ics file for Apple Calendar and other calendar apps.",
      },
      {
        title: "Directions",
        description:
          "The venue's address with Google Maps, Apple Maps and Waze buttons.",
      },
      {
        title: "The day's schedule",
        description:
          "Each part of the day with its time and place, from arrival to the last dance.",
      },
      {
        title: "RSVP form",
        description:
          "The questions you choose, answered in your dashboard and exported as CSV. On Pro and Business, each reply can also be emailed to you.",
      },
    ],
    editing: [
      "Plans change: edit the page and publish, and every printed invitation shows the new time, venue or schedule. Guests who already added it to their calendar keep the old entry, so let them know too.",
      `RSVPs count towards the workspace's form responses: ${free.formResponsesPerMonth} a month on Free and ${pro.formResponsesPerMonth.toLocaleString("en-US")} on Pro. Replies you already have are never deleted or hidden.`,
    ],
    compare: {
      title: "A WhatsApp RSVP code or an invitation page?",
      staticType: "whatsapp",
      staticLabel: "WhatsApp QR code (static)",
      staticPoints: [
        'No account: the code opens a WhatsApp chat with you, with a reply such as "We\'ll be there" already typed.',
        "Replies arrive one by one among your other chats.",
        "Holds no date, venue or schedule, and can't change after printing.",
      ],
      hostedLabel: "Invitation page",
      hostedPoints: [
        "A free QRdx account; the code opens a page QRdx hosts.",
        "Date, directions, the schedule, dress code and add to calendar.",
        "RSVPs in one list you can export; edit the details any time.",
      ],
    },
    faqs: [
      { question: "Is the invitation page free?", answer: FREE_PLAN },
      {
        question: "Where do the RSVPs go?",
        answer:
          "To the page's Responses in your dashboard: one row per reply with every answer, newest first, and Export CSV for a spreadsheet. On Pro and Business you can also get each reply by email.",
      },
      {
        question: "How many RSVPs can I collect?",
        answer: `Free includes ${free.formResponsesPerMonth} form responses a month across the workspace, Pro ${pro.formResponsesPerMonth.toLocaleString("en-US")} and Business ${business.formResponsesPerMonth.toLocaleString("en-US")}. When the limit is reached, the form asks guests to try again later and keeps what they typed.`,
      },
      {
        question: "Can I change the time or venue after printing?",
        answer:
          "Yes. Edit the page and publish; every printed code opens the new details.",
      },
      {
        question: "Can guests see who else is coming?",
        answer:
          "No. Replies are only shown to you and your workspace in the dashboard.",
      },
      {
        question: "What happens to my page if I stop paying?",
        answer: GUARANTEE,
      },
    ],
    related: ["whatsapp", "maps", "sms"],
  },
  {
    slug: "contact-form",
    page: "form",
    demo: "contact-us",
    name: "Contact Form",
    title: "Contact Form QR Code Generator",
    summary: "A contact or quote form whose answers land in your dashboard.",
    cta: "Create your form",
    metaDescription:
      "Turn a QR code into a contact form: name, email, phone and a message, or the questions you choose. Answers land in your dashboard. Free QRdx account.",
    intro: [
      "A contact form QR code opens a short form QRdx hosts for you. Keep the fields you need, such as name, email, phone and a message, or add your own questions: a choice of services, a postcode, a consent box. People fill it in on their phone and press send.",
      "Answers arrive in your dashboard with the time and the code that was scanned, so a flyer, a van and a trade show stand can each have their own code. It needs a free QRdx account.",
    ],
    steps: [
      "Sign in or create a free account, then start a Contact form page: the button above opens it with that type picked.",
      "Pick a template (Contact us, Quote request or Trade show leads) and keep, remove or add questions.",
      "Write the button label and the thank-you message, then publish.",
      "Download the page's QR code, print it and send yourself a test response.",
    ],
    features: [
      {
        title: "Fields you choose",
        description:
          "Text, email, phone, choices and a consent checkbox, each optional or required, with your own labels.",
      },
      {
        title: "Responses inbox",
        description:
          "Every answer under Responses, newest first, with Export CSV for a spreadsheet or CRM.",
      },
      {
        title: "Alerts and webhooks",
        description:
          "Email alerts for each response on Pro and Business; Slack, Discord and webhooks on Business.",
      },
      {
        title: "Spam protection",
        description:
          "A hidden field that only bots fill in, and limits on how often one device can send.",
      },
    ],
    editing: [
      "Change the questions any time and publish: printed codes open the new form, and exports keep the columns of removed questions that already have answers.",
      `Responses count per workspace each calendar month: ${free.formResponsesPerMonth} on Free, ${pro.formResponsesPerMonth.toLocaleString("en-US")} on Pro and ${business.formResponsesPerMonth.toLocaleString("en-US")} on Business. Responses you already have are never deleted or hidden.`,
    ],
    compare: {
      title: "An email QR code or a contact form?",
      staticType: "email",
      staticLabel: "Email QR code (static)",
      staticPoints: [
        "No account: the code opens an email draft to you, with the subject and message filled in.",
        "People need an email app set up on their phone.",
        "Replies land among your other email, and the address can't change after printing.",
      ],
      hostedLabel: "Contact form",
      hostedPoints: [
        "A free QRdx account; the code opens a form QRdx hosts.",
        "Works in any phone browser, with the questions you choose.",
        "Answers in one list you can export; edit the form any time.",
      ],
    },
    faqs: [
      { question: "Is the contact form free?", answer: FREE_PLAN },
      {
        question: "Where do the answers go?",
        answer:
          "To the page's Responses in your dashboard, newest first, with the time and the code that was scanned. Export CSV gives one row per response and one column per question. On Pro and Business each response can also be emailed to you.",
      },
      {
        question: "How many responses can I get?",
        answer: `Free includes ${free.formResponsesPerMonth} responses a month across the workspace, Pro ${pro.formResponsesPerMonth.toLocaleString("en-US")} and Business ${business.formResponsesPerMonth.toLocaleString("en-US")}. The count starts over on the 1st of each month.`,
      },
      {
        question: "Can I change the questions after printing?",
        answer:
          "Yes. Edit the form and publish; the printed code opens the new version, and the answers you already have stay.",
      },
      {
        question: "Is it protected from spam?",
        answer:
          "Yes. A hidden field catches most bots and one device can only send so often. When the server has Cloudflare Turnstile keys, forms also run Turnstile's invisible check.",
      },
      {
        question: "What happens to my form if I stop paying?",
        answer: GUARANTEE,
      },
    ],
    related: ["email", "phone", "whatsapp"],
  },
  {
    slug: "lost-and-found",
    page: "asset-tag",
    demo: "luggage",
    name: "Lost and Found Tag",
    title: "Lost and Found QR Code Generator",
    summary: "A tag page that helps whoever finds your things reach you.",
    cta: "Create your tag",
    metaDescription:
      "Lost and found QR tags for luggage, laptops and keys: call and message buttons, a reward note and a found-it form. New number? Edit it, keep the tag.",
    intro: [
      "A lost and found QR code goes on a sticker or tag on your bag, laptop, keys or camera. Whoever finds it scans it and gets a page QRdx hosts for you: who it belongs to, buttons to call, text or WhatsApp you, a reward note if you offer one, and a form to say where it is.",
      "The tag holds a short link, so a new phone number or email is one edit away and the tag you stuck on years ago still reaches you. It needs a free QRdx account.",
    ],
    steps: [
      "Sign in or create a free account, then start a Lost & found tag page: the button above opens it with that type picked.",
      "Pick a template (Luggage, Laptop & equipment or Keys) and add the buttons and details a finder needs.",
      "Publish, then download the QR code and print it as a sticker or tag.",
      "Scan it once to check the call button dials your number.",
    ],
    features: [
      {
        title: "Call and message",
        description:
          "Buttons that call or text you, and WhatsApp when you turn it on for your number.",
      },
      {
        title: "Found-it form",
        description:
          "The finder says where the item is and how to reach them; the answer lands in your dashboard.",
      },
      {
        title: "Asset details",
        description:
          "An asset number, the item and where to return it, for company laptops and equipment.",
      },
      {
        title: "Scan counts",
        description:
          "Every scan is counted without cookies, so you can see when someone has scanned the tag.",
      },
    ],
    editing: [
      "New number or email? Edit the page and publish; every tag you've already stuck on opens the new details.",
      "Anyone who finds the item can read the page, so show only what helps them return it: a first name and a phone number are usually enough.",
    ],
    compare: {
      title: "A phone QR code or a lost and found page?",
      staticType: "phone",
      staticLabel: "Phone QR code (static)",
      staticPoints: [
        "No account: the code holds your number and the phone offers to call it.",
        "Nothing to load: the call starts straight from the camera.",
        "No form or reward note, and a new number means a new tag.",
      ],
      hostedLabel: "Lost and found page",
      hostedPoints: [
        "A free QRdx account; the code opens a page QRdx hosts.",
        "Call, text and WhatsApp buttons, a reward note and a found-it form.",
        "Change your number any time; tags already in use keep working.",
      ],
    },
    faqs: [
      { question: "Is the lost and found tag free?", answer: FREE_PLAN },
      {
        question: "Can I see where my item was found?",
        answer:
          "Roughly. Like every dynamic code, the tag's analytics show when it was scanned and the country, region and city from the network, never an exact spot. The found-it form lets the finder tell you where the item is.",
      },
      {
        question: "Can I change my number later?",
        answer:
          "Yes. Edit the page and publish; every printed tag opens the new details.",
      },
      {
        question: "Is my phone number public?",
        answer:
          "Anyone who scans the tag or opens its link can see what's on the page. Hosted pages are hidden from search engines unless you turn on Show in search engines. Show only what a finder needs.",
      },
      {
        question: "What happens to my tag if I stop paying?",
        answer: GUARANTEE,
      },
    ],
    related: ["phone", "vcard", "sms"],
  },
  {
    slug: "message",
    page: "message",
    demo: "gift-note",
    name: "Message",
    title: "Message QR Code Generator",
    summary: "A short note with a photo and a button, editable after printing.",
    cta: "Create your message",
    metaDescription:
      "Put a message behind a QR code: a gift note, a thank-you card or a notice on the door, with a photo and one button. Edit it after printing, same code.",
    intro: [
      "A message QR code opens a short note on a page QRdx hosts for you: a heading, a few lines, an optional photo and one button. Put it on a gift tag, a card in every parcel or a sign on the door.",
      'The code holds a link, not the words, so you can change the message after printing, from "Closed today" back to your opening hours, and see how many people scanned it. It needs a free QRdx account. For words written into the code itself, with no account, use the text QR code generator.',
    ],
    steps: [
      "Sign in or create a free account, then start a Message page: the button above opens it with that type picked.",
      "Pick a template (Gift note, Thank-you card or Notice) and write your message.",
      "Add a photo and a button if you want them, then publish.",
      "Download the page's QR code, print it and scan it once to check.",
    ],
    features: [
      {
        title: "Your words, your look",
        description:
          "A heading and text in the fonts and colors you pick, with a photo if you add one.",
      },
      {
        title: "One button",
        description:
          "Send people on to a booking, a review page, your shop or a playlist.",
      },
      {
        title: "Edit after printing",
        description:
          "Change the message any time; the printed code stays the same.",
      },
      {
        title: "Scan counts",
        description:
          "See how many people opened the message and when, counted without cookies.",
      },
    ],
    editing: [
      "Edit the text, photo or button and publish: every printed code shows the new version, and each publish is kept as a version.",
      "Need it live only for a while? Start and end dates in the code's controls apply to the page too.",
    ],
    compare: {
      title: "A text QR code or a message page?",
      staticType: "text",
      staticLabel: "Text QR code (static)",
      staticPoints: [
        "No account, and nothing to load: the words are inside the code.",
        "Scanner apps show the text as plain words, with no photo or button.",
        "Can't change after printing, and long messages make the code dense.",
      ],
      hostedLabel: "Message page",
      hostedPoints: [
        "A free QRdx account; the code opens a page QRdx hosts.",
        "Your heading, text, a photo and a button, in your colors.",
        "Change it any time; printed codes keep working, and scans are counted.",
      ],
    },
    faqs: [
      { question: "Is the message page free?", answer: FREE_PLAN },
      {
        question: "Can I change the message after printing?",
        answer:
          "Yes. Edit the page and publish; the printed code opens the new message.",
      },
      {
        question: "Do people need an app?",
        answer: "No. The phone's camera opens the message in the browser.",
      },
      {
        question: "Should I use a text QR code instead?",
        answer:
          "If the message is short, won't change and doesn't need a photo, yes: a text code needs no account and works without internet. For a photo, a button or changes after printing, use the message page.",
      },
      {
        question: "What happens to my message if I stop paying?",
        answer: GUARANTEE,
      },
    ],
    related: ["text", "sms", "url"],
  },
];

export const HOSTED_TYPE_SLUGS: readonly HostedTypeSlug[] = HOSTED_QR_TYPES.map(
  (type) => type.slug,
);

const bySlug = new Map<string, HostedQrTypeContent>(
  HOSTED_QR_TYPES.map((type) => [type.slug, type]),
);

export function getHostedQrType(slug: string): HostedQrTypeContent | undefined {
  return bySlug.get(slug);
}

export const hostedTypePath = (slug: HostedTypeSlug) =>
  `/qr-code-generator/${slug}`;

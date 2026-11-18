// What the community's checks say when they refuse something (publishing,
// profiles, likes), and the lines the publish dialog shows about a page
// template, in English. The checks (./publish.ts, ./text.ts, ./scan-gate.ts,
// ./page-template.ts, ./handles.ts, ...) write these into errors and answers
// as they are, so the API, the AI chat and the Slack bot stay English. The
// server actions say them again in the language of the page that asked
// (lib/i18n/action-locale.ts), from communityActions.checks and
// communityActions.pageChanges in messages/en.json; a test keeps the
// catalog's English equal to these. Safe to import anywhere.
import type { Translator } from "@/lib/i18n/translator";

export const COMMUNITY_CHECK_MESSAGES = {
  licenceRequired: "Confirm the CC0 licence to publish.",
  publishedALot: "You've published a lot today. Try again tomorrow.",
  unavailable: "The community update isn't available on this deployment yet.",
  itemNotFound: "This item isn't in the community.",
  workspacePublishRefusal:
    "Only owners and admins of this workspace can publish what's in it.",
  nameRequired: "Give it a name.",
  alreadyPublished: "This design is already in the community.",
  themeSettings:
    "This theme has settings the community can't show. Save it again in the editor.",
  pageNothingLeft:
    "Nothing is left to share once your own details are taken out. Add some blocks people can reuse.",
  pageInvalid:
    "This page can't be shared as a template. Publish it again in the page editor first.",
  pageTooLarge:
    "This page is too large to share as a template. Remove some blocks or shorten long text.",
  repeatsDetail: "It repeats a detail taken out elsewhere on the page.",
  noEmails: "Leave email addresses out of names, labels and descriptions.",
  noLinks: "Leave links out of names, labels and descriptions.",
  noHandles: "Leave @handles out of names, labels and descriptions.",
  noPhones: "Leave phone numbers out of names, labels and descriptions.",
  noStreets: "Leave street addresses out of names, labels and descriptions.",
  gateFailed: ({ min, reasons }: { min: number; reasons: string }) =>
    `Only designs that scan Great (${min} or more) can be published. ${reasons}.`,
  gateTooLong: ({ sample }: { sample: string }) =>
    `${sample} won't fit in a code at this error correction level`,
  gateScore: ({ sample, score }: { sample: string; score: number }) =>
    `with ${sample} it scores ${score}`,
  gateSampleLink: "a link",
  gateSampleWifi: "Wi-Fi details",
  handleFormat: ({ min, max }: { min: number; max: number }) =>
    `Use ${min} to ${max} lowercase letters, numbers, "_" or "-", starting with a letter or number.`,
  handleReserved: "That handle is reserved.",
  handleTaken: "That handle is taken.",
  displayNameRequired: "Enter a display name.",
};

export type CommunityCheckMessages = typeof COMMUNITY_CHECK_MESSAGES;

/** One of those messages, picked from a set in any language. */
export type CheckMessage = (messages: CommunityCheckMessages) => string;

/**
 * A refusal whose message can be said again in another language: its
 * `message` is the English, and messageIn() picks the same message from
 * another language's set. Plain text (a message that has no translation,
 * such as a schema error) stays as it is in every language.
 */
export class CheckError extends Error {
  readonly check?: CheckMessage;

  constructor(message: string | CheckMessage) {
    super(
      typeof message === "string" ? message : message(COMMUNITY_CHECK_MESSAGES),
    );
    if (typeof message !== "string") this.check = message;
  }

  /** The message from `messages` (another language's set). */
  messageIn(messages: CommunityCheckMessages): string {
    return this.check ? this.check(messages) : this.message;
  }
}

/**
 * COMMUNITY_CHECK_MESSAGES in the catalog's language (communityActions.checks
 * in messages/en.json), for the server actions.
 */
export function communityCheckMessages(
  t: Translator<"communityActions.checks">,
): CommunityCheckMessages {
  return {
    licenceRequired: t("licenceRequired"),
    publishedALot: t("publishedALot"),
    unavailable: t("unavailable"),
    itemNotFound: t("itemNotFound"),
    workspacePublishRefusal: t("workspacePublishRefusal"),
    nameRequired: t("nameRequired"),
    alreadyPublished: t("alreadyPublished"),
    themeSettings: t("themeSettings"),
    pageNothingLeft: t("pageNothingLeft"),
    pageInvalid: t("pageInvalid"),
    pageTooLarge: t("pageTooLarge"),
    repeatsDetail: t("repeatsDetail"),
    noEmails: t("noEmails"),
    noLinks: t("noLinks"),
    noHandles: t("noHandles"),
    noPhones: t("noPhones"),
    noStreets: t("noStreets"),
    gateFailed: (values) => t("gateFailed", values),
    gateTooLong: (values) => t("gateTooLong", values),
    gateScore: (values) => t("gateScore", values),
    gateSampleLink: t("gateSampleLink"),
    gateSampleWifi: t("gateSampleWifi"),
    handleFormat: (values) => t("handleFormat", values),
    handleReserved: t("handleReserved"),
    handleTaken: t("handleTaken"),
    displayNameRequired: t("displayNameRequired"),
  };
}

const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** What the scrub changed on a page template (./page-template.ts scrubSummary). */
export const PAGE_CHANGE_MESSAGES = {
  texts: ({ count }: { count: number }) =>
    `${counted(count, "text", "texts")} replaced with sample text`,
  kept: ({ count }: { count: number }) =>
    `${counted(count, "text", "texts")} kept as you wrote it`,
  links: ({ count }: { count: number }) =>
    `${counted(count, "link", "links")} replaced with example.com`,
  emails: ({ count }: { count: number }) =>
    `${counted(count, "email address", "email addresses")} replaced with sample ones`,
  phones: ({ count }: { count: number }) =>
    `${counted(count, "phone number", "phone numbers")} replaced with sample ones`,
  emailsAndPhones: ({ emails, phones }: { emails: number; phones: number }) =>
    `${counted(emails, "email address", "email addresses")} and ${counted(phones, "phone number", "phone numbers")} replaced with sample ones`,
  addresses: ({ count }: { count: number }) =>
    `${counted(count, "address", "addresses")} replaced with a sample address`,
  wifi: "Wi-Fi network name and password replaced with sample ones",
  codes: "Coupon code replaced with a sample one",
  gtins: "Product GTIN removed: people add their own",
  images: ({ count }: { count: number }) =>
    `${counted(count, "photo", "photos")} removed: people add their own`,
  files: ({ count }: { count: number }) =>
    `${counted(count, "file", "files")} removed`,
  blocks: ({ blocks }: { blocks: string }) =>
    `Left out because they need your own files: ${blocks}`,
  hidden: ({ count }: { count: number }) =>
    `${counted(count, "hidden block", "hidden blocks")} left out`,
  settings: "Share image, description and custom CSS left out",
};

export type PageChangeMessages = typeof PAGE_CHANGE_MESSAGES;

/** PAGE_CHANGE_MESSAGES in the catalog's language (communityActions.pageChanges). */
export function pageChangeMessages(
  t: Translator<"communityActions.pageChanges">,
): PageChangeMessages {
  return {
    texts: (values) => t("texts", values),
    kept: (values) => t("kept", values),
    links: (values) => t("links", values),
    emails: (values) => t("emails", values),
    phones: (values) => t("phones", values),
    emailsAndPhones: (values) => t("emailsAndPhones", values),
    addresses: (values) => t("addresses", values),
    wifi: t("wifi"),
    codes: t("codes"),
    gtins: t("gtins"),
    images: (values) => t("images", values),
    files: (values) => t("files", values),
    blocks: (values) => t("blocks", values),
    hidden: (values) => t("hidden", values),
    settings: t("settings"),
  };
}

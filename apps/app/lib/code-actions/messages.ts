// What the code, page, file, domain, analytics and webhook server actions
// say themselves (actions/code-*.ts, landing-pages.ts, files.ts and the
// rest in CODE_ACTION_MESSAGES), in English: the source, with one section
// per action file. codeActionMessages(t) returns the same messages from
// codeActions in messages/en.json, in another language; the actions read
// them with codeActionText() (./messages-server.ts), in the language of the
// page that called them, when they answer with a message.
//
// Messages other modules throw (the code, page and domain services, rate
// limits, roles) reach the client as those modules wrote them, unless one is
// word for word one of these (ownMessage). The organize section is the
// exception: organize.ts throws these itself, in English for logs and its
// other callers, and runOrganize says them again for the actions.

import {
  MAX_BULK_IDS,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME,
  MAX_FOLDERS,
  MAX_NOTES_LENGTH,
  MAX_TAG_NAME,
  MAX_TAGS,
  MAX_TAGS_PER_CODE,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import type { Translator } from "@/lib/i18n/translator";
import { PLAN_NAMES, type Plan } from "@/lib/pricing";

/** A code's password, as actions/code-lifecycle.ts takes it. */
export const CODE_PASSWORD_LENGTH = { min: 4, max: 64 } as const;

/** Pages one bulk delete takes (actions/landing-pages.ts). */
export const MAX_BULK_PAGES = 100;

/** "Smart routing is a Pro feature. …": the plan that has it, if any. */
const planRequired =
  (feature: string, verb: "is" | "are") =>
  (plan: Plan | null): string =>
    `${feature} ${plan ? `${verb} a ${PLAN_NAMES[plan]} feature` : `${verb === "is" ? "isn't" : "aren't"} on your plan`}. You can still turn off or remove what's already set up.`;

/** tags.tooManyTags and organize.tagsPerCode: one rule, one sentence. */
const tooManyTagsPerCode = `A code can have up to ${MAX_TAGS_PER_CODE} tags.`;

export const CODE_ACTION_MESSAGES = {
  lifecycle: {
    signIn: "Sign in to manage this code.",
    failed: "Something went wrong.",
    notFound: "QR code not found",
    invalidDate: "Enter a valid date and time",
    dateRange: "Pick a date between 2000 and 2100",
    passwordTooShort: `Use at least ${CODE_PASSWORD_LENGTH.min} characters for the password`,
    passwordTooLong: `Passwords can be up to ${CODE_PASSWORD_LENGTH.max} characters`,
    passwordTooManyBytes: "The password is too long",
    scanLimitWhole: "The scan limit must be a whole number",
    scanLimitMin: "The scan limit must be at least 1",
    scanLimitMax: "The scan limit is too high",
    planRequired:
      "Passwords, schedules, scan limits and fallback URLs are part of Pro.",
    endBeforeStart: "The end date must be after the start date",
  },
  marketing: {
    signIn: "Sign in to manage this code.",
    failed: "Something went wrong.",
    notFound: "QR code not found",
    countryCode: "Use a 2-letter country code",
    regionCode: "Use a region code like CA",
    invalidUrl: "invalid URL",
    /** A routing rule without a name */
    rule: (rule: number) => `Rule ${rule}`,
    variant: ({ label, variant }: { label: string; variant: string }) =>
      `${label}, variant ${variant}`,
    /** What's wrong (`problem`) with a rule or variant (`label`) */
    problemIn: ({ label, problem }: { label: string; problem: string }) =>
      `${label}: ${problem}`,
    planRequired: {
      routing: planRequired("Smart routing", "is"),
      utm: planRequired("UTM parameters", "are"),
      pixels: planRequired("Tracking pixels", "are"),
      conversions: planRequired("Conversion tracking", "is"),
      preciseLocation: planRequired("Precise scan location", "is"),
    },
  },
  landingPages: {
    signIn: "Sign in to manage pages.",
    failed: "Something went wrong.",
    selectAtLeastOne: "Select at least one page",
    selectUpTo: `Select up to ${MAX_BULK_PAGES} pages at a time`,
  },
  files: {
    signIn: "Sign in to manage files.",
    failed: "Something went wrong.",
  },
  qrCodes: {
    signIn: "Sign in to manage dynamic QR codes.",
    failed: "Something went wrong.",
    nothingToUpdate: "Nothing to update",
  },
  customDomains: {
    signIn: "Sign in to manage custom domains.",
    failed: "Something went wrong.",
    enterDomain: "Enter a domain",
  },
  codeSuggestions: {
    signIn: "Sign in to get suggestions.",
    rateLimited: "That's a lot of suggestions. Try again in a minute.",
    unavailable: "Suggestions aren't available on this server.",
    failed: "Couldn't get suggestions right now. Try again.",
  },
  tags: {
    nothingToUpdate: "Nothing to update",
    tooManyTags: tooManyTagsPerCode,
    chooseTag: "Choose a tag to add or remove",
  },
  /**
   * Folders, tags, favourites, notes, the trash and bulk actions: what
   * app/(app)/dashboard/codes/_lib/organize.ts throws and its schemas say,
   * which actions/folders.ts, tags.ts and bulk-codes.ts answer with
   * (runOrganize). The messages that name a folder or tag are functions:
   * their errors carry the name (OrganizeValidationError).
   */
  organize: {
    signIn: "Sign in to manage your codes.",
    failed: "Something went wrong.",
    invalidInput: "Invalid input",
    selectAtLeastOne: "Select at least one code",
    selectUpTo: `Select up to ${MAX_BULK_IDS} codes at a time`,
    folderNameRequired: "Enter a folder name",
    folderNameTooLong: `Folder names can be up to ${MAX_FOLDER_NAME} characters`,
    folderNameSlash: "Folder names can't contain /",
    tagNameRequired: "Enter a tag name",
    tagNameTooLong: `Tag names can be up to ${MAX_TAG_NAME} characters`,
    tagNameCharacters: "Tag names can't contain , ; or |",
    notesTooLong: `Notes can be up to ${MAX_NOTES_LENGTH.toLocaleString("en")} characters`,
    folderNotFound: "Folder not found",
    folderExists: ({ name }: { name: string }) =>
      `A folder named "${name}" already exists there.`,
    folderDepth: `Folders can be nested up to ${MAX_FOLDER_DEPTH} levels deep.`,
    folderIntoItself: "A folder can't be moved into itself.",
    folderLimit: `You can have up to ${MAX_FOLDERS} folders.`,
    tagNotFound: "Tag not found",
    tagExists: ({ name }: { name: string }) =>
      `A tag named "${name}" already exists.`,
    tagLimit: `You can have up to ${MAX_TAGS} tags.`,
    /** The same sentence as tags.tooManyTags, read from that key */
    tagsPerCode: tooManyTagsPerCode,
    codeNotFound: "QR code not found",
    othersFolders:
      "Only team owners and admins can change folders created by others.",
    othersTags:
      "Only team owners and admins can change tags created by others.",
    tryAgain: "Please try again.",
  },
  publicStats: {
    signIn: "Sign in to share analytics.",
    failed: "Something went wrong.",
    notFound: "QR code not found",
  },
  pathAliases: {
    signIn: "Sign in again to change this code.",
    failed: "Something went wrong. Try again.",
    noDomain: "Path aliases are for codes on a custom domain.",
  },
  formResponses: {
    signIn: "Sign in to manage responses.",
    failed: "Something went wrong. Please try again.",
    chooseResponses: "Choose responses to delete.",
  },
  codeKind: {
    signIn: "Sign in to change codes.",
    failed: "Something went wrong.",
  },
  barcodes: {
    signIn: "Sign in to save barcodes.",
    failed: "Something went wrong.",
  },
  utmTemplates: {
    signIn: "Sign in to use templates.",
    failed: "Something went wrong.",
  },
  codeOptions: {
    signIn: "Sign in again to see the options.",
    failed: "Couldn't load the options. Try again.",
  },
  analytics: {
    searchTooLong: "Search is too long.",
    signIn: "Sign in to search your codes.",
    failed: "Something went wrong. Please try again.",
  },
  webhooks: {
    signIn: "Sign in to manage webhooks.",
    failed: "Something went wrong. Please try again.",
  },
};

/** CODE_ACTION_MESSAGES in any language. */
export type CodeActionMessages = typeof CODE_ACTION_MESSAGES;

/**
 * CODE_ACTION_MESSAGES in the language of `t` (codeActions in
 * messages/en.json).
 */
export function codeActionMessages(
  t: Translator<"codeActions">,
): CodeActionMessages {
  const planRequiredIn =
    (
      feature: "routing" | "utm" | "pixels" | "conversions" | "preciseLocation",
    ) =>
    (plan: Plan | null) =>
      t(`marketing.planRequired.${feature}`, { plan: plan ?? "none" });
  return {
    lifecycle: {
      signIn: t("lifecycle.signIn"),
      failed: t("lifecycle.failed"),
      notFound: t("lifecycle.notFound"),
      invalidDate: t("lifecycle.invalidDate"),
      dateRange: t("lifecycle.dateRange"),
      passwordTooShort: t("lifecycle.passwordTooShort", {
        min: CODE_PASSWORD_LENGTH.min,
      }),
      passwordTooLong: t("lifecycle.passwordTooLong", {
        max: CODE_PASSWORD_LENGTH.max,
      }),
      passwordTooManyBytes: t("lifecycle.passwordTooManyBytes"),
      scanLimitWhole: t("lifecycle.scanLimitWhole"),
      scanLimitMin: t("lifecycle.scanLimitMin"),
      scanLimitMax: t("lifecycle.scanLimitMax"),
      planRequired: t("lifecycle.planRequired"),
      endBeforeStart: t("lifecycle.endBeforeStart"),
    },
    marketing: {
      signIn: t("marketing.signIn"),
      failed: t("marketing.failed"),
      notFound: t("marketing.notFound"),
      countryCode: t("marketing.countryCode"),
      regionCode: t("marketing.regionCode"),
      invalidUrl: t("marketing.invalidUrl"),
      rule: (rule) => t("marketing.rule", { rule }),
      variant: (values) => t("marketing.variant", values),
      problemIn: (values) => t("marketing.problemIn", values),
      planRequired: {
        routing: planRequiredIn("routing"),
        utm: planRequiredIn("utm"),
        pixels: planRequiredIn("pixels"),
        conversions: planRequiredIn("conversions"),
        preciseLocation: planRequiredIn("preciseLocation"),
      },
    },
    landingPages: {
      signIn: t("landingPages.signIn"),
      failed: t("landingPages.failed"),
      selectAtLeastOne: t("landingPages.selectAtLeastOne"),
      selectUpTo: t("landingPages.selectUpTo", { max: MAX_BULK_PAGES }),
    },
    files: {
      signIn: t("files.signIn"),
      failed: t("files.failed"),
    },
    qrCodes: {
      signIn: t("qrCodes.signIn"),
      failed: t("qrCodes.failed"),
      nothingToUpdate: t("qrCodes.nothingToUpdate"),
    },
    customDomains: {
      signIn: t("customDomains.signIn"),
      failed: t("customDomains.failed"),
      enterDomain: t("customDomains.enterDomain"),
    },
    codeSuggestions: {
      signIn: t("codeSuggestions.signIn"),
      rateLimited: t("codeSuggestions.rateLimited"),
      unavailable: t("codeSuggestions.unavailable"),
      failed: t("codeSuggestions.failed"),
    },
    tags: {
      nothingToUpdate: t("tags.nothingToUpdate"),
      tooManyTags: t("tags.tooManyTags", { max: MAX_TAGS_PER_CODE }),
      chooseTag: t("tags.chooseTag"),
    },
    organize: {
      signIn: t("organize.signIn"),
      failed: t("organize.failed"),
      invalidInput: t("organize.invalidInput"),
      selectAtLeastOne: t("organize.selectAtLeastOne"),
      selectUpTo: t("organize.selectUpTo", { max: MAX_BULK_IDS }),
      folderNameRequired: t("organize.folderNameRequired"),
      folderNameTooLong: t("organize.folderNameTooLong", {
        max: MAX_FOLDER_NAME,
      }),
      folderNameSlash: t("organize.folderNameSlash"),
      tagNameRequired: t("organize.tagNameRequired"),
      tagNameTooLong: t("organize.tagNameTooLong", { max: MAX_TAG_NAME }),
      tagNameCharacters: t("organize.tagNameCharacters"),
      notesTooLong: t("organize.notesTooLong", { max: MAX_NOTES_LENGTH }),
      folderNotFound: t("organize.folderNotFound"),
      folderExists: (values) => t("organize.folderExists", values),
      folderDepth: t("organize.folderDepth", { max: MAX_FOLDER_DEPTH }),
      folderIntoItself: t("organize.folderIntoItself"),
      folderLimit: t("organize.folderLimit", { max: MAX_FOLDERS }),
      tagNotFound: t("organize.tagNotFound"),
      tagExists: (values) => t("organize.tagExists", values),
      tagLimit: t("organize.tagLimit", { max: MAX_TAGS }),
      tagsPerCode: t("tags.tooManyTags", { max: MAX_TAGS_PER_CODE }),
      codeNotFound: t("organize.codeNotFound"),
      othersFolders: t("organize.othersFolders"),
      othersTags: t("organize.othersTags"),
      tryAgain: t("organize.tryAgain"),
    },
    publicStats: {
      signIn: t("publicStats.signIn"),
      failed: t("publicStats.failed"),
      notFound: t("publicStats.notFound"),
    },
    pathAliases: {
      signIn: t("pathAliases.signIn"),
      failed: t("pathAliases.failed"),
      noDomain: t("pathAliases.noDomain"),
    },
    formResponses: {
      signIn: t("formResponses.signIn"),
      failed: t("formResponses.failed"),
      chooseResponses: t("formResponses.chooseResponses"),
    },
    codeKind: {
      signIn: t("codeKind.signIn"),
      failed: t("codeKind.failed"),
    },
    barcodes: {
      signIn: t("barcodes.signIn"),
      failed: t("barcodes.failed"),
    },
    utmTemplates: {
      signIn: t("utmTemplates.signIn"),
      failed: t("utmTemplates.failed"),
    },
    codeOptions: {
      signIn: t("codeOptions.signIn"),
      failed: t("codeOptions.failed"),
    },
    analytics: {
      searchTooLong: t("analytics.searchTooLong"),
      signIn: t("analytics.signIn"),
      failed: t("analytics.failed"),
    },
    webhooks: {
      signIn: t("webhooks.signIn"),
      failed: t("webhooks.failed"),
    },
  };
}

/**
 * `message` in the language of `text` when it is one of `english`'s own
 * messages word for word (a schema or throw in the action's file), and as it
 * is otherwise: another module's English, which stays English.
 */
export function ownMessage<T extends object>(
  english: T,
  text: T,
  message: string,
): string {
  for (const key of Object.keys(english) as (keyof T)[]) {
    const translated = text[key];
    if (english[key] === message && typeof translated === "string") {
      return translated;
    }
  }
  return message;
}

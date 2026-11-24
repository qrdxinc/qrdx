import type { BrandMarkSlug } from "@/lib/brand-logos/brand-logo";

// What each analytics breakdown row draws before its label: a country's
// flag, a brand's real mark (Simple Icons), an iconsax icon, or the first
// letter for names with no mark. Pure, so the mapping is tested on its own;
// the breakdown-mark component draws it.
//
// Brands that asked Simple Icons to remove their marks (Microsoft, so
// Windows and Edge; Yandex, Bing and others) get their letter, never a
// look-alike.

export type BreakdownIcon =
  | "mobile"
  | "tablet"
  | "desktop"
  | "devices"
  | "globe"
  | "scan"
  | "call"
  | "mail"
  | "message";

export type BreakdownMark =
  | { kind: "flag"; country: string }
  | { kind: "brand"; slug: BrandMarkSlug }
  /** LinkedIn isn't in Simple Icons; the design system keeps its mark */
  | { kind: "linkedin" }
  | { kind: "qrdx" }
  | { kind: "icon"; icon: BreakdownIcon }
  | { kind: "letter"; letter: string };

const letter = (name: string): BreakdownMark => ({
  kind: "letter",
  letter: name.trim().charAt(0).toUpperCase() || "?",
});

const UNKNOWN: BreakdownMark = { kind: "letter", letter: "?" };

/** An ISO 3166-1 alpha-2 code ("IN"); anything else draws the globe. */
export function countryMark(code: string | null | undefined): BreakdownMark {
  const upper = code?.trim().toUpperCase() ?? "";
  // XX and ZZ are "unknown" placeholders some geo headers send.
  return /^[A-Z]{2}$/.test(upper) && upper !== "XX" && upper !== "ZZ"
    ? { kind: "flag", country: upper }
    : { kind: "icon", icon: "globe" };
}

const DEVICE_ICONS: Record<string, BreakdownIcon> = {
  mobile: "mobile",
  tablet: "tablet",
  desktop: "desktop",
  other: "devices",
};

/** A device type as lib/user-agent.ts reports it. */
export function deviceMark(type: string | null | undefined): BreakdownMark {
  return { kind: "icon", icon: (type && DEVICE_ICONS[type]) || "devices" };
}

// Names as lib/user-agent.ts reports them. iOS and macOS take Apple's mark:
// their own Simple Icons are wordmarks, unreadable at 16 px.
const OS_MARKS: Record<string, BrandMarkSlug> = {
  Android: "android",
  ChromeOS: "googlechrome",
  HarmonyOS: "huawei",
  iOS: "apple",
  KaiOS: "kaios",
  Linux: "linux",
  macOS: "apple",
};

export function osMark(name: string | null | undefined): BreakdownMark {
  if (!name) return UNKNOWN;
  const slug = OS_MARKS[name];
  return slug ? { kind: "brand", slug } : letter(name);
}

const BROWSER_MARKS: Record<string, BrandMarkSlug> = {
  Chrome: "googlechrome",
  Facebook: "facebook",
  Firefox: "firefoxbrowser",
  "Google App": "google",
  Instagram: "instagram",
  LINE: "line",
  Opera: "opera",
  Safari: "safari",
  Snapchat: "snapchat",
  TikTok: "tiktok",
  WeChat: "wechat",
};

export function browserMark(name: string | null | undefined): BreakdownMark {
  if (!name) return UNKNOWN;
  const slug = BROWSER_MARKS[name];
  return slug ? { kind: "brand", slug } : letter(name);
}

// Registrable domains (and a few exact hosts) to their brand. Checked as a
// suffix, so "l.instagram.com" and "m.facebook.com" match too.
const HOST_MARKS: [suffix: string, slug: BrandMarkSlug][] = [
  ["mail.google.com", "gmail"],
  ["gemini.google.com", "googlegemini"],
  ["baidu.com", "baidu"],
  ["bsky.app", "bluesky"],
  ["claude.ai", "claude"],
  ["discord.com", "discord"],
  ["discord.gg", "discord"],
  ["duckduckgo.com", "duckduckgo"],
  ["ecosia.org", "ecosia"],
  ["facebook.com", "facebook"],
  ["fb.com", "facebook"],
  ["fb.me", "facebook"],
  ["github.com", "github"],
  ["instagram.com", "instagram"],
  ["kakao.com", "kakaotalk"],
  ["line.me", "line"],
  ["mastodon.social", "mastodon"],
  ["medium.com", "medium"],
  ["messenger.com", "messenger"],
  ["m.me", "messenger"],
  ["naver.com", "naver"],
  ["news.ycombinator.com", "ycombinator"],
  ["notion.so", "notion"],
  ["notion.site", "notion"],
  ["perplexity.ai", "perplexity"],
  ["pinterest.com", "pinterest"],
  ["pin.it", "pinterest"],
  ["producthunt.com", "producthunt"],
  ["reddit.com", "reddit"],
  ["snapchat.com", "snapchat"],
  ["spotify.com", "spotify"],
  ["substack.com", "substack"],
  ["t.co", "x"],
  ["t.me", "telegram"],
  ["telegram.org", "telegram"],
  ["threads.com", "threads"],
  ["threads.net", "threads"],
  ["tiktok.com", "tiktok"],
  ["tumblr.com", "tumblr"],
  ["twitch.tv", "twitch"],
  ["twitter.com", "x"],
  ["viber.com", "viber"],
  ["vk.com", "vk"],
  ["wa.me", "whatsapp"],
  ["weibo.com", "sinaweibo"],
  ["weixin.qq.com", "wechat"],
  ["whatsapp.com", "whatsapp"],
  ["x.com", "x"],
  ["youtu.be", "youtube"],
  ["youtube.com", "youtube"],
  ["zalo.me", "zalo"],
];

const matches = (host: string, suffix: string) =>
  host === suffix || host.endsWith(`.${suffix}`);

/** A referrer's host ("l.instagram.com"); null is a direct scan. */
export function hostMark(host: string | null | undefined): BreakdownMark {
  const clean =
    host
      ?.trim()
      .toLowerCase()
      .replace(/^www\./, "") ?? "";
  if (!clean) return { kind: "icon", icon: "scan" };
  if (matches(clean, "qrdx.dev")) return { kind: "qrdx" };
  if (matches(clean, "linkedin.com") || matches(clean, "lnkd.in")) {
    return { kind: "linkedin" };
  }
  for (const [suffix, slug] of HOST_MARKS) {
    if (matches(clean, suffix)) return { kind: "brand", slug };
  }
  // google.com, google.co.in, google.de and the rest.
  if (/(^|\.)google\.[a-z.]+$/.test(clean)) {
    return { kind: "brand", slug: "google" };
  }
  return letter(clean);
}

/** Where a tap on a hosted page went: a URL, a phone number or an address. */
export function targetMark(target: string | null | undefined): BreakdownMark {
  const value = target?.trim() ?? "";
  if (!value) return UNKNOWN;
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme === "tel") return { kind: "icon", icon: "call" };
  if (scheme === "mailto") return { kind: "icon", icon: "mail" };
  if (scheme === "sms" || scheme === "smsto") {
    return { kind: "icon", icon: "message" };
  }
  try {
    const url = new URL(scheme ? value : `https://${value}`);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return hostMark(url.hostname);
    }
  } catch {
    // Not a URL: fall through to its letter.
  }
  return letter(value.replace(/^[a-z][a-z0-9+.-]*:\/*/i, ""));
}

/**
 * The flag for a language tag: its own region ("en-in" → India), else the
 * region the language is most often written in (CLDR's likely subtags, so
 * "ja" → Japan). Tags with neither draw their letter.
 */
export function languageMark(tag: string | null | undefined): BreakdownMark {
  if (!tag) return UNKNOWN;
  try {
    const locale = new Intl.Locale(tag);
    const region = locale.region ?? locale.maximize().region;
    if (region && /^[A-Z]{2}$/.test(region)) {
      return { kind: "flag", country: region };
    }
  } catch {
    // An invalid tag: fall through to its letter.
  }
  return letter(tag);
}

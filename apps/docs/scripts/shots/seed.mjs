#!/usr/bin/env node
// Seeds the throwaway local database the docs screenshots are taken from
// (scripts/shots/README section in apps/docs/README.md). Everything here is
// invented: a café called Harbor Lane Coffee, people with .example addresses,
// made-up scans. Nothing is real and nothing is private, so every screen can
// be published.
//
//   node scripts/shots/seed.mjs --database postgresql://postgres@127.0.0.1:54329/qrdx
//
// The script refuses any DATABASE_URL that isn't on localhost: it drops and
// rewrites the seeded rows (ids start with "shots_"), and it must never see a
// shared database. Deterministic: the same rows every run, with dates
// relative to today so the analytics charts always show the last six weeks.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const connectionString =
  args.get("database") ??
  process.env.SHOTS_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:54329/qrdx";

if (
  !/^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1)[:/]/.test(
    connectionString,
  )
) {
  console.error("seed: refusing a database that isn't on localhost.");
  process.exit(1);
}

/** Polar product ids are public (NEXT_PUBLIC_*); the seed's subscription points at the Business one. */
function businessProductId() {
  const envFile = join(repoRoot, "apps", "app", ".env.local");
  if (existsSync(envFile)) {
    const match = /^NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID=(.+)$/m.exec(
      readFileSync(envFile, "utf8"),
    );
    if (match) return match[1].trim().replace(/^"|"$/g, "");
  }
  return (
    process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID ??
    "shots-business-monthly"
  );
}

// ─── Deterministic randomness ────────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261115);
const pick = (list) => list[Math.floor(rand() * list.length)];
const weighted = (entries) => {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rand() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
};
const hex = (length) => {
  let out = "";
  while (out.length < length) out += Math.floor(rand() * 16).toString(16);
  return out;
};

const DAY = 86_400_000;
const now = new Date();
const daysAgo = (days, hour = 10, minute = 0) => {
  const date = new Date(now.getTime() - days * DAY);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
};
const daysAhead = (days, hour = 9) => daysAgo(-days, hour);

// ─── The cast ────────────────────────────────────────────────────────────────

const USER_ID = "shots_user_noor";
export const OWNER_EMAIL = "noor@harborlane.example";
const TEAM_ID = "shots_ws_harbor";
export const TEAM_SLUG = "harbor-lane-coffee";

const digest = (userId) =>
  createHash("sha256")
    .update(`qrdx:own-workspace:${userId}`)
    .digest("hex")
    .slice(0, 32);
const ownWorkspaceId = (userId) => `ws_${digest(userId)}`;
const ownWorkspaceMemberId = (userId) => `wsm_${digest(userId)}`;

/** apps/app/content/changelog, so every entry counts as dismissed. */
const CHANGELOG_SLUGS = (() => {
  const dir = join(repoRoot, "apps", "app", "content", "changelog");
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".mdx"))
        .map((name) => name.replace(/\.mdx$/, ""))
    : [];
})();

const people = [
  {
    id: USER_ID,
    name: "Noor Castellanos",
    email: OWNER_EMAIL,
    role: "owner",
    joined: 140,
  },
  {
    id: "shots_user_teo",
    name: "Teo Lindgren",
    email: "teo@harborlane.example",
    role: "admin",
    joined: 96,
  },
  {
    id: "shots_user_ravi",
    name: "Ravi Okonkwo",
    email: "ravi@harborlane.example",
    role: "member",
    joined: 41,
  },
  {
    id: "shots_user_june",
    name: "June Abara",
    email: "june@harborlane.example",
    role: "viewer",
    joined: 12,
  },
];

const HARBOR_STYLE = {
  bgColor: "#F6F1EA",
  fgColor: "#23180F",
  eyeColor: "#3B2A1E",
  dotColor: "#B4552D",
  bodyPattern: "rounded",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "rounded",
  level: "Q",
  margin: 4,
};

const CLASSIC_STYLE = {
  bgColor: "#ffffff",
  fgColor: "#000000",
  eyeColor: "#000000",
  dotColor: "#000000",
  bodyPattern: "circle",
  cornerEyePattern: "gear",
  cornerEyeDotPattern: "circle",
  level: "Q",
  margin: 4,
};

const folders = [
  { id: "shots_folder_menus", name: "Menus", position: 0 },
  { id: "shots_folder_events", name: "Events", position: 1 },
  { id: "shots_folder_marketing", name: "Marketing", position: 2 },
  {
    id: "shots_folder_print",
    name: "Print runs",
    position: 0,
    parentId: "shots_folder_marketing",
  },
];

const tags = [
  { id: "shots_tag_print", name: "Print", color: "#B4552D" },
  { id: "shots_tag_seasonal", name: "Seasonal", color: "#2E7D5B" },
  { id: "shots_tag_front", name: "Front of house", color: "#3B5BDB" },
];

const SITE = "https://harborlane.example";

/** The dynamic codes. `scans` is the rough six-week total the scan generator aims for. */
const codes = [
  {
    id: "shots_code_menu",
    slug: "k2Pm9Qa",
    title: "Table menu",
    destinationUrl: `${SITE}/menu`,
    kind: "page",
    pageId: "shots_page_menu",
    folderId: "shots_folder_menus",
    tags: ["shots_tag_front"],
    style: HARBOR_STYLE,
    scans: 1460,
    createdDaysAgo: 120,
    isFavorite: true,
    createdVia: "dashboard",
  },
  {
    id: "shots_code_window",
    slug: "Rt7Lw3n",
    title: "Window poster",
    destinationUrl: `${SITE}/spring-blend`,
    folderId: "shots_folder_marketing",
    tags: ["shots_tag_print", "shots_tag_seasonal"],
    style: HARBOR_STYLE,
    scans: 610,
    createdDaysAgo: 48,
    notes: "A2 poster in the front window. Reprinted 3 Nov with the new blend.",
  },
  {
    id: "shots_code_loyalty",
    slug: "Hq4Zc8e",
    title: "Loyalty card",
    destinationUrl: `${SITE}/loyalty`,
    folderId: "shots_folder_marketing",
    tags: ["shots_tag_front"],
    style: HARBOR_STYLE,
    scans: 980,
    createdDaysAgo: 90,
    isFavorite: true,
    routing: {
      version: 1,
      rules: [
        {
          id: "ios-app",
          name: "iPhone and iPad",
          enabled: true,
          conditions: [{ type: "os", os: ["iOS"] }],
          action: { type: "redirect", url: `${SITE}/loyalty/ios` },
        },
        {
          id: "android-app",
          name: "Android phones",
          enabled: true,
          conditions: [{ type: "os", os: ["Android"] }],
          action: { type: "redirect", url: `${SITE}/loyalty/android` },
        },
        {
          id: "spanish",
          name: "Spanish speakers",
          enabled: true,
          conditions: [{ type: "language", languages: ["es"] }],
          action: { type: "redirect", url: `${SITE}/es/loyalty` },
        },
        {
          id: "weekend",
          name: "Weekend brunch offer",
          enabled: true,
          conditions: [
            {
              type: "schedule",
              days: [0, 6],
              start: "08:00",
              end: "14:00",
              timeZone: "Europe/Lisbon",
            },
          ],
          action: { type: "redirect", url: `${SITE}/brunch` },
        },
        {
          id: "sign-up-test",
          name: "Sign-up page test",
          enabled: true,
          conditions: [],
          action: {
            type: "split",
            variants: [
              {
                id: "a",
                name: "Short form",
                url: `${SITE}/loyalty/join`,
                weight: 50,
              },
              {
                id: "b",
                name: "With rewards list",
                url: `${SITE}/loyalty/rewards`,
                weight: 50,
              },
            ],
          },
        },
      ],
    },
    utm: {
      version: 1,
      source: "qr",
      medium: "loyalty-card",
      campaign: "autumn-2026",
    },
  },
  {
    id: "shots_code_latte",
    slug: "Vb6Nf2s",
    title: "Latte art night tickets",
    destinationUrl: `${SITE}/events/latte-art-night`,
    folderId: "shots_folder_events",
    tags: ["shots_tag_seasonal"],
    style: CLASSIC_STYLE,
    scans: 140,
    createdDaysAgo: 21,
    password: "harbor-2026",
    // A used Access & schedule panel: a window, a cap and somewhere to send late scans.
    startsAt: daysAgo(14, 8),
    expiresAt: daysAhead(30, 23),
    scanLimit: 300,
    fallbackUrl: `${SITE}/events`,
  },
  {
    id: "shots_code_tasting",
    slug: "Jd3Xr5p",
    title: "Spring tasting (ended)",
    destinationUrl: `${SITE}/events/spring-tasting`,
    folderId: "shots_folder_events",
    style: CLASSIC_STYLE,
    scans: 330,
    createdDaysAgo: 160,
    expiresAt: daysAgo(63, 22),
    fallbackUrl: null,
    scanEnd: 63,
  },
  {
    id: "shots_code_paused",
    slug: "Ym8Kt1u",
    title: "Delivery bag sticker",
    destinationUrl: `${SITE}/delivery`,
    folderId: "shots_folder_print",
    tags: ["shots_tag_print"],
    style: HARBOR_STYLE,
    scans: 420,
    createdDaysAgo: 75,
    pausedAt: daysAgo(4, 16),
    scanEnd: 4,
  },
  {
    id: "shots_code_flyer",
    slug: "Qs5Wv7c",
    title: "Opening week flyer",
    destinationUrl: `${SITE}/opening-week`,
    folderId: "shots_folder_print",
    tags: ["shots_tag_print"],
    style: HARBOR_STYLE,
    scans: 500,
    scanLimit: 500,
    limitReached: true,
    createdDaysAgo: 110,
    scanEnd: 30,
  },
  {
    id: "shots_code_feedback",
    slug: "Fz2Hb9m",
    title: "Feedback card",
    destinationUrl: `${SITE}/feedback`,
    kind: "page",
    pageId: "shots_page_feedback",
    folderId: "shots_folder_menus",
    tags: ["shots_tag_front"],
    style: HARBOR_STYLE,
    scans: 260,
    createdDaysAgo: 60,
  },
  {
    id: "shots_code_holiday",
    slug: "Cn9Lp4r",
    title: "Holiday menu",
    destinationUrl: `${SITE}/holiday-menu`,
    folderId: "shots_folder_menus",
    tags: ["shots_tag_seasonal"],
    style: HARBOR_STYLE,
    scans: 0,
    createdDaysAgo: 3,
    startsAt: daysAhead(16, 7),
  },
  {
    id: "shots_code_sleeve",
    slug: "Tg1Vd6k",
    title: "Cup sleeve",
    destinationUrl: `${SITE}/about`,
    folderId: "shots_folder_print",
    tags: ["shots_tag_print"],
    style: HARBOR_STYLE,
    scans: 760,
    createdDaysAgo: 100,
  },
  {
    id: "shots_code_newsletter",
    slug: "Lk4Rn2w",
    title: "Newsletter sign-up",
    destinationUrl: `${SITE}/newsletter`,
    folderId: "shots_folder_marketing",
    style: CLASSIC_STYLE,
    scans: 95,
    createdDaysAgo: 33,
  },
  {
    id: "shots_code_catering",
    slug: "Xp7Qa3j",
    title: "Catering enquiries",
    destinationUrl: `${SITE}/catering`,
    style: CLASSIC_STYLE,
    scans: 48,
    createdDaysAgo: 27,
  },
  {
    id: "shots_code_onboarding",
    slug: "Bw3Jm8t",
    title: "Staff onboarding guide",
    destinationUrl: `${SITE}/team/onboarding`,
    style: CLASSIC_STYLE,
    scans: 60,
    createdDaysAgo: 130,
    archivedAt: daysAgo(20, 11),
    scanEnd: 20,
  },
  {
    id: "shots_code_receipt",
    slug: "Nd8Sc5y",
    title: "Receipt footer (old)",
    destinationUrl: `${SITE}/receipt`,
    style: CLASSIC_STYLE,
    scans: 30,
    createdDaysAgo: 150,
    deletedAt: daysAgo(2, 9),
    scanEnd: 40,
  },
];

// ─── Scans ───────────────────────────────────────────────────────────────────

const COUNTRIES = [
  ["PT", 34, ["Lisbon", "Porto", "Cascais"], "Lisboa"],
  ["ES", 14, ["Madrid", "Seville", "Valencia"], "Madrid"],
  ["GB", 12, ["London", "Bristol", "Manchester"], "England"],
  ["DE", 8, ["Berlin", "Hamburg", "Munich"], "Berlin"],
  ["FR", 7, ["Paris", "Lyon", "Bordeaux"], "Île-de-France"],
  ["US", 9, ["Boston", "Austin", "Portland"], "Massachusetts"],
  ["NL", 4, ["Amsterdam", "Utrecht"], "North Holland"],
  ["BR", 5, ["São Paulo", "Rio de Janeiro"], "São Paulo"],
  ["IE", 3, ["Dublin", "Cork"], "Leinster"],
  ["IT", 4, ["Milan", "Rome", "Bologna"], "Lombardy"],
];
const LANGUAGES = {
  PT: "pt-pt",
  ES: "es-es",
  GB: "en-gb",
  DE: "de-de",
  FR: "fr-fr",
  US: "en-us",
  NL: "nl-nl",
  BR: "pt-br",
  IE: "en-ie",
  IT: "it-it",
};
const DEVICES = [
  ["mobile", 79],
  ["desktop", 13],
  ["tablet", 7],
  ["other", 1],
];
const OS_FOR = {
  mobile: [
    ["iOS", 56],
    ["Android", 44],
  ],
  tablet: [
    ["iPadOS", 70],
    ["Android", 30],
  ],
  desktop: [
    ["macOS", 45],
    ["Windows", 48],
    ["Linux", 7],
  ],
  other: [["Other", 1]],
};
const BROWSER_FOR = {
  iOS: [
    ["Safari", 82],
    ["Chrome", 15],
    ["Firefox", 3],
  ],
  iPadOS: [
    ["Safari", 88],
    ["Chrome", 12],
  ],
  Android: [
    ["Chrome", 74],
    ["Samsung Internet", 18],
    ["Firefox", 8],
  ],
  macOS: [
    ["Safari", 50],
    ["Chrome", 40],
    ["Firefox", 10],
  ],
  Windows: [
    ["Chrome", 62],
    ["Edge", 30],
    ["Firefox", 8],
  ],
  Linux: [
    ["Firefox", 60],
    ["Chrome", 40],
  ],
  Other: [["Other", 1]],
};
const REFERERS = [
  [null, 88],
  ["instagram.com", 5],
  ["maps.google.com", 4],
  ["harborlane.example", 3],
];

/** Hour-of-day weights for a café: a morning rush, a lunch bump, quiet nights. */
const HOURS = [
  0, 0, 0, 0, 0, 0, 1, 4, 9, 11, 10, 8, 10, 9, 7, 6, 5, 4, 3, 2, 1, 1, 0, 0,
].map((weight, hour) => [hour, weight + 0.1]);

function scansFor(code) {
  const total = code.scans;
  if (!total) return [];
  const windowDays = Math.min(42, code.createdDaysAgo);
  const end = code.scanEnd ?? 0;
  const rows = [];
  // Roughly a third of scans come from someone who scanned before.
  const visitors = Array.from(
    { length: Math.max(8, Math.round(total * 0.66)) },
    () => hex(64),
  );
  for (let i = 0; i < total; i++) {
    // Newer days get a little more traffic (growth), weekends a bump.
    let day = Math.floor(rand() ** 1.12 * windowDays);
    if (day < end)
      day = end + Math.floor(rand() * Math.max(1, windowDays - end));
    const date = new Date(now.getTime() - day * DAY);
    if ([0, 6].includes(date.getUTCDay()) && rand() < 0.35) {
      // keep: weekend scans are kept more often than dropped
    } else if (rand() < 0.08) {
      continue;
    }
    date.setUTCHours(
      weighted(HOURS),
      Math.floor(rand() * 60),
      Math.floor(rand() * 60),
      0,
    );
    const [country, , cities, region] = weighted(
      COUNTRIES.map((c) => [c, c[1]]),
    );
    const device = weighted(DEVICES);
    const os = weighted(OS_FOR[device]);
    const browser = weighted(BROWSER_FOR[os]);
    const split = code.routing?.rules.find(
      (rule) => rule.action.type === "split",
    );
    rows.push({
      id: `shots_scan_${code.id.slice(11)}_${i}`,
      qrCodeId: code.id,
      scannedAt: date,
      country,
      region,
      city: pick(cities),
      deviceType: device,
      os,
      browser,
      referer: weighted(REFERERS),
      visitorHash: pick(visitors),
      language: LANGUAGES[country],
      variant:
        split && rand() < 0.6
          ? `${split.id}:${rand() < 0.5 ? "a" : "b"}`
          : null,
      source: rand() < 0.04 ? "nfc" : "qr",
    });
  }
  return rows;
}

// ─── Pages ───────────────────────────────────────────────────────────────────

const theme = {
  colors: {
    background: "#f6f1ea",
    foreground: "#23180f",
    primary: "#3b2a1e",
    primaryForeground: "#f6f1ea",
    muted: "#ece3d6",
    mutedForeground: "#685645",
  },
  font: "dm-sans",
  headingFont: "fraunces",
  radius: 16,
  background: { type: "solid" },
};

const menuPage = {
  id: "shots_page_menu",
  type: "menu",
  title: "Harbor Lane menu",
  content: {
    version: 1,
    theme,
    blocks: [
      {
        id: "header",
        type: "header",
        props: {
          layout: "stack",
          align: "left",
          eyebrow: "Coffee and bakery · Since 2019",
          title: "Harbor Lane Coffee",
          size: "lg",
          subtitle: "Small-batch coffee and pastries baked every morning.",
        },
      },
      {
        id: "menu",
        type: "menu",
        props: {
          style: "classic",
          currency: "EUR",
          sections: [
            {
              name: "Coffee",
              items: [
                { name: "Espresso", price: 1.6 },
                {
                  name: "Flat white",
                  price: 3.2,
                  allergens: ["milk"],
                  badge: "Favourite",
                },
                { name: "Cortado", price: 2.8, allergens: ["milk"] },
                {
                  name: "Filter of the week",
                  description: "Ask for this week's single origin",
                  price: 3.5,
                },
                {
                  name: "Oat milk",
                  price: 0.5,
                  priceNote: "extra",
                  diet: ["vegan"],
                },
              ],
            },
            {
              name: "Bakery",
              items: [
                {
                  name: "Butter croissant",
                  price: 2.4,
                  allergens: ["gluten", "milk"],
                },
                {
                  name: "Cardamom bun",
                  price: 2.9,
                  allergens: ["gluten", "milk", "eggs"],
                  badge: "New",
                },
                {
                  name: "Banana bread",
                  price: 3.1,
                  allergens: ["gluten", "eggs"],
                },
              ],
            },
          ],
        },
      },
      {
        id: "hours",
        type: "hours",
        props: {
          title: "Opening hours",
          // No time zone: the "open now" badge would depend on when the picture is taken.
          timezone: "",
          days: [
            { ranges: [{ open: "07:30", close: "18:00" }] },
            { ranges: [{ open: "07:30", close: "18:00" }] },
            { ranges: [{ open: "07:30", close: "18:00" }] },
            { ranges: [{ open: "07:30", close: "18:00" }] },
            { ranges: [{ open: "07:30", close: "19:00" }] },
            { ranges: [{ open: "08:00", close: "19:00" }] },
            { ranges: [{ open: "09:00", close: "16:00" }] },
          ],
        },
      },
      {
        id: "wifi",
        type: "wifi",
        props: {
          ssid: "HarborLane Guest",
          password: "flatwhite",
          security: "WPA",
        },
      },
    ],
  },
};

const feedbackPage = {
  id: "shots_page_feedback",
  type: "feedback",
  title: "How was your visit?",
  content: {
    version: 1,
    theme,
    blocks: [
      {
        id: "header",
        type: "header",
        props: {
          layout: "stack",
          align: "center",
          title: "How was your visit?",
          size: "md",
          subtitle: "Two questions, thirty seconds. It helps the team a lot.",
        },
      },
      {
        id: "form",
        type: "form",
        props: {
          title: "",
          description: "",
          fields: [
            {
              id: "rating",
              type: "stars",
              label: "How was everything today?",
              required: true,
              max: 5,
            },
            {
              id: "drink",
              type: "choice",
              label: "What did you order?",
              required: false,
              multiple: true,
              options: [
                "Espresso drinks",
                "Filter coffee",
                "Tea",
                "Pastries",
                "Lunch",
              ],
            },
            {
              id: "notes",
              type: "text",
              label: "Anything we should know?",
              required: false,
              multiline: true,
              maxLength: 500,
            },
            {
              id: "email",
              type: "email",
              label: "Email, if you'd like a reply",
              required: false,
            },
          ],
          submitLabel: "Send",
          successMessage: "Thank you. We read every note.",
        },
      },
    ],
  },
};

const responses = [
  [
    5,
    ["Espresso drinks", "Pastries"],
    "The cardamom bun is the best thing on the street.",
    "",
    1,
  ],
  [
    4,
    ["Filter coffee"],
    "Great filter. The music was a bit loud around nine.",
    "",
    2,
  ],
  [5, ["Espresso drinks"], "", "", 3],
  [
    3,
    ["Lunch"],
    "Waited a while for the sandwich. Staff were lovely about it.",
    "",
    5,
  ],
  [5, ["Tea", "Pastries"], "Lovely spot to work in the afternoon.", "", 6],
  [4, ["Espresso drinks"], "Oat flat white was perfect.", "", 9],
  [5, ["Pastries"], "Banana bread!", "", 12],
  [2, ["Espresso drinks"], "The cortado was lukewarm today.", "", 15],
];

// ─── Write ───────────────────────────────────────────────────────────────────

const PASSWORD_HASH = bcrypt.hashSync("harbor-2026", 10);

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const q = (text, values = []) => client.query(text, values);

  await q("BEGIN");

  // A clean slate for the seed's own rows (and the test account's sessions).
  for (const table of [
    "workspace_audit_log",
    "affiliate_commission",
    "affiliate_referral",
    "affiliate",
    "form_response",
    "landing_event",
    "qr_scan",
    "qr_code_tag",
    "qr_code_version",
    "qr_code",
    "landing_page_version",
    "landing_page",
    "folder",
    "tag",
    "webhook_delivery",
    "webhook_endpoint",
    "api_key",
    "custom_domain",
    "qr_preset",
    "notification_setting",
    "subscription",
    "invitation",
    "passkey",
    "member",
    "organization",
    "session",
    "verification",
    "account",
    '"user"',
  ]) {
    await q(`DELETE FROM ${table}`);
  }

  const created = (days) => daysAgo(days, 9);

  for (const person of people) {
    await q(
      `INSERT INTO "user" (id, name, email, email_verified, settings, created_at, updated_at)
       VALUES ($1, $2, $3, true, $4, $5, $5)`,
      [
        person.id,
        person.name,
        person.email,
        JSON.stringify(
          person.id === USER_ID
            ? {
                keyboardShortcuts: true,
                lastWorkspaceId: TEAM_ID,
                // Nothing to announce: the "What's new" cards and spotlights stay out of the screenshots.
                changelogSeenAt: now.toISOString().slice(0, 10),
                whatsNewDismissed: CHANGELOG_SLUGS,
                spotlightsSeen: ["passkey-second-step", "setup-guide"],
              }
            : { keyboardShortcuts: true },
        ),
        created(person.joined),
      ],
    );
    // Everyone's own workspace, as the sign-up hook makes it.
    const first = person.name.split(" ")[0];
    await q(
      `INSERT INTO organization (id, name, slug, created_at) VALUES ($1, $2, $3, $4)`,
      [
        ownWorkspaceId(person.id),
        `${first}'s workspace`,
        first.toLowerCase(),
        created(person.joined),
      ],
    );
    await q(
      `INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, 'owner', $4)`,
      [
        ownWorkspaceMemberId(person.id),
        ownWorkspaceId(person.id),
        person.id,
        created(person.joined),
      ],
    );
  }

  await q(
    `INSERT INTO organization (id, name, slug, created_at) VALUES ($1, $2, $3, $4)`,
    [TEAM_ID, "Harbor Lane Coffee", TEAM_SLUG, created(138)],
  );
  for (const person of people) {
    await q(
      `INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [
        `shots_member_${person.id.slice(11)}`,
        TEAM_ID,
        person.id,
        person.role,
        created(Math.min(person.joined, 138)),
      ],
    );
  }
  await q(
    `INSERT INTO invitation (id, organization_id, email, role, status, expires_at, created_at, inviter_id)
     VALUES ('shots_invite_kim', $1, 'kim@harborlane.example', 'member', 'pending', $2, $3, $4)`,
    [TEAM_ID, daysAhead(6), daysAgo(1, 15), USER_ID],
  );

  // The owner pays for Business, so the team's screens show every feature.
  await q(
    `INSERT INTO subscription (id, created_at, modified_at, amount, currency, recurring_interval, status,
       current_period_start, current_period_end, cancel_at_period_end, started_at, customer_id, product_id, checkout_id, user_id)
     VALUES ('shots_sub_business', $1, $1, 4900, 'usd', 'month', 'active', $2, $3, false, $1, 'shots_customer', $4, 'shots_checkout', $5)`,
    [daysAgo(130), daysAgo(10), daysAhead(20), businessProductId(), USER_ID],
  );

  // A verified custom domain (DNS already pointed, as the Domains page shows it).
  await q(
    `INSERT INTO custom_domain (id, user_id, organization_id, hostname, verified, verification, created_at, updated_at)
     VALUES ('shots_domain_qr', $1, $2, 'qr.harborlane.example', true, $3, $4, $5)`,
    [
      USER_ID,
      TEAM_ID,
      JSON.stringify({
        mode: "manual",
        records: [
          { type: "CNAME", name: "qr", value: "cname.qrdx.dev" },
          {
            type: "TXT",
            name: "_qrdx-challenge.qr",
            value: "qrdx-verify=shots-seed-token",
          },
        ],
        checkedAt: daysAgo(30, 12).toISOString(),
        verifiedAt: daysAgo(30, 12).toISOString(),
      }),
      daysAgo(31, 10),
      daysAgo(30, 12),
    ],
  );

  for (const folder of folders) {
    await q(
      `INSERT INTO folder (id, user_id, organization_id, parent_id, name, position, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        folder.id,
        USER_ID,
        TEAM_ID,
        folder.parentId ?? null,
        folder.name,
        folder.position,
        created(118),
      ],
    );
  }
  for (const tag of tags) {
    await q(
      `INSERT INTO tag (id, user_id, organization_id, name, color, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [tag.id, USER_ID, TEAM_ID, tag.name, tag.color, created(118)],
    );
  }

  for (const page of [menuPage, feedbackPage]) {
    await q(
      `INSERT INTO landing_page (id, user_id, organization_id, type, title, content, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 3, $7, $8)`,
      [
        page.id,
        USER_ID,
        TEAM_ID,
        page.type,
        page.title,
        JSON.stringify(page.content),
        created(119),
        daysAgo(5, 14),
      ],
    );
    await q(
      `INSERT INTO landing_page_version (id, page_id, content, created_by, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [
        `${page.id}_v1`,
        page.id,
        JSON.stringify(page.content),
        USER_ID,
        created(119),
      ],
    );
  }

  let scanRows = 0;
  for (const code of codes) {
    const scans = scansFor(code);
    let lastScan = null;
    for (const scan of scans) {
      if (!lastScan || scan.scannedAt > lastScan) lastScan = scan.scannedAt;
    }
    await q(
      `INSERT INTO qr_code (id, user_id, organization_id, slug, slug_scope, destination_url, title, content_type, style,
         is_active, archived_at, scan_count, last_scanned_at, kind, page_id, folder_id, notes, is_favorite,
         password_hash, starts_at, expires_at, scan_limit, paused_at, fallback_url, routing, utm, deleted_at, created_via, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '', $5, $6, 'url', $7, true, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
      [
        code.id,
        USER_ID,
        TEAM_ID,
        code.slug,
        code.destinationUrl,
        code.title,
        JSON.stringify(code.style),
        code.archivedAt ?? null,
        code.limitReached ? code.scanLimit : scans.length,
        lastScan,
        code.kind ?? "redirect",
        code.pageId ?? null,
        code.folderId ?? null,
        code.notes ?? null,
        code.isFavorite ?? false,
        code.password ? PASSWORD_HASH : null,
        code.startsAt ?? null,
        code.expiresAt ?? null,
        code.scanLimit ?? null,
        code.pausedAt ?? null,
        code.fallbackUrl ?? null,
        code.routing ? JSON.stringify(code.routing) : null,
        code.utm ? JSON.stringify(code.utm) : null,
        code.deletedAt ?? null,
        code.createdVia ?? "dashboard",
        created(code.createdDaysAgo),
        daysAgo(Math.min(code.createdDaysAgo, 6), 11),
      ],
    );
    for (const tagId of code.tags ?? []) {
      await q(`INSERT INTO qr_code_tag (qr_code_id, tag_id) VALUES ($1, $2)`, [
        code.id,
        tagId,
      ]);
    }
    await q(
      `INSERT INTO qr_code_version (id, qr_code_id, snapshot, created_by, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [
        `${code.id}_v1`,
        code.id,
        JSON.stringify({
          destinationUrl: code.destinationUrl,
          title: code.title,
        }),
        USER_ID,
        created(code.createdDaysAgo),
      ],
    );
    // Scans in batches of 200 rows.
    for (let i = 0; i < scans.length; i += 200) {
      const batch = scans.slice(i, i + 200);
      const values = [];
      const params = [];
      batch.forEach((scan, index) => {
        const base = index * 14;
        values.push(
          `(${Array.from({ length: 14 }, (_, k) => `$${base + k + 1}`).join(", ")})`,
        );
        params.push(
          scan.id,
          scan.qrCodeId,
          scan.scannedAt,
          scan.country,
          scan.region,
          scan.city,
          scan.deviceType,
          scan.os,
          scan.browser,
          scan.referer,
          scan.visitorHash,
          scan.language,
          scan.variant,
          scan.source,
        );
      });
      await q(
        `INSERT INTO qr_scan (id, qr_code_id, scanned_at, country, region, city, device_type, os, browser, referer, visitor_hash, language, variant, source)
         VALUES ${values.join(", ")}`,
        params,
      );
      scanRows += batch.length;
    }
  }

  for (let index = 0; index < responses.length; index++) {
    const [stars, drinks, note, email, day] = responses[index];
    const data = {
      block: "form",
      answers: [
        {
          id: "rating",
          label: "How was everything today?",
          type: "stars",
          value: stars,
        },
        {
          id: "drink",
          label: "What did you order?",
          type: "choice",
          value: drinks,
        },
        ...(note
          ? [
              {
                id: "notes",
                label: "Anything we should know?",
                type: "text",
                value: note,
              },
            ]
          : []),
        ...(email
          ? [
              {
                id: "email",
                label: "Email, if you'd like a reply",
                type: "email",
                value: email,
              },
            ]
          : []),
      ],
    };
    await q(
      `INSERT INTO form_response (id, page_id, qr_code_id, data, visitor_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [
        `shots_response_${index}`,
        "shots_page_feedback",
        "shots_code_feedback",
        JSON.stringify(data),
        hex(64),
        daysAgo(day, 12 + (index % 6)),
      ],
    );
  }

  // A saved theme, shared with the team and preselected for new codes.
  await q(
    `INSERT INTO qr_preset (id, user_id, organization_id, name, style, is_default, created_at, updated_at)
     VALUES ('shots_theme_harbor', $1, $2, 'Harbor Lane brand', $3, true, $4, $4)`,
    [USER_ID, TEAM_ID, JSON.stringify(HARBOR_STYLE), created(117)],
  );

  // API keys: the hash is of a key nobody holds, so the row can never authenticate.
  for (const [id, name, start, scopes, lastUsed, createdDays] of [
    [
      "shots_key_site",
      "Website integration",
      "qrdx_h7Kq2m",
      ["codes:read", "codes:write"],
      1,
      70,
    ],
    [
      "shots_key_reports",
      "Reporting (read only)",
      "qrdx_Zp4Wn8",
      ["codes:read", "themes:read", "profile:read"],
      9,
      22,
    ],
  ]) {
    await q(
      `INSERT INTO api_key (id, name, key_hash, start, user_id, organization_id, scopes, last_used_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [
        id,
        name,
        createHash("sha256")
          .update(`shots-unusable-${id}-${randomBytes(16).toString("hex")}`)
          .digest("hex"),
        start,
        USER_ID,
        TEAM_ID,
        JSON.stringify(scopes),
        daysAgo(lastUsed, 8),
        created(createdDays),
      ],
    );
  }

  await q(
    `INSERT INTO webhook_endpoint (id, user_id, organization_id, url, secret, events, active, created_at)
     VALUES ('shots_hook_crm', $1, $2, 'https://hooks.harborlane.example/qrdx', $3, $4, true, $5)`,
    [
      USER_ID,
      TEAM_ID,
      `whsec_${hex(40)}`,
      JSON.stringify(["scan.created", "form.submitted"]),
      created(45),
    ],
  );
  const deliveries = [
    ["succeeded", 1, null, 0.2],
    ["succeeded", 1, null, 0.6],
    ["succeeded", 1, null, 1.1],
    ["failed", 3, "HTTP 503 from hooks.harborlane.example", 1.4],
    ["succeeded", 2, null, 2.2],
    ["succeeded", 1, null, 3.0],
    ["pending", 1, "HTTP 502 from hooks.harborlane.example", 0.05],
    ["succeeded", 1, null, 4.1],
  ];
  for (let index = 0; index < deliveries.length; index++) {
    const [status, attempts, lastError, days] = deliveries[index];
    const event =
      index === 3 || index === 5 ? "form.submitted" : "scan.created";
    await q(
      `INSERT INTO webhook_delivery (id, endpoint_id, event, payload, status, attempts, next_attempt_at, last_error, created_at)
       VALUES ($1, 'shots_hook_crm', $2, $3, $4, $5, $6, $7, $8)`,
      [
        `shots_delivery_${index}`,
        event,
        JSON.stringify({
          id: `evt_shots_${index}`,
          type: event,
          data:
            event === "scan.created"
              ? {
                  code: { id: "shots_code_menu", title: "Table menu" },
                  scan: { country: "PT", deviceType: "mobile" },
                }
              : {
                  page: {
                    id: "shots_page_feedback",
                    title: "How was your visit?",
                  },
                },
        }),
        status,
        attempts,
        status === "pending" ? new Date(now.getTime() + 15 * 60_000) : null,
        lastError,
        new Date(now.getTime() - days * DAY),
      ],
    );
  }

  await q(
    `INSERT INTO notification_setting (id, user_id, organization_id, channel, target, events, created_at)
     VALUES ('shots_notify_email', $1, $2, 'email', $3, $4, $5)`,
    [
      USER_ID,
      TEAM_ID,
      OWNER_EMAIL,
      JSON.stringify(["scan.milestone", "form.submitted"]),
      created(40),
    ],
  );

  // A passkey on the owner's account (the credential can't be used: nothing holds its private key).
  await q(
    `INSERT INTO passkey (id, name, public_key, user_id, credential_id, counter, device_type, backed_up, transports, created_at)
     VALUES ('shots_passkey_laptop', 'Work laptop', $1, $2, $3, 3, 'multiDevice', true, 'internal,hybrid', $4)`,
    [
      Buffer.from(hex(130), "hex").toString("base64"),
      USER_ID,
      Buffer.from(hex(32), "hex").toString("base64url"),
      created(35),
    ],
  );

  // The workspace's audit log (Business): a few weeks of everyday changes.
  const label = (id) => {
    const person = people.find((entry) => entry.id === id);
    return `${person.name} <${person.email}>`;
  };
  const auditRows = [
    [
      0.2,
      USER_ID,
      "code.destination_changed",
      "code",
      "shots_code_window",
      "Window poster",
      {
        before: { destination: "https://harborlane.example/autumn-blend" },
        after: { destination: "https://harborlane.example/spring-blend" },
      },
    ],
    [
      0.9,
      "shots_user_teo",
      "code.routing_changed",
      "code",
      "shots_code_loyalty",
      "Loyalty card",
      null,
    ],
    [
      1.3,
      "shots_user_teo",
      "page.published",
      "page",
      "shots_page_menu",
      "Harbor Lane menu",
      null,
    ],
    [
      2.1,
      USER_ID,
      "member.role_changed",
      "member",
      "shots_user_ravi",
      "Ravi Okonkwo",
      { before: { role: "viewer" }, after: { role: "member" } },
    ],
    [
      3.4,
      "shots_user_ravi",
      "code.created",
      "code",
      "shots_code_latte",
      "Latte art night tickets",
      null,
    ],
    [
      5.2,
      "shots_user_ravi",
      "code.renamed",
      "code",
      "shots_code_latte",
      "Latte art night tickets",
      {
        before: { title: "Latte night" },
        after: { title: "Latte art night tickets" },
      },
    ],
    [
      8.0,
      USER_ID,
      "member.invited",
      "member",
      null,
      "kim@harborlane.example",
      { after: { role: "member" } },
    ],
    [
      11.6,
      USER_ID,
      "code.paused",
      "code",
      "shots_code_paused",
      "Delivery bag sticker",
      null,
    ],
    [
      12.1,
      "shots_user_june",
      "member.joined",
      "member",
      "shots_user_june",
      "June Abara",
      null,
    ],
    [
      19.5,
      "shots_user_teo",
      "code.style_changed",
      "code",
      "shots_code_loyalty",
      "Loyalty card",
      null,
    ],
  ];
  for (let index = 0; index < auditRows.length; index++) {
    const [days, actor, action, targetType, targetId, targetLabel, metadata] =
      auditRows[index];
    await q(
      `INSERT INTO workspace_audit_log (id, organization_id, actor_type, actor_user_id, actor_label, action, target_type, target_id, target_label, metadata, device, created_at)
       VALUES ($1, $2, 'user', $3, $4, $5, $6, $7, $8, $9, 'Chrome on macOS', $10)`,
      [
        `shots_audit_${index}`,
        TEAM_ID,
        actor,
        label(actor),
        action,
        targetType,
        targetId,
        targetLabel,
        metadata ? JSON.stringify(metadata) : null,
        new Date(now.getTime() - days * DAY),
      ],
    );
  }

  // The owner is an approved affiliate with a few commissions (the program
  // is qrdx.dev's own; the capture run turns it on locally, README).
  await q(
    `INSERT INTO affiliate (id, user_id, status, code, paypal_email, click_count, approved_at, reviewed_at, created_at, updated_at)
     VALUES ('shots_affiliate', $1, 'approved', 'k7m2q9xt', $2, 86, $3, $3, $4, $3)`,
    [USER_ID, OWNER_EMAIL, created(60), created(63)],
  );
  // Two people who signed up through the link (not members of the workspace).
  const referred = [
    ["shots_user_mara", "Mara Voss", "mara@quayside.example", 55],
    ["shots_user_idris", "Idris Bell", "idris@millpond.example", 33],
  ];
  for (const [id, name, email, days] of referred) {
    await q(
      `INSERT INTO "user" (id, name, email, email_verified, settings, created_at, updated_at)
       VALUES ($1, $2, $3, true, '{}', $4, $4)`,
      [id, name, email, created(days)],
    );
    await q(
      `INSERT INTO affiliate_referral (id, affiliate_id, referred_user_id, attributed_via, first_paid_at, created_at)
       VALUES ($1, 'shots_affiliate', $2, 'link', $3, $4)`,
      [`shots_referral_${id}`, id, created(days - 2), created(days)],
    );
  }
  const commissions = [
    [52, 4800, "approved"],
    [31, 14_400, "approved"],
    [6, 4800, "pending"],
  ];
  for (let index = 0; index < commissions.length; index++) {
    const [days, orderAmount, status] = commissions[index];
    const paidAt = created(days);
    await q(
      `INSERT INTO affiliate_commission (id, affiliate_id, polar_order_id, currency, order_amount, rate_bps, amount, status, order_paid_at, available_at, created_at, updated_at)
       VALUES ($1, 'shots_affiliate', $2, 'usd', $3, 3000, $4, $5, $6, $7, $6, $6)`,
      [
        `shots_commission_${index}`,
        `shots_order_${index}`,
        orderAmount,
        Math.round(orderAmount * 0.3),
        status,
        paidAt,
        new Date(paidAt.getTime() + 45 * DAY),
      ],
    );
  }

  await q("COMMIT");
  await client.end();
  console.log(
    `seed: ${people.length} people, ${codes.length} codes, ${scanRows} scans, 2 pages, ${responses.length} form responses in workspace "${TEAM_SLUG}". Sign in as ${OWNER_EMAIL}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

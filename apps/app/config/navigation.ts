import { GITHUB_REPO_URL } from "@repo/config";
import { GithubLogo } from "@repo/design-system/components/icons";
import {
  Barcode,
  Book1,
  Box,
  Briefcase,
  Building,
  Buildings,
  Calendar,
  Category,
  Clock,
  Code1,
  CodeCircle,
  Coffee,
  Command,
  DocumentCode,
  DocumentText,
  ElementPlus,
  Gallery,
  Global,
  Hierarchy,
  House,
  Layer,
  Lifebuoy,
  Link21,
  MagicStar,
  MessageQuestion,
  MoneyRecive,
  Notepad2,
  PenTool2,
  People,
  Profile,
  Routing2,
  Send2,
  Shapes,
  ShieldTick,
  Shop,
  Sms,
  TableDocument,
  Wifi,
} from "iconsax-reactjs";
import type { ComponentType } from "react";
import type { Messages } from "@/lib/i18n/messages";
import { SCAN_STUDY_URL } from "@/lib/scan-study";

// Where the site's chrome links: the header's menus, the mobile menu and the
// footer, from one list so the same page has the same name everywhere
// (tests/home/site-navigation.test.ts checks that, and that every link
// leads to a page). Names live in messages footer.links (the docs' product
// links read them too), the header's one-line promises in nav.items. Links
// to features a deployment can't offer drop out where they render
// (useAvailability().showsPath).

/** A destination's name, the same in every menu. */
export type LinkKey = keyof Messages["footer"]["links"];
/** A destination with a promise under its name in the header menus. */
export type ItemKey = LinkKey & keyof Messages["nav"]["items"];

export type NavIcon = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean;
}>;

export type NavLink = { href: string; icon: NavIcon } & (
  | { key: ItemKey; compact?: false }
  /** A one-line row with no promise, like the code types. */
  | { key: LinkKey; compact: true }
);

/** The live miniature on a Product card (header-product-panel.tsx). */
export type ProductArt =
  | "generator"
  | "dynamic"
  | "art"
  | "barcodes"
  | "bulk"
  | "community";

export interface ProductCard {
  key: ItemKey;
  href: string;
  icon: NavIcon;
  art: ProductArt;
}

export interface NavColumn {
  label: keyof Messages["nav"]["columns"];
  links: NavLink[];
}

/** The full-width row under a menu's columns. */
export interface NavStrip {
  key: ItemKey;
  href: string;
  icon: NavIcon;
  /** Shows the live GitHub star count; opens in a new tab. */
  github?: boolean;
}

export type MenuId = keyof Messages["nav"]["entries"];

export type NavMenu =
  | { id: "product"; cards: ProductCard[] }
  | { id: Exclude<MenuId, "product">; columns: NavColumn[]; strip: NavStrip[] };

export const PRODUCT_CARDS: ProductCard[] = [
  { key: "playground", href: "/playground", icon: PenTool2, art: "generator" },
  {
    key: "dynamicCodes",
    href: "/dynamic-qr-code",
    icon: Routing2,
    art: "dynamic",
  },
  { key: "aiArt", href: "/ai/art", icon: MagicStar, art: "art" },
  {
    key: "barcode",
    href: "/barcode-generator",
    icon: Barcode,
    art: "barcodes",
  },
  { key: "bulk", href: "/tools/bulk", icon: TableDocument, art: "bulk" },
  { key: "community", href: "/community", icon: People, art: "community" },
];

export const HEADER_MENUS: NavMenu[] = [
  { id: "product", cards: PRODUCT_CARDS },
  {
    id: "solutions",
    columns: [
      {
        label: "industries",
        links: [
          {
            key: "restaurants",
            href: "/qr-codes-for/restaurants",
            icon: Coffee,
          },
          { key: "retail", href: "/qr-codes-for/retail", icon: Shop },
          { key: "realEstate", href: "/qr-codes-for/real-estate", icon: House },
          { key: "events", href: "/qr-codes-for/events", icon: Calendar },
        ],
      },
      {
        label: "teams",
        links: [
          { key: "enterprise", href: "/enterprise", icon: Building },
          {
            key: "agencies",
            href: "/qr-codes-for/marketing-agencies",
            icon: Briefcase,
          },
          {
            key: "openSource",
            href: "/open-source-qr-code-generator",
            icon: CodeCircle,
          },
        ],
      },
      {
        label: "codeTypes",
        links: [
          {
            key: "typeUrl",
            href: "/qr-code-generator/url",
            icon: Global,
            compact: true,
          },
          {
            key: "typeWifi",
            href: "/qr-code-generator/wifi",
            icon: Wifi,
            compact: true,
          },
          {
            key: "typeVcard",
            href: "/qr-code-generator/vcard",
            icon: Profile,
            compact: true,
          },
          {
            key: "typePdf",
            href: "/qr-code-generator/pdf",
            icon: DocumentText,
            compact: true,
          },
          {
            key: "generators",
            href: "/qr-code-generator",
            icon: Shapes,
            compact: true,
          },
        ],
      },
    ],
    strip: [{ key: "placements", href: "/qr-codes-on", icon: Layer }],
  },
  {
    id: "developers",
    columns: [
      {
        label: "build",
        links: [
          {
            key: "restApi",
            href: "/docs/developers/rest-api",
            icon: Code1,
          },
          { key: "imageApi", href: "/qr-code-api", icon: Gallery },
          { key: "mcp", href: "/mcp", icon: Sms },
          { key: "cli", href: "/docs/developers/cli", icon: Command },
        ],
      },
      {
        label: "embed",
        links: [
          {
            key: "react",
            href: "/docs/getting-started",
            icon: DocumentCode,
          },
          {
            key: "shadcn",
            href: "/docs/developers/shadcn",
            icon: Box,
          },
          { key: "nextjs", href: "/docs/nextjs", icon: Hierarchy },
        ],
      },
      {
        label: "connect",
        links: [
          { key: "integrations", href: "/integrations", icon: Link21 },
          { key: "plugins", href: "/plugins", icon: ElementPlus },
          { key: "webhooks", href: "/docs/webhooks", icon: Send2 },
        ],
      },
    ],
    strip: [
      { key: "docs", href: "/docs", icon: Book1 },
      { key: "github", href: GITHUB_REPO_URL, icon: GithubLogo, github: true },
    ],
  },
  {
    id: "resources",
    columns: [
      {
        label: "help",
        links: [
          { key: "help", href: "/docs/help", icon: Lifebuoy },
          { key: "contact", href: "/docs/help/contact", icon: MessageQuestion },
        ],
      },
      {
        label: "company",
        links: [
          { key: "customers", href: "/customers", icon: Buildings },
          { key: "security", href: "/security", icon: ShieldTick },
          { key: "affiliates", href: "/affiliates", icon: MoneyRecive },
        ],
      },
      {
        label: "updates",
        links: [
          { key: "blog", href: "/blog", icon: Notepad2 },
          { key: "changelog", href: "/changelogs", icon: Clock },
        ],
      },
    ],
    strip: [{ key: "tools", href: "/tools", icon: Category }],
  },
];

/** The header's one plain link, after the menus. */
export const HEADER_PRICING = { key: "pricing", href: "/pricing" } as const;

/**
 * Rows after the mobile menu's groups. Customers and Enterprise move here
 * from inside their groups, as the pages most visitors on a phone look for.
 */
export const MOBILE_ROWS = [
  HEADER_PRICING,
  { key: "customers", href: "/customers" },
  { key: "enterprise", href: "/enterprise" },
] as const satisfies { key: LinkKey; href: string }[];

export interface MobileGroup {
  id: MenuId;
  links: NavLink[];
}

/**
 * The header's menus as the mobile menu lists them: each menu's links in
 * order, its strip last, without the pages promoted to rows.
 */
export function mobileGroups(): MobileGroup[] {
  const promoted = new Set<string>(MOBILE_ROWS.map((row) => row.href));
  return HEADER_MENUS.map((menu) => {
    const links: NavLink[] =
      menu.id === "product"
        ? menu.cards.map(({ key, href, icon }) => ({ key, href, icon }))
        : [
            ...menu.columns.flatMap((column) => column.links),
            ...menu.strip.map(({ key, href, icon }) => ({ key, href, icon })),
          ];
    return {
      id: menu.id,
      links: links.filter((link) => !promoted.has(link.href)),
    };
  });
}

/** Every link in the header's menus, in order. */
export function headerLinks(): { key: LinkKey; href: string }[] {
  const links: { key: LinkKey; href: string }[] = [];
  for (const menu of HEADER_MENUS) {
    if (menu.id === "product") links.push(...menu.cards);
    else {
      for (const column of menu.columns) links.push(...column.links);
      links.push(...menu.strip);
    }
  }
  return [...links, HEADER_PRICING];
}

export const isExternalHref = (href: string) => /^https?:\/\//.test(href);

/** A footer link: a destination's name, or a name that's never translated. */
export type FooterLink = { href: string } & (
  | { key: LinkKey; label?: never }
  | { label: string; key?: never }
);

export interface FooterColumn {
  key: keyof Messages["footer"]["columns"];
  links: FooterLink[];
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    key: "product",
    links: [
      { key: "playground", href: "/playground" },
      { key: "dynamicCodes", href: "/dynamic-qr-code" },
      { key: "aiArt", href: "/ai/art" },
      { key: "aiThemes", href: "/ai" },
      { key: "barcode", href: "/barcode-generator" },
      { key: "bulk", href: "/tools/bulk" },
      { key: "pageTemplates", href: "/templates" },
      { key: "community", href: "/community" },
      // Shown only where each bot is set up (packages/availability).
      { key: "slackBot", href: "/slack" },
      { key: "telegramBot", href: "/telegram" },
      { key: "discordBot", href: "/discord" },
    ],
  },
  {
    key: "developers",
    links: [
      { key: "docs", href: "/docs" },
      { key: "restApi", href: "/docs/developers/rest-api" },
      { key: "apiReference", href: "/docs/developers/api" },
      { key: "imageApi", href: "/qr-code-api" },
      { key: "mcp", href: "/mcp" },
      { key: "cli", href: "/docs/developers/cli" },
      { key: "react", href: "/docs/getting-started" },
      { key: "integrations", href: "/integrations" },
      { key: "plugins", href: "/plugins" },
      { key: "selfHosting", href: "/docs/self-hosting" },
    ],
  },
  {
    key: "solutions",
    links: [
      { key: "restaurants", href: "/qr-codes-for/restaurants" },
      { key: "retail", href: "/qr-codes-for/retail" },
      { key: "realEstate", href: "/qr-codes-for/real-estate" },
      { key: "events", href: "/qr-codes-for/events" },
      { key: "industries", href: "/qr-codes-for" },
      { key: "placements", href: "/qr-codes-on" },
      { key: "generators", href: "/qr-code-generator" },
      { key: "enterprise", href: "/enterprise" },
      { key: "agencies", href: "/qr-codes-for/marketing-agencies" },
      { key: "openSource", href: "/open-source-qr-code-generator" },
    ],
  },
  {
    key: "resources",
    links: [
      { key: "help", href: "/docs/help" },
      { key: "blog", href: "/blog" },
      { key: "changelog", href: "/changelogs" },
      { key: "tools", href: "/tools" },
      { key: "scanner", href: "/scan" },
      { key: "scanChecker", href: "/tools/scan-checker" },
      { key: "printSize", href: "/tools/print-size" },
    ],
  },
  {
    // The answer pages people ask about before printing, and the study behind
    // them (on qrdx.dev only, so by its full address: lib/scan-study.ts).
    key: "guides",
    links: [
      { key: "guideExpire", href: "/blog/do-qr-codes-expire" },
      { key: "guidePrintSize", href: "/blog/how-big-should-a-qr-code-be" },
      { key: "guideDynamicStatic", href: "/blog/dynamic-vs-static-qr-codes" },
      { key: "scanStudy", href: SCAN_STUDY_URL },
    ],
  },
  {
    key: "company",
    links: [
      { key: "customers", href: "/customers" },
      { key: "pricing", href: "/pricing" },
      { key: "security", href: "/security" },
      { key: "guarantee", href: "/guarantee" },
      { key: "affiliates", href: "/affiliates" },
      { key: "contact", href: "/docs/help/contact" },
    ],
  },
  {
    key: "compare",
    links: [
      { label: "QR Code Monkey", href: "/compare/qr-code-monkey" },
      { label: "QR Tiger", href: "/compare/qr-tiger" },
      { label: "Canva QR", href: "/compare/canva-qr" },
      { label: "Bitly QR", href: "/compare/bitly-qr" },
      { label: "Flowcode", href: "/compare/flowcode" },
      { label: "QRFY", href: "/compare/qrfy" },
      { label: "Uniqode", href: "/compare/uniqode" },
      { label: "QR-Verse", href: "/compare/qr-verse" },
      { key: "allComparisons", href: "/compare" },
    ],
  },
];

/** Folded under "Legal" at the end of the Company column. */
export const FOOTER_LEGAL: FooterLink[] = [
  { key: "terms", href: "/legal/terms-of-service" },
  { key: "privacy", href: "/legal/privacy-policy" },
  { key: "cookies", href: "/legal/cookie-policy" },
  { key: "dpa", href: "/legal/dpa" },
  { key: "subprocessors", href: "/legal/subprocessors" },
  { key: "acceptableUse", href: "/legal/acceptable-use-policy" },
  { key: "aiFeatures", href: "/legal/ai-features" },
  { key: "refunds", href: "/legal/refunds" },
  { key: "affiliateTerms", href: "/legal/affiliate-terms" },
  { key: "securityPolicy", href: "/legal/security" },
  { key: "reportAbuse", href: "/report-abuse" },
];

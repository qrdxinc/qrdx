// The link and app types added on 2026-11-22 (utils/link-types.ts): what
// each encodes from a typed handle or a pasted link, what it refuses and
// says, what smart paste opens for each service's links, and that every
// generator page's example is what the encoder writes.
import { describe, expect, it } from "vitest";
import { CONTENT_EXAMPLES } from "@/components/editor/content-forms/content-examples";
import { LINK_TYPE_FORMS } from "@/components/editor/content-forms/link-type-fields";
import { LINK_QR_TYPES } from "@/lib/qr-types-content-links";
import { LINK_TYPE_SCHEMAS } from "@/lib/validations/qr-content";
import type { QRContentConfig } from "@/types/qr-content";
import { LINK_TYPE_IDS, linkTypeIssue } from "@/utils/link-types";
import { encodeQRContent, validateContent } from "@/utils/qr-content-encoder";
import { parseURL } from "@/utils/url-parser";

const enc = (config: QRContentConfig) => encodeQRContent(config);

describe("encoders", () => {
  it.each<[QRContentConfig, string]>([
    // Messenger
    [{ type: "messenger", username: "@qrdx.dev" }, "https://m.me/qrdx.dev"],
    [{ type: "messenger", username: "m.me/qrdxdev" }, "https://m.me/qrdxdev"],
    // Viber
    [
      { type: "viber", phoneNumber: "+1 (415) 555-0132", message: "Hi there" },
      "https://viber.me/14155550132?draft=Hi%20there",
    ],
    [
      { type: "viber", link: "https://invite.viber.com/?g2=AQBabc" },
      "https://invite.viber.com/?g2=AQBabc",
    ],
    // KakaoTalk
    [
      { type: "kakaotalk", url: "open.kakao.com/o/sAbCdEf" },
      "https://open.kakao.com/o/sAbCdEf",
    ],
    [{ type: "kakaotalk", url: "_ZeUTxl" }, "https://pf.kakao.com/_ZeUTxl"],
    // Zalo
    [
      { type: "zalo", url: "1234567890123456789" },
      "https://zalo.me/1234567890123456789",
    ],
    [
      { type: "zalo", url: "https://zalo.me/g/abcdef" },
      "https://zalo.me/g/abcdef",
    ],
    // FaceTime
    [
      { type: "facetime", contact: "+1 (415) 555-0132" },
      "facetime:+14155550132",
    ],
    [
      { type: "facetime", contact: "ada@example.com", audioOnly: true },
      "facetime-audio:ada@example.com",
    ],
    [
      { type: "facetime", url: "https://facetime.apple.com/join#v=1&p=abc" },
      "https://facetime.apple.com/join#v=1&p=abc",
    ],
    // Microsoft Teams
    [
      {
        type: "microsoft-teams",
        users: "ada@example.com, grace@example.com",
        message: "Hi & welcome",
      },
      "https://teams.microsoft.com/l/chat/0/0?users=ada@example.com,grace@example.com&message=Hi%20%26%20welcome",
    ],
    [
      {
        type: "microsoft-teams",
        url: "https://teams.microsoft.com/meet/123456789?p=abc",
      },
      "https://teams.microsoft.com/meet/123456789?p=abc",
    ],
    // Webex
    [
      { type: "webex", url: "acme.webex.com/meet/ada" },
      "https://acme.webex.com/meet/ada",
    ],
    // Calendly
    [
      { type: "calendly", username: "ada/30min" },
      "https://calendly.com/ada/30min",
    ],
    // Google Classroom
    [
      {
        type: "google-classroom",
        url: "https://classroom.google.com/c/MTIz?cjc=abc123",
      },
      "https://classroom.google.com/c/MTIz?cjc=abc123",
    ],
    // VK, Weibo
    [{ type: "vk", url: "vk.com/durov" }, "https://vk.com/durov"],
    [
      { type: "weibo", url: "https://m.weibo.cn/u/1234567890" },
      "https://m.weibo.cn/u/1234567890",
    ],
    // Tumblr, Medium, Substack
    [{ type: "tumblr", username: "Staff" }, "https://www.tumblr.com/staff"],
    [
      { type: "tumblr", username: "https://staff.tumblr.com/" },
      "https://staff.tumblr.com/",
    ],
    [{ type: "medium", username: "@Medium" }, "https://medium.com/@Medium"],
    [{ type: "substack", username: "On" }, "https://on.substack.com"],
    [{ type: "substack", username: "@ada" }, "https://substack.com/@ada"],
    // GitHub
    [{ type: "github", username: "octocat" }, "https://github.com/octocat"],
    [
      { type: "github", username: "octocat/Hello-World" },
      "https://github.com/octocat/Hello-World",
    ],
    // Behance, Dribbble, Linktree
    [{ type: "behance", username: "ada" }, "https://www.behance.net/ada"],
    [{ type: "dribbble", username: "ada" }, "https://dribbble.com/ada"],
    [{ type: "linktree", username: "@ada.l" }, "https://linktr.ee/ada.l"],
    // Patreon, Ko-fi, Buy Me a Coffee
    [{ type: "patreon", username: "ada" }, "https://www.patreon.com/ada"],
    [{ type: "kofi", username: "ada" }, "https://ko-fi.com/ada"],
    [{ type: "buymeacoffee", username: "ada" }, "https://buymeacoffee.com/ada"],
    // Music and podcasts
    [
      { type: "apple-music", url: "music.apple.com/us/album/x/123" },
      "https://music.apple.com/us/album/x/123",
    ],
    [
      { type: "youtube-music", url: "https://music.youtube.com/watch?v=abc" },
      "https://music.youtube.com/watch?v=abc",
    ],
    [
      {
        type: "apple-podcasts",
        url: "https://podcasts.apple.com/us/podcast/x/id123?i=456",
      },
      "https://podcasts.apple.com/us/podcast/x/id123?i=456",
    ],
    [
      { type: "amazon-music", url: "https://music.amazon.co.uk/albums/B0X" },
      "https://music.amazon.co.uk/albums/B0X",
    ],
    [
      { type: "deezer", url: "https://link.deezer.com/s/abc" },
      "https://link.deezer.com/s/abc",
    ],
    [
      { type: "tidal", url: "https://tidal.com/browse/track/123" },
      "https://tidal.com/browse/track/123",
    ],
    [{ type: "bandcamp", username: "Ada" }, "https://ada.bandcamp.com"],
    // Documents, forms and pages
    [
      { type: "google-docs", url: "docs.google.com/document/d/abc/edit" },
      "https://docs.google.com/document/d/abc/edit",
    ],
    [
      {
        type: "google-sheets",
        url: "https://docs.google.com/spreadsheets/u/1/d/abc/edit#gid=0",
      },
      "https://docs.google.com/spreadsheets/u/1/d/abc/edit#gid=0",
    ],
    [
      {
        type: "google-slides",
        url: "https://docs.google.com/presentation/d/abc",
      },
      "https://docs.google.com/presentation/d/abc",
    ],
    [{ type: "google-forms", url: "forms.gle/abc" }, "https://forms.gle/abc"],
    [
      { type: "microsoft-forms", url: "https://forms.cloud.microsoft/r/abc" },
      "https://forms.cloud.microsoft/r/abc",
    ],
    [
      { type: "notion", url: "https://ada.notion.site/Guide-123" },
      "https://ada.notion.site/Guide-123",
    ],
    [
      { type: "canva", url: "https://www.canva.com/design/DAF/abc/view" },
      "https://www.canva.com/design/DAF/abc/view",
    ],
    // App stores
    [
      { type: "app-store", app: "id284882215" },
      "https://apps.apple.com/app/id284882215",
    ],
    [
      { type: "app-store", app: "284882215", writeReview: true },
      "https://apps.apple.com/app/id284882215?action=write-review",
    ],
    [
      {
        type: "app-store",
        app: "https://apps.apple.com/us/app/facebook/id284882215",
        writeReview: true,
      },
      "https://apps.apple.com/us/app/facebook/id284882215?action=write-review",
    ],
    [
      { type: "google-play", app: "com.google.android.apps.maps" },
      "https://play.google.com/store/apps/details?id=com.google.android.apps.maps",
    ],
    [
      {
        type: "google-play",
        app: "https://play.google.com/store/apps/details?id=com.example.app&hl=en",
      },
      "https://play.google.com/store/apps/details?id=com.example.app&hl=en",
    ],
    // Reviews and stays
    [
      {
        type: "tripadvisor",
        url: "https://www.tripadvisor.co.uk/Hotel_Review-g186338-d1-Reviews.html",
      },
      "https://www.tripadvisor.co.uk/Hotel_Review-g186338-d1-Reviews.html",
    ],
    [
      { type: "trustpilot", website: "https://www.Example.com/shop" },
      "https://www.trustpilot.com/evaluate/example.com",
    ],
    [
      {
        type: "trustpilot",
        website: "https://uk.trustpilot.com/review/example.co.uk",
        writeReview: false,
      },
      "https://www.trustpilot.com/review/example.co.uk",
    ],
    [
      { type: "yelp", url: "https://www.yelp.ca/biz/cafe-toronto" },
      "https://www.yelp.ca/biz/cafe-toronto",
    ],
    [
      { type: "airbnb", url: "https://abnb.me/abc123" },
      "https://abnb.me/abc123",
    ],
    [
      { type: "airbnb", url: "www.airbnb.co.uk/rooms/123" },
      "https://www.airbnb.co.uk/rooms/123",
    ],
    [
      { type: "booking-com", url: "https://www.booking.com/hotel/gb/x.html" },
      "https://www.booking.com/hotel/gb/x.html",
    ],
  ])("%o → %s", (config, expected) => {
    expect(validateContent(config)).toEqual({ valid: true });
    expect(enc(config)).toBe(expected);
  });
});

describe("checks", () => {
  it.each<[QRContentConfig, RegExp]>([
    [{ type: "messenger", username: "abc" }, /at least 5/],
    [{ type: "messenger", username: "https://facebook.com/ada" }, /m\.me/],
    [{ type: "viber", phoneNumber: "415 555 0132" }, /country code/],
    [{ type: "viber", link: "https://viber.com/" }, /Invite URL/],
    [{ type: "viber" }, /required/],
    [{ type: "kakaotalk", url: "https://kakao.com/" }, /open chat link/],
    [{ type: "zalo", url: "0912345678" }, /zalo\.me/],
    [{ type: "facetime", contact: "not a number" }, /Apple Account/],
    [{ type: "facetime", url: "https://apple.com/facetime" }, /FaceTime link/],
    [{ type: "facetime" }, /required/],
    [{ type: "microsoft-teams", users: "ada, grace" }, /email addresses/],
    [
      { type: "microsoft-teams", url: "https://teams.microsoft.com/" },
      /join link/,
    ],
    [{ type: "webex", url: "https://www.webex.com/pricing" }, /meeting link/],
    [{ type: "calendly", username: "a b" }, /Calendly name/],
    [
      { type: "google-classroom", url: "https://example.com/c/1" },
      /invite link/,
    ],
    [{ type: "vk", url: "durov" }, /vk\.com/],
    [{ type: "weibo", url: "https://weibo.com/" }, /weibo\.com/],
    [
      { type: "tumblr", username: "-a-very-long-blog-name-over-32-chars" },
      /32/,
    ],
    [{ type: "medium", username: "a b" }, /Medium usernames/],
    [{ type: "substack", username: "https://substack.com" }, /publication/],
    [{ type: "github", username: "-octocat" }, /octocat/],
    [
      { type: "github", username: "https://gitlab.com/x" },
      /Enter a username|github\.com/,
    ],
    [{ type: "behance", username: "ab" }, /3-40/],
    [{ type: "dribbble", username: "a b" }, /Dribbble usernames/],
    [{ type: "linktree", username: "a b" }, /Linktree usernames/],
    [{ type: "patreon", username: "https://patreon.com" }, /creator page/],
    [{ type: "kofi", username: "a-b" }, /Ko-fi page names/],
    [{ type: "buymeacoffee", username: "a b" }, /Page names/],
    [
      { type: "apple-music", url: "https://music.apple.com/" },
      /music\.apple\.com/,
    ],
    [
      { type: "youtube-music", url: "https://youtube.com/watch?v=1" },
      /music\.youtube\.com/,
    ],
    [
      { type: "apple-podcasts", url: "https://podcasts.apple.com/us/browse" },
      /show or episode/,
    ],
    [
      { type: "amazon-music", url: "https://www.amazon.com/music" },
      /music\.amazon\.com/,
    ],
    [{ type: "deezer", url: "https://deezer.page.link/abc" }, /deezer\.com/],
    [{ type: "tidal", url: "https://tidal.com/pricing" }, /tidal\.com/],
    [{ type: "bandcamp", username: "https://bandcamp.com/" }, /bandcamp\.com/],
    [
      { type: "google-docs", url: "https://docs.google.com/spreadsheets/d/x" },
      /document link/,
    ],
    [
      { type: "google-sheets", url: "https://drive.google.com/file/d/x" },
      /spreadsheet link/,
    ],
    [
      { type: "google-slides", url: "https://docs.google.com/document/d/x" },
      /presentation link/,
    ],
    [
      { type: "google-forms", url: "https://docs.google.com/document/d/x" },
      /form's link/,
    ],
    [
      { type: "microsoft-forms", url: "https://forms.office.com/" },
      /share link/,
    ],
    [{ type: "notion", url: "https://notion.com/pricing" }, /public page/],
    [{ type: "canva", url: "https://www.canva.com/templates" }, /share link/],
    [{ type: "app-store", app: "Facebook" }, /app's link/],
    [
      { type: "app-store", app: "https://apps.apple.com/us/charts" },
      /app's link/,
    ],
    [{ type: "google-play", app: "maps" }, /package name/],
    [{ type: "tripadvisor", url: "https://www.tripadvisor.com/" }, /listing/],
    [{ type: "trustpilot", website: "not a domain" }, /domain/],
    [
      { type: "yelp", url: "https://www.yelp.com/search?find_desc=cafe" },
      /yelp\.com\/biz/,
    ],
    [{ type: "airbnb", url: "https://www.airbnb.com/s/Paris" }, /listing/],
    [
      {
        type: "booking-com",
        url: "https://www.booking.com/searchresults.html",
      },
      /property/,
    ],
  ])("%o is refused", (config, message) => {
    const result = validateContent(config);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(message);
    expect(enc(config)).toBe("");
  });

  it("asks for each type's content when it's empty", () => {
    for (const type of LINK_TYPE_IDS) {
      const issue = linkTypeIssue({ type } as Parameters<
        typeof linkTypeIssue
      >[0]);
      expect(issue?.message, type).toMatch(/required/);
    }
  });

  it("puts the problem on the field the form shows", () => {
    expect(
      LINK_TYPE_SCHEMAS.github.safeParse({ username: "-x" }).error?.issues[0]
        ?.path,
    ).toEqual(["username"]);
    expect(
      LINK_TYPE_SCHEMAS["microsoft-teams"].safeParse({ users: "x" }).error
        ?.issues[0]?.path,
    ).toEqual(["users"]);
    expect(
      LINK_TYPE_SCHEMAS.viber.safeParse({}).error?.issues[0]?.path,
    ).toEqual([]);
  });

  it("gives every form field to its schema", () => {
    for (const type of LINK_TYPE_IDS) {
      const shape = (
        LINK_TYPE_SCHEMAS[type] as unknown as { shape: Record<string, unknown> }
      ).shape;
      for (const field of LINK_TYPE_FORMS[type].fields) {
        expect(shape, `${type}.${field.name}`).toHaveProperty(field.name);
      }
      expect(
        validateContent({ type, ...CONTENT_EXAMPLES[type] } as QRContentConfig),
        type,
      ).toEqual({ valid: true });
    }
  });
});

describe("smart paste", () => {
  it.each([
    ["https://m.me/qrdxdev", "messenger"],
    ["https://www.messenger.com/t/qrdxdev", "messenger"],
    ["https://invite.viber.com/?g2=AQBabc", "viber"],
    ["https://viber.me/14155550132", "viber"],
    ["https://open.kakao.com/o/sAbCdEf", "kakaotalk"],
    ["https://pf.kakao.com/_ZeUTxl/friend", "kakaotalk"],
    ["https://zalo.me/1234567890123456789", "zalo"],
    ["https://facetime.apple.com/join#v=1&p=abc", "facetime"],
    [
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc",
      "microsoft-teams",
    ],
    ["https://teams.live.com/meet/9876543210", "microsoft-teams"],
    ["https://acme.webex.com/meet/ada", "webex"],
    ["https://calendly.com/ada/30min", "calendly"],
    ["https://classroom.google.com/c/MTIz?cjc=abc", "google-classroom"],
    ["https://vk.com/durov", "vk"],
    ["https://weibo.com/u/1234567890", "weibo"],
    ["https://staff.tumblr.com/", "tumblr"],
    ["https://medium.com/@Medium", "medium"],
    ["https://on.substack.com", "substack"],
    ["https://github.com/qrdxinc/qrdx", "github"],
    ["https://www.behance.net/ada", "behance"],
    ["https://dribbble.com/ada", "dribbble"],
    ["https://linktr.ee/ada", "linktree"],
    ["https://www.patreon.com/ada", "patreon"],
    ["https://ko-fi.com/ada", "kofi"],
    ["https://buymeacoffee.com/ada", "buymeacoffee"],
    ["https://music.apple.com/us/album/x/123", "apple-music"],
    ["https://music.youtube.com/watch?v=abc", "youtube-music"],
    ["https://podcasts.apple.com/us/podcast/x/id123", "apple-podcasts"],
    ["https://music.amazon.com/albums/B0X", "amazon-music"],
    ["https://www.deezer.com/en/track/3135556", "deezer"],
    ["https://tidal.com/browse/album/123", "tidal"],
    ["https://ada.bandcamp.com/album/x", "bandcamp"],
    ["https://docs.google.com/document/d/abc/edit", "google-docs"],
    ["https://docs.google.com/spreadsheets/d/abc/edit", "google-sheets"],
    ["https://docs.google.com/presentation/d/abc/edit", "google-slides"],
    ["https://docs.google.com/forms/d/e/abc/viewform", "google-forms"],
    ["https://forms.office.com/r/abc", "microsoft-forms"],
    ["https://ada.notion.site/Guide-123", "notion"],
    ["https://www.canva.com/design/DAF/abc/view", "canva"],
    ["https://apps.apple.com/us/app/facebook/id284882215", "app-store"],
    [
      "https://play.google.com/store/apps/details?id=com.example.app",
      "google-play",
    ],
    [
      "https://www.tripadvisor.com/Hotel_Review-g1-d1-Reviews.html",
      "tripadvisor",
    ],
    ["https://www.trustpilot.com/review/example.com", "trustpilot"],
    ["https://www.yelp.com/biz/cafe", "yelp"],
    ["https://www.airbnb.com/rooms/123", "airbnb"],
    ["https://www.booking.com/hotel/gb/x.html", "booking-com"],
  ])("%s opens the %s form", (url, type) => {
    const parsed = parseURL(url);
    expect(parsed?.type).toBe(type);
    expect(
      validateContent(parsed?.config as QRContentConfig),
      JSON.stringify(parsed?.config),
    ).toEqual({ valid: true });
  });

  it("keeps other links on these hosts as they were", () => {
    expect(parseURL("https://www.youtube.com/watch?v=abc")?.type).toBe(
      "youtube",
    );
    expect(parseURL("https://www.amazon.com/dp/B0X")?.type).toBe("amazon");
    expect(parseURL("https://drive.google.com/file/d/abc/view")?.type).toBe(
      "google-drive",
    );
    expect(parseURL("https://github.com")?.type).toBe("url");
    expect(parseURL("https://www.yelp.com/search?find_desc=x")?.type).toBe(
      "url",
    );
    expect(parseURL("https://www.trustpilot.com/categories")?.type).toBe("url");
    expect(parseURL("https://evil.example/m.me/x")?.type).toBe("url");
  });

  it("reads a Trustpilot link's page back", () => {
    expect(parseURL("https://www.trustpilot.com/evaluate/example.com")).toEqual(
      {
        type: "trustpilot",
        config: {
          type: "trustpilot",
          website: "https://www.trustpilot.com/evaluate/example.com",
          writeReview: true,
        },
      },
    );
  });
});

describe("generator pages", () => {
  /** Content that makes each page's payload example. */
  const EXAMPLES: Record<string, QRContentConfig> = {
    messenger: { type: "messenger", username: "bloomandleafstudio" },
    viber: { type: "viber", phoneNumber: "+1 202 555 0142", message: "Hi!" },
    kakaotalk: { type: "kakaotalk", url: "_AbCdEf" },
    zalo: { type: "zalo", url: "1234567890123456789" },
    facetime: { type: "facetime", contact: "+1 202 555 0142" },
    "microsoft-teams": {
      type: "microsoft-teams",
      users: "hello@example.com",
      message: "Hi!",
    },
    webex: {
      type: "webex",
      url: "https://example.webex.com/meet/bloomandleaf",
    },
    calendly: { type: "calendly", username: "bloomandleaf-example/30min" },
    trustpilot: { type: "trustpilot", website: "example.com" },
    "app-store": { type: "app-store", app: "1234567890" },
    "google-play": { type: "google-play", app: "com.example.bloomandleaf" },
    tumblr: { type: "tumblr", username: "bloomandleaf-example" },
    medium: { type: "medium", username: "bloomandleafexample" },
    substack: { type: "substack", username: "bloomandleafexample" },
    github: { type: "github", username: "bloomandleaf-example/garden-planner" },
    bandcamp: { type: "bandcamp", username: "bloomandleafexample" },
  };

  it.each(LINK_QR_TYPES.map((page) => [page.type, page] as const))(
    "%s: the payload example is what the encoder writes",
    (type, page) => {
      const config =
        EXAMPLES[type] ??
        ((LINK_TYPE_FORMS[type as keyof typeof LINK_TYPE_FORMS].fields[0]
          ?.name === "username"
          ? { type, username: page.payload.example }
          : { type, url: page.payload.example }) as QRContentConfig);
      expect(validateContent(config), type).toEqual({ valid: true });
      expect(enc(config)).toBe(page.payload.example);
    },
  );

  it("covers every link type once", () => {
    expect(LINK_QR_TYPES.map((page) => page.type).sort()).toEqual(
      [...LINK_TYPE_IDS].sort(),
    );
  });
});

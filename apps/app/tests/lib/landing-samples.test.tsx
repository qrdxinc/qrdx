import { describe, expect, it, vi } from "vitest";
import { LandingRender } from "@/components/landing/render";
import { listBlocks, parseLandingPageContent } from "@/lib/landing/blocks";
import {
  findSamples,
  isSampleField,
  isSampleLink,
  isSamplePhoto,
  removeSamples,
  TEMPLATE_PHOTO_PATH,
  withoutSampleLinks,
} from "@/lib/landing/samples";
import { templateSampleTexts } from "@/lib/landing/template-samples";
import { buildTemplateContent, listTemplates } from "@/lib/landing/templates";
import { TEMPLATE_MEDIA_PATH } from "@/lib/landing/templates/media";
import type { LandingPageContent } from "@/types/landing";
import { renderIntl } from "../support/intl";

// Hosted pages made from a template went live with its samples: example.com
// buttons, hello@example.com, "Model K2 · Documents". The editor marks and
// removes them; the public page never shows a sample link.

// next/font only works inside Next's compiler; these pages use no web fonts.
vi.mock("next/font/google", () => {
  const font = (options: { variable: string }) => ({
    className: "",
    variable: `font-var${options.variable}`,
    style: { fontFamily: "" },
  });
  return {
    Bricolage_Grotesque: font,
    Cormorant_Garamond: font,
    DM_Sans: font,
    Fraunces: font,
    Instrument_Serif: font,
    Space_Grotesk: font,
  };
});

const LINK = /^(https?:\/\/|mailto:|tel:)/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]+$/i;

/**
 * Every link, address and number a value holds, with the prop it sits in:
 * links anywhere, bare addresses anywhere, numbers in phone props.
 */
function links(
  value: unknown,
  found: { key: string; value: string }[] = [],
  key = "",
): { key: string; value: string }[] {
  if (typeof value === "string") {
    const text = value.trim();
    if (
      LINK.test(text) ||
      EMAIL.test(text) ||
      ((key === "number" || key === "phone") && text)
    ) {
      found.push({ key, value });
    }
  } else if (Array.isArray(value)) {
    for (const item of value) links(item, found, key);
  } else if (value && typeof value === "object") {
    for (const [childKey, item] of Object.entries(value)) {
      links(item, found, childKey);
    }
  }
  return found;
}

/** What a link, address or number becomes in an href. */
const hrefForms = ({ key, value }: { key: string; value: string }) => {
  const text = value.trim();
  if (LINK.test(text)) return [text];
  if (EMAIL.test(text)) return [`mailto:${text}`];
  if (key === "number" || key === "phone") {
    return [`tel:${text.replace(/[^0-9+]/g, "")}`];
  }
  return [];
};

const templates = listTemplates().flatMap((template) =>
  template.variants.map((variant) => ({
    key: `${template.type}/${variant.id}`,
    type: template.type,
    content: buildTemplateContent(template.type, variant.id),
  })),
);

function page(blocks: unknown[]): LandingPageContent {
  const parsed = parseLandingPageContent({
    version: 1,
    theme: buildTemplateContent("custom").theme,
    blocks,
  });
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

function render(content: LandingPageContent): string {
  return renderIntl(
    <LandingRender
      content={content}
      context={{
        theme: content.theme,
        mode: "live",
        pageId: "page_samples",
        qrCodeId: null,
      }}
    />,
  );
}

describe("sample links", () => {
  it("covers every link, address and number in every template and block default", () => {
    const all = [
      ...templates.flatMap(({ key, content }) =>
        links(content.blocks).map((link) => ({ ...link, where: key })),
      ),
      ...listBlocks().flatMap((block) =>
        links(block.defaults).map((link) => ({
          ...link,
          where: `${block.type} default`,
        })),
      ),
    ];
    // The collector itself finds the bare kinds (a vCard's number, an
    // organizer's address), so a new kind of sample can't slip past.
    expect(all.some((link) => link.key === "number")).toBe(true);
    expect(all.some((link) => EMAIL.test(link.value))).toBe(true);
    const missed = all
      .filter(
        (link) =>
          !(isSampleField(link.key, link.value) || isSamplePhoto(link.value)),
      )
      .map((link) => `${link.where}: ${link.key} ${link.value}`);
    expect(missed).toEqual([]);
  });

  it("matches the template photo path", () => {
    expect(TEMPLATE_PHOTO_PATH).toBe(TEMPLATE_MEDIA_PATH);
  });

  it.each([
    "https://example.com",
    "https://example.com/warranty",
    "https://shop.example.org/x",
    "http://www.example.net/",
    "mailto:hello@example.com",
    "mailto:support@example.com?subject=Hi",
    "sam@example.com",
    "tel:+15550142",
    "tel:+15035550142",
    "https://instagram.com/",
    "https://www.instagram.com",
    "https://play.google.com/store/apps",
    "https://paypal.me/yourname",
    "https://cash.app/$yourname",
    "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    "https://venmo.com/u/yourname",
    "https://wise.com/pay/me/yourname",
  ])("%s is a sample", (link) => {
    expect(isSampleLink(link)).toBe(true);
  });

  it.each([
    "+1 503 555 0142",
    "+1 555 0119",
    "+15550142",
    "+44 20 7946 0321",
    "+44 7700 900123",
    "+44 113 496 0000",
  ])("the number %s is a sample in a phone field only", (number) => {
    expect(isSampleField("number", number)).toBe(true);
    expect(isSampleField("phone", number)).toBe(true);
    expect(isSampleField("code", number)).toBe(false);
    expect(isSampleField("body", number)).toBe(false);
  });

  it.each([
    "555 0123",
    "555-0142",
    "+372 5550 123",
    "98755 50123",
    "138 4555 0123",
    "+91 98765 55501",
    "+44 20 7946 1321",
    "+1 503 555 1234",
  ])("the number %s is not a sample", (number) => {
    expect(isSampleField("number", number)).toBe(false);
  });

  it.each([
    "https://instagram.com/lenasbakery",
    "https://mybakery.com/",
    "https://examples.com/",
    "https://example.co.uk/menu",
    "mailto:hello@lenasbakery.com",
    "hello@lenasbakery.com",
    "+91 98765 43210",
    "+1 503 555 1234",
    "tel:+442071838750",
    "https://paypal.me/lenasbakery",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://instagram.com/yournamejewelry",
    "https://www.etsy.com/listing/1/custom-yourname-necklace",
    "https://shop.com/p?ref=yourname",
    "https://paypal.me/yournameshop",
    "Book a table",
  ])("%s is not a sample", (link) => {
    expect(isSampleLink(link)).toBe(false);
  });

  it("knows template photos only on QRdx's own hosts", () => {
    expect(isSamplePhoto("/images/templates/hero-cafe.webp")).toBe(true);
    expect(
      isSamplePhoto("https://qrdx.dev/images/templates/hero-cafe.webp"),
    ).toBe(true);
    expect(
      isSamplePhoto("http://localhost:3000/images/templates/hero-cafe.webp"),
    ).toBe(true);
    expect(
      isSamplePhoto("https://lenasbakery.com/images/templates/hero-cafe.webp"),
    ).toBe(false);
    expect(isSamplePhoto("https://qrdx.dev/images/hero-cafe.webp")).toBe(false);
  });
});

describe("findSamples", () => {
  it("lists an untouched template's sample links, photos and wording", () => {
    const content = buildTemplateContent("pdf", "document");
    const samples = findSamples(content, new Set(templateSampleTexts("pdf")));
    expect(samples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "link",
          text: "Register your warranty",
          link: "example.com/warranty",
        }),
        expect.objectContaining({
          kind: "link",
          text: "Contact support",
          link: "support@example.com",
        }),
        expect.objectContaining({ kind: "photo", blockType: "header" }),
        expect.objectContaining({
          kind: "text",
          text: "Everything in the box",
        }),
      ]),
    );
  });

  it("finds samples in every template", () => {
    const empty = templates
      .filter(
        ({ type, content }) =>
          findSamples(content, new Set(templateSampleTexts(type))).length === 0,
      )
      .map(({ key }) => key);
    // Even the blank page starts with sample wording; a template listed
    // here means its samples moved somewhere this doesn't look.
    expect(empty).toEqual([]);
  });

  it("doesn't mark the owner's own links, wording or hidden blocks", () => {
    const content = page([
      {
        id: "own",
        type: "links",
        props: {
          title: "Find us",
          items: [
            { id: "a", label: "Our shop", url: "https://lenasbakery.com" },
          ],
        },
      },
      {
        id: "hidden",
        type: "button",
        hidden: true,
        props: { label: "Visit our website", url: "https://example.com" },
      },
    ]);
    expect(findSamples(content, new Set(templateSampleTexts("links")))).toEqual(
      [],
    );
  });
});

describe("the public page (withoutSampleLinks)", () => {
  const mixed = () =>
    page([
      {
        id: "links",
        type: "links",
        props: {
          title: "Need a hand?",
          items: [
            {
              id: "sample",
              label: "Register your warranty",
              url: "https://example.com/warranty",
            },
            { id: "own", label: "Our shop", url: "https://lenasbakery.com" },
          ],
        },
      },
      {
        id: "cta",
        type: "button",
        props: { label: "Book a viewing", url: "https://example.com/book" },
      },
      {
        id: "social",
        type: "socials",
        props: {
          items: [
            { id: "ig", network: "instagram", url: "https://instagram.com/" },
          ],
        },
      },
      {
        id: "card",
        type: "contact",
        props: {
          firstName: "Lena",
          phones: [{ id: "p1", number: "+1 503 555 0142" }],
          emails: [
            { id: "e1", address: "sam@example.com" },
            { id: "e2", address: "hello@lenasbakery.com" },
          ],
          website: "https://lenasbakery.com",
        },
      },
    ]);

  it("leaves out sample links and keeps the owner's", () => {
    const content = withoutSampleLinks(mixed());
    const ids = content.blocks.map((block) => block.id);
    // The button only had its sample link; the socials only a sample.
    expect(ids).toEqual(["links", "card"]);
    const [links, contact] = content.blocks;
    const items = (links?.props.items ?? []) as { id: string }[];
    expect(items.map((item) => item.id)).toEqual(["own"]);
    const card = contact?.props as {
      firstName: string;
      phones: unknown[];
      emails: { address: string }[];
      website: string;
    };
    // The card stays with the owner's details; only the samples went.
    expect(card.phones).toEqual([]);
    expect(card.emails.map((email) => email.address)).toEqual([
      "hello@lenasbakery.com",
    ]);
    expect(card.website).toBe("https://lenasbakery.com");
    expect(card.firstName).toBe("Lena");
  });

  it("renders no sample link", () => {
    const html = render(withoutSampleLinks(mixed()));
    expect(html).not.toContain("example.com");
    expect(html).not.toContain("instagram.com");
    expect(html).not.toContain("555");
    expect(html).toContain("https://lenasbakery.com");
    expect(html).toContain("Our shop");
  });

  it("renders every template without any of its links, keeping its photos and text", () => {
    for (const { key, content } of templates) {
      // Every link, address and number the template ships with is a sample
      // (the coverage test above); none may reach an href.
      const sampleHrefs = new Set(
        links(content.blocks)
          .filter((link) => !isSamplePhoto(link.value))
          .flatMap(hrefForms),
      );
      const html = render(withoutSampleLinks(content));
      const hrefs = (html.match(/href="[^"]*"/g) ?? []).map((attr) =>
        attr.slice(6, -1).replaceAll("&amp;", "&"),
      );
      const left = hrefs.filter(
        (href) =>
          sampleHrefs.has(href) ||
          sampleHrefs.has(href.replace(/\/$/, "")) ||
          /example\.(com|net|org)/i.test(href),
      );
      expect(left, key).toEqual([]);
    }
  });

  it("keeps sample text and photos", () => {
    const content = withoutSampleLinks(buildTemplateContent("pdf", "document"));
    const html = render(content);
    expect(html).toContain("Everything in the box");
    expect(html).toContain(TEMPLATE_MEDIA_PATH);
  });

  it("returns a page with no samples unchanged", () => {
    const content = page([
      {
        id: "own",
        type: "button",
        props: { label: "Order online", url: "https://lenasbakery.com/order" },
      },
    ]);
    expect(withoutSampleLinks(content)).toBe(content);
  });
});

describe("removeSamples (the editor's Remove all samples)", () => {
  const texts = new Set(templateSampleTexts("pdf"));

  it("removes an untouched template's samples and keeps the owner's file", () => {
    const template = buildTemplateContent("pdf", "document");
    const content: LandingPageContent = {
      ...template,
      blocks: template.blocks.map((block) =>
        block.type === "pdf"
          ? {
              ...block,
              props: {
                ...block.props,
                source: { type: "url", url: "https://lenasbakery.com/m.pdf" },
              },
            }
          : block,
      ),
    };
    const cleaned = removeSamples(content, texts);
    expect(cleaned.blocks.map((block) => block.type)).toEqual(["pdf"]);
    expect(findSamples(cleaned, texts)).toEqual([]);
  });

  it("keeps what the owner changed and drops only the samples in it", () => {
    const template = buildTemplateContent("pdf", "document");
    const content: LandingPageContent = {
      ...template,
      blocks: template.blocks.map((block) =>
        block.type === "header"
          ? { ...block, props: { ...block.props, title: "Lena's manual" } }
          : block,
      ),
    };
    const cleaned = removeSamples(content, texts);
    const header = cleaned.blocks.find((block) => block.type === "header");
    expect(header?.props.title).toBe("Lena's manual");
    // Its sample photo went; the rest of its sample wording is left for the
    // owner, and still marked.
    expect(header?.props.cover).toBeUndefined();
    expect(
      findSamples(cleaned, texts).every((item) => item.kind === "text"),
    ).toBe(true);
  });
});

describe("only samples go, never the owner's content around them", () => {
  const photo = (id: string, url: string) => ({
    id,
    source: { type: "url", url },
    alt: id,
  });

  it("drops the sample photo from a gallery, not the gallery", () => {
    const content = page([
      {
        id: "gallery",
        type: "gallery",
        props: {
          images: [
            photo("own", "https://lenasbakery.com/a.jpg"),
            photo("sample", "https://example.com/b.jpg"),
          ],
        },
      },
    ]);
    for (const cleaned of [
      withoutSampleLinks(content),
      removeSamples(content, new Set()),
    ]) {
      const gallery = cleaned.blocks.find((block) => block.id === "gallery");
      expect(gallery).toBeDefined();
      const images = (gallery?.props.images ?? []) as { id: string }[];
      expect(images.map((image) => image.id)).toEqual(["own"]);
    }
  });

  it("keeps real links that happen to say yourname", () => {
    const content = page([
      {
        id: "links",
        type: "links",
        props: {
          items: [
            {
              id: "a",
              label: "Shop",
              url: "https://instagram.com/yournamejewelry",
            },
          ],
        },
      },
    ]);
    expect(withoutSampleLinks(content)).toBe(content);
  });

  it("leaves numbers outside phone fields alone (a coupon code, a text)", () => {
    const content = page([
      {
        id: "coupon",
        type: "coupon",
        props: { headline: "10% off", code: "5550142" },
      },
      { id: "text", type: "text", props: { body: "Call 555-0142" } },
    ]);
    expect(withoutSampleLinks(content)).toBe(content);
    expect(removeSamples(content, new Set()).blocks).toEqual(content.blocks);
  });

  it("leaves hidden blocks as they are, as the list does", () => {
    const content = page([
      {
        id: "hidden",
        type: "button",
        hidden: true,
        props: { label: "Visit our website", url: "https://example.com" },
      },
    ]);
    expect(findSamples(content)).toEqual([]);
    expect(removeSamples(content, new Set()).blocks).toEqual(content.blocks);
  });
});

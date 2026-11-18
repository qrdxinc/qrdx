import { describe, expect, it, vi } from "vitest";
import { LandingRender } from "@/components/landing/render";
import { listBlocks, parseLandingPageContent } from "@/lib/landing/blocks";
import {
  findSamples,
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

/** Every link, address and number a value holds. */
function links(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    if (LINK.test(value)) found.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) links(item, found);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) links(item, found);
  }
  return found;
}

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
  it("covers every link in every template and block default", () => {
    const missed = [
      ...templates.flatMap(({ key, content }) =>
        links(content.blocks).map((link) => `${key}: ${link}`),
      ),
      ...listBlocks().flatMap((block) =>
        links(block.defaults).map((link) => `${block.type} default: ${link}`),
      ),
    ].filter((entry) => {
      const link = entry.slice(entry.indexOf(": ") + 2);
      return !(isSampleLink(link) || isSamplePhoto(link));
    });
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
    "+1 503 555 0142",
    "https://instagram.com/",
    "https://www.instagram.com",
    "https://play.google.com/store/apps",
    "https://paypal.me/yourname",
    "https://cash.app/$yourname",
    "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
  ])("%s is a sample", (link) => {
    expect(isSampleLink(link)).toBe(true);
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
    "Book a table",
  ])("%s is not a sample", (link) => {
    expect(isSampleLink(link)).toBe(false);
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

  it("renders every template without a sample link, keeping its photos and text", () => {
    for (const { key, content } of templates) {
      const html = render(withoutSampleLinks(content));
      const left = (html.match(/(?:href|src)="[^"]*"/g) ?? [])
        .map((attr) =>
          attr.slice(attr.indexOf('"') + 1, -1).replaceAll("&amp;", "&"),
        )
        .filter((link) => isSampleLink(link));
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

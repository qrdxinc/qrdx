import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@repo/design-system/components/ui/hover-card";
import Link from "fumadocs-core/link";
import { PathUtils } from "fumadocs-core/source";
import { Lightbox } from "fumadocs-ui/components/image-zoom";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  PageLastUpdate,
} from "fumadocs-ui/layouts/notebook/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ComponentProps, FC } from "react";
import { PageActions } from "@/components/ai/page-actions";
import { PageEyebrow } from "@/components/docs/page-eyebrow";
import { PageFeedback } from "@/components/docs/page-feedback";
import { Callout } from "@/components/mdx/callout";
import {
  breadcrumbSchema,
  type Crumb,
  JsonLd,
} from "@/components/sections/tools/json-ld";
import { getGitHubIssueUrl, getGithubEditUrl, owner, repo } from "@/lib/github";
import { baseUrl, createMetadata, siteName } from "@/lib/metadata";
import { brandedTitle, seoOverride } from "@/lib/seo-overrides";
import { type Page as DocsPageData, getPageImage, source } from "@/lib/source";
import { buildTimeParams } from "@/lib/static-params";
import { getMDXComponents } from "@/mdx-components";

export const revalidate = false;

/** Home, the docs home, each parent page that exists, then this page. */
async function docsCrumbs(page: DocsPageData): Promise<Crumb[]> {
  const t = await getTranslations("docs.breadcrumb");
  const crumbs: Crumb[] = [
    { name: t("home"), path: "/" },
    { name: t("docs"), path: "/docs" },
  ];
  for (let depth = 1; depth < page.slugs.length; depth++) {
    const parent = source.getPage(page.slugs.slice(0, depth));
    if (parent) crumbs.push({ name: parent.data.title, path: parent.url });
  }
  if (page.slugs.length > 0) {
    crumbs.push({ name: page.data.title, path: page.url });
  }
  return crumbs;
}

function techArticleSchema(page: DocsPageData) {
  const url = (path: string) => new URL(path, baseUrl).toString();
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.data.title,
    description: page.data.description,
    url: url(page.url),
    image: url(getPageImage(page).url),
    inLanguage: "en",
    ...(page.data.lastModified && {
      dateModified: new Date(page.data.lastModified).toISOString(),
    }),
    isPartOf: { "@type": "WebSite", name: siteName, url: url("/") },
    publisher: {
      "@type": "Organization",
      name: siteName,
      url: url("/"),
      logo: url("/logo.png"),
    },
  };
}

/** The page's Markdown (app/llms.mdx). */
function markdownUrl(page: DocsPageData): string {
  return `${page.url}.md`;
}

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);

  if (!page) notFound();

  const { body: Mdx, toc } = page.data;
  const markdown = markdownUrl(page);
  const t = await getTranslations("docs.shell.feedback");
  const tree = source.pageTree;

  // "Edit this page" opens the file that rendered; "Report a problem" a new
  // issue with the page's title and URL filled in.
  const editUrl = getGithubEditUrl(page.path);
  const reportUrl = getGitHubIssueUrl({
    owner,
    repo,
    title: t("issueTitle", { title: page.data.title }),
    body: t("issueBody", { url: new URL(page.url, baseUrl).toString() }),
  });

  return (
    <DocsPage
      toc={toc}
      // API reference pages (frontmatter `full`) need the width for Try it.
      full={page.data.full}
      // The reading column: styles/styles.css sets --docs-page-width.
      className={page.data.full ? undefined : "*:max-w-(--docs-page-width)"}
      // The section shows as an eyebrow above the title instead.
      breadcrumb={{ enabled: false }}
      tableOfContent={{ style: "clerk" }}
    >
      <JsonLd data={techArticleSchema(page)} />
      {page.slugs.length > 0 && (
        <JsonLd data={breadcrumbSchema(await docsCrumbs(page))} />
      )}
      {page.slugs.length > 0 && <PageEyebrow tree={tree} url={page.url} />}
      <DocsTitle className="text-[2rem] leading-[1.15] tracking-tight">
        {page.data.title}
      </DocsTitle>
      <DocsDescription className="mb-3 text-[1.0625rem] leading-relaxed text-pretty">
        {page.data.description}
      </DocsDescription>
      <div className="flex flex-row flex-wrap items-center gap-2 border-b pb-6">
        <PageActions markdownUrl={markdown} />
      </div>
      <DocsBody className="text-fd-foreground/90">
        {/* One image viewer for the page's framed images (components/mdx/frame.tsx). */}
        <Lightbox>
          <Mdx
            components={getMDXComponents({
              a: ({ href, ...props }) => {
                const found = source.getPageByHref(href ?? "", {
                  dir: PathUtils.dirname(page.path),
                });

                if (!found) return <Link href={href} {...props} />;

                return (
                  <HoverCard>
                    <HoverCardTrigger
                      href={
                        found.hash
                          ? `${found.page.url}#${found.hash}`
                          : found.page.url
                      }
                      {...props}
                    >
                      {props.children}
                    </HoverCardTrigger>
                    <HoverCardContent className="text-sm">
                      <p className="font-medium">{found.page.data.title}</p>
                      <p className="text-fd-muted-foreground">
                        {found.page.data.description}
                      </p>
                    </HoverCardContent>
                  </HoverCard>
                );
              },
              blockquote: Callout as unknown as FC<
                ComponentProps<"blockquote">
              >,
            })}
          />
        </Lightbox>
      </DocsBody>
      <div className="flex flex-col gap-4">
        <PageFeedback editUrl={editUrl} path={page.url} reportUrl={reportUrl} />
        {page.data.lastModified && (
          <PageLastUpdate date={page.data.lastModified} />
        )}
      </div>
    </DocsPage>
  );
}

/**
 * Every docs page, prerendered at build (none in preview builds or under
 * `next dev`: lib/static-params.ts). Unknown pages answer notFound() above.
 */
export function generateStaticParams() {
  return buildTimeParams(() =>
    source.getPages().map((page) => ({ slug: page.slugs })),
  );
}

export async function generateMetadata(
  props: PageProps<"/docs/[[...slug]]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  // A search title of its own where the sidebar title competes with the
  // marketing pages (lib/seo-overrides.ts).
  const override = seoOverride(page.url);

  return createMetadata({
    title: brandedTitle(override.title ?? page.data.title, " | QRdx Docs"),
    description: override.description ?? page.data.description,
    path: page.url,
    openGraph: {
      images: getPageImage(page).url,
    },
    // The page as Markdown (app/llms.mdx), for agents.
    alternates: {
      types: {
        "text/markdown": new URL(markdownUrl(page), baseUrl).toString(),
      },
    },
  });
}

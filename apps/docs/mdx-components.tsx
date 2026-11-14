import { cn } from "@repo/design-system/lib/utils";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import * as FilesComponents from "fumadocs-ui/components/files";
import * as TabsComponents from "fumadocs-ui/components/tabs";
import { TypeTable } from "fumadocs-ui/components/type-table";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";
import { APIPage } from "@/components/docs/api-page";
import { ComponentLinks } from "@/components/docs/registry/component-links";
import { ComponentPreview } from "@/components/docs/registry/component-preview";
import { ComponentSource } from "@/components/docs/registry/component-source";
import { InstallationTabs } from "@/components/docs/registry/installation-tabs";
import { PackageManagerTabs } from "@/components/docs/registry/package-manager-tabs";
import { Callout } from "@/components/mdx/callout";
import { Card, Cards } from "@/components/mdx/card";
import {
  DocsCodeBlockTabs,
  DocsCodeBlockTabsList,
  DocsPre,
} from "@/components/mdx/code-block";
import { Frame } from "@/components/mdx/frame";
import { GithubCard } from "@/components/mdx/github-card";
import { IfAvailable } from "@/components/mdx/if-available";
import { Mermaid } from "@/components/mdx/mermaid";
import { NpmStatus } from "@/components/mdx/npm-status";
import { PlanNote } from "@/components/mdx/plan-note";
import { shotComponents } from "@/components/mdx/shot";
import { DocsTable } from "@/components/mdx/table";
import { Video } from "@/components/mdx/video";
import { docsIcons } from "@/lib/docs-icons";

// The building blocks a docs page can use, documented in README.md ("MDX
// building blocks"). Module-level wrappers, so each keeps its identity
// across renders.

/** Tabs on the docs' scale (styles/styles.css restyles the triggers). */
function DocsTabs(props: ComponentProps<typeof TabsComponents.Tabs>) {
  return (
    <TabsComponents.Tabs
      {...props}
      className={cn("my-6 bg-fd-card", props.className)}
      data-docs-tabs=""
    />
  );
}

function DocsTab(props: ComponentProps<typeof TabsComponents.Tab>) {
  return (
    <TabsComponents.Tab
      {...props}
      className={cn("text-[0.9375rem] leading-relaxed", props.className)}
    />
  );
}

function DocsAccordions(props: ComponentProps<typeof Accordions>) {
  return (
    <Accordions
      {...props}
      className={cn("my-6 rounded-xl", props.className)}
      data-docs-accordions=""
    />
  );
}

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...docsIcons,
    ...defaultMdxComponents,
    ...TabsComponents,
    ...FilesComponents,
    Tabs: DocsTabs,
    Tab: DocsTab,
    // Code blocks: a header with the copy button, never over the code.
    pre: DocsPre,
    CodeBlockTabs: DocsCodeBlockTabs,
    CodeBlockTabsList: DocsCodeBlockTabsList,
    // Tables scroll inside their own bordered box.
    table: DocsTable,
    Accordion,
    Accordions: DocsAccordions,
    Callout,
    Card,
    Cards,
    Frame,
    Video,
    PlanNote,
    Mermaid,
    TypeTable,
    GithubCard,
    IfAvailable,
    NpmStatus,
    // Pictures and clips of the app (lib/shots-manifest.json): Shot, Clip
    ...shotComponents,
    ComponentLinks,
    ComponentPreview,
    ComponentSource,
    InstallationTabs,
    PackageManagerTabs,
    // API reference pages (content/docs/developers/api)
    OpenAPIPage: APIPage,
    ...components,
  };
}

// fumadocs-ui/mdx augments "mdx/types.js" with React's JSX namespace.
declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}

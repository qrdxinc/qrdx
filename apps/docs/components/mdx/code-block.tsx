"use client";

import { Tick } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import {
  CodeBlock,
  CodeBlockTabs,
  CodeBlockTabsList,
  Pre,
} from "fumadocs-ui/components/codeblock";
import { Copy } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type ComponentProps,
  createContext,
  isValidElement,
  use,
  useRef,
  useState,
} from "react";

// Code blocks never put the copy button over the code: a block has a header
// (its title, or its language when it has none) that holds the button, and
// in a tab group the button sits at the end of the tab row and copies the
// tab that is open.

const InCodeTabs = createContext(false);

/** The language fumadocs writes on the <code> (source.config: addLanguageClass). */
function languageOf(children: unknown): string | undefined {
  if (!isValidElement<{ className?: string }>(children)) return;
  const match = /(?:^|\s)language-([\w+#.-]+)/.exec(
    children.props.className ?? "",
  );
  return match?.[1];
}

/** How a language reads in the header; anything else shows its id. */
const LANGUAGE_LABEL: Record<string, string> = {
  bash: "Terminal",
  sh: "Terminal",
  shell: "Terminal",
  shellscript: "Terminal",
  zsh: "Terminal",
  console: "Terminal",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  json: "JSON",
  jsonc: "JSON",
  html: "HTML",
  css: "CSS",
  mdx: "MDX",
  md: "Markdown",
  markdown: "Markdown",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  xml: "XML",
  sql: "SQL",
  http: "HTTP",
  env: ".env",
  dotenv: ".env",
  text: "Text",
  txt: "Text",
  plaintext: "Text",
  diff: "Diff",
  python: "Python",
  py: "Python",
  go: "Go",
  php: "PHP",
  ruby: "Ruby",
  rb: "Ruby",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  csharp: "C#",
  cs: "C#",
  vue: "Vue",
  svelte: "Svelte",
  astro: "Astro",
  dockerfile: "Dockerfile",
  docker: "Dockerfile",
  nginx: "nginx",
};

/** The `pre` of every code block (mdx-components.tsx). */
export function DocsPre({
  children,
  title,
  className,
  ...props
}: ComponentProps<typeof CodeBlock>) {
  const inTabs = use(InCodeTabs);
  const lang = languageOf(children);
  const header = title ?? (lang ? (LANGUAGE_LABEL[lang] ?? lang) : undefined);
  return (
    <CodeBlock
      {...props}
      // In a tab group the tab row is the header.
      allowCopy={inTabs ? false : props.allowCopy}
      className={cn(
        inTabs && "rounded-t-none border-x-0 border-t-0",
        className,
      )}
      title={inTabs ? undefined : header}
    >
      <Pre>{children}</Pre>
    </CodeBlock>
  );
}

/** A group of code tabs (remark-npm's package-install blocks, `tab=` fences). */
export function DocsCodeBlockTabs(props: ComponentProps<typeof CodeBlockTabs>) {
  return (
    <InCodeTabs value={true}>
      <CodeBlockTabs
        {...props}
        className={cn("my-6", props.className)}
        data-docs-codetabs=""
      />
    </InCodeTabs>
  );
}

/** The tab row, with the copy button for the open tab at its end. */
export function DocsCodeBlockTabsList({
  className,
  ...props
}: ComponentProps<typeof CodeBlockTabsList>) {
  return (
    <div className="flex items-center border-b pe-1.5">
      <CodeBlockTabsList
        {...props}
        className={cn("min-w-0 flex-1", className)}
      />
      <CopyOpenTab />
    </div>
  );
}

function CopyOpenTab() {
  const t = useTranslations("docs.shell.code");
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [checked, setChecked] = useState(false);

  const copy = async () => {
    const group = ref.current?.closest("[data-docs-codetabs]");
    const pre = group?.querySelector(
      '[role="tabpanel"][data-state="active"] pre',
    );
    if (!pre) return;
    // As fumadocs' own button: without the parts marked not to copy.
    const clone = pre.cloneNode(true) as HTMLElement;
    for (const node of clone.querySelectorAll(".nd-copy-ignore")) {
      node.replaceWith("\n");
    }
    await navigator.clipboard.writeText(clone.textContent ?? "");
    setChecked(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setChecked(false), 1500);
  };

  return (
    <button
      aria-live="polite"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring [&_svg]:size-4"
      onClick={copy}
      ref={ref}
      type="button"
    >
      {checked ? <Tick aria-hidden /> : <Copy aria-hidden />}
      <span className="sr-only">{checked ? t("copied") : t("copy")}</span>
    </button>
  );
}

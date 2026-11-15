"use client";

import { useChat } from "@ai-sdk/react";
import { Bot, Close, Spinner } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { Node } from "fumadocs-core/page-tree";
import { useTreeContext } from "fumadocs-ui/contexts/tree";
import { useNotebookLayout } from "fumadocs-ui/layouts/notebook";
import { Add, Dislike, Like1, Send2, Stop } from "iconsax-reactjs";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  type ComponentProps,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Streamdown } from "streamdown";
import { LocaleLink } from "@/components/i18n/locale-link";
import { DocsPre } from "@/components/mdx/code-block";
import { isDocsPage, ZoneLink } from "@/components/zone-link";
import { track } from "@/lib/analytics";
import { type AskSource, useDocsChat } from "./provider";
import { type DocsSection, docsSectionOf } from "./section";
import { SUGGESTION_KEYS } from "./suggestions";

// The docs assistant's panel: the conversation, the composer and the
// suggested questions, talking to the main app's /api/docs-chat on the same
// origin (the docs are one zone of qrdx.dev). Each answer streams in as
// Markdown; the pages the model read arrive as tool parts and become the
// Sources list. The conversation lives in this component's state for the
// visit: the panel stays mounted once opened (fumadocs' AIChatPanel) and
// nothing is written to storage.

/** The same caps as the route (apps/app/lib/docs-chat/config.ts). */
const MAX_QUESTION_CHARS = 1000;
const MAX_MESSAGES = 10;
const MAX_ANSWER_CHARS = 4000;

/** What the route needs: the last messages as plain text. */
function compactMessages(messages: UIMessage[]) {
  return messages
    .map((message) => ({
      role: message.role,
      content: textOf(message).slice(
        0,
        message.role === "user" ? MAX_QUESTION_CHARS : MAX_ANSWER_CHARS,
      ),
    }))
    .filter(
      (message): message is { role: "user" | "assistant"; content: string } =>
        message.role !== "system" && message.content.length > 0,
    )
    .slice(-MAX_MESSAGES);
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

interface Source {
  title: string;
  path: string;
  url: string;
}

/** The docs pages an answer read, in order, once each. */
function sourcesOf(message: UIMessage): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const part of message.parts) {
    if (part.type !== "tool-read_docs_page") continue;
    if (!("state" in part) || part.state !== "output-available") continue;
    const output = part.output as Partial<Source> & { error?: string };
    if (!output || output.error || !output.path || !output.url) continue;
    if (seen.has(output.path)) continue;
    seen.add(output.path);
    sources.push({
      title: output.title || output.path,
      path: output.path,
      url: output.url,
    });
  }
  return sources;
}

/** The error the route sent (its JSON body), or nothing readable. */
function routeError(error: Error | undefined): { code?: string } | null {
  if (!error) return null;
  try {
    const parsed = JSON.parse(error.message) as { code?: string };
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

/** A page's title from the sidebar tree, by its URL. */
function pageTitle(nodes: Node[], url: string): string | undefined {
  for (const node of nodes) {
    if (node.type === "page") {
      if (node.url === url && typeof node.name === "string") return node.name;
    } else if (node.type === "folder") {
      if (node.index?.url === url && typeof node.index.name === "string") {
        return node.index.name;
      }
      const found = pageTitle(node.children, url);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Links in answers: a docs page on this site opens in the app (and the
 * panel stays), anything else is a plain link in a new tab.
 */
function AnswerLink({
  href,
  children,
  node: _node,
  ...props
}: ComponentProps<"a"> & { node?: unknown }) {
  let path: string | undefined;
  if (href) {
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin === window.location.origin) {
        path = `${url.pathname}${url.hash}`;
      }
    } catch {
      path = undefined;
    }
  }
  if (path && isDocsPage(path)) {
    return (
      <ZoneLink className="text-fd-primary underline" href={path} {...props}>
        {children}
      </ZoneLink>
    );
  }
  return (
    <a
      className="text-fd-primary underline"
      href={href}
      rel="noreferrer noopener"
      target="_blank"
      {...props}
    >
      {children}
    </a>
  );
}

/** Fenced code as on the docs pages: one block with a header and its copy button, scrolling sideways. */
function AnswerPre({
  node: _node,
  ...props
}: ComponentProps<"pre"> & { node?: unknown }) {
  return <DocsPre {...(props as ComponentProps<typeof DocsPre>)} />;
}

/** Inline code as on the docs pages; code inside a block keeps its language class for the header. */
function AnswerCode({
  node: _node,
  className,
  children,
  ...props
}: ComponentProps<"code"> & { node?: unknown }) {
  if (/(?:^|\s)language-/.test(className ?? "")) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
  return (
    <code
      className="rounded-md bg-fd-muted px-1.5 py-0.5 font-mono text-[0.85em] text-fd-foreground"
      {...props}
    >
      {children}
    </code>
  );
}

const answerComponents = { a: AnswerLink, pre: AnswerPre, code: AnswerCode };

export function DocsChatPanel() {
  const t = useTranslations("docs.chat");
  const locale = useLocale();
  const pathname = usePathname();
  const { open, setOpen, pending, consume } = useDocsChat();
  const {
    props: { tabs },
  } = useNotebookLayout();
  const { full } = useTreeContext();
  const section: DocsSection = useMemo(
    () => docsSectionOf(pathname, tabs),
    [pathname, tabs],
  );
  const titleId = useId();

  // The page the reader is on, read when a question is sent.
  const pageRef = useRef<{ path: string; title: string } | undefined>(
    undefined,
  );
  useEffect(() => {
    const title =
      pageTitle(full.children, pathname) ??
      document.querySelector("h1")?.textContent?.trim() ??
      document.title.split(" | ")[0]?.trim() ??
      "";
    pageRef.current =
      isDocsPage(pathname) && title
        ? { path: pathname, title: title.slice(0, 200) }
        : undefined;
  }, [pathname, full]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/docs-chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages: compactMessages(messages),
            lang: locale,
            ...(pageRef.current ? { page: pageRef.current } : {}),
          },
        }),
      }),
    [locale],
  );

  const outcomeSent = useRef(false);
  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    setMessages,
    clearError,
  } = useChat<UIMessage>({
    transport,
    onFinish: ({ message }) => {
      outcomeSent.current = true;
      track("docs_chat_answered", {
        sources: sourcesOf(message).length,
        outcome: "answered",
      });
    },
    onError: (caught) => {
      outcomeSent.current = true;
      const code = routeError(caught)?.code;
      track("docs_chat_answered", {
        sources: 0,
        outcome:
          code === "DOCS_CHAT_LIMITED" || code === "RATE_LIMITED"
            ? "limited"
            : "error",
      });
    },
  });
  const busy = status === "submitted" || status === "streaming";

  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<Record<string, boolean>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const send = useCallback(
    (text: string, source: AskSource | "composer") => {
      const question = text.trim().slice(0, MAX_QUESTION_CHARS);
      if (!question || busy) return;
      clearError();
      outcomeSent.current = false;
      track("docs_chat_asked", {
        query_length: question.length,
        tab: section,
        suggested: source === "suggestion",
      });
      void sendMessage({ text: question });
      setDraft("");
      stickToBottom.current = true;
    },
    [busy, clearError, sendMessage, section],
  );

  // A question handed over from the search dialog.
  useEffect(() => {
    if (!pending) return;
    consume(pending.nonce);
    send(pending.text, pending.source);
  }, [pending, consume, send]);

  // Focus moves into the panel when it opens.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => textareaRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [open]);

  // Follow the answer as it streams, unless the reader scrolled up.
  useEffect(() => {
    const element = scrollRef.current;
    if (messages.length > 0 && element && stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    stickToBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(draft, "composer");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      send(draft, "composer");
    }
  };

  const newChat = () => {
    stop();
    setMessages([]);
    clearError();
    setFeedback({});
    setDraft("");
    textareaRef.current?.focus();
  };

  const giveFeedback = (id: string, helpful: boolean) => {
    setFeedback((current) => ({ ...current, [id]: helpful }));
    track("docs_chat_feedback", { helpful });
  };

  const failure = routeError(error);
  const failureText = failure
    ? failure.code === "DOCS_CHAT_LIMITED"
      ? t("limited")
      : failure.code === "RATE_LIMITED"
        ? t("pace")
        : t("unavailable")
    : null;

  const lastAssistant = messages.at(-1);
  const waiting =
    busy &&
    (lastAssistant?.role !== "assistant" || textOf(lastAssistant).length === 0);

  return (
    <section
      aria-labelledby={titleId}
      className="flex h-full min-h-0 flex-col text-sm"
      data-docs-chat=""
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Bot className="size-4 shrink-0 text-fd-primary" size={16} />
        <h2 className="truncate font-medium text-fd-foreground" id={titleId}>
          {t("title")}
        </h2>
        <div className="ms-auto flex items-center gap-0.5">
          {messages.length > 0 && (
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
              onClick={newChat}
              type="button"
            >
              <Add className="size-4" size={16} />
              {t("newChat")}
            </button>
          )}
          <button
            aria-label={t("close")}
            className="inline-flex size-8 items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
            onClick={() => setOpen(false)}
            type="button"
          >
            <Close className="size-4" size={16} />
          </button>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        onScroll={onScroll}
        ref={scrollRef}
      >
        {messages.length === 0 ? (
          <EmptyState
            onAsk={(text) => send(text, "suggestion")}
            section={section}
          />
        ) : (
          <ol aria-live="polite" className="flex flex-col gap-5">
            {messages.map((message, index) => {
              const isLast = index === messages.length - 1;
              if (message.role === "user") {
                return (
                  <li className="flex justify-end" key={message.id}>
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-fd-secondary px-3.5 py-2 text-fd-foreground">
                      <span className="sr-only">{t("you")}: </span>
                      {textOf(message)}
                    </p>
                  </li>
                );
              }
              const text = textOf(message);
              const sources = sourcesOf(message);
              const done = !(isLast && busy);
              return (
                <li className="flex flex-col gap-3" key={message.id}>
                  <span className="sr-only">{t("assistant")}: </span>
                  {text.length > 0 ? (
                    <Streamdown
                      className="prose prose-sm max-w-none text-fd-foreground/90 [&_figure]:my-3 [&_pre]:text-xs"
                      codeBlockMaxHeight={320}
                      components={answerComponents}
                      controls={{
                        code: { copy: true, download: false },
                        table: false,
                        mermaid: false,
                      }}
                      isAnimating={isLast && busy}
                      lineNumbers={false}
                      mode="streaming"
                    >
                      {text}
                    </Streamdown>
                  ) : null}
                  {done && sources.length > 0 && (
                    <div
                      className="rounded-lg border bg-fd-card p-3"
                      data-docs-chat-sources=""
                    >
                      <p className="mb-1.5 text-xs font-medium text-fd-muted-foreground">
                        {t("sources")}
                      </p>
                      <ul className="flex flex-col gap-1">
                        {sources.map((source) => (
                          <li key={source.path}>
                            <ZoneLink
                              className="text-fd-foreground underline-offset-4 hover:underline"
                              href={source.path}
                            >
                              {source.title}
                            </ZoneLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {done && text.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-fd-muted-foreground">
                      {message.id in feedback ? (
                        <span>{t("thanks")}</span>
                      ) : (
                        <>
                          <span>{t("helpful")}</span>
                          <button
                            aria-label={t("yes")}
                            className="inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
                            onClick={() => giveFeedback(message.id, true)}
                            type="button"
                          >
                            <Like1 className="size-3.5" size={14} />
                          </button>
                          <button
                            aria-label={t("no")}
                            className="inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
                            onClick={() => giveFeedback(message.id, false)}
                            type="button"
                          >
                            <Dislike className="size-3.5" size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            {waiting && (
              <li
                aria-live="polite"
                className="flex items-center gap-2 text-fd-muted-foreground"
              >
                <Spinner className="size-4 animate-spin" size={16} />
                {t("reading")}
              </li>
            )}
            {failureText && (
              <li
                className="rounded-lg border border-fd-border bg-fd-card px-3 py-2 text-fd-muted-foreground"
                role="alert"
              >
                {failureText}
              </li>
            )}
          </ol>
        )}
      </div>

      <form className="shrink-0 border-t p-3" onSubmit={onSubmit}>
        <div className="flex items-end gap-1 rounded-xl border bg-fd-background p-1 ps-3 transition-shadow focus-within:ring-2 focus-within:ring-fd-ring/40">
          <textarea
            aria-label={t("placeholder")}
            className="field-sizing-content max-h-40 min-h-9 w-full resize-none bg-transparent py-2 text-sm text-fd-foreground outline-none placeholder:text-fd-muted-foreground"
            maxLength={MAX_QUESTION_CHARS}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("placeholder")}
            ref={textareaRef}
            rows={1}
            value={draft}
          />
          {busy ? (
            <button
              aria-label={t("stop")}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-fd-secondary text-fd-foreground transition-colors hover:bg-fd-accent"
              onClick={() => stop()}
              type="button"
            >
              <Stop className="size-4" size={16} variant="Bold" />
            </button>
          ) : (
            <button
              aria-label={t("send")}
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                draft.trim()
                  ? "bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90"
                  : "text-fd-muted-foreground",
              )}
              disabled={!draft.trim()}
              type="submit"
            >
              <Send2 className="size-4" size={16} />
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-fd-muted-foreground">
          {t.rich("privacy", {
            link: (chunks) => (
              <LocaleLink
                className="underline underline-offset-2 hover:text-fd-foreground"
                href="/legal/ai-features"
              >
                {chunks}
              </LocaleLink>
            ),
          })}
        </p>
      </form>
    </section>
  );
}

function EmptyState({
  section,
  onAsk,
}: {
  section: DocsSection;
  onAsk: (text: string) => void;
}) {
  const t = useTranslations("docs.chat");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-medium text-fd-foreground">{t("emptyTitle")}</p>
        <p className="mt-1 text-fd-muted-foreground">{t("emptyBody")}</p>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-fd-muted-foreground">
          {t("suggestionsTitle")}
        </p>
        <ul className="flex flex-col gap-1.5">
          {SUGGESTION_KEYS.map((key) => {
            // Looked up by a plain string: the typed template-literal key
            // makes next-intl's key types give up for the whole app.
            const question = (t as unknown as (key: string) => string)(
              `suggestions.${section}_${key}`,
            );
            return (
              <li key={key}>
                <button
                  className="w-full rounded-lg border bg-fd-card px-3 py-2 text-start text-fd-foreground transition-colors hover:border-fd-primary/40 hover:bg-fd-accent"
                  onClick={() => onAsk(question)}
                  type="button"
                >
                  {question}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

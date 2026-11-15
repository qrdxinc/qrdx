"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DOCS_CHAT_ENABLED } from "./enabled";

// The docs assistant's state for one visit: whether the panel is open and a
// question handed to it from elsewhere (the search dialog's "Ask AI about…"
// row, components/chat/slot.tsx). The conversation itself lives in the panel
// (components/chat/panel.tsx), which stays mounted once opened, so closing
// and reopening keeps it; a reload forgets it. Nothing is written to storage.
//
// Hand-overs travel as a window event, so a component outside this provider
// (the search dialog sits in fumadocs' RootProvider) can ask a question
// without the layout threading context through Shell-owned files.

/** Where a handed-over question came from, for analytics. */
export type AskSource = "search" | "page" | "suggestion";

export interface PendingQuestion {
  text: string;
  source: AskSource;
  /** Changes with every hand-over, so the same text twice is asked twice. */
  nonce: number;
}

const ASK_EVENT = "qrdx:docs-chat-ask";

/** Opens the chat and asks `text`, from anywhere in the docs (a no-op when the chat is off). */
export function askDocsChat(text: string, source: AskSource): void {
  if (!DOCS_CHAT_ENABLED || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ASK_EVENT, { detail: { text, source } }),
  );
}

interface DocsChatContextValue {
  /** The assistant is offered on this deployment (availability "docsChat"). */
  enabled: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Opens the panel and asks `text` as soon as it can. */
  ask: (text: string, source: AskSource) => void;
  /** The question waiting to be asked, if any; `consume` takes it. */
  pending: PendingQuestion | null;
  consume: (nonce: number) => void;
}

const DocsChatContext = createContext<DocsChatContextValue | null>(null);

/** ⌘I on Mac, Ctrl+I elsewhere. */
export function isAskAiShortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "i"
  );
}

export function DocsChatProvider({ children }: { children: ReactNode }) {
  const enabled = DOCS_CHAT_ENABLED;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const nonce = useRef(0);

  const ask = useCallback((text: string, source: AskSource) => {
    const trimmed = text.trim();
    if (!(enabled && trimmed)) return;
    nonce.current += 1;
    setPending({ text: trimmed, source, nonce: nonce.current });
    setOpen(true);
  }, []);

  const consume = useCallback((taken: number) => {
    setPending((current) => (current?.nonce === taken ? null : current));
  }, []);

  const toggle = useCallback(() => setOpen((current) => !current), []);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isAskAiShortcut(event) || event.defaultPrevented) return;
      event.preventDefault();
      toggle();
    };
    const onAsk = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string; source: AskSource }>)
        .detail;
      if (detail?.text) ask(detail.text, detail.source ?? "page");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(ASK_EVENT, onAsk);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(ASK_EVENT, onAsk);
    };
  }, [toggle, ask]);

  const value = useMemo<DocsChatContextValue>(
    () => ({ enabled, open, setOpen, toggle, ask, pending, consume }),
    [open, toggle, ask, pending, consume],
  );

  return (
    <DocsChatContext.Provider value={value}>
      {children}
    </DocsChatContext.Provider>
  );
}

const OFF: DocsChatContextValue = {
  enabled: false,
  open: false,
  setOpen: () => undefined,
  toggle: () => undefined,
  ask: () => undefined,
  pending: null,
  consume: () => undefined,
};

/** The chat's state; a disabled, closed one outside the provider. */
export function useDocsChat(): DocsChatContextValue {
  return useContext(DocsChatContext) ?? OFF;
}

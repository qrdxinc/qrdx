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

// The docs assistant's state for one visit: whether the panel is open and a
// question handed to it from elsewhere (the search dialog's "Ask AI about…"
// row). The conversation itself lives in the panel (components/chat/panel.tsx),
// which stays mounted once opened, so closing and reopening keeps it; a
// reload forgets it. Nothing is written to storage.

/** Where a handed-over question came from, for analytics. */
export type AskSource = "search" | "page" | "suggestion";

export interface PendingQuestion {
  text: string;
  source: AskSource;
  /** Changes with every hand-over, so the same text twice is asked twice. */
  nonce: number;
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

export function DocsChatProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const nonce = useRef(0);

  const ask = useCallback(
    (text: string, source: AskSource) => {
      const trimmed = text.trim();
      if (!(enabled && trimmed)) return;
      nonce.current += 1;
      setPending({ text: trimmed, source, nonce: nonce.current });
      setOpen(true);
    },
    [enabled],
  );

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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, toggle]);

  const value = useMemo<DocsChatContextValue>(
    () => ({ enabled, open, setOpen, toggle, ask, pending, consume }),
    [enabled, open, toggle, ask, pending, consume],
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

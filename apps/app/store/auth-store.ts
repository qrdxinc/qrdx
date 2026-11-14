/** biome-ignore-all lint/suspicious/noExplicitAny: false positive */
import {
  type AuthPromptReason,
  trackAuthPromptDismissed,
  trackAuthPromptShown,
} from "@repo/analytics/auth-prompt";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type AuthDialogMode,
  authPromptSurface,
  defaultAuthMode,
} from "@/lib/analytics/auth-prompt";
import type {
  PostLoginActionType,
  StoredPostLoginAction,
} from "@/lib/hooks/use-post-login-action";

export interface AuthDialogOptions {
  /** Defaults to defaultAuthMode(reason): sign-up for a first visit. */
  mode?: AuthDialogMode;
  /** What to do once signed in (lib/hooks/use-post-login-action.ts). */
  action?: PostLoginActionType;
  data?: any;
  /** Same-site page to land on after signing in (default: stay here). */
  callbackURL?: string;
  /** Where it opened, when the page's section doesn't say ("header"). */
  surface?: string;
}

interface AuthStore {
  isOpen: boolean;
  mode: AuthDialogMode;
  /** Why it opened: the dialog says so in one line (auth.reasons). */
  reason: AuthPromptReason;
  surface: string;
  postLoginAction: StoredPostLoginAction;
  /** Same-site page to land on after signing in (null: stay on this page). */
  callbackURL: string | null;
  openAuthDialog: (
    reason: AuthPromptReason,
    options?: AuthDialogOptions,
  ) => void;
  /** Opens sign-in for a page that needs an account, landing there after. */
  openSignInTo: (callbackURL: string, reason?: AuthPromptReason) => void;
  /** Closes it after a sign-in (or when a session is already there). */
  closeAuthDialog: () => void;
  /** The visitor closed it without signing in. */
  dismissAuthDialog: () => void;
  clearPostLoginAction: () => void;
}

function currentSurface(): string {
  return typeof window === "undefined"
    ? "other"
    : authPromptSurface(window.location.pathname);
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      isOpen: false,
      mode: "signin",
      reason: "nav",
      surface: "other",
      postLoginAction: null,
      callbackURL: null,
      openAuthDialog: (reason, options = {}) => {
        const surface = options.surface ?? currentSurface();
        set({
          isOpen: true,
          mode: options.mode ?? defaultAuthMode(reason),
          reason,
          surface,
          postLoginAction: options.action
            ? { type: options.action, data: options.data }
            : null,
          callbackURL: options.callbackURL ?? null,
        });
        trackAuthPromptShown({ reason, surface }, "dialog");
      },
      openSignInTo: (callbackURL, reason = "nav") => {
        get().openAuthDialog(reason, { callbackURL });
      },
      closeAuthDialog: () => {
        set({ isOpen: false, callbackURL: null });
      },
      dismissAuthDialog: () => {
        const { isOpen, reason, surface } = get();
        if (isOpen) trackAuthPromptDismissed({ reason, surface }, "dialog");
        set({ isOpen: false, callbackURL: null, postLoginAction: null });
      },
      clearPostLoginAction: () => {
        set({ postLoginAction: null });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ postLoginAction: state.postLoginAction }),
    },
  ),
);

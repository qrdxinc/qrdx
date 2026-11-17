"use client";

import { KeyboardShortcutsTrigger } from "@/components/keyboard-shortcuts-trigger";
import { KeyboardShortcutProvider } from "@/lib/hooks/use-keyboard-shortcuts";
import { UserSettingsProvider } from "@/lib/hooks/user-settings-provider";

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <UserSettingsProvider>
      <KeyboardShortcutProvider>
        <KeyboardShortcutsTrigger>{children}</KeyboardShortcutsTrigger>
      </KeyboardShortcutProvider>
    </UserSettingsProvider>
  );
};

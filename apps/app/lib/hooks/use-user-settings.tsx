"use client";

import { createContext, useContext } from "react";

/**
 * What the UI reads of the person's settings: the `settings` of their user
 * row (@repo/database/schema UserSettings), as far as these components use
 * it. Declared here so components that show shortcuts (tooltips, menus) and
 * the public generator widgets that use them never name the database package.
 */
export interface ShortcutSettings {
  keyboardShortcuts: boolean;
}

export interface UserSettingsContextType {
  settings: ShortcutSettings | null;
  isLoading: boolean;
  refreshSettings: () => Promise<void>;
}

/**
 * Filled by UserSettingsProvider (./user-settings-provider.tsx) in the
 * playground and settings. Without it (the public generator pages) there are
 * no settings, and shortcuts show by default.
 */
export const UserSettingsContext = createContext<UserSettingsContextType>({
  settings: null,
  isLoading: true,
  refreshSettings: async () => {},
});

export function useUserSettings() {
  const context = useContext(UserSettingsContext);
  if (!context) {
    throw new Error("useUserSettings must be used within UserSettingsProvider");
  }
  return context;
}

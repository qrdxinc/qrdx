"use client";

import type { UserSettings } from "@repo/database/schema";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { getUserSettings } from "@/actions/user-settings";
import { UserSettingsContext } from "@/lib/hooks/use-user-settings";

/** Loads the signed-in person's settings for useUserSettings below it. */
export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    try {
      const userSettings = await getUserSettings();
      setSettings(userSettings);
    } catch (error) {
      console.error("Error fetching user settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  return (
    <UserSettingsContext.Provider
      value={{ settings, isLoading, refreshSettings }}
    >
      {children}
    </UserSettingsContext.Provider>
  );
}

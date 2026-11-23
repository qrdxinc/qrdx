"use client";

import { authClient } from "@repo/auth/client";
import { useEffect } from "react";
import { getThemes } from "@/actions/qr-themes";
import { storedStyleDefaults } from "@/config/qr";
import { isDeepEqual } from "@/lib/utils";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";

const SESSION_KEY = "qrdx:default-theme-applied";

/**
 * A fresh editor session (still on the untouched built-in default) starts
 * from the active workspace's default theme, once per tab and workspace.
 * Never replaces a design in progress or a theme opened from a link.
 */
function applyDefaultTheme(workspace: string) {
  const { defaultPresetId } = useThemePresetStore.getState();
  if (!defaultPresetId) return;

  const key = `${SESSION_KEY}:${workspace}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    return;
  }

  const { themeState, hasUnsavedChanges, applyThemePreset } =
    useQREditorStore.getState();
  // The default look kept from before new designs had a margin counts too
  const pristine =
    (themeState.preset ?? "default") === "default" &&
    (!hasUnsavedChanges() ||
      isDeepEqual(themeState.styles, storedStyleDefaults));
  if (pristine) applyThemePreset(defaultPresetId);
}

/** Keeps the editor's saved themes in sync with the signed-in user's workspace. */
export function useSavedThemes() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const workspace = session?.session.activeOrganizationId ?? "personal";

  useEffect(() => {
    const { loadSavedPresets, unloadSavedPresets } =
      useThemePresetStore.getState();
    if (!userId) {
      unloadSavedPresets();
      return;
    }

    let cancelled = false;
    loadSavedPresets(getThemes).then(() => {
      if (!cancelled) applyDefaultTheme(`${userId}:${workspace}`);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, workspace]);
}

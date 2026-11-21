import type { EyePosition } from "qrdx/types";
import { create } from "zustand";

import { useControlsTabFromUrl } from "@/lib/hooks/use-controls-tab-from-url";

export type FocusColorId =
  | "bgColor"
  | "fgColor"
  | "eyeColor"
  | "dotColor"
  // Per-eye colors (the Eye colors section)
  | `eyeColors.${EyePosition}.${"outer" | "inner"}`
  // The looks around the shapes (Rounded corners, Halo, Shadow sections)
  | "backdrop"
  | "halo.color"
  | "shadow.color";

interface ColorControlFocusState {
  /**
   * The controls showing each color, oldest first: the Design tab's, then a
   * copy in the preview's part toolbars while one is open. Focusing goes
   * to the oldest.
   */
  colorRefs: Map<FocusColorId, (HTMLElement | null)[]>;
  highlightTarget: FocusColorId | null;
  /**
   * Programmatically focus the color control identified by `name`.
   */
  focusColor: (name: FocusColorId) => void;
  registerColor: (name: FocusColorId, ref: HTMLElement | null) => void;
  /** Forgets the control `ref` (another one showing the color stays). */
  unregisterColor: (name: FocusColorId, ref: HTMLElement | null) => void;
}

export const useColorControlFocusStore = create<ColorControlFocusState>(
  (set, get) => ({
    colorRefs: new Map(),
    highlightTarget: null,

    registerColor: (name, ref) =>
      set((state) => {
        const map = new Map(state.colorRefs);
        map.set(name, [...(map.get(name) ?? []), ref]);
        return { colorRefs: map };
      }),

    unregisterColor: (name, ref) =>
      set((state) => {
        const map = new Map(state.colorRefs);
        const left = (map.get(name) ?? []).filter((other) => other !== ref);
        if (left.length > 0) map.set(name, left);
        else map.delete(name);
        return { colorRefs: map };
      }),

    focusColor: (name) => {
      const { colorRefs } = get();
      const refs = colorRefs.get(name);
      if (!refs) return;
      const ref = refs[0] ?? null;

      // Scroll & highlight after a brief delay to ensure expansion has occurred.
      setTimeout(() => {
        if (ref?.scrollIntoView) {
          ref.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        set({ highlightTarget: name });
        setTimeout(() => set({ highlightTarget: null }), 3000);
      }, 175);
    },
  }),
);

/**
 * Hook that exposes helper functions for color control focus behaviour.
 */
export const useColorControlFocus = () => {
  const { handleSetTab } = useControlsTabFromUrl();

  const focusColor = (name: FocusColorId) => {
    handleSetTab("customisations");
    requestAnimationFrame(() => {
      useColorControlFocusStore.getState().focusColor(name);
    });
  };

  return {
    registerColor: useColorControlFocusStore((s) => s.registerColor),
    unregisterColor: useColorControlFocusStore((s) => s.unregisterColor),
    highlightTarget: useColorControlFocusStore((s) => s.highlightTarget),
    focusColor,
  } as const;
};

import { useEffect } from "react";
import { create } from "zustand";
import type { DesignSection } from "@/lib/playground-links";

interface PlaygroundFocusStore {
  /** A Design section a playground link asked to open (?section=) */
  section: DesignSection | null;
  setSection: (section: DesignSection | null) => void;
  /**
   * A signed-out visitor came for a dynamic code (open=dynamic): the URL
   * form gets a "Create dynamic code" button, which asks for sign-up only
   * when pressed (lib/playground-apply.ts). Cleared once there's a session
   * (lib/hooks/use-playground-params.ts) or the code is made.
   */
  dynamicPick: boolean;
  setDynamicPick: (pick: boolean) => void;
  /** The address field takes focus once for the pick, not on every remount. */
  addressFocus: boolean;
  /** The pick from a link: the button, and the address field's focus once. */
  pickDynamic: () => void;
  /** True the first time after pickDynamic, then false. */
  takeAddressFocus: () => boolean;
}

/** Hand-off from a playground link to the Design tab; cleared on the next tab change. */
export const usePlaygroundFocusStore = create<PlaygroundFocusStore>()(
  (set, get) => ({
    section: null,
    setSection: (section) => set({ section }),
    dynamicPick: false,
    setDynamicPick: (dynamicPick) =>
      set(dynamicPick ? { dynamicPick } : { dynamicPick, addressFocus: false }),
    addressFocus: false,
    pickDynamic: () => set({ dynamicPick: true, addressFocus: true }),
    takeAddressFocus: () => {
      if (!get().addressFocus) return false;
      set({ addressFocus: false });
      return true;
    },
  }),
);

/**
 * Ends the signed-out "Create dynamic code" once there's a session: signed
 * in, Dynamic and Link options take over, and the button doesn't come back
 * after a later sign-out (lib/hooks/use-playground-params.ts calls it).
 */
export function useEndDynamicPickWhenSignedIn(signedIn: boolean): void {
  useEffect(() => {
    if (signedIn) usePlaygroundFocusStore.getState().setDynamicPick(false);
  }, [signedIn]);
}

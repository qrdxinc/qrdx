import { create } from "zustand";
import type { DesignSection } from "@/lib/playground-links";

interface PlaygroundFocusStore {
  /** A Design section a playground link asked to open (?section=) */
  section: DesignSection | null;
  setSection: (section: DesignSection | null) => void;
  /**
   * A signed-out visitor came for a dynamic code (open=dynamic): the URL
   * form gets the address field ready and a "Create dynamic code" button,
   * which asks for sign-up only when pressed (lib/playground-apply.ts).
   */
  dynamicPick: boolean;
  setDynamicPick: (pick: boolean) => void;
}

/** Hand-off from a playground link to the Design tab; cleared on the next tab change. */
export const usePlaygroundFocusStore = create<PlaygroundFocusStore>()(
  (set) => ({
    section: null,
    setSection: (section) => set({ section }),
    dynamicPick: false,
    setDynamicPick: (dynamicPick) => set({ dynamicPick }),
  }),
);

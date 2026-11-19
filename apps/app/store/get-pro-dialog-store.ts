import { create } from "zustand";
import type { PaidPlan } from "@/lib/pricing";

/**
 * Whose plan a locked feature follows. "workspace" (the default): the open
 * workspace's, which only its owners and billing members lift by
 * upgrading (lib/plans.ts getPlanForScope). "self": the person's own, such
 * as more workspaces or AI chat requests.
 */
export type UpgradePayer = "workspace" | "self";

export interface UpgradeDialogOptions {
  payer?: UpgradePayer;
}

interface GetProDialogState {
  isOpen: boolean;
  /** The plan the dialog highlights: the lowest one with the locked feature. */
  plan: PaidPlan;
  payer: UpgradePayer;
  /**
   * The app shell's answer for the open workspace (an owner or billing
   * member: PlanLimitsProvider sets it); null outside the shell.
   */
  shellCanUpgrade: boolean | null;
  /** Opens the dialog for Pro; safe to pass straight to onClick. */
  openGetProDialog: () => void;
  /** For features that need a specific tier, e.g. openUpgradeDialog("business"). */
  openUpgradeDialog: (plan: PaidPlan, options?: UpgradeDialogOptions) => void;
  closeGetProDialog: () => void;
  setShellCanUpgrade: (value: boolean | null) => void;
}

export const useGetProDialogStore = create<GetProDialogState>()((set) => ({
  isOpen: false,
  plan: "pro",
  payer: "workspace",
  shellCanUpgrade: null,
  openGetProDialog: () =>
    set({ isOpen: true, plan: "pro", payer: "workspace" }),
  openUpgradeDialog: (plan, options = {}) =>
    set({
      isOpen: true,
      plan: plan === "business" ? "business" : "pro",
      payer: options.payer ?? "workspace",
    }),
  closeGetProDialog: () => set({ isOpen: false }),
  setShellCanUpgrade: (value) => set({ shellCanUpgrade: value }),
}));

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
  /**
   * A workspace gate that knows whether this person's purchase lifts the
   * workspace's plan (the AI art credits answer it). Left out, the app
   * shell's answer is used, else the server's (components/billing).
   */
  canUpgrade?: boolean;
}

interface GetProDialogState {
  isOpen: boolean;
  /** The plan the dialog highlights: the lowest one with the locked feature. */
  plan: PaidPlan;
  payer: UpgradePayer;
  /** The gate's own canUpgrade (UpgradeDialogOptions); null when not given */
  canUpgrade: boolean | null;
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
  canUpgrade: null,
  shellCanUpgrade: null,
  openGetProDialog: () =>
    set({ isOpen: true, plan: "pro", payer: "workspace", canUpgrade: null }),
  openUpgradeDialog: (plan, options = {}) =>
    set({
      isOpen: true,
      plan: plan === "business" ? "business" : "pro",
      payer: options.payer ?? "workspace",
      canUpgrade: options.canUpgrade ?? null,
    }),
  closeGetProDialog: () => set({ isOpen: false }),
  setShellCanUpgrade: (value) => set({ shellCanUpgrade: value }),
}));

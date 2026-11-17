"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Diamonds as Gem } from "iconsax-reactjs";
import { WhiteLabelRow, WhiteLabelUpgrade } from "@/ee/white-label/editor";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { BrandingRow } from "./branding-row";

/**
 * What QRdx branding the page carries on the current plan, with upgrade CTAs.
 * White-label (Business) is ee/white-label: its line and button show only
 * where the server offers it.
 */
export function BrandingSection({
  badge,
  whiteLabel,
}: {
  badge: boolean;
  whiteLabel: boolean;
}) {
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-medium">Branding</h3>
      <ul className="space-y-2.5">
        <BrandingRow
          hint={
            badge
              ? 'Free pages show a small "Made with QRdx" link at the bottom.'
              : "Your page has no QRdx footer."
          }
          label="No QRdx footer (Pro)"
          on={!badge}
        />
        <WhiteLabelRow on={whiteLabel} />
      </ul>
      {badge ? (
        <Button
          onClick={() => openUpgradeDialog("pro")}
          size="sm"
          type="button"
          variant="outline"
        >
          <Gem />
          Remove the footer with Pro
        </Button>
      ) : (
        !whiteLabel && <WhiteLabelUpgrade />
      )}
    </section>
  );
}

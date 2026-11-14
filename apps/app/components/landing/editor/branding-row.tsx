"use client";

import { Tick as Check } from "@repo/design-system/components/icons";
import { Lock } from "iconsax-reactjs";

/** One line of the editor's Branding section: on (tick) or locked. */
export function BrandingRow({
  on,
  label,
  hint,
}: {
  on: boolean;
  label: string;
  hint: string;
}) {
  return (
    <li className="flex gap-2">
      {on ? (
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      )}
      <span>
        <span className="block text-sm">{label}</span>
        <span className="text-muted-foreground block text-xs">{hint}</span>
      </span>
    </li>
  );
}

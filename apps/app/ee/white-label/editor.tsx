"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { Diamonds as Gem, Lock } from "iconsax-reactjs";
import { useId, useMemo } from "react";
import { useAvailability } from "@/components/availability-provider";
import { MAX_CUSTOM_CSS_LENGTH } from "@/components/landing/custom-css-limit";
import { BrandingRow } from "@/components/landing/editor/branding-row";
import { scopeCustomCss } from "@/ee/white-label/custom-css";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";

// The page editor's white-label and custom CSS controls (ee/white-label,
// QRdx commercial licence). Each renders nothing where the server doesn't
// offer the feature (no licence key: packages/availability/rules.ts
// `whiteLabel`), the way SSO is absent there; the plan decides on/locked.

export interface PreviewCss {
  /** Scoped CSS for the preview, or null */
  css: string | null;
  /** Why the CSS can't be published, shown with the page's other problems */
  error: string | null;
}

/**
 * The page's custom CSS as the editor's preview applies it, and the problem
 * that keeps it from being published (the server refuses the same, in
 * access.ts). Where the server doesn't offer custom CSS it's neither checked
 * nor applied.
 */
export function usePreviewCss(
  canUseCustomCss: boolean,
  css: string,
): PreviewCss {
  const offered = useAvailability().has("whiteLabel");
  return useMemo(() => {
    if (!(offered && css.trim())) return { css: null, error: null };
    const result = scopeCustomCss(css);
    if (!result.ok) return { css: null, error: result.error };
    return { css: canUseCustomCss ? result.css : null, error: null };
  }, [offered, canUseCustomCss, css]);
}

/** The Branding section's white-label line. */
export function WhiteLabelRow({ on }: { on: boolean }) {
  const offered = useAvailability().has("whiteLabel");
  if (!offered) return null;
  return (
    <BrandingRow
      hint="Your logo as the browser icon and share name; no QRdx branding anywhere. A neutral Report abuse link always stays."
      label="White-label (Business)"
      on={on}
    />
  );
}

/** The Branding section's upgrade button, for a page without white-label. */
export function WhiteLabelUpgrade() {
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );
  const offered = useAvailability().has("whiteLabel");
  if (!offered) return null;
  return (
    <Button
      onClick={() => openUpgradeDialog("business")}
      size="sm"
      type="button"
      variant="outline"
    >
      <Gem />
      White-label with Business
    </Button>
  );
}

/** Settings → Custom CSS: editable on Business, locked with an upgrade below. */
export function CustomCssField({
  value,
  onChange,
  allowed,
}: {
  value: string;
  onChange: (css: string) => void;
  allowed: boolean;
}) {
  const cssId = useId();
  const openUpgradeDialog = useGetProDialogStore(
    (state) => state.openUpgradeDialog,
  );
  const offered = useAvailability().has("whiteLabel");
  if (!offered) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium" htmlFor={cssId}>
          Custom CSS
        </Label>
        {!allowed && (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <Lock className="size-3" />
            Business
          </span>
        )}
      </div>
      <Textarea
        className="min-h-32 font-mono text-xs"
        disabled={!allowed}
        id={cssId}
        maxLength={MAX_CUSTOM_CSS_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        placeholder={".lp-block-links a {\n  letter-spacing: 0.02em;\n}"}
        spellCheck={false}
        value={value}
      />
      <p className="text-muted-foreground text-xs">
        Styles apply only inside your page. Target blocks with{" "}
        <code>.lp-block-&lt;type&gt;</code> (e.g. <code>.lp-block-links</code>
        ). Images, fonts and other files can't be loaded from CSS.
      </p>
      {!allowed && (
        <Button
          onClick={() => openUpgradeDialog("business")}
          size="sm"
          type="button"
          variant="outline"
        >
          <Gem />
          Upgrade to Business for custom CSS
        </Button>
      )}
    </div>
  );
}

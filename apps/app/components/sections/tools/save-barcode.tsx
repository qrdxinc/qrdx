"use client";

// /barcode-generator's "Save to dashboard": signed in, the barcode goes to
// the workspace's Barcodes (POST /api/barcodes, which runs the saveBarcode
// server action); signed out, a quiet line offers sign-in and the generator
// keeps working without one. The session is the browser's (authClient).

import { track } from "@repo/analytics";
import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { ArchiveAdd } from "iconsax-reactjs";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useLocaleRouter as useRouter } from "@/components/i18n/locale-link";
import {
  BarcodeGenerator,
  type CurrentBarcode,
} from "@/components/sections/tools/barcode-generator";
import { type BarcodeFormatId, getBarcodeFormat } from "@/lib/barcode/formats";
import { styleChanges } from "@/lib/barcode/style";
import { soundEvent } from "@/lib/sound/emit";
import { saveGeneratorBarcode } from "@/lib/widget-routes/client";
import { workspaceHref } from "@/lib/workspace-paths";
import { useAuthStore } from "@/store/auth-store";

/**
 * The public generator, with "Save to dashboard" under its downloads. A
 * format's own page (/barcode-generator/<format>) starts on that format and
 * its example.
 */
export function PublicBarcodeGenerator({
  format,
}: {
  format?: BarcodeFormatId;
} = {}) {
  return (
    <BarcodeGenerator
      initial={
        format ? { format, value: getBarcodeFormat(format).example } : undefined
      }
      renderActions={(current) => <SaveBarcode current={current} />}
    />
  );
}

export function SaveBarcode({ current }: { current: CurrentBarcode | null }) {
  const t = useTranslations("barcodeTool.save");
  // The server's messages come in this page's language (English here).
  const locale = useLocale();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const openSignInTo = useAuthStore((state) => state.openSignInTo);
  const [saving, setSaving] = useState(false);

  if (isPending) return <div aria-hidden className="h-9" />;

  if (!session?.user) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        {t.rich("signIn", {
          link: (chunks) => (
            <button
              className="text-foreground underline underline-offset-4 hover:no-underline"
              onClick={() => openSignInTo("/barcode-generator", "save_barcode")}
              type="button"
            >
              {chunks}
            </button>
          ),
        })}
      </p>
    );
  }

  const save = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const result = await saveGeneratorBarcode(
        {
          format: current.format,
          value: current.value,
          options: styleChanges(current.format, current.style),
          title: null,
        },
        locale,
      );
      if (!result.success) {
        soundEvent("error");
        toast.error(t("failed"), {
          description: result.error.message,
        });
        return;
      }
      const { id, workspace } = result.data;
      const href = workspaceHref(
        workspace.slug,
        `/barcodes/${encodeURIComponent(id)}`,
      );
      soundEvent("success");
      track("barcode_saved", {
        symbology: current.format,
        source: "generator",
      });
      toast.success(t("saved", { workspace: workspace.name }), {
        description: t("savedDescription"),
        action: { label: t("open"), onClick: () => router.push(href) },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button
      className="w-full"
      disabled={!current || saving}
      onClick={save}
      variant="secondary"
    >
      {saving ? (
        <ModuleOrbit aria-hidden className="size-4" />
      ) : (
        <ArchiveAdd aria-hidden className="size-4" />
      )}
      {t("save")}
    </Button>
  );
}

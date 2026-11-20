"use client";

import { CANONICAL_ORIGIN } from "@repo/config";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";
import type { ThemeStyles } from "@/types/theme";
import { STAGE } from "./card-layout";
import { DesignQr } from "./design-qr";
import stage from "./stage.module.css";

const SAMPLE = `${CANONICAL_ORIGIN}/community`;

/**
 * The item's design with the visitor's own link, drawn in the browser,
 * standing on the community's light stage. `page`: a kit's page on its
 * phone, which stands beside the design on the same stage.
 */
export function TryIt({
  style,
  page,
}: {
  style: ThemeStyles;
  page?: ReactNode;
}) {
  const t = useTranslations("community.tryIt");
  const id = useId();
  const [value, setValue] = useState("");
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl",
          page ? "aspect-[4/3]" : "aspect-square",
          STAGE,
        )}
        data-stage=""
      >
        <DesignQr
          className={cn(
            "absolute",
            page ? "top-[16%] bottom-[16%] left-[7%] w-[42%]" : "inset-[11%]",
            stage.object,
          )}
          style={style}
          value={value || SAMPLE}
        />
        {page}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor={id}>
          {t("tryItWithYourLink")}
        </Label>
        <Input
          id={id}
          inputMode="url"
          maxLength={500}
          onChange={(event) => setValue(event.target.value)}
          placeholder={SAMPLE}
          value={value}
        />
        <p className="text-muted-foreground text-xs">
          {t("drawnInYourBrowserNothing")}
        </p>
      </div>
    </div>
  );
}

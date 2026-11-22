"use client";

// The payment code of a Swiss QR-bill (SIX Swiss Payments Code). The
// guidelines want error correction M, the Swiss cross in the middle, black
// on white and nothing printed around the code, so the form puts that
// QR-bill style on the design when it opens, and offers to put it back if
// the design changes it. What people type stays in this browser.

import { Button } from "@repo/design-system/components/ui/button";
import { useFormatter, useTranslations } from "next-intl";
import * as React from "react";
import {
  swissQrStyleIssues,
  withSwissQrStyle,
} from "@/lib/qr-design/swiss-qr-bill-style";
import { swissQrBillSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import { SWISS_CROSS_LOGO, swissCrossShare } from "@/utils/swiss-qr-bill";
import { type FormField, SchemaForm } from "./schema-form";

const payer = (values: Record<string, string | boolean>) =>
  values.payableBy === true;

const SWISS_QR_BILL_FIELDS: FormField[] = [
  {
    name: "iban",
    label: "IBAN or QR-IBAN",
    required: true,
    placeholder: "CH44 3199 9123 0008 8901 2",
    hint: "A Swiss or Liechtenstein account. A QR-IBAN needs a QR reference.",
    mono: true,
  },
  {
    name: "name",
    label: "Name",
    required: true,
    placeholder: "Name on the account",
  },
  {
    name: "street",
    label: "Street",
    placeholder: "Bahnhofstrasse",
  },
  {
    name: "buildingNumber",
    label: "Building number",
    placeholder: "1",
  },
  {
    name: "postalCode",
    label: "Postcode",
    required: true,
    placeholder: "8001",
    inputMode: "numeric",
  },
  {
    name: "town",
    label: "Town",
    required: true,
    placeholder: "Zurich",
  },
  {
    name: "country",
    label: "Country",
    required: true,
    initial: "CH",
    placeholder: "CH",
    hint: "The 2-letter code, like CH or LI.",
    mono: true,
  },
  {
    name: "currency",
    label: "Currency",
    kind: "select",
    initial: "CHF",
    options: [
      { value: "CHF", label: "Swiss francs (CHF)" },
      { value: "EUR", label: "Euros (EUR)" },
    ],
  },
  {
    name: "amount",
    label: "Amount",
    placeholder: "Leave empty to let the payer choose",
    inputMode: "decimal",
  },
  {
    name: "reference",
    label: "Reference",
    placeholder: "21 00000 00003 13947 14300 09017",
    hint: "The 27-digit QR reference with a QR-IBAN, or an RF creditor reference (optional) with an IBAN. Check digits are checked.",
    mono: true,
  },
  {
    name: "message",
    label: "Message",
    placeholder: "Invoice 2026-114",
    hint: "Shown to the payer. Up to 140 characters, with the billing information.",
  },
  {
    name: "billingInfo",
    label: "Billing information",
    placeholder: "//S1/10/10201409/11/200630",
    hint: "Optional, for accounting software: structured details that start with // and a syntax code.",
    mono: true,
  },
  {
    name: "payableBy",
    label: "Name who pays",
    kind: "switch",
    initial: false,
  },
  {
    name: "debtorName",
    label: "Payer's name",
    required: true,
    placeholder: "Name of the person or company paying",
    when: payer,
  },
  {
    name: "debtorStreet",
    label: "Payer's street",
    when: payer,
  },
  {
    name: "debtorBuildingNumber",
    label: "Payer's building number",
    when: payer,
  },
  {
    name: "debtorPostalCode",
    label: "Payer's postcode",
    required: true,
    inputMode: "numeric",
    when: payer,
  },
  {
    name: "debtorTown",
    label: "Payer's town",
    required: true,
    when: payer,
  },
  {
    name: "debtorCountry",
    label: "Payer's country",
    required: true,
    initial: "CH",
    placeholder: "CH",
    mono: true,
    when: payer,
  },
];

/**
 * The QR-bill style (lib/qr-design/swiss-qr-bill-style.ts): error correction
 * M, the Swiss cross at 7/46 of the symbol, black on white and a clear
 * border. Set when the form opens, the cross kept in step with the
 * payload's size, and offered back when the design drops any of it. Dot and
 * eye shapes stay the design's: the guidelines don't fix them.
 */
function SwissQrDesign() {
  const t = useTranslations("editor.contentForms.swissQrBill");
  const format = useFormatter();
  const value = useQREditorStore((state) => state.value);
  const styles = useQREditorStore((state) => state.themeState.styles);
  const changed = swissQrStyleIssues(styles, value);
  const compliant = changed.length === 0;
  const hasCross =
    styles.showLogo === true && styles.customLogo === SWISS_CROSS_LOGO;
  const share = swissCrossShare(value, styles.margin ?? 0);

  const apply = React.useCallback(() => {
    const {
      themeState,
      setThemeState,
      value: payload,
    } = useQREditorStore.getState();
    setThemeState({
      ...themeState,
      styles: withSwissQrStyle(themeState.styles, payload),
    });
  }, []);

  // Once, when the type is picked: QR-bills always carry the style.
  const opened = React.useRef(false);
  React.useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (!compliant) apply();
  }, [compliant, apply]);

  // A longer bill can need a bigger symbol: the cross follows.
  React.useEffect(() => {
    if (!hasCross || styles.logoOptions?.size === share) return;
    const { themeState, setThemeState } = useQREditorStore.getState();
    setThemeState({
      ...themeState,
      styles: {
        ...themeState.styles,
        logoOptions: { ...themeState.styles.logoOptions, size: share },
      },
    });
  }, [hasCross, share, styles.logoOptions?.size]);

  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-[11px] leading-relaxed text-pretty">
        {compliant
          ? t("designApplied")
          : t("designChanged", {
              parts: format.list(
                changed.map((part) => t(`styleParts.${part}`)),
                { type: "disjunction" },
              ),
            })}
      </p>
      {!compliant && (
        <Button
          className="h-7 w-fit px-2.5 text-xs"
          onClick={apply}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("putBack")}
        </Button>
      )}
    </div>
  );
}

export function SwissQrBillForm() {
  const t = useTranslations("editor.contentForms.swissQrBill");
  return (
    <SchemaForm
      fields={SWISS_QR_BILL_FIELDS}
      note={t("note")}
      schema={swissQrBillSchema}
      type="swiss-qr-bill"
    >
      <SwissQrDesign />
    </SchemaForm>
  );
}

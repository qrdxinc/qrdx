"use client";
import { useTranslations } from "next-intl";

// Forms for QR Platba (Czechia), Swish (Sweden) and KHQR (Cambodia). What
// people type here stays in this browser.

import {
  czechSpdSchema,
  khqrSchema,
  swishSchema,
} from "@/lib/validations/qr-content";
import { type FormField, SchemaForm } from "./schema-form";

const hasAmount = (values: Record<string, string | boolean>) =>
  typeof values.amount === "string" && values.amount.trim() !== "";

const hasMessage = (values: Record<string, string | boolean>) =>
  typeof values.message === "string" && values.message.trim() !== "";

const CZECH_SPD_FIELDS: FormField[] = [
  {
    name: "account",
    label: "Account",
    required: true,
    placeholder: "19-2000145399/0800 or CZ65 0800 0000 1920 0014 5399",
    hint: "Your account number or IBAN. Check digits are checked.",
    mono: true,
  },
  {
    name: "amount",
    label: "Amount (Kč)",
    placeholder: "Leave empty to let the payer choose",
    inputMode: "decimal",
  },
  {
    name: "variableSymbol",
    label: "Variable symbol",
    placeholder: "Up to 10 digits",
    inputMode: "numeric",
    mono: true,
  },
  {
    name: "message",
    label: "Message",
    placeholder: "Platba za fakturu 2026114",
    hint: "Up to 60 characters. Written in capitals without diacritics, as banks read best.",
  },
  {
    name: "name",
    label: "Recipient name",
    placeholder: "Shown in some banking apps",
  },
  {
    name: "dueDate",
    label: "Due date",
    kind: "date",
  },
  {
    name: "specificSymbol",
    label: "Specific symbol",
    placeholder: "Optional",
    inputMode: "numeric",
    mono: true,
  },
  {
    name: "constantSymbol",
    label: "Constant symbol",
    placeholder: "Optional",
    inputMode: "numeric",
    mono: true,
  },
  {
    name: "bic",
    label: "BIC",
    placeholder: "Optional",
    mono: true,
  },
  {
    name: "instant",
    label: "Ask for an instant payment",
    kind: "switch",
    initial: false,
    hint: "Banks that offer instant payments send it at once.",
  },
];

export function CzechSpdForm() {
  const t = useTranslations("editor.contentForms.paymentStandards");
  return (
    <SchemaForm
      fields={CZECH_SPD_FIELDS}
      note={t("czechSpdNote")}
      schema={czechSpdSchema}
      type="czech-spd"
    />
  );
}

const SWISH_FIELDS: FormField[] = [
  {
    name: "payee",
    label: "Swish number",
    required: true,
    placeholder: "070 123 45 67 or 123 456 78 90",
    hint: "Your mobile number, or your business's 123 number.",
    inputMode: "tel",
    mono: true,
  },
  {
    name: "amount",
    label: "Amount (kr)",
    placeholder: "Leave empty to let the payer choose",
    inputMode: "decimal",
  },
  {
    name: "amountEditable",
    label: "Payer can change the amount",
    kind: "switch",
    initial: false,
    when: hasAmount,
  },
  {
    name: "message",
    label: "Message",
    placeholder: "Fika for two",
    hint: "Up to 50 characters.",
  },
  {
    name: "messageEditable",
    label: "Payer can change the message",
    kind: "switch",
    initial: false,
    when: hasMessage,
  },
];

export function SwishForm() {
  const t = useTranslations("editor.contentForms.paymentStandards");
  return (
    <SchemaForm
      fields={SWISH_FIELDS}
      note={t("swishNote")}
      schema={swishSchema}
      type="swish"
    />
  );
}

const KHQR_FIELDS: FormField[] = [
  {
    name: "bakongId",
    label: "Bakong account ID",
    required: true,
    placeholder: "yourname@bank",
    hint: "Copy it from your banking app or the Bakong app: QRdx can't look it up.",
    mono: true,
  },
  {
    name: "name",
    label: "Name",
    required: true,
    placeholder: "Name on the account",
    hint: "Up to 25 characters.",
  },
  {
    name: "city",
    label: "City",
    placeholder: "Phnom Penh",
  },
  {
    name: "currency",
    label: "Currency",
    kind: "select",
    initial: "KHR",
    options: [
      { value: "KHR", label: "Riel (KHR)" },
      { value: "USD", label: "US dollars (USD)" },
    ],
  },
  {
    name: "amount",
    label: "Amount",
    placeholder: "Leave empty for a code that never expires",
    inputMode: "decimal",
  },
  {
    name: "expiry",
    label: "Expires",
    kind: "date",
    required: true,
    hint: "Bakong needs an expiry on codes with an amount. The code stops working after this day.",
    when: hasAmount,
  },
  {
    name: "billNumber",
    label: "Bill number",
    placeholder: "Optional",
  },
];

export function KhqrForm() {
  const t = useTranslations("editor.contentForms.paymentStandards");
  return (
    <SchemaForm
      fields={KHQR_FIELDS}
      note={t("khqrNote")}
      schema={khqrSchema}
      type="khqr"
    />
  );
}

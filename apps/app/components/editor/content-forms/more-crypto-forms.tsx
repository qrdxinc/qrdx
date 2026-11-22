"use client";
import { useTranslations } from "next-intl";

// Payment requests for Lightning, XRP, Cardano, Tron, TON and Stellar
// (utils/crypto-payments.ts), each in its own documented format.

import {
  cardanoSchema,
  lightningSchema,
  stellarSchema,
  tonSchema,
  tronSchema,
  xrpSchema,
} from "@/lib/validations/qr-content";
import { type FormField, SchemaForm } from "./schema-form";

const LIGHTNING_FIELDS: FormField[] = [
  {
    name: "request",
    label: "Invoice, LNURL or Lightning Address",
    required: true,
    kind: "textarea",
    placeholder: "lnbc…, lnurl1… or you@yourwallet.com",
    hint: "Invoices expire and work once. For a printed code, use an LNURL or a Lightning Address.",
    mono: true,
  },
];

export function LightningForm() {
  const t = useTranslations("editor.contentForms.moreCrypto");
  return (
    <SchemaForm
      fields={LIGHTNING_FIELDS}
      note={t("lightningNote")}
      schema={lightningSchema}
      type="lightning"
    />
  );
}

const XRP_FIELDS: FormField[] = [
  {
    name: "address",
    label: "Wallet address",
    required: true,
    placeholder: "r…",
    mono: true,
  },
  {
    name: "destinationTag",
    label: "Destination tag",
    placeholder: "Only if your exchange or wallet gave you one",
    hint: "With a tag the code holds an X-address, which carries the tag with it.",
    inputMode: "numeric",
    mono: true,
  },
];

export function XrpForm() {
  const t = useTranslations("editor.contentForms.moreCrypto");
  return (
    <SchemaForm
      fields={XRP_FIELDS}
      note={t("xrpNote")}
      schema={xrpSchema}
      type="xrp"
    />
  );
}

const CARDANO_FIELDS: FormField[] = [
  {
    name: "address",
    label: "Wallet address",
    required: true,
    placeholder: "addr1…",
    mono: true,
  },
  {
    name: "amount",
    label: "Amount (ADA)",
    placeholder: "Leave empty to let the payer choose",
    inputMode: "decimal",
  },
];

export function CardanoForm() {
  const t = useTranslations("editor.contentForms.moreCrypto");
  return (
    <SchemaForm
      fields={CARDANO_FIELDS}
      note={t("cardanoNote")}
      schema={cardanoSchema}
      type="cardano"
    />
  );
}

const TRON_FIELDS: FormField[] = [
  {
    name: "address",
    label: "Wallet address",
    required: true,
    placeholder: "T…",
    mono: true,
  },
];

export function TronForm() {
  const t = useTranslations("editor.contentForms.moreCrypto");
  return (
    <SchemaForm
      fields={TRON_FIELDS}
      note={t("tronNote")}
      schema={tronSchema}
      type="tron"
    />
  );
}

const TON_FIELDS: FormField[] = [
  {
    name: "address",
    label: "Wallet address",
    required: true,
    placeholder: "UQ…",
    mono: true,
  },
  {
    name: "token",
    label: "Coin",
    kind: "select",
    initial: "TON",
    options: [
      { value: "TON", label: "TON" },
      { value: "USDT", label: "USDT (Tether on TON)" },
    ],
  },
  {
    name: "amount",
    label: "Amount",
    placeholder: "Leave empty to let the payer choose",
    inputMode: "decimal",
  },
  {
    name: "message",
    label: "Comment",
    placeholder: "What the payment is for",
  },
];

export function TonForm() {
  const t = useTranslations("editor.contentForms.moreCrypto");
  return (
    <SchemaForm
      fields={TON_FIELDS}
      note={t("tonNote")}
      schema={tonSchema}
      type="ton"
    />
  );
}

const STELLAR_FIELDS: FormField[] = [
  {
    name: "address",
    label: "Wallet address",
    required: true,
    placeholder: "G…",
    mono: true,
  },
  {
    name: "token",
    label: "Asset",
    kind: "select",
    initial: "XLM",
    options: [
      { value: "XLM", label: "XLM" },
      { value: "USDC", label: "USDC (Circle)" },
    ],
  },
  {
    name: "amount",
    label: "Amount",
    placeholder: "Leave empty to let the payer choose",
    inputMode: "decimal",
  },
  {
    name: "memo",
    label: "Memo",
    placeholder: "Up to 28 characters",
    hint: "Exchanges often ask for one. Check yours before you print.",
  },
];

export function StellarForm() {
  const t = useTranslations("editor.contentForms.moreCrypto");
  return (
    <SchemaForm
      fields={STELLAR_FIELDS}
      note={t("stellarNote")}
      schema={stellarSchema}
      type="stellar"
    />
  );
}

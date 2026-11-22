"use client";
import { useTranslations } from "next-intl";

// A MeCard contact (MECARD:): the same details as a vCard in fewer
// characters, so the code has fewer, larger modules.

import { mecardSchema } from "@/lib/validations/qr-content";
import { type FormField, SchemaForm } from "./schema-form";

const MECARD_FIELDS: FormField[] = [
  {
    name: "firstName",
    label: "First name",
    required: true,
    placeholder: "Alex",
    autoComplete: "given-name",
  },
  {
    name: "lastName",
    label: "Last name",
    placeholder: "Morgan",
    autoComplete: "family-name",
  },
  {
    name: "reading",
    label: "Name reading",
    placeholder: "Optional",
    hint: "How the name is pronounced, like kana for a Japanese name. Phones that support it sort contacts by it.",
  },
  {
    name: "nickname",
    label: "Nickname",
    placeholder: "Optional",
  },
  {
    name: "phone",
    label: "Phone",
    placeholder: "+1 202 555 0142",
    inputMode: "tel",
    autoComplete: "tel",
  },
  {
    name: "email",
    label: "Email",
    placeholder: "alex@example.com",
    inputMode: "email",
    autoComplete: "email",
  },
  {
    name: "url",
    label: "Website",
    placeholder: "https://example.com",
    inputMode: "url",
  },
  {
    name: "birthday",
    label: "Birthday",
    kind: "date",
  },
  {
    name: "address",
    label: "Address",
    placeholder: "1 Main St, Springfield",
  },
  {
    name: "note",
    label: "Note",
    kind: "textarea",
    placeholder: "Met at the spring fair",
  },
];

export function MeCardForm() {
  const t = useTranslations("editor.contentForms.contactForms");
  return (
    <SchemaForm
      fields={MECARD_FIELDS}
      note={t("meCardNote")}
      schema={mecardSchema}
      type="mecard"
    />
  );
}

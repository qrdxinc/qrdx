"use client";

// The forms of the link and app types added on 2026-11-22: each one is
// SchemaForm with the type's fields (./link-type-fields.ts) and its schema.

import type { ComponentType } from "react";
import { LINK_TYPE_SCHEMAS } from "@/lib/validations/qr-content";
import { LINK_TYPE_IDS, type LinkType } from "@/utils/link-types";
import { LINK_TYPE_FORMS } from "./link-type-fields";
import { SchemaForm } from "./schema-form";

function linkTypeForm(type: LinkType): ComponentType {
  const { fields, modes, note } = LINK_TYPE_FORMS[type];
  // biome-ignore lint/correctness/noComponentHookFactories: made once per type when the module loads, never during a render
  function LinkTypeForm() {
    return (
      <SchemaForm
        fields={fields}
        modes={modes}
        note={note}
        schema={LINK_TYPE_SCHEMAS[type]}
        type={type}
      />
    );
  }
  LinkTypeForm.displayName = `LinkTypeForm(${type})`;
  return LinkTypeForm;
}

/** Each link and app type's form, for the editor's FORMS. */
export const LINK_TYPE_FORM_COMPONENTS = Object.fromEntries(
  LINK_TYPE_IDS.map((type) => [type, linkTypeForm(type)]),
) as Record<LinkType, ComponentType>;

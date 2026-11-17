"use client";

import { CustomCssField } from "@/ee/white-label/editor";
import type { BlockEditorProps } from "@/lib/landing/registry";
import type { PageSettings } from "../page-settings-block";
import { ImageField, SwitchField, TextField } from "./fields";

export function PageSettingsEditor({
  value,
  onChange,
  customCssAllowed = false,
}: BlockEditorProps<PageSettings> & { customCssAllowed?: boolean }) {
  const set = (patch: Partial<PageSettings>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <TextField
        hint="Shown when the link is shared in chats and social apps."
        label="Description"
        maxLength={300}
        multiline
        onChange={(description) => set({ description })}
        value={value.description}
      />
      <ImageField
        hint="1200×630 works best. Defaults to the header photo."
        label="Share image"
        onChange={(shareImage) => set({ shareImage })}
        value={value.shareImage}
      />
      <SwitchField
        checked={value.indexable}
        hint="Off by default: hosted pages are hidden from Google and other search engines."
        label="Show in search engines"
        onChange={(indexable) => set({ indexable })}
      />

      <CustomCssField
        allowed={customCssAllowed}
        onChange={(customCss) => set({ customCss })}
        value={value.customCss}
      />
    </div>
  );
}

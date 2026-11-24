"use client";

import { moveQrCodes } from "@/actions/bulk-codes";
import {
  createQrCode,
  getQrCode,
  listQrCodes,
  updateQrCode,
} from "@/actions/qr-codes";
import { setQrCodeTags } from "@/actions/tags";
import type {
  QrCodeListItem,
  QrCodeView,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import type { BuilderServices } from "./submit";

/**
 * The builder's writes: the dashboard's existing server actions, answering
 * in `locale`, the language of the page the builder is on (its useLocale()).
 */
export const builderServices = (locale: string): BuilderServices => ({
  createCode: (input) => createQrCode(input, undefined, locale),
  updateCode: (input) => updateQrCode(input, locale),
  moveCodes: (input) => moveQrCodes(input, locale),
  setTags: (input) => setQrCodeTags(input, locale),
});

/** The same over the playground: new codes are recorded as made there. */
export const playgroundBuilderServices = (locale: string): BuilderServices => ({
  ...builderServices(locale),
  createCode: (input) => createQrCode(input, { via: "playground" }, locale),
});

export interface LoadedCode {
  code: QrCodeView;
  /** Its folder and tags; null when they couldn't be looked up */
  organization: { folderId: string | null; tagIds: string[] } | null;
}

const isListItem = (code: QrCodeView): code is QrCodeListItem =>
  Array.isArray((code as Partial<QrCodeListItem>).tags);

/**
 * A code to edit, with its folder and tags. A codes list row already has
 * them; otherwise the list action finds the row by its slug (an exact
 * match there), read-only. Messages come in `locale` (the page's).
 */
export async function loadCodeForEdit(
  codeId: string,
  hint: QrCodeView | undefined,
  locale: string,
): Promise<{ ok: true; loaded: LoadedCode } | { ok: false; message: string }> {
  if (hint && isListItem(hint)) {
    return {
      ok: true,
      loaded: {
        code: hint,
        organization: {
          folderId: hint.folderId,
          tagIds: hint.tags.map((tag) => tag.id),
        },
      },
    };
  }
  let code = hint;
  try {
    if (!code) {
      const result = await getQrCode(codeId, locale);
      if (!result.success) return { ok: false, message: result.error.message };
      code = result.data;
    }
    const list = await listQrCodes({ status: "all", q: code.slug }, locale);
    // The list's rows carry folder and tags (QrCodeListItem) at runtime;
    // checked, not assumed.
    const row = list.success
      ? list.data.codes.find((item) => item.id === codeId)
      : undefined;
    return {
      ok: true,
      loaded: {
        code,
        organization:
          row && isListItem(row)
            ? {
                folderId: row.folderId ?? null,
                tagIds: row.tags.map((tag) => tag.id),
              }
            : null,
      },
    };
  } catch {
    if (code) return { ok: true, loaded: { code, organization: null } };
    return {
      ok: false,
      message: "Couldn't load this code. Check your connection and try again.",
    };
  }
}

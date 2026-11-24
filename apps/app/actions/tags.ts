"use server";

import { z } from "zod";
import {
  createTag,
  deleteTag,
  idSchema,
  idsSchema,
  listTags,
  type OrganizeResult,
  parseInput,
  runOrganize,
  setCodeTags,
  type TagRow,
  tagCodes,
  tagColorSchema,
  tagNameSchema,
  updateTag,
} from "@/app/(app)/dashboard/codes/_lib/organize";
import { MAX_TAGS_PER_CODE } from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import { CODE_ACTION_MESSAGES, ownMessage } from "@/lib/code-actions/messages";
import { codeActionText } from "@/lib/code-actions/messages-server";
import type { ActiveScope } from "@/lib/scope";

const ENGLISH = CODE_ACTION_MESSAGES.tags;

/**
 * runOrganize (which says organize's messages in the calling page's
 * language), saying this file's own messages (its schemas') in that
 * language too (codeActionText).
 */
async function run<T>(
  action: string,
  fn: (scope: ActiveScope) => Promise<T>,
  options: Parameters<typeof runOrganize>[2] = {},
): Promise<OrganizeResult<T>> {
  const result = await runOrganize(action, fn, options);
  if (
    result.success ||
    !Object.values(ENGLISH).includes(result.error.message)
  ) {
    return result;
  }
  const text = (await codeActionText({ pageLocale: options.pageLocale })).tags;
  return {
    ...result,
    error: {
      ...result.error,
      message: ownMessage(ENGLISH, text, result.error.message),
    },
  };
}

const createSchema = z.object({
  name: tagNameSchema,
  color: tagColorSchema.default("gray"),
});

const updateSchema = z
  .object({
    id: idSchema,
    name: tagNameSchema.optional(),
    color: tagColorSchema.optional(),
  })
  .refine((input) => input.name !== undefined || input.color !== undefined, {
    message: ENGLISH.nothingToUpdate,
  });

const idOnlySchema = z.object({ id: idSchema });

const tagIdsSchema = z.array(idSchema).max(MAX_TAGS_PER_CODE * 2);

const setSchema = z.object({
  codeId: idSchema,
  tagIds: z.array(idSchema).max(MAX_TAGS_PER_CODE, ENGLISH.tooManyTags),
});

const bulkSchema = z
  .object({
    ids: idsSchema,
    add: tagIdsSchema.default([]),
    remove: tagIdsSchema.default([]),
  })
  .refine((input) => input.add.length + input.remove.length > 0, {
    message: ENGLISH.chooseTag,
  });

export async function listCodeTags(): Promise<OrganizeResult<TagRow[]>> {
  return run("listCodeTags", listTags, {
    revalidate: false,
    access: "read",
  });
}

/**
 * `pageLocale`: the calling page's useLocale() (the code builder's, which
 * opens over /[lang]/playground too), the language its messages are in.
 */
export async function createCodeTag(
  input: z.input<typeof createSchema>,
  pageLocale?: string,
): Promise<OrganizeResult<TagRow>> {
  return run(
    "createCodeTag",
    (scope) => createTag(scope, parseInput(createSchema, input)),
    { pageLocale },
  );
}

export async function updateCodeTag(
  input: z.input<typeof updateSchema>,
): Promise<OrganizeResult<void>> {
  return run("updateCodeTag", (scope) =>
    updateTag(scope, parseInput(updateSchema, input)),
  );
}

export async function deleteCodeTag(
  input: z.input<typeof idOnlySchema>,
): Promise<OrganizeResult<void>> {
  return run("deleteCodeTag", (scope) =>
    deleteTag(scope, parseInput(idOnlySchema, input).id),
  );
}

/**
 * Replaces the tags of one code. `pageLocale`: the calling page's
 * useLocale(), the language its own messages are in.
 */
export async function setQrCodeTags(
  input: z.input<typeof setSchema>,
  pageLocale?: string,
): Promise<OrganizeResult<void>> {
  return run(
    "setQrCodeTags",
    (scope) => {
      const { codeId, tagIds } = parseInput(setSchema, input);
      return setCodeTags(scope, codeId, tagIds);
    },
    { pageLocale },
  );
}

/** Adds and/or removes tags on several codes. */
export async function tagQrCodes(
  input: z.input<typeof bulkSchema>,
): Promise<OrganizeResult<{ updated: number }>> {
  return run("tagQrCodes", (scope) => {
    const { ids, add, remove } = parseInput(bulkSchema, input);
    return tagCodes(scope, ids, { add, remove });
  });
}

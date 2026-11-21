#!/usr/bin/env node
// Seed: QRdx's official community items, published by the official @qrdx
// profile (the team@qrdx.dev account, workspace "qrdx"), verified:
// - the official frames of the qrdx engine (packages/qrdx/src/frames/
//   official/*.json, listed in ./community-seed.json in catalogue order),
//   with the engine's ids as their slugs, so /community/frames/<id> keeps
//   the same URL it had before the seed;
// - the 10 new themes and 18 collections in ./community-seed.json (8 of
//   them group the frames and hand-made themes, 10 group the designs);
// - 41 of the app's built-in themes (apps/app/utils/qr-presets.ts), as
//   ./community-seed-presets.json stores them: written from the presets by
//   apps/app/scripts/community-seed/generate.ts, each payload what a
//   publish of that theme stores;
// - the official designs made for the gallery (apps/app/scripts/
//   community-seed/designs), as ./community-seed-designs.json stores them
//   (written by the same generate.ts): each payload what a publish stores,
//   with its official frame, if it has one, put in from the engine here;
// - QRdx's own page templates (apps/app/lib/landing/templates), each run
//   through the publish scrub (sample text, no photos, no real data), and
//   8 official kits pairing one with a seeded theme and/or frame, as
//   ./community-seed-pages.json stores them (apps/app/scripts/
//   community-seed/page-templates.ts);
// - the official account's themes already in the gallery (copied by
//   backfill-community.mjs) are moved to @qrdx and marked official.
//
//   node --env-file=apps/app/.env.local packages/database/scripts/seed-community.mjs
//       dry run (the default): prints every planned insert and update,
//       rolls back. Writes nothing.
//   ... seed-community.mjs --apply --backup ./community-seed-backup.json
//       writes the backup, applies the plan in one transaction, checks the
//       counts and commits (or rolls back and exits 1). The backup file is
//       written before the apply and never overwritten, so it stays after
//       a rollback too: a rerun needs a new --backup path.
//   --official-email <email> names another account as the official one (its
//       themes move to @qrdx); it is refused unless
//       --allow-other-official-email is passed too.
//
// Run after manual-sql/0012_community.sql and backfill-community.mjs. Safe
// to run more than once: ids are fixed ("ci_official_frame_wifi-card"),
// inserts use ON CONFLICT DO NOTHING, so a second run plans nothing. An item
// already seeded is never changed (published versions are immutable). Like
// a publish, an item whose design is already published (same type and
// payload hash) is skipped with a warning.
//
// Every seeded design is checked to scan Great with the publish gate's
// samples by apps/app/tests/database/seed-community.test.ts, which also
// keeps this file's rules equal to the app's.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  LICENSE,
  OFFICIAL_EMAIL,
  OFFICIAL_HANDLE,
  OFFICIAL_PROFILE_ID,
  OFFICIAL_WORKSPACE_SLUG,
  payloadHash,
} from "./backfill-community.mjs";

const here = (path) => new URL(path, import.meta.url);

export const SEED = JSON.parse(
  readFileSync(here("./community-seed.json"), "utf8")
);

/** Page templates and kits, generated from the app (see the header). */
export const PAGES_SEED = JSON.parse(
  readFileSync(here("./community-seed-pages.json"), "utf8")
);

/** Built-in themes, generated from the app's presets (see the header). */
export const PRESET_SEED = JSON.parse(
  readFileSync(here("./community-seed-presets.json"), "utf8")
);

/** The official designs, generated from the app's design files (see the header). */
export const DESIGN_SEED = JSON.parse(
  readFileSync(here("./community-seed-designs.json"), "utf8")
);

/**
 * Each seeded theme's publish-gate score by slug, written by the app's seed
 * test with the scorer a publish uses: stored as scan_score, as a publish
 * of a theme stores it. Frames go in without one (1,013 of them; the
 * Frame scan workflow gates every one), as do page templates, kits and
 * collections, which a publish doesn't gate either.
 */
export const THEME_SCORES = JSON.parse(
  readFileSync(here("./community-seed-theme-scores.json"), "utf8")
).scores;

/** The engine's official frame files, in catalogue order. */
export function loadOfficialFrames() {
  return SEED.frames.map((id) =>
    JSON.parse(
      readFileSync(here(`../../qrdx/src/frames/official/${id}.json`), "utf8")
    )
  );
}

export const seedItemId = (type, id) => `ci_official_${type}_${id}`;
const versionId = (itemId) =>
  `civ_${createHash("sha256").update(`qrdx:community-version:${itemId}:1`).digest("hex").slice(0, 24)}`;

/**
 * A seed theme's full style: its fields plus its official frame, with the
 * colors and labels the theme sets on it (`color`, `textColor`,
 * `secondaryColor`, `text`, `secondaryText`).
 */
export function resolveSeedTheme(theme, framesById) {
  const frame = framesById.get(theme.frame.official);
  if (!frame)
    throw new Error(`${theme.id}: no official frame ${theme.frame.official}`);
  const { official: _id, ...options } = theme.frame;
  return {
    ...theme.style,
    frame: { style: "custom", spec: frame.spec, ...options },
  };
}

// ─── SQL ─────────────────────────────────────────────────────────────────────

export const SQL = {
  lockTimeout: (value) => `SET LOCAL lock_timeout = '${value}'`,
  statementTimeout: (value) => `SET LOCAL statement_timeout = '${value}'`,
  advisoryLock: `SELECT pg_advisory_xact_lock(hashtext('qrdx:seed-community'))`,
  officialUser: `SELECT id FROM "user" WHERE lower(email) = $1`,
  officialWorkspace: "SELECT id FROM organization WHERE slug = $1",
  officialProfile:
    "SELECT id, user_id, workspace_id, verified_at FROM community_profile WHERE kind = 'official' OR id = $1",
  items:
    "SELECT id, type, slug, status, payload_hash, profile_id, is_official, created_by, updated_at::text AS updated_at FROM community_item",
  collectionEntries:
    "SELECT collection_id, item_id FROM community_collection_entry WHERE collection_id LIKE 'ci_official_%'",
  insertProfile:
    "INSERT INTO community_profile (id, kind, user_id, workspace_id, handle, display_name, verified_at, status, created_at, updated_at) VALUES ($1, 'official', $2, $3, $4, 'QRdx', $5, 'active', $5, $5) ON CONFLICT DO NOTHING",
  verifyProfile:
    "UPDATE community_profile SET verified_at = $2, updated_at = $2 WHERE id = $1 AND verified_at IS NULL",
  insertItem:
    "INSERT INTO community_item (id, type, slug, profile_id, created_by, name, description, status, license, current_version, payload, payload_hash, facets, is_official, featured_at, published_at, created_at, updated_at, scan_score, scan_checked_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', $8, 1, $9, $10, $11, true, $12, $13, $13, $13, $14, $15) ON CONFLICT DO NOTHING",
  insertVersion:
    "INSERT INTO community_item_version (id, item_id, version, payload, payload_hash, created_by, created_at) VALUES ($1, $2, 1, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
  insertTag:
    "INSERT INTO community_item_tag (item_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING",
  insertEntry:
    "INSERT INTO community_collection_entry (collection_id, item_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
  // Every condition planSeed adopts by, so a wrong plan moves nothing
  adoptTheme:
    "UPDATE community_item SET profile_id = $2, is_official = true, updated_at = $3 WHERE id = $1 AND type = 'theme' AND created_by = $4 AND NOT starts_with(id, 'ci_official_') AND (is_official IS NOT TRUE OR profile_id IS DISTINCT FROM $2)",
  countSeeded:
    "SELECT count(*)::int AS n FROM community_item WHERE id = ANY($1::text[]) AND is_official = true AND profile_id = $2",
  countEntries:
    "SELECT count(*)::int AS n FROM community_collection_entry WHERE collection_id = ANY($1::text[])",
  countVersions:
    "SELECT count(*)::int AS n FROM community_item_version WHERE item_id = ANY($1::text[])",
  countTags:
    "SELECT count(*)::int AS n FROM community_item_tag WHERE item_id = ANY($1::text[])",
};

// ─── Plan ────────────────────────────────────────────────────────────────────

/** Every official item the seed publishes, built from the files alone. */
export function buildSeedItems(frames = loadOfficialFrames()) {
  const framesById = new Map(frames.map((frame) => [frame.id, frame]));
  const featured = new Set(SEED.featured);
  const items = [];
  for (const frame of frames) {
    const payload = { frame: { style: "custom", spec: frame.spec } };
    items.push({
      id: seedItemId("frame", frame.id),
      ref: `frame:${frame.id}`,
      type: "frame",
      slug: frame.id,
      name: frame.name,
      description: frame.description,
      tags: frame.tags.slice(0, 5),
      payload,
      facets: { contentTypes: frame.contentTypes, category: frame.category },
      featured: featured.has(`frame:${frame.id}`),
    });
  }
  for (const theme of SEED.themes) {
    const payload = { style: resolveSeedTheme(theme, framesById) };
    items.push({
      id: seedItemId("theme", theme.id),
      ref: `theme:${theme.id}`,
      type: "theme",
      slug: theme.id,
      name: theme.name,
      description: theme.description,
      tags: theme.tags.slice(0, 5),
      payload,
      facets: { pairedFrame: theme.frame.official },
      featured: featured.has(`theme:${theme.id}`),
      scanScore: THEME_SCORES[theme.id] ?? null,
    });
  }
  // Already in the shape a publish stores: the payload is used as it is.
  for (const theme of PRESET_SEED.themes) {
    items.push({
      id: seedItemId("theme", theme.id),
      ref: `theme:${theme.id}`,
      type: "theme",
      slug: theme.slug,
      name: theme.name,
      description: theme.description,
      tags: theme.tags.slice(0, 5),
      payload: theme.payload,
      facets: { preset: theme.id },
      featured: featured.has(`theme:${theme.id}`),
      scanScore: THEME_SCORES[theme.slug] ?? null,
    });
  }
  // Already in the shape a publish stores; an official frame is put in
  // from the engine, as the hand-made themes' are.
  for (const theme of DESIGN_SEED.themes) {
    const style = theme.frame
      ? resolveSeedTheme(
          { id: theme.id, style: theme.payload.style, frame: theme.frame },
          framesById
        )
      : theme.payload.style;
    items.push({
      id: seedItemId("theme", theme.id),
      ref: `theme:${theme.id}`,
      type: "theme",
      slug: theme.slug,
      name: theme.name,
      description: theme.description,
      tags: theme.tags.slice(0, 5),
      payload: { ...theme.payload, style },
      facets: theme.frame
        ? { design: theme.id, pairedFrame: theme.frame.official }
        : { design: theme.id },
      featured: featured.has(`theme:${theme.id}`),
      scanScore: THEME_SCORES[theme.slug] ?? null,
    });
  }
  // Already in the shape a publish stores, scrubbed by the app.
  for (const template of PAGES_SEED.templates) {
    items.push({
      id: seedItemId("page-template", template.id),
      ref: `page-template:${template.id}`,
      type: "page-template",
      slug: template.slug,
      name: template.name,
      description: template.description,
      tags: template.tags.slice(0, 5),
      payload: template.payload,
      facets: { pageType: template.payload.page.type },
      featured: false,
    });
  }
  const byRef = new Map(items.map((item) => [item.ref, item]));
  for (const kit of PAGES_SEED.kits) {
    const part = (ref) => {
      if (!ref) return;
      const item = byRef.get(ref);
      if (!item) throw new Error(`kit ${kit.id}: unknown item ${ref}`);
      return item.id;
    };
    const parts = {
      theme: part(kit.theme),
      frame: part(kit.frame),
      page: part(kit.page),
    };
    // As a publish orders a kit's entries: theme, frame, page.
    const entries = [parts.theme, parts.frame, parts.page].filter(Boolean);
    items.push({
      id: seedItemId("kit", kit.id),
      ref: `kit:${kit.id}`,
      type: "kit",
      slug: kit.slug,
      name: kit.name,
      description: kit.description,
      tags: [],
      payload: {
        kit: {
          ...(parts.theme ? { theme: parts.theme } : {}),
          ...(parts.frame ? { frame: parts.frame } : {}),
          page: parts.page,
        },
      },
      facets: null,
      featured: false,
      entries,
    });
  }
  for (const collection of SEED.collections) {
    const entries = collection.items.map((ref) => {
      const item = byRef.get(ref);
      if (!item) throw new Error(`${collection.id}: unknown item ${ref}`);
      return item.id;
    });
    items.push({
      id: seedItemId("collection", collection.id),
      ref: `collection:${collection.id}`,
      type: "collection",
      slug: collection.id,
      name: collection.name,
      description: collection.description,
      tags: [],
      payload: { items: entries },
      facets: null,
      featured: false,
      entries,
    });
  }
  return items;
}

export async function loadSnapshot(client, options) {
  const read = async (text, params) => (await client.query(text, params)).rows;
  const [user] = await read(SQL.officialUser, [
    options.officialEmail.toLowerCase(),
  ]);
  const [workspace] = await read(SQL.officialWorkspace, [
    options.officialWorkspace,
  ]);
  const profiles = await read(SQL.officialProfile, [OFFICIAL_PROFILE_ID]);
  const items = await read(SQL.items);
  const entries = await read(SQL.collectionEntries);
  return {
    officialEmail: options.officialEmail.toLowerCase(),
    officialUserId: user?.id ?? null,
    officialWorkspaceId: workspace?.id ?? null,
    officialProfile: profiles[0] ?? null,
    items,
    entries,
  };
}

/**
 * The fewest items a collection holds: a publish refuses fewer
 * (apps/app/lib/community/bundles.ts COLLECTION_MIN_ITEMS; the seed test
 * keeps the two equal).
 */
export const COLLECTION_MIN_ITEMS = 2;

/**
 * A collection or kit with only the items in `present` (in the database
 * after this run), with a warning for each one left out; null when too few
 * are left (a collection needs COLLECTION_MIN_ITEMS items, a kit its page
 * template and a theme or frame, as a publish does). Its payload and
 * entries both leave the missing items out, so it never points at a row
 * that isn't there.
 */
function withPresentItems(item, present, reason, warnings) {
  const missing = item.entries.filter((id) => !present.has(id));
  if (missing.length === 0) return item;
  const entries = item.entries.filter((id) => present.has(id));
  const named = missing.map((id) => `${id} (${reason(id)})`).join(", ");
  if (item.type === "kit") {
    const { theme, frame, page } = item.payload.kit;
    const kit = {
      ...(theme && present.has(theme) ? { theme } : {}),
      ...(frame && present.has(frame) ? { frame } : {}),
      ...(present.has(page) ? { page } : {}),
    };
    if (!(kit.page && (kit.theme || kit.frame))) {
      warnings.push(
        `kit ${item.slug}: not seeded: ${named}; a kit needs its page template and a theme or frame, so it is skipped.`
      );
      return null;
    }
    warnings.push(
      `kit ${item.slug}: not seeded: ${named}; the kit goes in without it (payload and entries).`
    );
    return { ...item, payload: { kit }, entries };
  }
  if (entries.length < COLLECTION_MIN_ITEMS) {
    warnings.push(
      `collection ${item.slug}: not seeded: ${named}; ${entries.length === 0 ? "none" : `only ${entries.length}`} of its items would be in, and a collection holds ${COLLECTION_MIN_ITEMS} or more, so it is skipped.`
    );
    return null;
  }
  warnings.push(
    `collection ${item.slug}: not seeded: ${named}; left out of its payload and entries, and a later run adds the entry once the item is in.`
  );
  return {
    ...item,
    payload: { items: entries },
    entries,
    allEntries: item.entries,
  };
}

export function planSeed(snapshot, seedItems, now = new Date()) {
  const warnings = [];
  if (!snapshot.officialUserId) {
    throw new Error(
      "The official account isn't in the database: sign in once as it, or pass --official-email with --allow-other-official-email."
    );
  }
  if (!snapshot.officialWorkspaceId) {
    warnings.push(
      "The official workspace wasn't found: @qrdx gets no workspace."
    );
  }
  const profileId = snapshot.officialProfile?.id ?? OFFICIAL_PROFILE_ID;
  const profile = snapshot.officialProfile
    ? null
    : {
        id: OFFICIAL_PROFILE_ID,
        userId: snapshot.officialUserId,
        workspaceId: snapshot.officialWorkspaceId,
        handle: OFFICIAL_HANDLE,
        verifiedAt: now,
      };
  const verify =
    snapshot.officialProfile && !snapshot.officialProfile.verified_at
      ? snapshot.officialProfile.id
      : null;

  const existingIds = new Set(snapshot.items.map((item) => item.id));
  const takenSlugs = new Set(
    snapshot.items.map((item) => `${item.type}:${item.slug}`)
  );
  // Designs already published, as a publish refuses them (ALREADY_PUBLISHED)
  const published = new Map(
    snapshot.items
      .filter((item) => item.status === "published" && item.payload_hash)
      .map((item) => [`${item.type}:${item.payload_hash}`, item.slug])
  );
  const inserts = [];
  // Why a seed item isn't going in, by id (for the collections and kits
  // that list it)
  const skipped = new Map();
  const reason = (id) => skipped.get(id) ?? "it isn't in this seed";
  // Items in the database after this run: a collection or kit lists only
  // these (its items come before it in seed order)
  const present = new Set(existingIds);
  for (const seedItem of seedItems) {
    if (existingIds.has(seedItem.id)) continue;
    if (takenSlugs.has(`${seedItem.type}:${seedItem.slug}`)) {
      skipped.set(
        seedItem.id,
        `its ${seedItem.type} slug "${seedItem.slug}" is taken`
      );
      warnings.push(
        `${seedItem.type} slug "${seedItem.slug}" is taken by another item: ${seedItem.id} is skipped.`
      );
      continue;
    }
    const item = seedItem.entries
      ? withPresentItems(seedItem, present, reason, warnings)
      : seedItem;
    if (!item) {
      skipped.set(seedItem.id, "too few of its items are seeded");
      continue;
    }
    const design = `${item.type}:${payloadHash(item.payload)}`;
    if (published.has(design)) {
      skipped.set(
        item.id,
        `its design is already published as "${published.get(design)}"`
      );
      warnings.push(
        `${item.type} ${item.slug} is already published as "${published.get(design)}": ${item.id} is skipped.`
      );
      continue;
    }
    published.set(design, item.slug);
    inserts.push(item);
    present.add(item.id);
  }
  // Entries an earlier run left out of a seeded collection, whose items are
  // in now (the gallery shows a collection's entries). A kit is used by its
  // payload's parts, so a part it went in without stays out.
  const seededEntries = new Set(
    snapshot.entries.map((row) => `${row.collection_id}:${row.item_id}`)
  );
  const entriesBefore = new Map();
  for (const row of snapshot.entries) {
    entriesBefore.set(
      row.collection_id,
      (entriesBefore.get(row.collection_id) ?? 0) + 1
    );
  }
  const entryInserts = [];
  for (const item of seedItems) {
    if (!(item.type === "collection" && existingIds.has(item.id))) continue;
    for (const [position, entry] of item.entries.entries()) {
      if (seededEntries.has(`${item.id}:${entry}`) || !present.has(entry)) {
        continue;
      }
      entryInserts.push({ collectionId: item.id, itemId: entry, position });
    }
  }

  // The official account's own themes, moved to @qrdx (SQL.adoptTheme
  // repeats each condition)
  const adopted = snapshot.items.filter(
    (item) =>
      item.type === "theme" &&
      item.created_by === snapshot.officialUserId &&
      !item.id.startsWith("ci_official_") &&
      (item.is_official !== true || item.profile_id !== profileId)
  );
  const adopt = adopted.map((item) => item.id);

  return {
    profile,
    verify,
    profileId,
    officialUserId: snapshot.officialUserId,
    officialEmail: snapshot.officialEmail ?? null,
    adoptedSlugs: new Map(adopted.map((item) => [item.id, item.slug])),
    inserts,
    entryInserts,
    entriesBefore,
    adopt,
    warnings,
    now,
  };
}

export const isEmptySeed = (plan) =>
  !(plan.profile || plan.verify) &&
  plan.inserts.length === 0 &&
  plan.entryInserts.length === 0 &&
  plan.adopt.length === 0;

export function describeSeed(plan) {
  const lines = [];
  if (plan.profile) {
    lines.push(
      `INSERT community_profile id=${plan.profile.id} kind=official handle=@${plan.profile.handle} user=${plan.profile.userId} workspace=${plan.profile.workspaceId ?? "-"} verified`
    );
  }
  if (plan.verify)
    lines.push(`UPDATE community_profile id=${plan.verify} SET verified`);
  for (const item of plan.inserts) {
    lines.push(
      `INSERT community_item ${item.type} slug=${item.slug} id=${item.id}${item.featured ? " featured" : ""}${item.entries ? ` (${item.entries.length} items)` : ""}`
    );
  }
  for (const entry of plan.entryInserts) {
    lines.push(
      `INSERT community_collection_entry collection=${entry.collectionId} item=${entry.itemId} position=${entry.position}`
    );
  }
  if (plan.adopt.length > 0) {
    lines.push(
      `Adopting ${plan.adopt.length} theme(s) created by ${plan.officialEmail ?? "the official account"} (user ${plan.officialUserId}): they move to @qrdx, marked official`
    );
  }
  for (const id of plan.adopt) {
    lines.push(
      `UPDATE community_item theme slug=${plan.adoptedSlugs?.get(id) ?? "-"} id=${id} SET profile=@qrdx, official`
    );
  }
  return lines;
}

export function backupOf(snapshot, plan) {
  const adopting = new Set(plan.adopt);
  return {
    kind: "qrdx-seed-community-backup",
    createdAt: new Date().toISOString(),
    note: "Inserted rows are listed by id: delete them to undo (an item's versions, tags and entries go with it). Entries added to collections seeded before are listed by collection and item: delete those rows too. Updated rows are as they were before --apply, updated_at as the database held it (UTC).",
    insertedProfile: plan.profile?.id ?? null,
    insertedItems: plan.inserts.map((item) => item.id),
    insertedEntries: plan.entryInserts.map((entry) => ({
      collection_id: entry.collectionId,
      item_id: entry.itemId,
      position: entry.position,
    })),
    updatedItems: snapshot.items.filter((item) => adopting.has(item.id)),
    verifiedProfile: plan.verify,
  };
}

/**
 * A time as a timestamp parameter: UTC text, the way the app writes these
 * columns. They are timestamp without time zone, and the driver sends a
 * Date as local time with an offset that such a column drops, so a Date
 * from a machine east of UTC lands hours in the future (apps/app/lib/
 * keyset-sql.ts has the same note).
 */
const utc = (date) => date.toISOString();

export async function applySeed(client, plan, userId) {
  const now = utc(plan.now);
  if (plan.profile) {
    await client.query(SQL.insertProfile, [
      plan.profile.id,
      plan.profile.userId,
      plan.profile.workspaceId,
      plan.profile.handle,
      now,
    ]);
  }
  if (plan.verify) await client.query(SQL.verifyProfile, [plan.verify, now]);
  // Items first (collections and kits reference them), in seed order.
  const ordered = [
    ...plan.inserts.filter((item) => !item.entries),
    ...plan.inserts.filter((item) => item.entries),
  ];
  for (const [index, item] of ordered.entries()) {
    const hash = payloadHash(item.payload);
    // A millisecond apart in seed order, so "newest" has a stable order
    const published = utc(new Date(plan.now.getTime() + index));
    await client.query(SQL.insertItem, [
      item.id,
      item.type,
      item.slug,
      plan.profileId,
      userId,
      item.name,
      item.description,
      LICENSE,
      JSON.stringify(item.payload),
      hash,
      item.facets ? JSON.stringify(item.facets) : null,
      item.featured ? published : null,
      published,
      item.scanScore ?? null,
      item.scanScore === undefined || item.scanScore === null
        ? null
        : published,
    ]);
    await client.query(SQL.insertVersion, [
      versionId(item.id),
      item.id,
      JSON.stringify(item.payload),
      hash,
      userId,
      published,
    ]);
    for (const tag of item.tags) {
      await client.query(SQL.insertTag, [item.id, tag]);
    }
    // A collection's entries at their places in its full list, so one left
    // out (above) goes back where it belongs when a later run adds it; a
    // kit's from 0, as a publish stores them (its parts never change)
    for (const entry of item.entries ?? []) {
      const position = (item.allEntries ?? item.entries).indexOf(entry);
      await client.query(SQL.insertEntry, [item.id, entry, position]);
    }
  }
  for (const entry of plan.entryInserts) {
    await client.query(SQL.insertEntry, [
      entry.collectionId,
      entry.itemId,
      entry.position,
    ]);
  }
  for (const id of plan.adopt) {
    await client.query(SQL.adoptTheme, [id, plan.profileId, now, userId]);
  }
}

export async function verifySeed(client, plan) {
  const problems = [];
  const count = async (text, params) =>
    (await client.query(text, params)).rows[0]?.n ?? 0;
  const ids = [...plan.inserts.map((item) => item.id), ...plan.adopt];
  const seeded = await count(SQL.countSeeded, [ids, plan.profileId]);
  if (seeded !== ids.length) {
    problems.push(
      `community_item: ${seeded} of ${ids.length} official item(s) in place`
    );
  }
  const collections = plan.inserts.filter((item) => item.entries);
  const expected = collections.reduce(
    (sum, item) => sum + item.entries.length,
    0
  );
  const entries = await count(SQL.countEntries, [
    collections.map((item) => item.id),
  ]);
  if (entries !== expected) {
    problems.push(`community_collection_entry: ${entries} of ${expected}`);
  }
  const insertedIds = plan.inserts.map((item) => item.id);
  const versions = await count(SQL.countVersions, [insertedIds]);
  if (versions !== insertedIds.length) {
    problems.push(
      `community_item_version: ${versions} of ${insertedIds.length}`
    );
  }
  const expectedTags = plan.inserts.reduce(
    (sum, item) => sum + item.tags.length,
    0
  );
  const tags = await count(SQL.countTags, [insertedIds]);
  if (tags !== expectedTags) {
    problems.push(`community_item_tag: ${tags} of ${expectedTags}`);
  }
  // Entries added to collections seeded by an earlier run
  const touched = [...new Set(plan.entryInserts.map((e) => e.collectionId))];
  if (touched.length > 0) {
    const expectedAdded = touched.reduce(
      (sum, id) =>
        sum +
        (plan.entriesBefore.get(id) ?? 0) +
        plan.entryInserts.filter((e) => e.collectionId === id).length,
      0
    );
    const added = await count(SQL.countEntries, [touched]);
    if (added !== expectedAdded) {
      problems.push(
        `community_collection_entry (added): ${added} of ${expectedAdded}`
      );
    }
  }
  return problems;
}

// ─── Command line ────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const options = {
    apply: false,
    backup: null,
    lockTimeout: "5s",
    statementTimeout: "60s",
    officialEmail: OFFICIAL_EMAIL,
    allowOtherOfficialEmail: false,
    officialWorkspace: OFFICIAL_WORKSPACE_SLUG,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--backup") options.backup = argv[++i] ?? null;
    else if (arg === "--lock-timeout") options.lockTimeout = argv[++i];
    else if (arg === "--statement-timeout")
      options.statementTimeout = argv[++i];
    else if (arg === "--official-email")
      options.officialEmail = argv[++i] ?? "";
    else if (arg === "--allow-other-official-email")
      options.allowOtherOfficialEmail = true;
    else if (arg === "--official-workspace")
      options.officialWorkspace = argv[++i] ?? "";
    else throw new Error(`Unknown option: ${arg}`);
  }
  const duration = /^\d+(ms|s|min)$/;
  if (
    !(
      duration.test(options.lockTimeout) &&
      duration.test(options.statementTimeout)
    )
  ) {
    throw new Error("Timeouts look like 5s, 500ms or 2min.");
  }
  if (
    options.officialEmail.toLowerCase() !== OFFICIAL_EMAIL.toLowerCase() &&
    !options.allowOtherOfficialEmail
  ) {
    throw new Error(
      `--official-email ${options.officialEmail} isn't the official account (${OFFICIAL_EMAIL}): its themes would move to @qrdx. Pass --allow-other-official-email too to mean it.`
    );
  }
  if (options.apply && !options.backup) {
    throw new Error(
      "--apply needs --backup <file>, a new file each run (a backup is never overwritten)."
    );
  }
  return options;
}

export async function run({
  client,
  argv,
  log = console.log,
  save = (path, text) => writeFileSync(path, text, { flag: "wx" }),
  now = new Date(),
  seedItems = buildSeedItems(),
}) {
  const options = parseArgs(argv);
  log(options.apply ? "Mode: APPLY" : "Mode: dry run (nothing is written)");
  await client.query("BEGIN");
  try {
    await client.query(SQL.lockTimeout(options.lockTimeout));
    await client.query(SQL.statementTimeout(options.statementTimeout));
    await client.query(SQL.advisoryLock);
    const snapshot = await loadSnapshot(client, options);
    const plan = planSeed(snapshot, seedItems, now);
    for (const line of describeSeed(plan)) log(`  ${line}`);
    for (const warning of plan.warnings) log(`warning: ${warning}`);
    if (isEmptySeed(plan)) {
      log("Nothing to do: every official item is seeded.");
      await client.query("ROLLBACK");
      return 0;
    }
    const counts = (type) =>
      plan.inserts.filter((item) => item.type === type).length;
    const summary = `${counts("frame")} frame(s), ${counts("theme")} theme(s), ${counts("collection")} collection(s), ${counts("page-template")} page template(s), ${counts("kit")} kit(s), ${plan.entryInserts.length} entry(ies) added to seeded collections, ${plan.adopt.length} existing theme(s) marked official`;
    if (!options.apply) {
      log(
        `Planned: ${summary}. Run with --apply --backup <new file> to write.`
      );
      await client.query("ROLLBACK");
      return 0;
    }
    try {
      await save(
        options.backup,
        `${JSON.stringify(backupOf(snapshot, plan), null, 2)}\n`
      );
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      throw new Error(
        `${options.backup} already exists: a rerun needs a new --backup path (a backup is never overwritten).`
      );
    }
    log(`Backup written to ${options.backup}`);
    await applySeed(client, plan, snapshot.officialUserId);
    const problems = await verifySeed(client, plan);
    if (problems.length > 0) {
      for (const problem of problems) log(`check failed: ${problem}`);
      await client.query("ROLLBACK");
      log("Rolled back: nothing was changed.");
      return 1;
    }
    await client.query("COMMIT");
    log(`Committed: ${summary}. Counts checked.`);
    return 0;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      // The connection may be gone; the original error is what matters.
    });
    throw error;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "Set DATABASE_URL (for example with node --env-file=apps/app/.env.local)."
    );
    return 2;
  }
  let host = "the database";
  try {
    host = new URL(url).host;
  } catch {
    // Not a URL: print nothing about it (never the value itself).
  }
  console.log(`Database: ${host}`);
  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  const { default: ws } = await import("ws");
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    return await run({ client, argv: process.argv.slice(2) });
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  );
}

-- Path aliases on custom domains (feat/path-aliases): one new table.
--
-- link_path_alias: an exact legacy path on a customer's custom domain
-- (Flowcode's /r/<code>, Unitag's /a/<code>, BL.INK's /<word>/<word>, ...)
-- that opens a QRdx code on that domain, so codes printed by another
-- provider keep working after the domain moves to QRdx. The app answers an
-- alias only while its code is on the same domain (qr_code.domain_id =
-- link_path_alias.domain_id); the rules for paths are in
-- apps/app/lib/path-aliases.ts.
--
-- path: leading "/", no trailing "/", case kept (matching is exact and
-- case-sensitive, like back-halves; the query string is never part of it).
-- Unique per domain. Deleting the domain or the code deletes its aliases.
--
-- Additive and idempotent: a new table and its two indexes, all
-- IF NOT EXISTS, in one transaction. No existing table, column, row or
-- constraint changes. The table starts empty, so the indexes build
-- instantly. Constraint and index names are the ones drizzle-kit gives
-- schema.ts (`drizzle-kit export`), so a later `drizzle-kit push` finds
-- nothing to change.
--
-- Order: apply it before or after deploying the code. Until it exists, the
-- app treats every alias lookup as "no alias" (custom domains answer as they
-- did before, and the failed lookup is logged once per server bundle),
-- imports don't propose aliases, and adding one in a code's edit dialog says
-- path aliases aren't available yet.
--
-- Rollback: the code before this change never reads the table, so it can
-- stay. To remove it: DROP TABLE IF EXISTS link_path_alias;
--
-- Dry run first (rolled back):
--   BEGIN; <the statements below, without BEGIN/COMMIT>; ROLLBACK;
-- After running, check:
--   \d link_path_alias   -- link_path_alias_domain_id_custom_domain_id_fk,
--                         -- link_path_alias_qr_code_id_qr_code_id_fk,
--                         -- link_path_alias_domain_id_path_unique,
--                         -- link_path_alias_qr_code_id_idx
--   SELECT count(*) FROM link_path_alias;   -- 0 right after

BEGIN;

CREATE TABLE IF NOT EXISTS "link_path_alias" (
  "id" text PRIMARY KEY NOT NULL,
  "domain_id" text NOT NULL,
  "qr_code_id" text NOT NULL,
  "path" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "link_path_alias_domain_id_custom_domain_id_fk"
    FOREIGN KEY ("domain_id") REFERENCES "public"."custom_domain"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "link_path_alias_qr_code_id_qr_code_id_fk"
    FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_code"("id")
    ON DELETE cascade ON UPDATE no action
);

-- A table made by an earlier draft of this file got Postgres's default
-- names for its foreign keys: rename them to drizzle-kit's. No-op otherwise.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'link_path_alias_domain_id_fkey'
      AND conrelid = 'public.link_path_alias'::regclass
  ) THEN
    ALTER TABLE "link_path_alias" RENAME CONSTRAINT
      "link_path_alias_domain_id_fkey" TO "link_path_alias_domain_id_custom_domain_id_fk";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'link_path_alias_qr_code_id_fkey'
      AND conrelid = 'public.link_path_alias'::regclass
  ) THEN
    ALTER TABLE "link_path_alias" RENAME CONSTRAINT
      "link_path_alias_qr_code_id_fkey" TO "link_path_alias_qr_code_id_qr_code_id_fk";
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "link_path_alias_domain_id_path_unique"
  ON "link_path_alias" USING btree ("domain_id", "path");

CREATE INDEX IF NOT EXISTS "link_path_alias_qr_code_id_idx"
  ON "link_path_alias" USING btree ("qr_code_id");

COMMIT;

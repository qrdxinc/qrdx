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
-- instantly.
--
-- Order: apply it before or after deploying the code. Until it exists, the
-- app treats every alias lookup as "no alias" (custom domains answer as they
-- did before, and the failed lookup is logged once per server instance),
-- imports don't propose aliases, and adding one in a code's edit dialog says
-- path aliases aren't available yet.
--
-- Rollback: the code before this change never reads the table, so it can
-- stay. To remove it: DROP TABLE IF EXISTS link_path_alias;
--
-- Dry run first (rolled back):
--   BEGIN; <the statements below, without BEGIN/COMMIT>; ROLLBACK;
-- After running, check:
--   \d link_path_alias
--   SELECT count(*) FROM link_path_alias;   -- 0 right after

BEGIN;

CREATE TABLE IF NOT EXISTS link_path_alias (
  id text PRIMARY KEY,
  domain_id text NOT NULL
    REFERENCES custom_domain (id) ON DELETE CASCADE,
  qr_code_id text NOT NULL
    REFERENCES qr_code (id) ON DELETE CASCADE,
  path text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS link_path_alias_domain_id_path_unique
  ON link_path_alias (domain_id, path);

CREATE INDEX IF NOT EXISTS link_path_alias_qr_code_id_idx
  ON link_path_alias (qr_code_id);

COMMIT;

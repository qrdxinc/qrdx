-- The back-office console's grants (apps/app/lib/admin-console/grants.ts):
-- one new table, admin_console_grant.
--
-- When an admin signs in to the console, the app mints a random grant for
-- that sign-in and hands it to the console with the code exchange. The
-- console keeps it only in that admin's sealed session cookie and sends it
-- with every signed call to /api/internal/console/*, and the app checks it
-- against this table: same user, same qrdx.dev session, not expired. A
-- call then proves which admin is at the console, not just that the caller
-- knows a live session id.
--
-- Each row: the grant's SHA-256 (base64url; the grant itself is never
-- stored), the admin, the qrdx.dev session the console signed in with, and
-- when it was minted and expires (8 hours and 5 minutes later, the console
-- session's length plus a margin). Rows go with their session (signing out
-- on qrdx.dev, "sign out everywhere", a ban) and with their user, through
-- the foreign keys. The app deletes the admin's expired rows at each new
-- sign-in. No role is granted anything on it: only the app's own
-- connection reads and writes it.
--
-- Additive and idempotent: a new table, its foreign keys and indexes only,
-- safe to run more than once, in one transaction. No existing table or
-- column changes.
--
-- Order: apply it BEFORE deploying the release that mints grants
-- (feat/console-grants). If the code runs first, nothing breaks: sign-in
-- mints no grant (logged once per process as admin_console.grants_missing),
-- the console carries none, and calls without one are still accepted. Once
-- the table exists, the next sign-ins get grants. The later release that
-- requires a grant on every call must not ship before this has been
-- applied and every console session carries one.
--
-- Rollback: the code before this feature never reads or writes this table,
-- so it keeps working with the table present. Leave the table in place
-- when rolling back; dropping it is a separate change.
--
-- Dry run first (rolled back):
--   BEGIN; <the statements below, without BEGIN/COMMIT>; ROLLBACK;
-- After running, check:
--   SELECT count(*) FROM admin_console_grant;  -- 0 right after
--   \d admin_console_grant
--
-- Names match what drizzle-kit generates from packages/database/schema.ts
-- (adminConsoleGrant), so a later `drizzle-kit push` sees no drift.

BEGIN;

CREATE TABLE IF NOT EXISTS "admin_console_grant" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "session_id" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "expires_at" timestamp NOT NULL,
  CONSTRAINT "admin_console_grant_user_id_user_id_fk" FOREIGN KEY ("user_id")
    REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "admin_console_grant_session_id_session_id_fk" FOREIGN KEY ("session_id")
    REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "admin_console_grant_user_id_idx"
  ON "admin_console_grant" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "admin_console_grant_session_id_idx"
  ON "admin_console_grant" USING btree ("session_id");

COMMIT;

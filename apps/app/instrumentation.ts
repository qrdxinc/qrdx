/**
 * Runs once when a server starts, before it takes requests.
 *
 * It validates the environment first (env.ts): a server missing a required
 * variable, or with an invalid one, refuses to start and names it.
 * next.config.ts does the same for `next dev` and `next build`, but a
 * standalone server (the Docker image) never loads next.config.ts.
 *
 * Better Auth's side of the stolen-session check (packages/auth/
 * session-origin.ts) reads a request's country and browser family through a
 * reader the app hands it. Registering it here means every server has it
 * from its first request, whichever page, action or route that is; the
 * modules that use the check register it too.
 *
 * The same goes for the plan limits packages/auth decides seats, more
 * workspaces, workspace SSO and required two-step verification from:
 * lib/plans.ts hands them over when it loads. Last, it logs the state of the
 * ee licence key (packages/auth/ee/license.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await import("./env");
  const { registerAppSessionOriginReader } = await import(
    "./lib/account/session-origin"
  );
  registerAppSessionOriginReader();
  await import("./lib/plans");
  // Checks the ee licence key once at start-up, so the log says straight away
  // which ee features are on (never the key itself).
  const { eeLicenseState } = await import("@repo/auth/license");
  eeLicenseState();
}

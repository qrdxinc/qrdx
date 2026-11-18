"use server";

import type { SignInOptions } from "@/lib/auth/sign-in-options";
import { getSignInOptions } from "@/lib/auth/sign-in-options-server";

/**
 * The sign-in panel asks this when it opens without the page's answer (the
 * dialog). Prerendered pages carry what the build's environment said, and a
 * Docker image is built without its secrets, so only the running server
 * knows whether Google, GitHub and email codes work. Four booleans, the
 * same the sign-in page shows anyone, so it needs no session.
 */
export async function loadSignInOptions(): Promise<SignInOptions> {
  return getSignInOptions();
}

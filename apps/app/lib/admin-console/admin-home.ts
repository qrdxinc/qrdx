import "server-only";

import { adminConsoleAddress } from "@repo/next-config/console-zone";
import { env } from "@/env";

/**
 * Where the admin UI is, for links to it outside the admin pages (the user
 * menu's Admin entry): the console's front page while it's at its own
 * address (ADMIN_CONSOLE_URL with its client secret, adminConsoleAddress),
 * else this app's /admin (self-hosting).
 */
export function adminHomeHref(): string {
  const consoleUrl = adminConsoleAddress({
    adminConsoleUrl: env.ADMIN_CONSOLE_URL,
    secret: env.CONSOLE_ZONE_KEY,
  });
  return consoleUrl ? `${consoleUrl}/` : "/admin";
}

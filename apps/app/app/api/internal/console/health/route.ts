import { z } from "zod";
import {
  getBuildInfo,
  getConfiguration,
  getCronHealth,
  getIntegrationHealth,
  getServiceProbes,
  getWebhookBacklog,
} from "@/app/(app)/admin/_lib/health";
import { safeLoad } from "@/app/(app)/admin/_lib/safe";
import { env } from "@/env";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: this deployment's health, as the admin
// page shows it (app/(app)/admin/health): the build, one probe per service,
// the cron jobs, the webhook backlog, which optional features are configured
// (variable names only, never values) and which integrations can connect.
// `deployment` names this app's address, so the console can say whose health
// it shows. Signed, with the admin checked again here
// (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  schema: z.object({}),
  run: async () => {
    const [probes, cron, webhooks] = await Promise.all([
      getServiceProbes(),
      safeLoad("health.cron", getCronHealth),
      safeLoad("health.webhooks", getWebhookBacklog),
    ]);
    return {
      data: {
        deployment: new URL(env.NEXT_PUBLIC_APP_URL).origin,
        build: getBuildInfo(),
        probes,
        cron,
        webhooks,
        configuration: getConfiguration(),
        integrations: getIntegrationHealth(),
      },
    };
  },
});

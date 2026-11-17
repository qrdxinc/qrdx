import { retryWebhookDelivery } from "@/app/(app)/admin/_lib/operations";
import { deliverySchema } from "@/app/(app)/admin/_lib/schemas";
import { consoleInternalRoute } from "@/lib/console-internal/route";

// POST from the back-office console: retries a webhook delivery, as
// retryWebhookDeliveryAction.
// Signed, with the admin checked again here (lib/console-internal/route.ts).

export const dynamic = "force-dynamic";

export const POST = consoleInternalRoute({
  action: "webhook_delivery.retry",
  schema: deliverySchema,
  run: (input, { actor }) => retryWebhookDelivery(actor, input),
});

import "server-only";

import { createEmailSender } from "@repo/email";
import { env } from "@/env";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";

// Email through @repo/email (packages/email: the sender, the templates and
// their layout), with this app's settings: RESEND_API_KEY and EMAIL_FROM,
// and the delivery guard that keeps local development and previews from
// emailing anyone. Without RESEND_API_KEY + EMAIL_FROM every send is skipped
// and logged, so callers must offer a fallback (e.g. a copyable invite
// link). `sendEmail` never throws unless `throwOnError`.

export const { isEmailConfigured, sendEmail } = createEmailSender({
  apiKey: env.RESEND_API_KEY,
  from: env.EMAIL_FROM,
  isDeliveryAllowed: () => isOutboundDeliveryAllowed(),
});

export type { SendEmailOptions, SendEmailResult } from "@repo/email";
export { renderEmail } from "@repo/email/render";

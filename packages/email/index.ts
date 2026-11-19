import "server-only";

import type { ReactElement } from "react";
import { Resend } from "resend";
import { renderEmail } from "./render";
import { isReservedEmailAddress } from "./reserved-address";

/**
 * Transactional email through Resend. An app makes one sender with its
 * settings (apps/app/lib/email/send.ts). Without an API key and a sender
 * address every send is skipped and logged, so callers must offer a
 * fallback (e.g. a copyable invite link). `sendEmail` never throws unless
 * `throwOnError`.
 */
export interface EmailSenderConfig {
  /** RESEND_API_KEY (./keys.ts) */
  apiKey: string | undefined;
  /** EMAIL_FROM, e.g. "QRdx <hello@qrdx.dev>" */
  from: string | undefined;
  /**
   * False where nobody may be emailed (the app's delivery guard: local
   * development and previews share the real database): sends are skipped.
   */
  isDeliveryAllowed: () => boolean;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  /** A template from ./templates (wrapped in EmailLayout) */
  react: ReactElement;
  replyTo?: string;
  /** Adds one-click List-Unsubscribe headers (digests, alerts) */
  unsubscribeUrl?: string;
  /** Resend drops repeats with the same key for 24 hours (safe retries) */
  idempotencyKey?: string;
  /** Resend tags: ASCII letters, numbers, _ and - only */
  tags?: { name: string; value: string }[];
  /** Throw on failure instead of resolving `{ sent: false }` */
  throwOnError?: boolean;
}

export type SendEmailResult =
  | { sent: true; id: string }
  | {
      sent: false;
      reason: "not-configured" | "failed" | "reserved-address";
      error?: string;
    };

export interface EmailSender {
  isEmailConfigured: boolean;
  sendEmail: (options: SendEmailOptions) => Promise<SendEmailResult>;
}

function log(
  level: "info" | "error",
  event: string,
  fields: Record<string, unknown>
) {
  // Recipient addresses stay out of logs.
  console[level](JSON.stringify({ event, ...fields }));
}

export function createEmailSender({
  apiKey,
  from,
  isDeliveryAllowed,
}: EmailSenderConfig): EmailSender {
  const isEmailConfigured = Boolean(apiKey && from);
  let client: Resend | null = null;

  async function sendEmail({
    to,
    subject,
    react,
    replyTo,
    unsubscribeUrl,
    idempotencyKey,
    tags,
    throwOnError = false,
  }: SendEmailOptions): Promise<SendEmailResult> {
    const requested = Array.isArray(to) ? to : [to];
    // Reserved test and example addresses never get email (reserved-address.ts).
    const recipients = requested.filter(
      (address) => !isReservedEmailAddress(address)
    );
    const fields = { subject, recipients: recipients.length };

    if (!(isEmailConfigured && apiKey && from)) {
      log("info", "email.skipped", { ...fields, reason: "not-configured" });
      if (throwOnError) throw new Error("Email is not configured");
      return { sent: false, reason: "not-configured" };
    }
    if (!isDeliveryAllowed()) {
      log("info", "email.skipped", { ...fields, reason: "outside-production" });
      return { sent: false, reason: "not-configured" };
    }
    if (recipients.length === 0) {
      log("info", "email.skipped", {
        ...fields,
        reason: "reserved-address",
        skipped: requested.length,
      });
      return { sent: false, reason: "reserved-address" };
    }

    try {
      const { html, text } = await renderEmail(react);
      client ??= new Resend(apiKey);
      const { data, error } = await client.emails.send(
        {
          from,
          to: recipients,
          subject,
          html,
          text,
          replyTo,
          tags,
          headers: unsubscribeUrl
            ? {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }
            : undefined,
        },
        idempotencyKey ? { idempotencyKey } : undefined
      );
      if (error || !data) {
        throw new Error(error?.message ?? "Resend returned no email id");
      }
      log("info", "email.sent", { ...fields, id: data.id });
      return { sent: true, id: data.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("error", "email.failed", { ...fields, error: message });
      if (throwOnError) throw error;
      return { sent: false, reason: "failed", error: message };
    }
  }

  return { isEmailConfigured, sendEmail };
}

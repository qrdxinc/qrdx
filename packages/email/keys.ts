import { onValidationError } from "@repo/next-config/env-errors";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    server: {
      // Resend (emails are skipped and logged when unset)
      RESEND_API_KEY: z.string().min(1).optional(),
      // Sender, e.g. "QRdx <hello@qrdx.dev>"
      EMAIL_FROM: z.string().regex(/\S@\S/).optional(),
    },
    runtimeEnv: {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      EMAIL_FROM: process.env.EMAIL_FROM,
    },
    emptyStringAsUndefined: true,
    onValidationError,
  });

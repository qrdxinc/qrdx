import { ADMIN_ROLE } from "@repo/auth/admin-rules";
import { z } from "zod";
import { MAX_EMAIL_LENGTH } from "@/lib/account/email-change";
import { adminId, optionalReason, requiredReason } from "./rules";

// The inputs of the admin actions that both this app's admin pages
// (../actions.ts, ../users/support-actions.ts, ../abuse/actions.ts) and the
// back-office console's endpoints (app/api/internal/console) take. Here, not
// in those "use server" files, which may export only their actions.

export const userReasonSchema = z.object({
  userId: adminId,
  reason: requiredReason,
});

export const banSchema = userReasonSchema.extend({
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export const roleSchema = userReasonSchema.extend({
  role: z.enum(["user", ADMIN_ROLE]),
});

export const changeEmailSchema = userReasonSchema.extend({
  newEmail: z.string().trim().toLowerCase().email().max(MAX_EMAIL_LENGTH),
});

export const unlinkSchema = userReasonSchema.extend({ accountId: adminId });

export const deliverySchema = z.object({
  deliveryId: adminId,
  reason: requiredReason,
});

export const integrationSchema = z.object({
  integrationId: adminId,
  reason: requiredReason,
});

export const invitationSchema = z.object({
  invitationId: adminId,
  reason: requiredReason,
});

export const deleteSchema = userReasonSchema.extend({
  confirmation: z.string().trim().max(320),
});

export const blockFileSchema = z.object({
  reportId: adminId,
  fileId: adminId,
  reason: optionalReason,
});

export const importSchema = userReasonSchema.extend({ jobId: adminId });

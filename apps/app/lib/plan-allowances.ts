// Each plan's REST API requests a day, AI art images a month, file storage,
// largest upload, form responses a month and Pro's team size. lib/plans.ts
// reads them (`apiRequestsPerDay`, `aiArtPerMonth`, `storageBytes`,
// `maxFileBytes`, `formResponsesPerMonth`, `teamMembers`); they live in this
// light, client-safe module so copy can quote them too: the `{facts.*}`
// tokens in MDX (lib/product-facts.ts), the way lib/scan-history.ts gives
// copy each plan's scan history.

import type { Plan } from "./pricing";

/** REST API requests a workspace can make a day (resets at 00:00 UTC). */
export const API_REQUESTS_PER_DAY: Readonly<Record<Plan, number>> = {
  free: 1000,
  pro: 10_000,
  business: 100_000,
};

/** AI art images a calendar month (pooled across a Business team). */
export const AI_ART_PER_MONTH: Readonly<Record<Plan, number>> = {
  free: 3,
  pro: 30,
  business: 150,
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Bytes of uploaded files a workspace can keep. */
export const FILE_STORAGE_BYTES: Readonly<Record<Plan, number>> = {
  free: 50 * MB,
  pro: 5 * GB,
  business: 50 * GB,
};

/** The largest single upload, in bytes. */
export const MAX_FILE_BYTES: Readonly<Record<Plan, number>> = {
  free: 10 * MB,
  pro: 100 * MB,
  business: 250 * MB,
};

/** Form submissions a workspace accepts a calendar month, across its hosted pages. */
export const FORM_RESPONSES_PER_MONTH: Readonly<Record<Plan, number>> = {
  free: 50,
  pro: 1000,
  business: 10_000,
};

/**
 * People in a Pro workspace, the owner and pending invitations included.
 * Free has no team (only you) and Business has no limit.
 */
export const PRO_TEAM_MEMBERS = 3;

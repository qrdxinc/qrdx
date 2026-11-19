import { resolveBaseUrl } from "@repo/config";

/**
 * The origin the templates link to: the app's, resolved as the app resolves
 * its own (apps/app/lib/metadata.ts). Read straight from the process, as
 * there: the preview app (apps/email) renders the templates with no app
 * environment at all, and then they link to http://localhost:3000.
 */
export const baseUrl = resolveBaseUrl({
  nodeEnv: process.env.NODE_ENV,
  devAppUrl:
    process.env.NODE_ENV === "development"
      ? process.env.NEXT_PUBLIC_APP_URL
      : undefined,
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
});

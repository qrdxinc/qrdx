import "server-only";

import {
  type CustomDomainMode,
  computeFeatures,
  customDomainMode,
  type FeatureContext,
  type FeatureId,
  type FeatureMap,
  isPathShown,
  missingFeatureSetup,
  toPublicAvailability,
} from "@repo/availability";
import { featureContext } from "@/lib/feature-context";

export { featureContext } from "@/lib/feature-context";

// Worked out again only when the context changes, which happens when the
// licence key expires or its grace period ends (lib/feature-context.ts).
let snapshot: {
  context: FeatureContext;
  features: FeatureMap;
  hiddenPaths: string[];
} | null = null;

function current() {
  const context = featureContext();
  if (snapshot?.context !== context) {
    const features = computeFeatures(context);
    snapshot = {
      context,
      features,
      hiddenPaths: toPublicAvailability(features).hiddenPaths,
    };
  }
  return snapshot;
}

/** True when `id` can work on this deployment. */
export function isFeatureAvailable(id: FeatureId): boolean {
  return current().features[id];
}

/** The variable names `id` still needs here (admin and dev use only). */
export function featureSetupNeeded(id: FeatureId): string[] {
  return missingFeatureSetup(id, featureContext());
}

export function getCustomDomainMode(): CustomDomainMode {
  return customDomainMode(featureContext());
}

/** Every feature's availability here, by id. */
export function getFeatures(): FeatureMap {
  return current().features;
}

/**
 * False for a link to a page that only offers an unavailable feature, like
 * a workspace's Domains page where custom domains can't be added.
 */
export function isPathAvailable(href: string): boolean {
  return isPathShown(current().hiddenPaths, href);
}

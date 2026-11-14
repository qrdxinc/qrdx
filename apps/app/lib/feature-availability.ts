import "server-only";

import {
  type CustomDomainMode,
  computeFeatures,
  customDomainMode,
  type FeatureId,
  type FeatureMap,
  isPathShown,
  missingFeatureSetup,
  toPublicAvailability,
} from "@repo/availability";
import { featureContext } from "@/lib/feature-context";

export { featureContext } from "@/lib/feature-context";

const features = computeFeatures(featureContext());

/** True when `id` can work on this deployment. */
export function isFeatureAvailable(id: FeatureId): boolean {
  return features[id];
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
  return features;
}

const hiddenPaths = toPublicAvailability(features).hiddenPaths;

/**
 * False for a link to a page that only offers an unavailable feature, like
 * a workspace's Domains page where custom domains can't be added.
 */
export function isPathAvailable(href: string): boolean {
  return isPathShown(hiddenPaths, href);
}

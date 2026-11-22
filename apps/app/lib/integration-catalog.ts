import type {
  IntegrationCapability,
  IntegrationCapabilityKind,
} from "@repo/integration-kit";
import { getCapabilityLabel, hasCapability } from "@repo/integration-kit";
import type { IntegrationDefinition } from "@repo/integrations";
import { dubIntegration } from "@repo/integrations/src/integrations/dub/config";
import { googleDriveIntegration } from "@repo/integrations/src/integrations/google-drive/config";

export const EDITOR_INTEGRATIONS = [dubIntegration, googleDriveIntegration];

export function getIntegrationCapabilityLabels(
  capabilities: readonly IntegrationCapability[],
): string[] {
  return capabilities.map((capability) => getCapabilityLabel(capability.kind));
}

export function hasIntegrationCapability(
  integration: IntegrationDefinition,
  kind: IntegrationCapabilityKind,
): boolean {
  return hasCapability(integration.capabilities, kind);
}

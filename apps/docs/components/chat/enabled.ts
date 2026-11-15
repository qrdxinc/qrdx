// Whether this deployment offers the docs assistant: the main app's
// availability id "docsChat" (packages/availability), read from the file
// the build fetched (scripts/zone-inputs.mjs), as lib/feature-availability.ts
// does on the server. Pure JSON, so the chat's client components can read
// it too; it changes with the next docs deploy, like the rest.
import zoneFile from "@/generated/zone-availability.json";
import {
  type ZoneAvailabilityFile,
  zoneAvailability,
} from "@/lib/zone-availability";

export const DOCS_CHAT_ENABLED: boolean = zoneAvailability(
  zoneFile as ZoneAvailabilityFile,
).features.docsChat;

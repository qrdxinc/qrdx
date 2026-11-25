// What a Segment connection keeps in metadata.settings, read defensively
// (it is JSON). Client-safe: the settings panel shares the defaults.

/** Segment workspaces live in one region; a write key only works in its own. */
export const SEGMENT_REGIONS = ["us", "eu"] as const;
export type SegmentRegion = (typeof SEGMENT_REGIONS)[number];

/** Event names until the person picks their own (Segment's Object Action style). */
export const SEGMENT_DEFAULT_EVENTS = {
  scans: "QR Code Scanned",
  responses: "Form Submitted",
} as const;

/** Longest event name QRdx accepts. */
export const SEGMENT_EVENT_NAME_MAX = 200;

/** metadata.settings of a Segment connection. */
export interface SegmentSettings {
  region: SegmentRegion;
  /** `event` of every scan's track call */
  scanEvent: string;
  /** `event` of every form response's track call */
  responseEvent: string;
}

/** Control characters (C0, DEL, C1) never go into an event name. */
const CONTROL = /\p{Cc}/u;

/** A usable event name: trimmed, 1 to 200 characters, no control characters. */
export function normalizeSegmentEventName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > SEGMENT_EVENT_NAME_MAX || CONTROL.test(name)) {
    return null;
  }
  return name;
}

export function isSegmentRegion(value: unknown): value is SegmentRegion {
  return (SEGMENT_REGIONS as readonly unknown[]).includes(value);
}

/** The saved settings, with the defaults for anything missing or broken. */
export function readSegmentSettings(value: unknown): SegmentSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    region: isSegmentRegion(raw.region) ? raw.region : "us",
    scanEvent:
      normalizeSegmentEventName(raw.scanEvent) ?? SEGMENT_DEFAULT_EVENTS.scans,
    responseEvent:
      normalizeSegmentEventName(raw.responseEvent) ??
      SEGMENT_DEFAULT_EVENTS.responses,
  };
}

export {
  assertSegmentWriteKey,
  createSegmentClient,
  SEGMENT_ENDPOINTS,
  SegmentClient,
  type SegmentTrackEvent,
  verifySegmentWriteKey,
} from "./client";
export { segmentIntegration } from "./config";
export {
  responseTrackEvent,
  scanTrackEvent,
  segmentAnswers,
  segmentBatches,
  segmentMessageId,
} from "./events";
export {
  isSegmentRegion,
  normalizeSegmentEventName,
  readSegmentSettings,
  SEGMENT_DEFAULT_EVENTS,
  SEGMENT_EVENT_NAME_MAX,
  SEGMENT_REGIONS,
  type SegmentRegion,
  type SegmentSettings,
} from "./settings";
export {
  sendResponsesToSegment,
  sendScansToSegment,
  sendSegmentTestEvent,
} from "./sink";

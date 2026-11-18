import "server-only";

import type { ScanGrade } from "qrdx";
import { DesignTooLongError, scoreDesign } from "@/lib/qr-design/score";
import type { ThemeStyles } from "@/types/theme";
import {
  COMMUNITY_CHECK_MESSAGES,
  type CommunityCheckMessages,
} from "./messages";
import { GATE_SAMPLES, type GateSample, MIN_GATE_SCORE } from "./scan-samples";

// The publish gate: a design (a theme, or a frame on a classic code) goes
// into the community only when the server-side scan score (the editor's
// score: rendered by the engine, rasterized, scored from pixels) is Great
// with each of the sample payloads. Nothing about it comes from the client.

export interface GateResult {
  sample: GateSample["id"];
  label: string;
  score: number;
  grade: ScanGrade | "too-long";
  passed: boolean;
}

export interface ScanGate {
  passed: boolean;
  /** Lowest score across the samples (0 when one couldn't be encoded) */
  minScore: number;
  results: GateResult[];
}

export type ScoreFn = typeof scoreDesign;

/** Scores `style` with every gate sample. */
export async function checkScanGate(
  style: ThemeStyles,
  score: ScoreFn = scoreDesign,
): Promise<ScanGate> {
  const results: GateResult[] = [];
  for (const sample of GATE_SAMPLES) {
    try {
      const result = await score(sample.value, style);
      results.push({
        sample: sample.id,
        label: sample.label,
        score: result.score,
        grade: result.grade,
        passed: result.score >= MIN_GATE_SCORE,
      });
    } catch (error) {
      if (!(error instanceof DesignTooLongError)) throw error;
      results.push({
        sample: sample.id,
        label: sample.label,
        score: 0,
        grade: "too-long",
        passed: false,
      });
    }
  }
  return {
    passed: results.every((result) => result.passed),
    minScore: Math.min(...results.map((result) => result.score)),
    results,
  };
}

/** A gate sample's name in a message, e.g. "Wi-Fi details". */
const sampleName = (
  sample: GateSample["id"],
  messages: CommunityCheckMessages,
): string =>
  sample === "wifi" ? messages.gateSampleWifi : messages.gateSampleLink;

/**
 * Why a gate failed, e.g. "... With Wi-Fi details it scores 71." In English
 * unless `messages` is another language's set (./messages.ts).
 */
export function gateFailureMessage(
  gate: ScanGate,
  messages: CommunityCheckMessages = COMMUNITY_CHECK_MESSAGES,
): string {
  const failed = gate.results.filter((result) => !result.passed);
  const parts = failed.map((result) => {
    const sample = sampleName(result.sample, messages);
    return result.grade === "too-long"
      ? messages.gateTooLong({ sample })
      : messages.gateScore({ sample, score: result.score });
  });
  const reasons = parts.join("; ");
  return messages.gateFailed({
    min: MIN_GATE_SCORE,
    reasons: `${reasons.charAt(0).toUpperCase()}${reasons.slice(1)}`,
  });
}

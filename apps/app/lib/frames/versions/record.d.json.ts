// The type of ./record.json (written by scripts/frame-versions.ts), so
// TypeScript reads this instead of inferring one from 1.7 MB of specs.
import type { FrameSpec } from "qrdx/types";

declare const record: Readonly<
  Record<
    string,
    readonly {
      /** 1, 2, …: the version a pinned name (autumn-maple.v2) draws */
      v: number;
      /** frameSpecHash(spec) */
      hash: string;
      spec: FrameSpec;
    }[]
  >
>;
export default record;

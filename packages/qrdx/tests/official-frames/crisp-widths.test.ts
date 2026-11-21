// The crisp-render width sweep (tests/support/crisp-widths.ts) at error
// level M and at Q, the engine's default. One file, so it takes one test
// worker: the renders are heavy, and other packages' tests share the CPU.
import { describeCrispWidths } from "../support/crisp-widths";

describeCrispWidths("M");
describeCrispWidths("Q");

// Runs a reader script (support/halo-reads.mjs, support/crisp-reads.mjs) in
// a short-lived child process and returns what it printed, parsed. The input
// goes in a temporary file, not on stdin: with the jobs piped through
// execFileSync's stdin, the child sat in read() waiting for the end of its
// input while the test worker waited for the child, both idle, until killed
// (twice on a loaded machine, 22 Nov 2026), and a synchronous call can't be
// stopped by the test's own timeout. A child that takes longer than
// CHILD_TIMEOUT fails its test instead of hanging the suite.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Longest a reader child may run: a batch takes a few seconds. */
const CHILD_TIMEOUT = 60_000;

/** Runs `script` on `input` (its first argument names a JSON file) and parses its stdout. */
export function childReads<T>(script: string, input: unknown): T {
  const dir = mkdtempSync(join(tmpdir(), "qrdx-reads-"));
  const file = join(dir, "input.json");
  try {
    writeFileSync(file, JSON.stringify(input));
    return JSON.parse(
      execFileSync(process.execPath, [script, file], {
        maxBuffer: 16 * 1024 * 1024,
        timeout: CHILD_TIMEOUT,
      }).toString()
    ) as T;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

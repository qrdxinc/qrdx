/** One option per id, its own literal: `{ value: "x"; … } | { value: "y"; … }`. */
export type IdOption<Value extends string> = {
  [V in Value]: { value: V; label: string };
}[Value];

/**
 * Prompt options for a catalogue of ids, each labelled with its id. Each
 * option keeps its own literal type, so a list of more than 25 ids still
 * checks against the prompt's per-value option union, and a list from the
 * wrong catalogue doesn't compile (tests/id-options.test.ts).
 */
export function idOptions<Value extends string>(
  values: readonly Value[]
): IdOption<Value>[] {
  return values.map((value) => ({ value, label: value }));
}

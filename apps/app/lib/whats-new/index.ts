// Things added recently carry a "New" tag until their batch's date passes, so
// nothing stays "new" forever. Each area keeps its own batch file beside this one.
export interface NewBatch {
  /** Ids (as the catalogue spells them) of what the batch added. */
  ids: readonly string[];
  /** Last day the tag shows, as YYYY-MM-DD (UTC). */
  until: string;
}

export function isNewIn(
  batches: readonly NewBatch[],
  id: string,
  now: Date = new Date(),
): boolean {
  const today = now.toISOString().slice(0, 10);
  return batches.some(
    (batch) => today <= batch.until && batch.ids.includes(id),
  );
}

// Community items carry a "New" tag for a while after they are published.
// The gallery reads each item's published date from the database, so the
// rule needs no list of ids and writes nothing (unlike the catalogue
// batches in ./index.ts).

/** How long a published item stays "new", in days. */
export const NEW_FOR_DAYS = 30;

const DAY = 86_400_000;

/**
 * True when `createdAt` (an ISO string or a Date, the item's published
 * date) is within the last NEW_FOR_DAYS days of `now`. Nothing without a
 * date, or with one that doesn't parse, is new.
 */
export function isNewPublished(
  createdAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!createdAt) return false;
  const time =
    typeof createdAt === "string"
      ? new Date(createdAt).getTime()
      : createdAt.getTime();
  if (!Number.isFinite(time)) return false;
  return now.getTime() - time <= NEW_FOR_DAYS * DAY;
}

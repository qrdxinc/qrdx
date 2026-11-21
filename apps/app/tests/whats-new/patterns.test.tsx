// The "New" tags on the pattern pickers: every tagged id is a real option,
// the tag expires, and the tiles render it only for new ids.
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
} from "qrdx/types";
import { describe, expect, it } from "vitest";
import {
  CompactTile,
  OptionTile,
} from "@/components/editor/control-sections/option-tiles";
import { isNewIn } from "@/lib/whats-new";
import {
  NEW_BODY_PATTERNS,
  NEW_EYE_CENTRES,
  NEW_EYE_FRAMES,
} from "@/lib/whats-new/patterns";
import { renderIntl } from "../support/intl";

describe("the patterns batch", () => {
  it("names only ids the engine offers", () => {
    const check = (
      batches: typeof NEW_BODY_PATTERNS,
      catalogue: readonly string[],
    ) => {
      for (const batch of batches) {
        expect(batch.ids.length).toBeGreaterThan(0);
        for (const id of batch.ids) expect(catalogue, id).toContain(id);
        expect(batch.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    };
    check(NEW_BODY_PATTERNS, BODY_PATTERN);
    check(NEW_EYE_FRAMES, CORNER_EYE_PATTERNS);
    check(NEW_EYE_CENTRES, CORNER_EYE_DOT_PATTERNS);
  });

  it("tags an id until its date, not the day after", () => {
    const batches = [{ ids: ["pebble"], until: "2026-12-31" }];
    expect(isNewIn(batches, "pebble", new Date("2026-12-31T23:59:59Z"))).toBe(
      true,
    );
    expect(isNewIn(batches, "pebble", new Date("2027-01-01T00:00:00Z"))).toBe(
      false,
    );
    expect(isNewIn(batches, "square", new Date("2026-11-20T12:00:00Z"))).toBe(
      false,
    );
  });
});

describe("the tiles", () => {
  const tile = (isNew: boolean, compact: boolean) =>
    renderIntl(
      compact ? (
        <CompactTile
          isNew={isNew}
          name="Pebble"
          onSelect={() => undefined}
          selected={false}
        >
          <svg aria-hidden />
        </CompactTile>
      ) : (
        <OptionTile
          isNew={isNew}
          name="Pebble"
          onSelect={() => undefined}
          selected={false}
        >
          <svg aria-hidden />
        </OptionTile>
      ),
    );

  for (const compact of [false, true]) {
    it(`${compact ? "compact" : "full"} tile shows the tag only for a new option`, () => {
      const tagged = tile(true, compact);
      expect(tagged).toContain(">New<");
      expect(tagged).toContain('aria-label="Pebble, new"');
      const plain = tile(false, compact);
      expect(plain).not.toContain(">New<");
      expect(plain).not.toContain("Pebble, new");
    });
  }
});

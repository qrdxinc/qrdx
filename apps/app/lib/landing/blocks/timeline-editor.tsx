"use client";

import { newItemId } from "@/components/landing/block-kit";
import { ListEditor, TextField } from "@/components/landing/editor/fields";
import type { BlockEditorProps } from "../registry";
import {
  MAX_TIMELINE_ITEMS,
  type TimelineItem,
  type TimelineProps,
} from "./timeline-schema";

export function TimelineEditor({
  value,
  onChange,
}: BlockEditorProps<TimelineProps>) {
  const set = (patch: Partial<TimelineProps>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <TextField
        label="Heading"
        maxLength={120}
        onChange={(title) => set({ title })}
        placeholder="Optional, e.g. Experience"
        value={value.title}
      />
      <ListEditor<TimelineItem>
        addLabel="Add entry"
        create={() => ({
          id: newItemId(),
          when: "",
          title: "",
          place: "",
          note: "",
        })}
        itemLabel={(item, index) => item.title || `Entry ${index + 1}`}
        items={value.items}
        max={MAX_TIMELINE_ITEMS}
        onChange={(items) => set({ items })}
        renderItem={(item, update) => (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="When"
                maxLength={40}
                onChange={(when) => update({ when })}
                placeholder="2021 – now, or 4:00 pm"
                value={item.when}
              />
              <TextField
                label="Title"
                maxLength={120}
                onChange={(title) => update({ title })}
                placeholder="Senior designer, or Ceremony"
                value={item.title}
              />
            </div>
            <TextField
              label="Where"
              maxLength={120}
              onChange={(place) => update({ place })}
              placeholder="Optional: a company, a school, a room"
              value={item.place}
            />
            <TextField
              label="Note"
              maxLength={500}
              multiline
              onChange={(note) => update({ note })}
              placeholder="Optional"
              rows={2}
              value={item.note}
            />
          </div>
        )}
      />
    </div>
  );
}

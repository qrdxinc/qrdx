import { z } from "zod";
import {
  itemIdSchema,
  lineText,
  longText,
} from "@/components/landing/block-kit";

// Entries in order, each with when it was: the jobs and schools on a CV, the
// order of the day on an invitation, a firm's milestones.

export const MAX_TIMELINE_ITEMS = 30;

export const timelineItemSchema = z.object({
  id: itemIdSchema,
  /** When: "2021 – now", "4:00 pm", "Spring 2019" */
  when: lineText(40).default(""),
  title: lineText(120).min(1, "Add a title to every entry"),
  /** Where or with whom: a company, a school, a room */
  place: lineText(120).default(""),
  note: longText(500).default(""),
});

export const timelineSchema = z.object({
  title: lineText(120).default(""),
  items: z.array(timelineItemSchema).max(MAX_TIMELINE_ITEMS).default([]),
});

export type TimelineProps = z.output<typeof timelineSchema>;
export type TimelineItem = TimelineProps["items"][number];

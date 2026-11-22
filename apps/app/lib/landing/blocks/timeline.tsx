import { cn } from "@repo/design-system/lib/utils";
import { Timer1 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { mutedTextClass } from "@/components/landing/block-kit";
import { LpHeading } from "@/components/landing/heading";
import { type BlockRenderProps, registerBlock } from "../registry";
import { TimelineEditor } from "./timeline-editor";
import { type TimelineProps, timelineSchema } from "./timeline-schema";

function TimelineBlock({
  id,
  props,
  context,
}: BlockRenderProps<TimelineProps>) {
  const t = useTranslations("scanPages.hosted");
  if (props.items.length === 0) {
    return context.mode === "preview" ? (
      <p className="rounded-(--lp-radius) border-2 border-dashed border-current p-4 text-center text-sm opacity-40">
        Add entries to the timeline
      </p>
    ) : null;
  }
  const titleId = `${id}-title`;
  return (
    <section
      aria-label={props.title ? undefined : t("timeline")}
      aria-labelledby={props.title ? titleId : undefined}
      className="space-y-3"
    >
      {props.title && (
        <LpHeading
          as="h2"
          className="text-lg font-semibold tracking-tight"
          id={titleId}
          preview={context.thumbnail}
        >
          {props.title}
        </LpHeading>
      )}
      <ol className="space-y-4 border-s-2 border-(--lp-fg)/15 ps-5">
        {props.items.map((item) => (
          <li className="relative" key={item.id}>
            <span
              aria-hidden="true"
              className="absolute -start-[1.625rem] top-1.5 size-2.5 rounded-full bg-(--lp-primary)"
            />
            {item.when && (
              <p className={cn(mutedTextClass, "text-sm tabular-nums")}>
                {item.when}
              </p>
            )}
            <p className="text-[15px] leading-snug font-semibold">
              {item.title}
            </p>
            {item.place && (
              <p className={cn(mutedTextClass, "text-sm")}>{item.place}</p>
            )}
            {item.note && (
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">
                {item.note}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export const timelineBlock = registerBlock({
  type: "timeline",
  category: "content",
  label: "Timeline",
  description:
    "Entries in order: jobs and schools, a day's schedule, milestones",
  icon: Timer1,
  schema: timelineSchema,
  defaults: {
    items: [
      {
        id: "entry1",
        when: "2021 – now",
        title: "Senior designer",
        place: "Example Co.",
      },
      {
        id: "entry2",
        when: "2018 – 2021",
        title: "Designer",
        place: "Example Studio",
      },
    ],
  },
  Render: TimelineBlock,
  Editor: TimelineEditor,
});

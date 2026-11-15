import {
  CloseCircle,
  Flash,
  Refresh2,
  Send2,
  TickCircle,
} from "iconsax-reactjs";
import {
  Arrow,
  Canvas,
  type DiagramProps,
  Elbow,
  Node,
  Note,
  Pill,
} from "./parts";

/** An event is POSTed to the endpoint; a 2xx ends it, anything else is retried on a schedule, then marked failed. */
export function WebhookDelivery({ labels }: DiagramProps) {
  return (
    <Canvas height={250} title={labels.title} width={760}>
      <Node
        icon={Flash}
        label={labels.event}
        note={labels.eventNote}
        width={196}
        x={16}
        y={40}
      />
      <Arrow x1={216} x2={242} y1={72} y2={72} />
      <Node
        accent
        icon={Send2}
        label={labels.post}
        note={labels.postNote}
        width={246}
        x={244}
        y={40}
      />
      <Arrow tone="accent" x1={494} x2={520} y1={72} y2={72} />
      <Node
        icon={TickCircle}
        label={labels.delivered}
        note={labels.deliveredNote}
        width={222}
        x={522}
        y={40}
      />

      <Elbow tone="muted" x1={367} x2={367} y1={104} y2={132} />
      <Node
        dashed
        icon={Refresh2}
        label={labels.retry}
        note={labels.retryNote}
        width={246}
        x={244}
        y={134}
      />
      <Pill anchor="start" x={16} y={162}>
        {labels.schedule}
      </Pill>
      <Arrow tone="muted" x1={494} x2={520} y1={166} y2={166} />
      <Node
        icon={CloseCircle}
        label={labels.failed}
        note={labels.failedNote}
        width={222}
        x={522}
        y={134}
      />
      <Note x={16} y={234}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

import { Code, Data, Driver, Monitor, Setting2 } from "iconsax-reactjs";
import {
  Arrow,
  Canvas,
  type DiagramProps,
  Elbow,
  LINE,
  Node,
  Note,
} from "./parts";

/** The four Compose services: the app, the HTTP proxy it queries through, Postgres, and the one-off migrate job. */
export function SelfHostingStack({ labels }: DiagramProps) {
  return (
    <Canvas height={262} title={labels.title} width={760}>
      <Node
        icon={Monitor}
        label={labels.browser}
        note={labels.browserNote}
        width={150}
        x={16}
        y={56}
      />
      <Arrow x1={170} x2={206} y1={88} y2={88} />

      <rect
        fill="none"
        height={204}
        rx="14"
        stroke={LINE}
        strokeDasharray="4 4"
        width={544}
        x={200}
        y={16}
      />
      <Note x={216} y={38}>
        {labels.compose}
      </Note>
      <Node
        accent
        icon={Code}
        label={labels.app}
        note={labels.appNote}
        width={156}
        x={216}
        y={56}
      />
      <Arrow tone="accent" x1={376} x2={402} y1={88} y2={88} />
      <Node
        icon={Driver}
        label={labels.proxy}
        note={labels.proxyNote}
        width={160}
        x={404}
        y={56}
      />
      <Arrow x1={568} x2={590} y1={88} y2={88} />
      <Node
        icon={Data}
        label={labels.db}
        note={labels.dbNote}
        width={136}
        x={592}
        y={56}
      />
      <Node
        dashed
        icon={Setting2}
        label={labels.migrate}
        note={labels.migrateNote}
        width={220}
        x={404}
        y={142}
      />
      <Elbow dashed tone="muted" x1={624} x2={660} y1={174} y2={124} />
      <Note x={16} y={250}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

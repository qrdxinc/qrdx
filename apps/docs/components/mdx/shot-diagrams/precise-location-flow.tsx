import { Chart, Global, Location, Routing, Scan } from "iconsax-reactjs";
import { Arrow, Canvas, type DiagramProps, Elbow, Node, Note } from "./parts";

/** The scanner is asked first; a shared point is rounded, stored with the scan and used by area rules; everyone reaches the destination. */
export function PreciseLocationFlow({ labels }: DiagramProps) {
  return (
    <Canvas height={262} title={labels.title} width={760}>
      <Node
        icon={Scan}
        label={labels.scan}
        note={labels.scanNote}
        width={196}
        x={16}
        y={32}
      />
      <Arrow x1={216} x2={246} y1={64} y2={64} />
      <Node
        accent
        icon={Location}
        label={labels.ask}
        note={labels.askNote}
        width={236}
        x={248}
        y={32}
      />
      <Arrow tone="muted" x1={488} x2={518} y1={64} y2={64} />
      <Note anchor="middle" x={503} y={52}>
        {labels.skip}
      </Note>
      <Node
        icon={Global}
        label={labels.destination}
        note={labels.destinationNote}
        width={224}
        x={520}
        y={32}
      />

      <Arrow tone="accent" x1={366} x2={366} y1={98} y2={140} />
      <Note accent x={376} y={124}>
        {labels.allow}
      </Note>
      <Node
        icon={Chart}
        label={labels.stored}
        note={labels.storedNote}
        width={236}
        x={248}
        y={142}
      />
      <Arrow x1={488} x2={518} y1={174} y2={174} />
      <Node
        icon={Routing}
        label={labels.rule}
        note={labels.ruleNote}
        width={224}
        x={520}
        y={142}
      />
      <Elbow x1={632} x2={632} y1={140} y2={100} />
      <Note x={16} y={250}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

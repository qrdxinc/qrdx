import { Global, Link1, Scan, ShieldTick } from "iconsax-reactjs";
import { Arrow, Canvas, type DiagramProps, Node, Note, Pill } from "./parts";

/** A CNAME at the owner's DNS sends the hostname to QRdx, which answers with the code's destination. */
export function CustomDomain({ labels }: DiagramProps) {
  return (
    <Canvas height={236} title={labels.title} width={760}>
      <Node
        icon={Scan}
        label={labels.scan}
        note={labels.scanNote}
        width={176}
        x={16}
        y={40}
      />
      <Arrow x1={196} x2={222} y1={72} y2={72} />
      <Node
        accent
        icon={Global}
        label={labels.dns}
        note={labels.dnsNote}
        width={226}
        x={224}
        y={40}
      />
      <Arrow tone="accent" x1={454} x2={480} y1={72} y2={72} />
      <Node
        icon={ShieldTick}
        label={labels.qrdx}
        note={labels.qrdxNote}
        width={262}
        x={482}
        y={40}
      />
      <Pill anchor="middle" x={337} y={140}>
        {labels.record}
      </Pill>
      <Arrow x1={613} x2={613} y1={104} y2={130} />
      <Node
        icon={Link1}
        label={labels.destination}
        note={labels.destinationNote}
        width={262}
        x={482}
        y={132}
      />
      <Note x={16} y={226}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

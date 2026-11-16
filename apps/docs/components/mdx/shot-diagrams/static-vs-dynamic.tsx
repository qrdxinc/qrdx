import { DocumentText, Global, Link1, Printer, Scan } from "iconsax-reactjs";
import { Arrow, Canvas, type DiagramProps, Node, Note } from "./parts";

/** A static code holds its content; a dynamic code holds a short link that QRdx resolves. */
export function StaticVsDynamic({ labels }: DiagramProps) {
  return (
    <Canvas height={250} title={labels.title} width={760}>
      <Note x={16} y={28}>
        {labels.static}
      </Note>
      <Node
        icon={Printer}
        label={labels.printed}
        note={labels.printedNote}
        width={200}
        x={16}
        y={40}
      />
      <Arrow x1={220} x2={250} y1={72} y2={72} />
      <Node
        icon={DocumentText}
        label={labels.content}
        note={labels.contentNote}
        width={250}
        x={252}
        y={40}
      />
      <Note x={520} y={76}>
        {labels.staticEnd}
      </Note>

      <Note x={16} y={158}>
        {labels.dynamic}
      </Note>
      <Node
        icon={Scan}
        label={labels.printed}
        note={labels.printedNote}
        width={200}
        x={16}
        y={170}
      />
      <Arrow x1={220} x2={250} y1={202} y2={202} />
      <Node
        accent
        icon={Link1}
        label={labels.shortLink}
        note={labels.shortLinkNote}
        width={250}
        x={252}
        y={170}
      />
      <Arrow tone="accent" x1={506} x2={536} y1={202} y2={202} />
      <Node
        icon={Global}
        label={labels.destination}
        note={labels.destinationNote}
        width={206}
        x={538}
        y={170}
      />
    </Canvas>
  );
}

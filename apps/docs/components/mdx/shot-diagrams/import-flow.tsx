import { Global, Import, Link1, Scan } from "iconsax-reactjs";
import { Arrow, Canvas, type DiagramProps, Node, Note } from "./parts";

/** An import copies links into QRdx as dynamic codes; an optional step points the old links at them. */
export function ImportFlow({ labels }: DiagramProps) {
  return (
    <Canvas height={262} title={labels.title} width={760}>
      <Note x={16} y={28}>
        {labels.importing}
      </Note>
      <Node
        icon={Link1}
        label={labels.source}
        note={labels.sourceNote}
        width={220}
        x={16}
        y={40}
      />
      <Arrow tone="accent" x1={240} x2={270} y1={72} y2={72} />
      <Node
        accent
        icon={Import}
        label={labels.import}
        note={labels.importNote}
        width={200}
        x={272}
        y={40}
      />
      <Arrow tone="accent" x1={476} x2={506} y1={72} y2={72} />
      <Node
        icon={Scan}
        label={labels.codes}
        note={labels.codesNote}
        width={236}
        x={508}
        y={40}
      />

      <Note x={16} y={152}>
        {labels.keeping}
      </Note>
      <Node
        icon={Scan}
        label={labels.printed}
        note={labels.printedNote}
        width={220}
        x={16}
        y={164}
      />
      <Arrow dashed x1={240} x2={270} y1={196} y2={196} />
      <Node
        dashed
        icon={Link1}
        label={labels.newLink}
        note={labels.newLinkNote}
        width={200}
        x={272}
        y={164}
      />
      <Arrow x1={476} x2={506} y1={196} y2={196} />
      <Node
        icon={Global}
        label={labels.destination}
        note={labels.destinationNote}
        width={236}
        x={508}
        y={164}
      />
      <Note x={16} y={250}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

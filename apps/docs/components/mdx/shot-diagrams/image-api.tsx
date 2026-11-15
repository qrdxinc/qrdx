import { Code1, Image, ScanBarcode, Setting4 } from "iconsax-reactjs";
import { Arrow, Canvas, type DiagramProps, Node, Note, Pill } from "./parts";

/** One GET with the content and the style: QRdx encodes, renders and answers with an image anyone can embed. */
export function ImageApi({ labels }: DiagramProps) {
  return (
    <Canvas height={236} title={labels.title} width={760}>
      <Node
        accent
        icon={Code1}
        label={labels.request}
        note={labels.requestNote}
        width={236}
        x={16}
        y={40}
      />
      <Arrow tone="accent" x1={256} x2={282} y1={72} y2={72} />
      <Node
        icon={ScanBarcode}
        label={labels.encode}
        note={labels.encodeNote}
        width={180}
        x={284}
        y={40}
      />
      <Arrow x1={468} x2={494} y1={72} y2={72} />
      <Node
        icon={Setting4}
        label={labels.render}
        note={labels.renderNote}
        width={180}
        x={496}
        y={40}
      />
      <Arrow x1={586} x2={586} y1={104} y2={130} />
      <Node
        icon={Image}
        label={labels.response}
        note={labels.responseNote}
        width={248}
        x={496}
        y={132}
      />
      <Pill anchor="start" x={16} y={150}>
        {labels.example}
      </Pill>
      <Note x={16} y={190}>
        {labels.noKey}
      </Note>
      <Note x={16} y={226}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

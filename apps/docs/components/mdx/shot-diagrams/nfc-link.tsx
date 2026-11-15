import { Chart, Global, Link1, Mobile, Tag } from "iconsax-reactjs";
import {
  Arrow,
  Canvas,
  type DiagramProps,
  Elbow,
  Node,
  Note,
  Pill,
} from "./parts";

/** A tap opens the code's short link with ?nfc on the end: the same redirect as a scan, counted as a tap. */
export function NfcLink({ labels }: DiagramProps) {
  return (
    <Canvas height={250} title={labels.title} width={760}>
      <Node
        icon={Mobile}
        label={labels.tap}
        note={labels.tapNote}
        width={190}
        x={16}
        y={40}
      />
      <Arrow x1={210} x2={238} y1={72} y2={72} />
      <Node
        icon={Tag}
        label={labels.tag}
        note={labels.tagNote}
        width={180}
        x={240}
        y={40}
      />
      <Arrow tone="accent" x1={424} x2={452} y1={72} y2={72} />
      <Node
        accent
        icon={Link1}
        label={labels.link}
        note={labels.linkNote}
        width={292}
        x={454}
        y={40}
      />
      <Pill anchor="end" x={746} y={28}>
        {labels.example}
      </Pill>

      <Elbow x1={500} x2={500} y1={104} y2={140} />
      <Node
        icon={Chart}
        label={labels.counted}
        note={labels.countedNote}
        width={250}
        x={336}
        y={142}
      />
      <Elbow tone="accent" x1={672} x2={672} y1={104} y2={140} />
      <Node
        icon={Global}
        label={labels.destination}
        note={labels.destinationNote}
        width={146}
        x={600}
        y={142}
      />
      <Note x={16} y={238}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

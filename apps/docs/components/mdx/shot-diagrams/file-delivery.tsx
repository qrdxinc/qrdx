import {
  Cloud,
  DocumentUpload,
  Link1,
  Mobile,
  ShieldTick,
} from "iconsax-reactjs";
import { Arrow, Canvas, type DiagramProps, Elbow, Node, Note } from "./parts";

/** The browser uploads to the bucket, QRdx checks the file and gives it a link of its own, visitors use that link. */
export function FileDelivery({ labels }: DiagramProps) {
  return (
    <Canvas height={262} title={labels.title} width={760}>
      <Node
        icon={DocumentUpload}
        label={labels.browser}
        note={labels.browserNote}
        width={210}
        x={16}
        y={32}
      />
      <Arrow x1={230} x2={260} y1={64} y2={64} />
      <Node
        icon={Cloud}
        label={labels.bucket}
        note={labels.bucketNote}
        width={210}
        x={262}
        y={32}
      />
      <Arrow tone="accent" x1={476} x2={506} y1={64} y2={64} />
      <Node
        accent
        icon={ShieldTick}
        label={labels.check}
        note={labels.checkNote}
        width={238}
        x={508}
        y={32}
      />

      <Elbow tone="accent" x1={626} x2={626} y1={98} y2={140} />
      <Node
        icon={Link1}
        label={labels.link}
        note={labels.linkNote}
        width={238}
        x={508}
        y={142}
      />
      <Arrow x1={260} x2={504} y1={174} y2={174} />
      <Node
        icon={Mobile}
        label={labels.visitor}
        note={labels.visitorNote}
        width={242}
        x={16}
        y={142}
      />
      <Note x={16} y={250}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

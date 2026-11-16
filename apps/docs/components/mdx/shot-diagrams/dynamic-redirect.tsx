import { Chart, Global, Link1, Routing2, Scan } from "iconsax-reactjs";
import { Arrow, Canvas, type DiagramProps, Elbow, Node, Pill } from "./parts";

/** scan → short link → rules → destination, with the scan recorded on the way. */
export function DynamicRedirect({ labels }: DiagramProps) {
  return (
    <Canvas height={236} title={labels.title} width={760}>
      <Node
        icon={Scan}
        label={labels.scan}
        note={labels.scanNote}
        width={150}
        x={16}
        y={40}
      />
      <Arrow x1={170} x2={196} y1={72} y2={72} />
      <Node
        accent
        icon={Link1}
        label={labels.shortLink}
        note={labels.shortLinkNote}
        width={184}
        x={198}
        y={40}
      />
      <Arrow tone="accent" x1={386} x2={412} y1={72} y2={72} />
      <Node
        icon={Routing2}
        label={labels.rules}
        note={labels.rulesNote}
        width={160}
        x={414}
        y={40}
      />
      <Arrow x1={578} x2={604} y1={72} y2={72} />
      <Node
        icon={Global}
        label={labels.destination}
        note={labels.destinationNote}
        width={138}
        x={606}
        y={40}
      />
      <Pill anchor="middle" x={290} y={140}>
        qrdx.dev/q/k2Pm9Qa
      </Pill>
      <Elbow dashed tone="muted" x1={290} x2={290} y1={104} y2={122} />
      <Elbow dashed tone="muted" x1={494} x2={494} y1={104} y2={158} />
      <Node
        dashed
        icon={Chart}
        label={labels.recorded}
        note={labels.recordedNote}
        width={240}
        x={374}
        y={160}
      />
    </Canvas>
  );
}

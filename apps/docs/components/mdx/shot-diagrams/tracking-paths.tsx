import {
  Activity,
  Element3,
  Global,
  Receipt,
  Scan,
  ShieldTick,
} from "iconsax-reactjs";
import { Arrow, Canvas, type DiagramProps, INK, Node, Note } from "./parts";

/** A hosted page loads your pixels after consent; a website visit carries a signed scan id and reports conversions back. */
export function TrackingPaths({ labels }: DiagramProps) {
  return (
    <Canvas height={272} title={labels.title} width={760}>
      <Node
        icon={Scan}
        label={labels.scan}
        note={labels.scanNote}
        width={150}
        x={16}
        y={96}
      />
      {/* One line out of the scan that forks to the two paths. */}
      <path
        d="M166 128 H182 M182 58 V198"
        fill="none"
        stroke={INK}
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <Arrow x1={182} x2={200} y1={58} y2={58} />
      <Arrow x1={182} x2={200} y1={198} y2={198} />

      <Note x={204} y={18}>
        {labels.pagePath}
      </Note>
      <Node
        icon={Element3}
        label={labels.page}
        note={labels.pageNote}
        width={162}
        x={202}
        y={26}
      />
      <Arrow x1={368} x2={388} y1={58} y2={58} />
      <Node
        icon={ShieldTick}
        label={labels.consent}
        note={labels.consentNote}
        width={178}
        x={390}
        y={26}
      />
      <Arrow tone="accent" x1={572} x2={592} y1={58} y2={58} />
      <Node
        accent
        icon={Activity}
        label={labels.pixels}
        note={labels.pixelsNote}
        width={150}
        x={594}
        y={26}
      />

      <Note x={204} y={158}>
        {labels.sitePath}
      </Note>
      <Node
        icon={Global}
        label={labels.site}
        note={labels.siteNote}
        width={162}
        x={202}
        y={166}
      />
      <Arrow x1={368} x2={388} y1={198} y2={198} />
      <Node
        icon={Receipt}
        label={labels.convert}
        note={labels.convertNote}
        width={178}
        x={390}
        y={166}
      />
      <Arrow tone="accent" x1={572} x2={592} y1={198} y2={198} />
      <Node
        accent
        icon={Scan}
        label={labels.report}
        note={labels.reportNote}
        width={150}
        x={594}
        y={166}
      />
      <Note x={16} y={260}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

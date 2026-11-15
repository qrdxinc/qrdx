import { Edit2, Element3, Scan } from "iconsax-reactjs";
import {
  ACCENT,
  Arrow,
  Canvas,
  type DiagramProps,
  INK,
  LINE,
  MUTED,
  Node,
  Note,
  SURFACE,
  SURFACE_2,
} from "./parts";

/** You arrange blocks in the editor and publish; the printed code's short link opens the page QRdx serves. */
export function HostedPageAnatomy({ labels }: DiagramProps) {
  const blocks = [labels.block1, labels.block2, labels.block3, labels.block4];
  const phoneX = 566;
  return (
    <Canvas height={266} title={labels.title} width={760}>
      <Node
        icon={Edit2}
        label={labels.editor}
        note={labels.editorNote}
        width={190}
        x={16}
        y={40}
      />
      <Arrow tone="accent" x1={210} x2={262} y1={72} y2={72} />
      <Note accent anchor="middle" x={236} y={60}>
        {labels.publish}
      </Note>
      <Node
        accent
        icon={Element3}
        label={labels.page}
        note={labels.pageNote}
        width={236}
        x={264}
        y={40}
      />
      <Arrow x1={504} x2={phoneX - 6} y1={72} y2={72} />

      <Node
        icon={Scan}
        label={labels.code}
        note={labels.codeNote}
        width={236}
        x={264}
        y={156}
      />
      <Arrow x1={382} x2={382} y1={154} y2={108} />
      <Note x={392} y={136}>
        {labels.scan}
      </Note>

      {/* The phone a visitor holds: the page as a stack of blocks. */}
      <rect
        fill={SURFACE}
        height={216}
        rx="20"
        stroke={INK}
        strokeWidth="1.5"
        width={150}
        x={phoneX}
        y={20}
      />
      <rect fill={INK} height={5} rx="2.5" width={40} x={phoneX + 55} y={29} />
      {blocks.map((block, index) => {
        const y = 46 + index * 44;
        return (
          <g key={block}>
            <rect
              fill={index === 0 ? SURFACE : SURFACE_2}
              height={36}
              rx="8"
              stroke={index === 0 ? ACCENT : LINE}
              width={126}
              x={phoneX + 12}
              y={y}
            />
            <text
              fill={index === 0 ? INK : MUTED}
              fontSize="12"
              fontWeight={index === 0 ? 600 : 400}
              textAnchor="middle"
              x={phoneX + 75}
              y={y + 22}
            >
              {block}
            </text>
          </g>
        );
      })}
      <Note x={16} y={254}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

import { Global, Scan } from "iconsax-reactjs";
import {
  ACCENT,
  Arrow,
  Canvas,
  type DiagramProps,
  Elbow,
  INK,
  LINE,
  MUTED,
  Node,
  Note,
  SURFACE,
} from "./parts";

/** Rules are read top to bottom; the first one whose conditions hold decides, else the default destination. */
export function SmartRouting({ labels }: DiagramProps) {
  const rules = [labels.rule1, labels.rule2, labels.rule3];
  const left = 250;
  const top = 24;
  const rowHeight = 46;
  return (
    <Canvas height={236} title={labels.title} width={760}>
      <Node
        icon={Scan}
        label={labels.scan}
        note={labels.scanNote}
        width={200}
        x={16}
        y={76}
      />
      <Elbow x1={216} x2={232} y1={108} y2={top + rowHeight / 2} />
      <Arrow
        x1={232}
        x2={left - 4}
        y1={top + rowHeight / 2}
        y2={top + rowHeight / 2}
      />

      {rules.map((rule, index) => {
        const y = top + index * rowHeight;
        const match = index === 1;
        return (
          <g key={rule}>
            <rect
              fill={SURFACE}
              height={40}
              rx="10"
              stroke={match ? ACCENT : LINE}
              strokeWidth={match ? 1.5 : 1}
              width={280}
              x={left}
              y={y}
            />
            <text
              fill={match ? ACCENT : MUTED}
              fontSize="12"
              fontWeight="600"
              x={left + 14}
              y={y + 25}
            >
              {index + 1}
            </text>
            <text fill={INK} fontSize="13" x={left + 32} y={y + 25}>
              {rule}
            </text>
            {index < rules.length - 1 && (
              <Arrow
                tone="muted"
                x1={left + 140}
                x2={left + 140}
                y1={y + 40}
                y2={y + rowHeight}
              />
            )}
          </g>
        );
      })}

      <Arrow
        tone="accent"
        x1={left + 280}
        x2={left + 310}
        y1={top + rowHeight + 20}
        y2={top + rowHeight + 20}
      />
      <Node
        accent
        icon={Global}
        label={labels.firstMatch}
        note={labels.firstMatchNote}
        width={190}
        x={left + 312}
        y={top + rowHeight - 12}
      />

      <Arrow
        dashed
        tone="muted"
        x1={left + 140}
        x2={left + 140}
        y1={top + 3 * rowHeight - 6}
        y2={top + 3 * rowHeight + 30}
      />
      <Node
        dashed
        icon={Global}
        label={labels.noMatch}
        note={labels.noMatchNote}
        width={280}
        x={left}
        y={top + 3 * rowHeight + 32}
      />
      <Note x={16} y={226}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

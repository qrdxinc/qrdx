import { Folder2, Sms } from "iconsax-reactjs";
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
} from "./parts";

function FolderRow({
  x,
  y,
  width,
  label,
  shared,
}: {
  x: number;
  y: number;
  width: number;
  label: string;
  shared: boolean;
}) {
  return (
    <g>
      <rect
        fill={SURFACE}
        height={34}
        rx="8"
        stroke={shared ? ACCENT : LINE}
        strokeWidth={shared ? 1.5 : 1}
        width={width}
        x={x}
        y={y}
      />
      <g
        color={shared ? ACCENT : MUTED}
        transform={`translate(${x + 10}, ${y + 8})`}
      >
        <Folder2 aria-hidden color="currentColor" size={18} variant="Linear" />
      </g>
      <text fill={shared ? INK : MUTED} fontSize="12.5" x={x + 36} y={y + 22}>
        {label}
      </text>
    </g>
  );
}

/** You tick folders in a client's invitation; the portal shows that client those folders and nothing else. */
export function ClientPortalAccess({ labels }: DiagramProps) {
  const folders = [
    { label: labels.folder1, shared: true },
    { label: labels.folder2, shared: true },
    { label: labels.folder3, shared: false },
    { label: labels.folder4, shared: false },
  ];
  return (
    <Canvas height={262} title={labels.title} width={760}>
      <Note x={16} y={28}>
        {labels.workspace}
      </Note>
      {folders.map((folder, index) => (
        <FolderRow
          key={folder.label}
          label={folder.label}
          shared={folder.shared}
          width={200}
          x={16}
          y={40 + index * 42}
        />
      ))}

      <Arrow tone="accent" x1={220} x2={262} y1={78} y2={78} />
      <Node
        accent
        height={76}
        icon={Sms}
        label={labels.invite}
        note={labels.inviteNote}
        width={224}
        x={264}
        y={40}
      />
      <Arrow tone="accent" x1={492} x2={534} y1={78} y2={78} />

      <Note x={538} y={28}>
        {labels.portal}
      </Note>
      <rect
        fill={SURFACE}
        height={166}
        rx="12"
        stroke={LINE}
        width={206}
        x={536}
        y={40}
      />
      <text fill={INK} fontSize="13" fontWeight="600" x={550} y={64}>
        {labels.portalName}
      </text>
      {folders
        .filter((folder) => folder.shared)
        .map((folder, index) => (
          <FolderRow
            key={folder.label}
            label={folder.label}
            shared
            width={178}
            x={550}
            y={76 + index * 42}
          />
        ))}
      <text fill={MUTED} fontSize="12" x={550} y={184}>
        {labels.readOnly}
      </text>
      <Note x={16} y={250}>
        {labels.footnote}
      </Note>
    </Canvas>
  );
}

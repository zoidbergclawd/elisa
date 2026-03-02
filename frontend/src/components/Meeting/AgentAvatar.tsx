/** Themed SVG avatar icons for meeting agents. */

interface AgentAvatarProps {
  agentName: string;
  size?: number;
}

interface AgentTheme {
  color: string;
  icon: (props: { cx: number; cy: number }) => React.ReactNode;
}

/** Paint palette with brush */
function PixelIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      {/* Palette body */}
      <ellipse cx={cx} cy={cy + 1} rx={9} ry={7} fill="#fff" />
      {/* Paint dots */}
      <circle cx={cx - 4} cy={cy - 1} r={1.5} fill="#EC4899" />
      <circle cx={cx - 1} cy={cy - 3} r={1.5} fill="#F59E0B" />
      <circle cx={cx + 3} cy={cy - 1} r={1.5} fill="#3B82F6" />
      <circle cx={cx - 2} cy={cy + 3} r={1.5} fill="#10B981" />
      {/* Brush handle */}
      <rect x={cx + 5} y={cy - 6} width={3} height={8} rx={1} fill="#fff" transform={`rotate(30 ${cx + 6} ${cy - 2})`} />
    </>
  );
}

/** Film clapperboard */
function CanvasIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      {/* Board body */}
      <rect x={cx - 8} y={cy - 3} width={16} height={11} rx={1.5} fill="#fff" />
      {/* Clapper top */}
      <rect x={cx - 8} y={cy - 7} width={16} height={5} rx={1.5} fill="#fff" />
      {/* Clapper stripes */}
      <rect x={cx - 6} y={cy - 7} width={2.5} height={5} fill="#F59E0B" transform={`skewX(-10)`} />
      <rect x={cx - 1} y={cy - 7} width={2.5} height={5} fill="#F59E0B" transform={`skewX(-10)`} />
      <rect x={cx + 4} y={cy - 7} width={2.5} height={5} fill="#F59E0B" transform={`skewX(-10)`} />
    </>
  );
}

/** Open book with pencil */
function ScribeIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      {/* Left page */}
      <path d={`M${cx} ${cy - 6} L${cx - 9} ${cy - 4} L${cx - 9} ${cy + 6} L${cx} ${cy + 4} Z`} fill="#fff" opacity={0.9} />
      {/* Right page */}
      <path d={`M${cx} ${cy - 6} L${cx + 9} ${cy - 4} L${cx + 9} ${cy + 6} L${cx} ${cy + 4} Z`} fill="#fff" />
      {/* Text lines on right page */}
      <line x1={cx + 2} y1={cy - 1} x2={cx + 7} y2={cy - 1} stroke="#10B981" strokeWidth={1} />
      <line x1={cx + 2} y1={cy + 1.5} x2={cx + 6} y2={cy + 1.5} stroke="#10B981" strokeWidth={1} />
      {/* Spine */}
      <line x1={cx} y1={cy - 6} x2={cx} y2={cy + 4} stroke="#fff" strokeWidth={1.5} />
    </>
  );
}

/** Browser window with color swatch */
function StylerIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      {/* Browser frame */}
      <rect x={cx - 9} y={cy - 7} width={18} height={14} rx={2} fill="#fff" />
      {/* Title bar */}
      <rect x={cx - 9} y={cy - 7} width={18} height={4} rx={2} fill="#fff" />
      <line x1={cx - 9} y1={cy - 3} x2={cx + 9} y2={cy - 3} stroke="#EC4899" strokeWidth={0.5} />
      {/* Window dots */}
      <circle cx={cx - 6.5} cy={cy - 5} r={1} fill="#EF4444" />
      <circle cx={cx - 4} cy={cy - 5} r={1} fill="#F59E0B" />
      <circle cx={cx - 1.5} cy={cy - 5} r={1} fill="#10B981" />
      {/* Color swatches inside */}
      <rect x={cx - 6} y={cy} width={4} height={4} rx={0.5} fill="#EC4899" />
      <rect x={cx - 1} y={cy} width={4} height={4} rx={0.5} fill="#8B5CF6" />
      <rect x={cx + 4} y={cy} width={4} height={4} rx={0.5} fill="#3B82F6" />
    </>
  );
}

/** Compass / protractor */
function BlueprintIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      {/* Compass arc */}
      <path d={`M${cx - 7} ${cy + 5} A 9 9 0 0 1 ${cx + 7} ${cy + 5}`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      {/* Left leg */}
      <line x1={cx} y1={cy - 7} x2={cx - 6} y2={cy + 5} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      {/* Right leg */}
      <line x1={cx} y1={cy - 7} x2={cx + 6} y2={cy + 5} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      {/* Pivot point */}
      <circle cx={cx} cy={cy - 7} r={1.5} fill="#fff" />
    </>
  );
}

/** Two puzzle pieces connecting */
function InterfaceDesignerIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      {/* Left puzzle piece */}
      <path
        d={`M${cx - 9} ${cy - 5} h6 v2 a2 2 0 0 1 0 4 v2 h-6 z`}
        fill="#fff"
      />
      {/* Right puzzle piece */}
      <path
        d={`M${cx + 9} ${cy - 5} h-6 v2 a2 2 0 0 0 0 4 v2 h6 z`}
        fill="#fff"
        opacity={0.85}
      />
    </>
  );
}

/** Magnifying glass */
function BugDetectiveIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      {/* Glass circle */}
      <circle cx={cx - 2} cy={cy - 2} r={7} fill="none" stroke="#fff" strokeWidth={2.5} />
      {/* Handle */}
      <line x1={cx + 3} y1={cy + 3} x2={cx + 9} y2={cy + 9} stroke="#fff" strokeWidth={3} strokeLinecap="round" />
      {/* Bug icon inside glass */}
      <circle cx={cx - 2} cy={cy - 2} r={2} fill="#fff" />
    </>
  );
}

const AGENT_THEMES: Record<string, AgentTheme> = {
  pixel: { color: '#8B5CF6', icon: PixelIcon },
  canvas: { color: '#F59E0B', icon: CanvasIcon },
  scribe: { color: '#10B981', icon: ScribeIcon },
  styler: { color: '#EC4899', icon: StylerIcon },
  blueprint: { color: '#3B82F6', icon: BlueprintIcon },
  'interface designer': { color: '#14B8A6', icon: InterfaceDesignerIcon },
  'bug detective': { color: '#EF4444', icon: BugDetectiveIcon },
};

export default function AgentAvatar({ agentName, size = 40 }: AgentAvatarProps) {
  const theme = AGENT_THEMES[agentName.toLowerCase()];

  if (!theme) {
    // Fallback: letter circle for unknown agents
    const scale = size / 40;
    return (
      <div
        style={{ width: size, height: size, fontSize: 14 * scale }}
        className="rounded-full bg-gray-500/30 flex items-center justify-center text-gray-300 font-bold shrink-0"
      >
        {agentName.charAt(0).toUpperCase()}
      </div>
    );
  }

  const cx = 20;
  const cy = 20;

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role="img"
      aria-label={`${agentName} avatar`}
      className="shrink-0"
    >
      <circle cx={cx} cy={cy} r={20} fill={theme.color} />
      <theme.icon cx={cx} cy={cy} />
    </svg>
  );
}

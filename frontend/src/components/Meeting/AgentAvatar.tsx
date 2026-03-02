/** SVG avatar icons for meeting agents. */

import pixelSvg from '../../../assets/pixel.svg';
import canvasSvg from '../../../assets/canvas.svg';
import scribeSvg from '../../../assets/scribe.svg';
import stylerSvg from '../../../assets/styler.svg';
import interfaceDesignerSvg from '../../../assets/interface-designer.svg';
import bugDetectiveSvg from '../../../assets/bug-detective.svg';

interface AgentAvatarProps {
  agentName: string;
  size?: number;
}

const AGENT_AVATARS: Record<string, string> = {
  pixel: pixelSvg,
  canvas: canvasSvg,
  scribe: scribeSvg,
  styler: stylerSvg,
  blueprint: '', // no custom SVG yet
  'interface designer': interfaceDesignerSvg,
  'bug detective': bugDetectiveSvg,
};

const AGENT_COLORS: Record<string, string> = {
  pixel: '#8B5CF6',
  canvas: '#F59E0B',
  scribe: '#10B981',
  styler: '#EC4899',
  blueprint: '#3B82F6',
  'interface designer': '#14B8A6',
  'bug detective': '#EF4444',
};

export default function AgentAvatar({ agentName, size = 40 }: AgentAvatarProps) {
  const key = agentName.toLowerCase();
  const svg = AGENT_AVATARS[key];
  const color = AGENT_COLORS[key];

  if (svg) {
    return (
      <img
        src={svg}
        alt={`${agentName} avatar`}
        width={size}
        height={size}
        className="shrink-0 rounded-full"
        draggable={false}
      />
    );
  }

  // Fallback: colored letter circle (used for Blueprint + unknown agents)
  const scale = size / 40;
  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize: 14 * scale,
        backgroundColor: color || undefined,
      }}
      className={`rounded-full ${color ? '' : 'bg-gray-500/30'} flex items-center justify-center text-white font-bold shrink-0`}
    >
      {agentName.charAt(0).toUpperCase()}
    </div>
  );
}

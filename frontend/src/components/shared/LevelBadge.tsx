import type { SystemLevel } from '../../types';

interface LevelBadgeProps {
  level: SystemLevel;
}

const LEVEL_CONFIG: Record<SystemLevel, { label: string; icon: string; description: string; className: string }> = {
  explorer: {
    label: 'Explorer',
    icon: '\uD83D\uDD0D', // magnifying glass
    description: 'See how systems work -- everything is automatic and explained',
    className: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  builder: {
    label: 'Builder',
    icon: '\uD83D\uDD27', // wrench
    description: 'Understand and control systems -- you decide what to test and when',
    className: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  architect: {
    label: 'Architect',
    icon: '\uD83D\uDCD0', // triangular ruler
    description: 'Design your own systems -- nothing is automatic, everything is your choice',
    className: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
};

export default function LevelBadge({ level }: LevelBadgeProps) {
  const config = LEVEL_CONFIG[level];

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${config.className}`}
      title={config.description}
      role="status"
      aria-label={`System level: ${config.label}`}
    >
      <span aria-hidden="true">{config.icon}</span>
      <span>{config.label}</span>
    </div>
  );
}

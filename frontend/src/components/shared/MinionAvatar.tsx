import type { Agent } from '../../types';

import elisaSvg from '../../../assets/elisa.svg';
import builderSvg from '../../../assets/builder.svg';
import testerSvg from '../../../assets/tester.svg';
import reviewerSvg from '../../../assets/reviewer.svg';

type MinionRole = Agent['role'] | 'narrator';
type MinionStatus = Agent['status'] | 'waiting';

interface MinionAvatarProps {
  name: string;
  role: MinionRole;
  status: MinionStatus;
  size?: 'sm' | 'md' | 'lg';
}

const ROLE_SVGS: Record<string, string> = {
  narrator: elisaSvg,
  builder: builderSvg,
  tester: testerSvg,
  reviewer: reviewerSvg,
};

const ROLE_COLORS: Record<string, string> = {
  narrator: 'bg-amber-500',
  builder: 'bg-accent-sky',
  tester: 'bg-accent-mint',
  reviewer: 'bg-accent-lavender',
  custom: 'bg-accent-coral',
};

const ROLE_GLOWS: Record<string, string> = {
  narrator: 'shadow-amber-500/30',
  builder: 'glow-sky',
  tester: 'glow-mint',
  reviewer: 'glow-lavender',
  custom: 'glow-coral',
};

const STATUS_CLASSES: Record<string, string> = {
  idle: 'minion-idle',
  working: 'minion-working',
  done: 'ring-2 ring-accent-mint/50',
  error: 'minion-error',
  waiting: 'minion-waiting',
};

const SIZE_CLASSES: Record<string, string> = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-12 h-12 text-lg',
};

export default function MinionAvatar({ name, role, status, size = 'md' }: MinionAvatarProps) {
  const svg = ROLE_SVGS[role];
  const initial = name.charAt(0).toUpperCase();
  const baseColor = status === 'error' ? 'bg-accent-coral' : (ROLE_COLORS[role] || ROLE_COLORS.custom);
  const glowClass = status === 'working' ? (ROLE_GLOWS[role] || '') : '';
  const statusClass = STATUS_CLASSES[status] || '';
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  return (
    <>
      <style>{`
        @keyframes minion-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes minion-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        @keyframes minion-sway {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        .minion-idle {
          opacity: 0.6;
          filter: saturate(0.7);
        }
        .minion-working {
          animation: minion-bounce 1s ease-in-out infinite;
        }
        .minion-error {
          animation: minion-shake 0.4s ease-in-out infinite;
          filter: hue-rotate(-20deg) saturate(1.5);
        }
        .minion-waiting {
          animation: minion-sway 2s ease-in-out infinite;
          opacity: 0.7;
          filter: saturate(0.8);
        }
        @media (prefers-reduced-motion: reduce) {
          .minion-working,
          .minion-error,
          .minion-waiting {
            animation: none;
          }
        }
      `}</style>
      <div
        className={`relative inline-flex items-center justify-center rounded-full overflow-hidden ${statusClass} ${glowClass} ${sizeClass} ${svg ? '' : `${baseColor} text-white font-display font-bold`}`}
      >
        {svg ? (
          <img src={svg} alt={name} className="w-full h-full object-cover" draggable={false} />
        ) : (
          initial
        )}
        {status === 'done' && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-accent-mint rounded-full border-2 border-atelier-surface flex items-center justify-center text-[8px] text-white">
            &#10003;
          </span>
        )}
      </div>
    </>
  );
}

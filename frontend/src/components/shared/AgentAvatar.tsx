import type { Agent } from '../../types';

interface AgentAvatarProps {
  name: string;
  role: Agent['role'];
  status: Agent['status'];
  size?: 'sm' | 'md';
}

const ROLE_COLORS: Record<string, string> = {
  builder: 'bg-blue-500',
  tester: 'bg-green-500',
  reviewer: 'bg-purple-500',
  custom: 'bg-orange-500',
};

const STATUS_CLASSES: Record<string, string> = {
  idle: 'opacity-60',
  working: 'animate-bounce ring-2 ring-offset-1 ring-blue-300',
  done: 'ring-2 ring-green-400',
  error: 'bg-red-500 animate-pulse',
};

export default function AgentAvatar({ name, role, status, size = 'md' }: AgentAvatarProps) {
  const initial = name.charAt(0).toUpperCase();
  const baseColor = status === 'error' ? 'bg-red-500' : (ROLE_COLORS[role] || ROLE_COLORS.custom);
  const statusClass = STATUS_CLASSES[status] || '';
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';

  return (
    <div className={`relative inline-flex items-center justify-center rounded-full text-white font-bold ${baseColor} ${statusClass} ${sizeClass}`}>
      {initial}
      {status === 'done' && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border border-white flex items-center justify-center text-[8px]">
          &#10003;
        </span>
      )}
    </div>
  );
}

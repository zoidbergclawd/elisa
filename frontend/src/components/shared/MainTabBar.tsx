import type { Task, Agent } from '../../types';

export type MainTab = 'workspace' | 'mission' | 'tests' | 'team';

interface MainTabBarProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  tasks: Task[];
  agents: Agent[];
  pendingInviteCount?: number;
  failingTestCount?: number;
}

export default function MainTabBar({ activeTab, onTabChange, tasks, agents, pendingInviteCount, failingTestCount }: MainTabBarProps) {
  const workingAgents = agents.filter(a => a.status === 'working').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;

  return (
    <nav className="flex items-center gap-1">
      <TabButton
        label="Workspace"
        active={activeTab === 'workspace'}
        onClick={() => onTabChange('workspace')}
      />
      <TabButton
        label="Mission Control"
        active={activeTab === 'mission'}
        onClick={() => onTabChange('mission')}
        badge={(workingAgents + inProgressTasks) > 0 ? workingAgents + inProgressTasks : undefined}
      />
      <TabButton
        label="Tests"
        active={activeTab === 'tests'}
        onClick={() => onTabChange('tests')}
        badge={failingTestCount && failingTestCount > 0 ? failingTestCount : undefined}
        badgeColor="bg-accent-coral"
      />
      <TabButton
        label="Team"
        active={activeTab === 'team'}
        onClick={() => onTabChange('team')}
        badge={pendingInviteCount && pendingInviteCount > 0 ? pendingInviteCount : undefined}
      />
    </nav>
  );
}

function TabButton({ label, active, onClick, badge, badgeColor }: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  badgeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
        active
          ? 'bg-accent-lavender/20 text-accent-lavender'
          : 'text-atelier-text-muted hover:text-atelier-text-secondary hover:bg-atelier-surface/60'
      }`}
    >
      {label}
      {badge !== undefined && (
        <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full ${badgeColor || 'bg-accent-sky'} text-white text-[10px] font-bold px-1`}>
          {badge}
        </span>
      )}
    </button>
  );
}

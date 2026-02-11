import { useState } from 'react';
import type { ProjectSpec } from '../BlockCanvas/blockInterpreter';
import type { UIState, Task, Agent, WSEvent, TokenUsage } from '../../types';
import TaskDAG from './TaskDAG';
import CommsFeed from './CommsFeed';
import MetricsPanel from './MetricsPanel';
import AgentAvatar from '../shared/AgentAvatar';

interface MissionControlProps {
  spec: ProjectSpec | null;
  tasks: Task[];
  agents: Agent[];
  events: WSEvent[];
  uiState: UIState;
  tokenUsage: TokenUsage;
  deployProgress?: { step: string; progress: number } | null;
}

const STATUS_DOT: Record<string, string> = {
  idle: 'bg-gray-400',
  working: 'bg-blue-500 animate-pulse',
  done: 'bg-green-500',
  error: 'bg-red-500',
};

export default function MissionControl({ spec, tasks, agents, events, uiState, tokenUsage, deployProgress }: MissionControlProps) {
  const [debugOpen, setDebugOpen] = useState(false);

  const displayAgents = agents.length > 0 ? agents : (spec?.agents ?? []).map(a => ({
    ...a,
    status: 'idle' as const,
  }));

  const doneCount = tasks.filter(t => t.status === 'done').length;
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const isPlanning = uiState === 'building' && tasks.length === 0;

  const currentTask = tasks.find(t => t.status === 'in_progress');
  const isDeploying = uiState === 'building' && deployProgress != null;

  const getPhaseText = () => {
    if (uiState === 'done') return 'Done!';
    if (isDeploying) return deployProgress!.step;
    if (isPlanning) return 'Planning...';
    if (totalCount > 0) {
      const inProgress = tasks.find(t => t.status === 'in_progress');
      if (inProgress) return `Building (${doneCount}/${totalCount})... ${inProgress.name}`;
      return `Building (${doneCount}/${totalCount})...`;
    }
    return `State: ${uiState}`;
  };

  const getProgressBarColor = () => {
    if (uiState === 'done') return 'bg-green-500';
    if (isDeploying) return 'bg-purple-500';
    if (tasks.some(t => t.status === 'failed')) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold">Mission Control</h2>

      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Agent Team</h3>
        {displayAgents.length ? (
          <ul className="text-sm space-y-1">
            {displayAgents.map((a, i) => (
              <li key={i} className="flex items-center gap-2 px-2 py-1 bg-orange-50 rounded">
                <AgentAvatar name={a.name} role={a.role as Agent['role']} status={a.status as Agent['status']} size="sm" />
                <span>{a.name} ({a.role})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No agents added yet</p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Task Map</h3>
        {tasks.length > 0 ? (
          <TaskDAG tasks={tasks} />
        ) : (
          <p className="text-sm text-gray-400">Tasks will appear here during a build</p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Progress</h3>
        {isDeploying ? (
          <div>
            <p className="text-sm text-purple-600 font-medium mb-1">{getPhaseText()}</p>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${getProgressBarColor()} transition-all duration-300`}
                style={{ width: `${deployProgress!.progress}%` }}
              />
            </div>
          </div>
        ) : isPlanning ? (
          <p className="text-sm text-blue-500 font-medium">{getPhaseText()}</p>
        ) : totalCount > 0 ? (
          <div>
            <p className="text-sm text-gray-600 mb-1">{getPhaseText()}</p>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${getProgressBarColor()} transition-all duration-300`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : uiState === 'done' ? (
          <p className="text-sm text-green-600 font-bold">{getPhaseText()}</p>
        ) : (
          <p className="text-sm text-gray-400">{getPhaseText()}</p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Comms Feed</h3>
        <CommsFeed events={events} />
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Token Usage</h3>
        <MetricsPanel tokenUsage={tokenUsage} />
      </section>

      <section>
        <button
          onClick={() => setDebugOpen(!debugOpen)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          {debugOpen ? 'Hide' : 'Show'} Debug Spec
        </button>
        {debugOpen && spec && (
          <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-64">
            {JSON.stringify(spec, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}

import { useState } from 'react';
import { useBuildSessionContext } from '../../contexts/BuildSessionContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import type { Task, TestResult } from '../../types';

const STATUS_BADGE: Record<Task['status'], { bg: string; text: string; label: string }> = {
  done: { bg: 'bg-green-500/20 border-green-500/30', text: 'text-green-400', label: 'Done' },
  in_progress: { bg: 'bg-blue-500/20 border-blue-500/30', text: 'text-blue-400', label: 'In Progress' },
  pending: { bg: 'bg-gray-500/20 border-gray-500/30', text: 'text-gray-400', label: 'Pending' },
  failed: { bg: 'bg-red-500/20 border-red-500/30', text: 'text-red-400', label: 'Failed' },
};

function SummaryBar({ tasks, testResults, healthUpdate }: {
  tasks: Task[];
  testResults: TestResult[];
  healthUpdate: { tasks_done: number; tasks_total: number; tests_passing: number; tests_total: number; health_score: number } | null;
}) {
  const tasksDone = healthUpdate?.tasks_done ?? tasks.filter(t => t.status === 'done').length;
  const tasksTotal = healthUpdate?.tasks_total ?? tasks.length;
  const testsPassing = healthUpdate?.tests_passing ?? testResults.filter(t => t.passed).length;
  const testsTotal = healthUpdate?.tests_total ?? testResults.length;
  const healthScore = healthUpdate?.health_score ?? null;

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10" data-testid="summary-bar">
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-atelier-text-muted">Tasks</span>
        <span className="font-semibold text-atelier-text">{tasksDone}/{tasksTotal}</span>
      </div>
      <div className="w-px h-4 bg-white/10" />
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-atelier-text-muted">Tests</span>
        <span className="font-semibold text-atelier-text">{testsPassing}/{testsTotal}</span>
      </div>
      {healthScore !== null && (
        <>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-atelier-text-muted">Health</span>
            <span className={`font-semibold ${healthScore >= 80 ? 'text-green-400' : healthScore >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {healthScore}%
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function TaskCard({ task, isSelected, onClick }: {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
}) {
  const badge = STATUS_BADGE[task.status];
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer ${
        isSelected
          ? 'bg-accent-lavender/10 border-accent-lavender/30'
          : 'bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/15'
      }`}
      data-testid={`task-card-${task.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-atelier-text truncate flex-1">{task.name}</span>
        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border flex-shrink-0 ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
      </div>
      {task.agent_name && (
        <div className="text-xs text-atelier-text-muted mt-1 truncate">{task.agent_name}</div>
      )}
    </button>
  );
}

function TaskDetail({ task, testResults }: { task: Task; testResults: TestResult[] }) {
  const badge = STATUS_BADGE[task.status];
  // Show test results whose name contains the task name or id (simple heuristic)
  const relatedTests = testResults.filter(t =>
    t.test_name.toLowerCase().includes(task.name.toLowerCase()) ||
    t.test_name.toLowerCase().includes(task.id.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4" data-testid="task-detail">
      <div>
        <h3 className="text-base font-semibold text-atelier-text">{task.name}</h3>
        <span className={`inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border mt-1.5 ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
      </div>

      {task.description && (
        <div>
          <h4 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-1">Description</h4>
          <p className="text-sm text-atelier-text/80">{task.description}</p>
        </div>
      )}

      {task.agent_name && (
        <div>
          <h4 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-1">Agent</h4>
          <p className="text-sm text-atelier-text">{task.agent_name}</p>
        </div>
      )}

      {task.acceptance_criteria && task.acceptance_criteria.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-1">Acceptance Criteria</h4>
          <ul className="space-y-1">
            {task.acceptance_criteria.map((c, i) => (
              <li key={i} className="text-sm text-atelier-text/80 flex items-start gap-1.5">
                <span className="text-atelier-text-muted mt-0.5 flex-shrink-0">{'\u2022'}</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {relatedTests.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-1">Test Results</h4>
          <div className="space-y-1">
            {relatedTests.map((t, i) => (
              <div key={i} className={`text-sm flex items-center gap-1.5 ${t.passed ? 'text-green-400' : 'text-red-400'}`}>
                <span>{t.passed ? '\u2713' : '\u2717'}</span>
                <span className="truncate">{t.test_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {task.dependencies.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-1">Dependencies</h4>
          <p className="text-sm text-atelier-text/60">{task.dependencies.join(', ')}</p>
        </div>
      )}
    </div>
  );
}

function SpecView({ spec }: { spec: { nugget: { goal: string; description: string; type: string }; requirements: Array<{ type: string; description: string }>; agents: Array<{ name: string; role: string }>; deployment: { target: string }; portals?: Array<{ id: string; name: string }>; devices?: Array<{ pluginId: string; instanceId: string }> } }) {
  return (
    <div className="flex flex-col gap-4" data-testid="spec-view">
      <div className="rounded-lg bg-white/5 border border-white/10 p-4">
        <h3 className="text-base font-semibold text-atelier-text mb-1">{spec.nugget.goal}</h3>
        {spec.nugget.description && (
          <p className="text-sm text-atelier-text/70">{spec.nugget.description}</p>
        )}
        <span className="inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border bg-accent-lavender/15 border-accent-lavender/25 text-accent-lavender mt-2">
          {spec.nugget.type}
        </span>
      </div>

      {spec.requirements.length > 0 && (
        <div className="rounded-lg bg-white/5 border border-white/10 p-4">
          <h4 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-2">Requirements ({spec.requirements.length})</h4>
          <ul className="space-y-1.5">
            {spec.requirements.map((r, i) => (
              <li key={i} className="text-sm text-atelier-text/80 flex items-start gap-2">
                <span className="text-accent-sky text-[10px] uppercase font-semibold bg-accent-sky/10 border border-accent-sky/20 rounded px-1 py-0.5 flex-shrink-0 mt-0.5">{r.type}</span>
                <span>{r.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {spec.agents.length > 0 && (
        <div className="rounded-lg bg-white/5 border border-white/10 p-4">
          <h4 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-2">Agents ({spec.agents.length})</h4>
          <div className="flex flex-wrap gap-2">
            {spec.agents.map((a, i) => (
              <span key={i} className="text-sm bg-accent-mint/10 border border-accent-mint/20 text-accent-mint rounded-lg px-2.5 py-1">
                {a.name} <span className="text-[10px] opacity-70">({a.role})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-white/5 border border-white/10 p-4">
        <h4 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-2">Deployment</h4>
        <span className="text-sm text-atelier-text">{spec.deployment.target || 'Not set'}</span>
      </div>

      {spec.portals && spec.portals.length > 0 && (
        <div className="rounded-lg bg-white/5 border border-white/10 p-4">
          <h4 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-2">Portals ({spec.portals.length})</h4>
          <div className="flex flex-wrap gap-2">
            {spec.portals.map((p) => (
              <span key={p.id} className="text-sm bg-accent-gold/10 border border-accent-gold/20 text-accent-gold rounded-lg px-2.5 py-1">
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {spec.devices && spec.devices.length > 0 && (
        <div className="rounded-lg bg-white/5 border border-white/10 p-4">
          <h4 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-2">Devices ({spec.devices.length})</h4>
          <div className="flex flex-wrap gap-2">
            {spec.devices.map((d) => (
              <span key={d.instanceId} className="text-sm bg-white/10 border border-white/15 text-atelier-text rounded-lg px-2.5 py-1">
                {d.pluginId}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SystemPanel() {
  const { tasks, testResults, healthUpdate, uiState } = useBuildSessionContext();
  const { spec } = useWorkspaceContext();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const hasBuildData = tasks.length > 0;
  const isPreBuild = !hasBuildData && (uiState === 'design' || uiState === 'building');

  // Pre-build: show spec structure
  if (isPreBuild && spec) {
    return (
      <div className="h-full flex flex-col p-5 gap-4 overflow-auto" data-testid="system-spec">
        <h2 className="text-xs font-semibold text-accent-lavender uppercase tracking-wider">Nugget Spec</h2>
        <SpecView spec={spec} />
      </div>
    );
  }

  // No data at all
  if (!hasBuildData && !spec) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="system-empty">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3 opacity-30">{'\u2B21'}</div>
          <p className="text-sm text-atelier-text-muted">
            Architecture overview will appear here once a build begins or a spec is loaded.
          </p>
        </div>
      </div>
    );
  }

  // During/post-build: architecture explorer
  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;

  return (
    <div className="h-full flex flex-col p-5 gap-4" data-testid="system-architecture">
      <SummaryBar tasks={tasks} testResults={testResults} healthUpdate={healthUpdate} />

      <div className="flex-1 min-h-0 flex gap-4">
        {/* Left column: task list */}
        <div className="w-64 flex-shrink-0 flex flex-col min-h-0">
          <h3 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-2 px-1">
            Tasks ({tasks.length})
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                isSelected={selectedTaskId === task.id}
                onClick={() => setSelectedTaskId(prev => prev === task.id ? null : task.id)}
              />
            ))}
          </div>
        </div>

        {/* Right panel: task detail */}
        <div className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 p-4 overflow-y-auto">
          {selectedTask ? (
            <TaskDetail task={selectedTask} testResults={testResults} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-atelier-text-muted" data-testid="select-task-prompt">
                Select a task to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

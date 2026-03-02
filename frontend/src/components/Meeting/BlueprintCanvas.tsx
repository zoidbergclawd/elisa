/** Blueprint canvas -- system overview walkthrough for Architecture Agent meetings. */

import { useState } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';

interface TaskSummary {
  id: string;
  name: string;
  agent: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  acceptance_criteria?: string;
}

interface RequirementSummary {
  id: string;
  description: string;
  verified: 'passing' | 'failing' | 'untested';
}

interface SystemStats {
  total_tasks: number;
  tasks_done: number;
  tests_passing: number;
  tests_total: number;
  health_score: number;
}

function parseTasks(data: Record<string, unknown>): TaskSummary[] {
  if (!Array.isArray(data.tasks)) return [];
  return data.tasks.map((t: unknown) => {
    const task = t as Record<string, unknown>;
    return {
      id: String(task.id ?? ''),
      name: String(task.name ?? ''),
      agent: String(task.agent ?? ''),
      status: (['pending', 'running', 'done', 'failed'].includes(String(task.status))
        ? String(task.status)
        : 'pending') as TaskSummary['status'],
      acceptance_criteria: task.acceptance_criteria ? String(task.acceptance_criteria) : undefined,
    };
  });
}

function parseRequirements(data: Record<string, unknown>): RequirementSummary[] {
  if (!Array.isArray(data.requirements)) return [];
  return data.requirements.map((r: unknown) => {
    const req = r as Record<string, unknown>;
    return {
      id: String(req.id ?? ''),
      description: String(req.description ?? ''),
      verified: (['passing', 'failing', 'untested'].includes(String(req.verified))
        ? String(req.verified)
        : 'untested') as RequirementSummary['verified'],
    };
  });
}

function parseStats(data: Record<string, unknown>): SystemStats | null {
  if (data.total_tasks == null) return null;
  return {
    total_tasks: Number(data.total_tasks ?? 0),
    tasks_done: Number(data.tasks_done ?? 0),
    tests_passing: Number(data.tests_passing ?? 0),
    tests_total: Number(data.tests_total ?? 0),
    health_score: Number(data.health_score ?? 0),
  };
}

const STATUS_COLORS: Record<TaskSummary['status'], string> = {
  pending: 'bg-gray-500/20 text-gray-400',
  running: 'bg-blue-500/20 text-blue-400',
  done: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
};

const VERIFIED_DOTS: Record<RequirementSummary['verified'], string> = {
  passing: 'bg-green-400',
  failing: 'bg-red-400',
  untested: 'bg-amber-400',
};

function BlueprintCanvas({ canvasState }: CanvasProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const tasks = parseTasks(canvasState.data);
  const requirements = parseRequirements(canvasState.data);
  const stats = parseStats(canvasState.data);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="flex flex-col h-full" data-testid="blueprint-canvas">
      <div className="mb-4">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          System Blueprint
        </h3>
        <p className="text-sm text-atelier-text-secondary mt-1">
          Here's how your project was built. Click a task to learn more!
        </p>
      </div>

      {/* System Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4" data-testid="system-stats">
          <div className="rounded-xl bg-atelier-surface p-3 border border-border-subtle text-center">
            <p className="text-2xl font-bold text-atelier-text">{stats.tasks_done}/{stats.total_tasks}</p>
            <p className="text-xs text-atelier-text-secondary">Tasks Done</p>
          </div>
          <div className="rounded-xl bg-atelier-surface p-3 border border-border-subtle text-center">
            <p className="text-2xl font-bold text-atelier-text">{stats.tests_passing}/{stats.tests_total}</p>
            <p className="text-xs text-atelier-text-secondary">Tests Passing</p>
          </div>
          <div className="rounded-xl bg-atelier-surface p-3 border border-border-subtle text-center">
            <p className="text-2xl font-bold text-atelier-text">{stats.health_score}</p>
            <p className="text-xs text-atelier-text-secondary">Health Score</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Tasks list */}
          <div>
            <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-2">
              Tasks
            </p>
            {tasks.length > 0 ? (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedTaskId(task.id === selectedTaskId ? null : task.id)}
                    className={`w-full text-left rounded-xl p-3 border transition-all cursor-pointer ${
                      selectedTaskId === task.id
                        ? 'border-accent-sky bg-accent-sky/10'
                        : 'border-border-subtle bg-atelier-surface hover:bg-atelier-surface/70'
                    }`}
                    aria-label={`View task: ${task.name}`}
                    aria-pressed={selectedTaskId === task.id}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-atelier-text truncate">{task.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status]}`}>
                        {task.status}
                      </span>
                    </div>
                    <p className="text-xs text-atelier-text-muted mt-1">{task.agent}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-atelier-surface p-4 border border-border-subtle text-center">
                <p className="text-sm text-atelier-text-muted">
                  Waiting for Blueprint to share the task overview...
                </p>
              </div>
            )}
          </div>

          {/* Requirements + selected task detail */}
          <div className="space-y-4">
            {/* Selected task detail */}
            {selectedTask && (
              <div className="rounded-xl bg-accent-sky/5 p-3 border border-accent-sky/20" data-testid="task-detail">
                <p className="text-xs font-semibold text-accent-sky uppercase tracking-wide mb-1">
                  Task Detail
                </p>
                <p className="text-sm font-medium text-atelier-text">{selectedTask.name}</p>
                <p className="text-xs text-atelier-text-secondary mt-1">
                  Agent: {selectedTask.agent}
                </p>
                {selectedTask.acceptance_criteria && (
                  <div className="mt-2">
                    <p className="text-xs text-atelier-text-secondary">Acceptance Criteria:</p>
                    <p className="text-sm text-atelier-text mt-1">{selectedTask.acceptance_criteria}</p>
                  </div>
                )}
              </div>
            )}

            {/* Requirements */}
            <div>
              <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-2">
                Requirements
              </p>
              {requirements.length > 0 ? (
                <div className="space-y-2">
                  {requirements.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-start gap-2 rounded-xl bg-atelier-surface p-3 border border-border-subtle"
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${VERIFIED_DOTS[req.verified]}`}
                        aria-label={`Status: ${req.verified}`}
                      />
                      <p className="text-sm text-atelier-text">{req.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-atelier-surface p-4 border border-border-subtle text-center">
                  <p className="text-sm text-atelier-text-muted">
                    No requirements data yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Register in the canvas registry
registerCanvas('blueprint', BlueprintCanvas);

export default BlueprintCanvas;

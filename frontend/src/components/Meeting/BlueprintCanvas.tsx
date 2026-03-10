/** Blueprint canvas -- interactive architecture explorer for end-of-build summary. */

import { useState } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';
import HealthGradeCard from '../shared/HealthGradeCard';

interface TaskSummary {
  id: string;
  name: string;
  agent: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  description?: string;
  acceptance_criteria?: string;
}

interface TestSummary {
  name: string;
  passed: boolean;
  details?: string;
}

interface HealthInfo {
  grade: string;
  score: number;
  breakdown: { tasks_score: number; tests_score: number; corrections_score: number; budget_score: number };
}

interface ArchitectureInfo {
  complexity: string;
  input_count: number;
  output_count: number;
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
      name: String(task.name ?? task.title ?? ''),
      agent: String(task.agent ?? ''),
      status: (['pending', 'running', 'done', 'failed'].includes(String(task.status))
        ? String(task.status)
        : 'pending') as TaskSummary['status'],
      description: task.description ? String(task.description) : undefined,
      acceptance_criteria: task.acceptance_criteria ? String(task.acceptance_criteria) : undefined,
    };
  });
}

function parseTests(data: Record<string, unknown>): TestSummary[] {
  if (!Array.isArray(data.tests)) return [];
  return data.tests.map((t: unknown) => {
    const test = t as Record<string, unknown>;
    return {
      name: String(test.name ?? ''),
      passed: Boolean(test.passed),
      details: test.details ? String(test.details) : undefined,
    };
  });
}

function parseHealthInfo(data: Record<string, unknown>): HealthInfo | null {
  if (!data.health_grade || !data.health_breakdown) return null;
  const bd = data.health_breakdown as Record<string, unknown>;
  return {
    grade: String(data.health_grade),
    score: Number(data.health_score ?? 0),
    breakdown: {
      tasks_score: Number(bd.tasks_score ?? 0),
      tests_score: Number(bd.tests_score ?? 0),
      corrections_score: Number(bd.corrections_score ?? 0),
      budget_score: Number(bd.budget_score ?? 0),
    },
  };
}

function parseArchitectureInfo(data: Record<string, unknown>): ArchitectureInfo | null {
  if (!data.complexity) return null;
  return {
    complexity: String(data.complexity),
    input_count: Array.isArray(data.system_inputs) ? data.system_inputs.length : 0,
    output_count: Array.isArray(data.system_outputs) ? data.system_outputs.length : 0,
  };
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

const STATUS_BADGE: Record<TaskSummary['status'], { bg: string; label: string }> = {
  done: { bg: 'bg-green-500/20 text-green-400', label: 'done' },
  running: { bg: 'bg-blue-500/20 text-blue-400', label: 'in progress' },
  failed: { bg: 'bg-red-500/20 text-red-400', label: 'failed' },
  pending: { bg: 'bg-gray-500/20 text-gray-400', label: 'pending' },
};

function BlueprintCanvas({ canvasState }: CanvasProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const tasks = parseTasks(canvasState.data);
  const tests = parseTests(canvasState.data);
  const stats = parseStats(canvasState.data);
  const healthInfo = parseHealthInfo(canvasState.data);
  const archInfo = parseArchitectureInfo(canvasState.data);
  const failingTests = tests.filter(t => !t.passed);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  // Match tests to selected task by checking if the test name contains a word from the task name
  const matchedTests = (() => {
    if (!selectedTask) return [];
    const keywords = selectedTask.name
      .toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 2);
    if (keywords.length === 0) return tests;
    return tests.filter((test: { name: string }) => {
      const lower = test.name.toLowerCase();
      return keywords.some((kw: string) => lower.includes(kw));
    });
  })();

  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="blueprint-canvas">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          Build Explorer
        </h3>
        <p className="text-sm text-atelier-text-secondary mt-1">
          Here's how your project was built. Click a task to explore!
        </p>
      </div>

      {/* Health grade or legacy stats bar */}
      {healthInfo ? (
        <div className="mb-4" data-testid="health-grade-section">
          <HealthGradeCard
            grade={healthInfo.grade}
            score={healthInfo.score}
            breakdown={healthInfo.breakdown}
            compact
          />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-3 gap-3 mb-4" data-testid="system-stats">
          <div className="rounded-xl bg-atelier-surface/60 backdrop-blur-sm p-3 border border-border-subtle text-center">
            <p className="text-2xl font-bold text-atelier-text">{stats.tasks_done}/{stats.total_tasks}</p>
            <p className="text-xs text-atelier-text-secondary">Tasks Done</p>
          </div>
          <div className="rounded-xl bg-atelier-surface/60 backdrop-blur-sm p-3 border border-border-subtle text-center">
            <p className="text-2xl font-bold text-atelier-text">{stats.tests_passing}/{stats.tests_total}</p>
            <p className="text-xs text-atelier-text-secondary">Tests Passing</p>
          </div>
          <div className="rounded-xl bg-atelier-surface/60 backdrop-blur-sm p-3 border border-border-subtle text-center">
            <p className="text-2xl font-bold text-atelier-text">{stats.health_score}</p>
            <p className="text-xs text-atelier-text-secondary">Health Score</p>
          </div>
        </div>
      ) : null}

      {/* Architecture summary */}
      {archInfo && (
        <div className="flex items-center gap-3 mb-4 rounded-xl bg-atelier-surface/60 backdrop-blur-sm px-4 py-2.5 border border-border-subtle" data-testid="architecture-summary">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            archInfo.complexity === 'simple' ? 'bg-green-500/20 text-green-400' :
            archInfo.complexity === 'complex' ? 'bg-red-500/20 text-red-400' :
            'bg-yellow-500/20 text-yellow-400'
          }`}>
            {archInfo.complexity}
          </span>
          <span className="text-xs text-atelier-text-secondary">
            {archInfo.input_count} input{archInfo.input_count !== 1 ? 's' : ''}, {archInfo.output_count} output{archInfo.output_count !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Failing tests banner */}
      {failingTests.length > 0 && (
        <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3" data-testid="failing-tests-banner">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">
            Failing Tests ({failingTests.length})
          </p>
          <div className="space-y-1.5">
            {failingTests.map((test, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 mt-1" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-atelier-text truncate">{test.name}</p>
                  {test.details && (
                    <p className="text-xs text-atelier-text-muted mt-0.5 truncate">{test.details}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex-1 flex gap-4 min-h-[300px]">
        {/* Left panel: scrollable task list */}
        <div className="w-1/2 flex flex-col min-h-0">
          <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-2">
            Tasks
          </p>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {tasks.length > 0 ? (
              tasks.map((task) => {
                const badge = STATUS_BADGE[task.status];
                const isSelected = selectedTaskId === task.id;
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                    className={`w-full text-left rounded-xl p-3 border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent-sky bg-accent-sky/10'
                        : 'border-border-subtle bg-atelier-surface/60 backdrop-blur-sm hover:bg-atelier-surface/80'
                    }`}
                    aria-label={`View task: ${task.name}`}
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-atelier-text truncate">{task.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-atelier-text-muted mt-1">{task.agent}</p>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl bg-atelier-surface/60 backdrop-blur-sm p-4 border border-border-subtle text-center">
                <p className="text-sm text-atelier-text-muted">
                  Waiting for Blueprint to share the task overview...
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: task detail */}
        <div className="w-1/2 flex flex-col min-h-0">
          {selectedTask ? (
            <div className="flex-1 overflow-y-auto" data-testid="task-detail">
              <div className="rounded-xl bg-atelier-surface/60 backdrop-blur-sm p-4 border border-border-subtle space-y-4">
                {/* Task header */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="text-sm font-bold text-atelier-text">{selectedTask.name}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[selectedTask.status].bg}`}>
                      {STATUS_BADGE[selectedTask.status].label}
                    </span>
                  </div>
                  <p className="text-xs text-atelier-text-secondary">
                    Agent: {selectedTask.agent}
                  </p>
                </div>

                {/* Description */}
                {selectedTask.description && (
                  <div>
                    <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-1">Description</p>
                    <p className="text-sm text-atelier-text">{selectedTask.description}</p>
                  </div>
                )}

                {/* Acceptance criteria */}
                {selectedTask.acceptance_criteria && (
                  <div>
                    <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-1">Acceptance Criteria</p>
                    <p className="text-sm text-atelier-text">{selectedTask.acceptance_criteria}</p>
                  </div>
                )}

                {/* Related tests */}
                <div>
                  <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-2">
                    Related Tests
                  </p>
                  {matchedTests.length > 0 ? (
                    <div className="space-y-1.5">
                      {matchedTests.map((test, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 rounded-lg bg-atelier-surface/40 p-2 border border-border-subtle"
                        >
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 mt-1 ${test.passed ? 'bg-green-400' : 'bg-red-400'}`}
                            aria-label={test.passed ? 'Test: Passed' : 'Test: Failed'}
                          />
                          <div className="min-w-0">
                            <p className="text-xs text-atelier-text truncate">{test.name}</p>
                            {!test.passed && test.details && (
                              <p className="text-xs text-red-400/80 mt-0.5 truncate">{test.details}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-atelier-text-muted">No matching tests found.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="rounded-xl bg-atelier-surface/60 backdrop-blur-sm p-6 border border-border-subtle text-center" data-testid="empty-detail">
                <p className="text-sm text-atelier-text-muted">
                  Click a task to explore how it was built
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Register in the canvas registry
registerCanvas('blueprint', BlueprintCanvas);

export default BlueprintCanvas;

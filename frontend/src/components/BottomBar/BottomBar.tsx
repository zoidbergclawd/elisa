import { useState, useEffect } from 'react';
import type { Commit, TestResult, TeachingMoment, UIState, Task, Agent, TokenUsage, TraceabilitySummary, CorrectionCycleState, HealthHistoryEntry, SystemLevel } from '../../types';
import type { SerialLine, DeployProgress } from '../../hooks/useBuildSession';
import type { BoardInfo } from '../../hooks/useBoardDetect';
import GitTimeline from './GitTimeline';
import TestResults from './TestResults';
import TeachingSidebar from './TeachingSidebar';
import BoardOutput from './BoardOutput';
import ProgressPanel from './ProgressPanel';
import TraceabilityView from './TraceabilityView';
import SystemBoundaryView from './SystemBoundaryView';
import HealthDashboard from './HealthDashboard';
import MetricsPanel from '../MissionControl/MetricsPanel';
import ConvergencePanel from '../MissionControl/ConvergencePanel';

interface Props {
  commits: Commit[];
  testResults: TestResult[];
  coveragePct: number | null;
  teachingMoments: TeachingMoment[];
  serialLines: SerialLine[];
  uiState: UIState;
  tasks: Task[];
  agents: Agent[];
  deployProgress: DeployProgress | null;
  deployChecklist: Array<{ name: string; prompt: string }> | null;
  tokenUsage: TokenUsage;
  boardInfo: BoardInfo | null;
  traceability: TraceabilitySummary | null;
  boundaryAnalysis: { inputs: Array<{ name: string; type: string; source?: string }>; outputs: Array<{ name: string; type: string; source?: string }>; boundary_portals: string[] } | null;
  healthUpdate: { tasks_done: number; tasks_total: number; tests_passing: number; tests_total: number; tokens_used: number; health_score: number } | null;
  healthSummary: { health_score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F'; breakdown: { tasks_score: number; tests_score: number; corrections_score: number; budget_score: number } } | null;
  healthHistory?: HealthHistoryEntry[];
  systemLevel?: SystemLevel;
  correctionCycles?: Record<string, CorrectionCycleState>;
}

type Tab = 'Timeline' | 'Tests' | 'Trace' | 'Board' | 'Learn' | 'Progress' | 'System' | 'Health' | 'Tokens';

export default function BottomBar({
  commits, testResults, coveragePct, teachingMoments, serialLines,
  uiState, tasks, agents, deployProgress, deployChecklist, tokenUsage, boardInfo,
  traceability, boundaryAnalysis, healthUpdate, healthSummary, healthHistory = [], systemLevel,
  correctionCycles = {},
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Timeline');

  // Auto-switch to Progress tab when build starts
  useEffect(() => {
    if (uiState === 'building') {
      setActiveTab('Progress'); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [uiState]);

  // Auto-switch to Tests tab when first test result arrives
  useEffect(() => {
    if (testResults.length === 1) {
      setActiveTab('Tests'); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [testResults.length]);

  // Auto-switch to Trace tab when traceability summary arrives
  useEffect(() => {
    if (traceability && traceability.requirements.length > 0) {
      setActiveTab('Trace'); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [traceability !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: Tab[] = ['Timeline', 'Tests', 'Trace', 'Board', 'Learn', 'Progress', 'System', 'Health', 'Tokens'];

  return (
    <div className="relative z-10 glass-panel border-x-0 border-b-0">
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border-subtle">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              activeTab === tab
                ? 'bg-accent-lavender/20 text-accent-lavender'
                : 'text-atelier-text-muted hover:text-atelier-text-secondary hover:bg-atelier-surface/60'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="h-32 overflow-y-auto">
        {activeTab === 'Timeline' && <GitTimeline commits={commits} />}
        {activeTab === 'Tests' && <TestResults results={testResults} coveragePct={coveragePct} uiState={uiState} tasks={tasks} agents={agents} />}
        {activeTab === 'Trace' && <TraceabilityView traceability={traceability} />}
        {activeTab === 'Board' && <BoardOutput serialLines={serialLines} boardInfo={boardInfo} />}
        {activeTab === 'Learn' && <TeachingSidebar moments={teachingMoments} />}
        {activeTab === 'Progress' && (
          <>
            <ProgressPanel uiState={uiState} tasks={tasks} deployProgress={deployProgress} deployChecklist={deployChecklist} />
            <ConvergencePanel cycles={correctionCycles} />
          </>
        )}
        {activeTab === 'System' && (
          boundaryAnalysis
            ? <SystemBoundaryView inputs={boundaryAnalysis.inputs} outputs={boundaryAnalysis.outputs} boundary_portals={boundaryAnalysis.boundary_portals} />
            : <p className="text-sm text-atelier-text-muted p-4">System boundary data will appear during a build</p>
        )}
        {activeTab === 'Health' && <HealthDashboard healthUpdate={healthUpdate} healthSummary={healthSummary} healthHistory={healthHistory} systemLevel={systemLevel} />}
        {activeTab === 'Tokens' && (
          <div className="p-4">
            <MetricsPanel tokenUsage={tokenUsage} agents={agents} />
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import type { Commit, TestResult, TeachingMoment, UIState, Task, TokenUsage } from '../../types';
import type { SerialLine, DeployProgress } from '../../hooks/useBuildSession';
import GitTimeline from './GitTimeline';
import TestResults from './TestResults';
import TeachingSidebar from './TeachingSidebar';
import BoardOutput from './BoardOutput';
import ProgressPanel from './ProgressPanel';
import MetricsPanel from '../MissionControl/MetricsPanel';

interface Props {
  commits: Commit[];
  testResults: TestResult[];
  coveragePct: number | null;
  teachingMoments: TeachingMoment[];
  serialLines: SerialLine[];
  uiState: UIState;
  tasks: Task[];
  deployProgress: DeployProgress | null;
  deployChecklist: Array<{ name: string; prompt: string }> | null;
  tokenUsage: TokenUsage;
}

type Tab = 'Timeline' | 'Tests' | 'Board' | 'Learn' | 'Progress' | 'Tokens';

export default function BottomBar({
  commits, testResults, coveragePct, teachingMoments, serialLines,
  uiState, tasks, deployProgress, deployChecklist, tokenUsage,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Timeline');

  const showBoard = serialLines.length > 0;

  // Auto-switch to Progress tab when build starts
  useEffect(() => {
    if (uiState === 'building') {
      setActiveTab('Progress');
    }
  }, [uiState]);

  const tabs: Tab[] = ['Timeline', 'Tests', ...(showBoard ? ['Board' as Tab] : []), 'Learn', 'Progress', 'Tokens'];

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
      <div className="h-32 overflow-hidden">
        {activeTab === 'Timeline' && <GitTimeline commits={commits} />}
        {activeTab === 'Tests' && <TestResults results={testResults} coveragePct={coveragePct} uiState={uiState} />}
        {activeTab === 'Board' && showBoard && <BoardOutput serialLines={serialLines} />}
        {activeTab === 'Learn' && <TeachingSidebar moments={teachingMoments} />}
        {activeTab === 'Progress' && <ProgressPanel uiState={uiState} tasks={tasks} deployProgress={deployProgress} deployChecklist={deployChecklist} />}
        {activeTab === 'Tokens' && (
          <div className="p-4">
            <MetricsPanel tokenUsage={tokenUsage} />
          </div>
        )}
      </div>
    </div>
  );
}

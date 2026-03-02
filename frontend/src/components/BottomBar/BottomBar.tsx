import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { BoardInfo } from '../../hooks/useBoardDetect';
import { useBuildSessionContext } from '../../contexts/BuildSessionContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
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
  boardInfo: BoardInfo | null;
}

type Tab = 'Timeline' | 'Tests' | 'Trace' | 'Board' | 'Learn' | 'Progress' | 'System' | 'Health' | 'Tokens';

const STORAGE_KEY = 'elisa:bottom-bar-height';
const DEFAULT_HEIGHT = 128;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 320;

function getStoredHeight(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const val = Number(stored);
      if (val >= MIN_HEIGHT && val <= MAX_HEIGHT) return val;
    }
  } catch { /* ignore */ }
  return DEFAULT_HEIGHT;
}

export default function BottomBar({ boardInfo }: Props) {
  const {
    commits, testResults, coveragePct, teachingMoments, serialLines,
    uiState, tasks, agents, deployProgress, deployChecklist, tokenUsage,
    traceability, boundaryAnalysis, healthUpdate, healthSummary, healthHistory,
    correctionCycles,
  } = useBuildSessionContext();
  const { systemLevel } = useWorkspaceContext();
  const [activeTab, setActiveTab] = useState<Tab>('Tests');
  const [panelHeight, setPanelHeight] = useState<number>(getStoredHeight);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // --- Contextual tab visibility ---
  const visibleTabs = useMemo<Tab[]>(() => {
    const tabs: Tab[] = [];

    // Timeline: hidden unless commits exist
    if (commits.length > 0) tabs.push('Timeline');

    // Tests: always visible
    tabs.push('Tests');

    // Trace: hidden unless traceability data exists
    if (traceability !== null) tabs.push('Trace');

    // Board: hidden unless serial data or board info
    if (serialLines.length > 0 || boardInfo !== null) tabs.push('Board');

    // Learn: always visible
    tabs.push('Learn');

    // Progress: visible during/after builds
    if (uiState !== 'design') tabs.push('Progress');

    // System: hidden unless boundary analysis exists
    if (boundaryAnalysis !== null) tabs.push('System');

    // Health: visible during/after builds
    if (uiState !== 'design') tabs.push('Health');

    // Tokens: visible during/after builds
    if (uiState !== 'design') tabs.push('Tokens');

    return tabs;
  }, [commits.length, traceability, serialLines.length, boardInfo, uiState, boundaryAnalysis]);

  // Auto-switch to first visible tab when active tab becomes hidden
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [visibleTabs, activeTab]);

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

  // Auto-switch to Health tab when health summary arrives
  useEffect(() => {
    if (healthSummary) {
      setActiveTab('Health'); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [healthSummary !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Resizable height ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartHeight.current = panelHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      // Dragging up increases height, dragging down decreases
      const delta = dragStartY.current - moveEvent.clientY;
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStartHeight.current + delta));
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Persist height
      try {
        localStorage.setItem(STORAGE_KEY, String(panelHeight));
      } catch { /* ignore */ }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [panelHeight]);

  // Persist height when it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(panelHeight));
    } catch { /* ignore */ }
  }, [panelHeight]);

  const handleDoubleClick = useCallback(() => {
    setPanelHeight((prev) => (prev < MAX_HEIGHT ? MAX_HEIGHT : MIN_HEIGHT));
  }, []);

  // --- Tab badge rendering ---
  const hasTestFailures = testResults.some(t => !t.passed);
  const healthGrade = healthSummary?.grade ?? null;
  const traceCoverage = traceability ? Math.round(traceability.coverage) : null;
  const boardConnected = boardInfo !== null;

  function renderBadge(tab: Tab) {
    switch (tab) {
      case 'Tests':
        if (hasTestFailures) {
          return (
            <span
              data-testid="badge-tests-fail"
              className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500"
            />
          );
        }
        return null;
      case 'Health':
        if (healthGrade) {
          return (
            <span
              data-testid="badge-health-grade"
              className="absolute -top-1 -right-2 text-[9px] font-bold text-accent-lavender"
            >
              {healthGrade}
            </span>
          );
        }
        return null;
      case 'Trace':
        if (traceCoverage !== null) {
          return (
            <span
              data-testid="badge-trace-coverage"
              className="absolute -top-1 -right-2 text-[9px] font-bold text-accent-lavender"
            >
              {traceCoverage}%
            </span>
          );
        }
        return null;
      case 'Board':
        if (boardConnected) {
          return (
            <span
              data-testid="badge-board-connected"
              className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 animate-pulse"
            />
          );
        }
        return null;
      default:
        return null;
    }
  }

  return (
    <div className="relative z-10 glass-panel border-x-0 border-b-0">
      {/* Resize handle */}
      <div
        data-testid="resize-handle"
        className="h-1 cursor-row-resize bg-transparent hover:bg-accent-lavender/30 transition-colors"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      />
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border-subtle">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              activeTab === tab
                ? 'bg-accent-lavender/20 text-accent-lavender'
                : 'text-atelier-text-muted hover:text-atelier-text-secondary hover:bg-atelier-surface/60'
            }`}
          >
            {tab}
            {renderBadge(tab)}
          </button>
        ))}
      </div>
      <div className="overflow-y-auto" style={{ height: `${panelHeight}px` }}>
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

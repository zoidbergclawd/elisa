import { useState, useCallback, useEffect, useRef } from 'react';
import BlockCanvas from './components/BlockCanvas/BlockCanvas';
import type { BlockCanvasHandle } from './components/BlockCanvas/BlockCanvas';
import { interpretWorkspace, migrateWorkspace, type NuggetSpec } from './components/BlockCanvas/blockInterpreter';
import BottomBar from './components/BottomBar/BottomBar';
import GoButton from './components/shared/GoButton';
import MainTabBar, { type MainTab } from './components/shared/MainTabBar';
import WorkspaceSidebar from './components/BlockCanvas/WorkspaceSidebar';
import MissionControlPanel from './components/MissionControl/MissionControlPanel';
import TeachingToast from './components/shared/TeachingToast';
import HumanGateModal from './components/shared/HumanGateModal';
import QuestionModal from './components/shared/QuestionModal';
import SkillsModal from './components/Skills/SkillsModal';
import RulesModal from './components/Rules/RulesModal';
import PortalsModal from './components/Portals/PortalsModal';
import ExamplePickerModal from './components/shared/ExamplePickerModal';
import { EXAMPLE_NUGGETS } from './lib/examples';
import { useWebSocket } from './hooks/useWebSocket';
import { useBuildSession } from './hooks/useBuildSession';
import { useHealthCheck } from './hooks/useHealthCheck';
import { useBoardDetect } from './hooks/useBoardDetect';
import ReadinessBadge from './components/shared/ReadinessBadge';
import DirectoryPickerModal from './components/shared/DirectoryPickerModal';
import BoardDetectedModal from './components/shared/BoardDetectedModal';
import { portalTemplates } from './components/Portals/portalTemplates';
import { playChime } from './lib/playChime';
import { saveNuggetFile, loadNuggetFile, downloadBlob } from './lib/nuggetFile';
import { setAuthToken, authFetch } from './lib/apiClient';
import type { TeachingMoment } from './types';
import elisaLogo from '../assets/elisa.svg';
import type { Skill, Rule } from './components/Skills/types';
import type { Portal } from './components/Portals/types';

const LS_WORKSPACE = 'elisa:workspace';
const LS_SKILLS = 'elisa:skills';
const LS_RULES = 'elisa:rules';
const LS_PORTALS = 'elisa:portals';
const LS_WORKSPACE_PATH = 'elisa:workspace-path';

function readLocalStorageJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // corrupted data -- ignore
  }
  return null;
}

export default function App() {
  const [spec, setSpec] = useState<NuggetSpec | null>(null);
  const {
    uiState, tasks, agents, commits, events, sessionId,
    teachingMoments, testResults, coveragePct, tokenUsage,
    serialLines, deployProgress, deployChecklist, deployUrl, gateRequest, questionRequest,
    nuggetDir, errorNotification, narratorMessages, isPlanning,
    handleEvent, startBuild, stopBuild, clearGateRequest, clearQuestionRequest,
    clearErrorNotification, resetToDesign,
  } = useBuildSession();
  const { waitForOpen } = useWebSocket({ sessionId, onEvent: handleEvent });
  const { health, loading: healthLoading } = useHealthCheck(uiState === 'design');
  const { boardInfo, justConnected, acknowledgeConnection } = useBoardDetect(uiState === 'design');

  // Fetch auth token on mount
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as unknown as Record<string, any>).elisaAPI;
    if (api?.getAuthToken) {
      api.getAuthToken().then((token: string | null) => {
        if (token) setAuthToken(token);
      });
    } else {
      // Dev mode without Electron: use dev default
      setAuthToken('dev-token');
    }
  }, []);

  // Main tab state
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('workspace');

  // Restore skills/rules from localStorage on mount
  const [skills, setSkills] = useState<Skill[]>(() => readLocalStorageJson<Skill[]>(LS_SKILLS) ?? []);
  const [rules, setRules] = useState<Rule[]>(() => readLocalStorageJson<Rule[]>(LS_RULES) ?? []);
  const [portals, setPortals] = useState<Portal[]>(() => readLocalStorageJson<Portal[]>(LS_PORTALS) ?? []);
  const [skillsModalOpen, setSkillsModalOpen] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [portalsModalOpen, setPortalsModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [boardDetectedModalOpen, setBoardDetectedModalOpen] = useState(false);
  const boardDismissedPortsRef = useRef<Set<string>>(new Set());

  // Workspace directory path (user-chosen output location)
  const [workspacePath, setWorkspacePath] = useState<string | null>(
    () => localStorage.getItem(LS_WORKSPACE_PATH),
  );
  const [dirPickerOpen, setDirPickerOpen] = useState(false);

  // The latest workspace JSON for saving nuggets
  const [workspaceJson, setWorkspaceJson] = useState<Record<string, unknown> | null>(null);

  // Saved workspace loaded from localStorage (read once on mount, passed to BlockCanvas)
  const [initialWorkspace] = useState<Record<string, unknown> | null>(
    () => {
      const ws = readLocalStorageJson<Record<string, unknown>>(LS_WORKSPACE);
      if (ws) migrateWorkspace(ws);
      return ws;
    },
  );

  // Open example picker on first launch (no saved workspace)
  const [examplePickerOpen, setExamplePickerOpen] = useState(!initialWorkspace);

  const blockCanvasRef = useRef<BlockCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentToast, setCurrentToast] = useState<TeachingMoment | null>(null);
  const lastToastIndexRef = useRef(-1);

  // Show toast when a new teaching moment arrives
  useEffect(() => {
    const latestIndex = teachingMoments.length - 1;
    if (latestIndex > lastToastIndexRef.current && teachingMoments.length > 0) {
      setCurrentToast(teachingMoments[latestIndex]); // eslint-disable-line react-hooks/set-state-in-effect
      lastToastIndexRef.current = latestIndex;
    }
  }, [teachingMoments]);

  const handleDismissToast = useCallback(() => {
    setCurrentToast(null);
  }, []);

  // Persist skills/rules to localStorage on change
  useEffect(() => {
    localStorage.setItem(LS_SKILLS, JSON.stringify(skills));
  }, [skills]);

  useEffect(() => {
    localStorage.setItem(LS_RULES, JSON.stringify(rules));
  }, [rules]);

  useEffect(() => {
    localStorage.setItem(LS_PORTALS, JSON.stringify(portals));
  }, [portals]);

  // Re-interpret workspace when skills/rules/portals change (without Blockly interaction)
  useEffect(() => {
    if (workspaceJson) {
      setSpec(interpretWorkspace(workspaceJson, skills, rules, portals)); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [skills, rules, portals]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-switch to agents tab when build starts
  useEffect(() => {
    if (uiState === 'building' && activeMainTab === 'workspace') {
      setActiveMainTab('mission'); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [uiState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show board-detected modal when a board is newly plugged in
  useEffect(() => {
    if (!justConnected || !boardInfo) return;

    // Don't re-show if dismissed for this port already
    if (boardDismissedPortsRef.current.has(boardInfo.port)) {
      acknowledgeConnection();
      return;
    }

    playChime();
    setBoardDetectedModalOpen(true); // eslint-disable-line react-hooks/set-state-in-effect
    acknowledgeConnection();
  }, [justConnected, boardInfo, acknowledgeConnection]);

  // Resize Blockly when returning to workspace tab
  useEffect(() => {
    if (activeMainTab === 'workspace') {
      // Small delay to let CSS display change take effect before resize
      const timer = setTimeout(() => {
        blockCanvasRef.current?.resize();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeMainTab]);

  const handleWorkspaceChange = useCallback((json: Record<string, unknown>) => {
    setSpec(interpretWorkspace(json, skills, rules, portals));
    setWorkspaceJson(json);
    try {
      localStorage.setItem(LS_WORKSPACE, JSON.stringify(json));
    } catch {
      // localStorage full or unavailable -- ignore
    }
  }, [skills, rules, portals]);

  const pickDirectory = async (): Promise<string | null> => {
    // Try Electron native dialog first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as unknown as Record<string, any>).elisaAPI;
    if (api?.pickDirectory) {
      return api.pickDirectory();
    }
    // Fall back to manual text input modal
    return new Promise((resolve) => {
      setDirPickerOpen(true);
      dirPickerResolveRef.current = resolve;
    });
  };

  const dirPickerResolveRef = useRef<((value: string | null) => void) | null>(null);

  const handleDirPickerSelect = (dir: string) => {
    setDirPickerOpen(false);
    dirPickerResolveRef.current?.(dir);
    dirPickerResolveRef.current = null;
  };

  const handleDirPickerCancel = () => {
    setDirPickerOpen(false);
    dirPickerResolveRef.current?.(null);
    dirPickerResolveRef.current = null;
  };

  const handleGo = async () => {
    if (!spec) return;

    let wp = workspacePath;
    if (!wp) {
      wp = await pickDirectory();
      if (!wp) return; // User cancelled
      setWorkspacePath(wp);
      localStorage.setItem(LS_WORKSPACE_PATH, wp);
    }

    lastToastIndexRef.current = -1;
    setCurrentToast(null);
    await startBuild(spec, waitForOpen, wp ?? undefined, workspaceJson ?? undefined);
  };

  // -- Save Nugget --
  const handleSaveNugget = async () => {
    if (!workspaceJson) return;

    // If workspace path is set, save design files to workspace via backend
    if (workspacePath) {
      try {
        await authFetch('/api/workspace/save', {
          method: 'POST',
          body: JSON.stringify({
            workspace_path: workspacePath,
            workspace_json: workspaceJson,
            skills,
            rules,
            portals,
          }),
        });
      } catch {
        // Fall through to zip download
      }
      return;
    }

    // No workspace path: fall back to .elisa ZIP download
    let outputArchive: Blob | undefined;
    if (sessionId) {
      try {
        const resp = await authFetch(`/api/sessions/${sessionId}/export`);
        if (resp.ok) {
          outputArchive = await resp.blob();
        }
      } catch {
        // no generated code available -- that's fine
      }
    }

    const blob = await saveNuggetFile(workspaceJson, skills, rules, portals, outputArchive);
    const name = spec?.nugget.goal
      ? spec.nugget.goal.slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '')
      : 'nugget';
    downloadBlob(blob, `${name}.elisa`);
  };

  // -- Open Nugget --
  const handleOpenNugget = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await loadNuggetFile(file);

      // Migrate old block types in workspace
      migrateWorkspace(data.workspace);

      // Restore skills, rules, and portals
      setSkills(data.skills);
      setRules(data.rules);
      setPortals(data.portals);

      // Restore workspace via imperative handle
      setWorkspaceJson(data.workspace);
      blockCanvasRef.current?.loadWorkspace(data.workspace);

      // Update localStorage
      localStorage.setItem(LS_WORKSPACE, JSON.stringify(data.workspace));
      localStorage.setItem(LS_SKILLS, JSON.stringify(data.skills));
      localStorage.setItem(LS_RULES, JSON.stringify(data.rules));
      localStorage.setItem(LS_PORTALS, JSON.stringify(data.portals));
    } catch (err) {
      console.error('Failed to open nugget file:', err);
    }

    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  // -- Open Folder (load workspace from directory) --
  const handleOpenFolder = async () => {
    const dir = await pickDirectory();
    if (!dir) return;

    try {
      const resp = await authFetch('/api/workspace/load', {
        method: 'POST',
        body: JSON.stringify({ workspace_path: dir }),
      });
      if (!resp.ok) return;
      const data = await resp.json();

      if (data.workspace && Object.keys(data.workspace).length > 0) {
        const ws = data.workspace;
        migrateWorkspace(ws);
        setWorkspaceJson(ws);
        blockCanvasRef.current?.loadWorkspace(ws);
        localStorage.setItem(LS_WORKSPACE, JSON.stringify(ws));
      }
      if (data.skills) {
        setSkills(data.skills);
        localStorage.setItem(LS_SKILLS, JSON.stringify(data.skills));
      }
      if (data.rules) {
        setRules(data.rules);
        localStorage.setItem(LS_RULES, JSON.stringify(data.rules));
      }
      if (data.portals) {
        setPortals(data.portals);
        localStorage.setItem(LS_PORTALS, JSON.stringify(data.portals));
      }

      setWorkspacePath(dir);
      localStorage.setItem(LS_WORKSPACE_PATH, dir);
    } catch (err) {
      console.error('Failed to load workspace from folder:', err);
    }
  };

  const handleSelectExample = useCallback((example: typeof EXAMPLE_NUGGETS[number]) => {
    setSkills(example.skills);
    setRules(example.rules);
    setPortals(example.portals);
    setWorkspaceJson(example.workspace);
    blockCanvasRef.current?.loadWorkspace(example.workspace);
    localStorage.setItem(LS_WORKSPACE, JSON.stringify(example.workspace));
    localStorage.setItem(LS_SKILLS, JSON.stringify(example.skills));
    localStorage.setItem(LS_RULES, JSON.stringify(example.rules));
    localStorage.setItem(LS_PORTALS, JSON.stringify(example.portals));
    setExamplePickerOpen(false);
  }, []);

  const handleBoardCreatePortal = useCallback(() => {
    if (!boardInfo) return;

    // Only create a new portal if one doesn't already exist for this port
    const hasPortal = portals.some(
      p => p.mechanism === 'serial' && p.serialConfig?.port === boardInfo.port
    );
    if (!hasPortal) {
      const tmpl = portalTemplates.find(t => t.templateId === 'esp32');
      if (!tmpl) return;

      const newPortal: Portal = {
        ...tmpl,
        id: crypto.randomUUID(),
        name: boardInfo.boardType,
        status: 'ready' as const,
        serialConfig: { ...tmpl.serialConfig, port: boardInfo.port, boardType: boardInfo.boardType },
      };

      setPortals(prev => [...prev, newPortal]);
    }

    setBoardDetectedModalOpen(false);
    setPortalsModalOpen(true);
  }, [boardInfo, portals]);

  const handleBoardDismiss = useCallback(() => {
    if (boardInfo) boardDismissedPortsRef.current.add(boardInfo.port);
    setBoardDetectedModalOpen(false);
  }, [boardInfo]);

  return (
    <div className="flex flex-col h-screen atelier-bg noise-overlay text-atelier-text">
      {/* Header: Logo | MainTabBar | GO button | ReadinessBadge */}
      <header className="relative z-10 flex items-center justify-between px-5 py-2 glass-panel border-t-0 border-x-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <img src={elisaLogo} alt="Elisa logo" className="h-9 w-auto drop-shadow-sm" />
            <h1 className="text-xl font-display font-bold tracking-tight gradient-text-warm">Elisa</h1>
          </div>
          <MainTabBar
            activeTab={activeMainTab}
            onTabChange={setActiveMainTab}
            tasks={tasks}
            agents={agents}
          />
        </div>
        <div className="flex items-center gap-3">
          <GoButton
            disabled={uiState !== 'design' || !spec?.nugget.goal || health.status !== 'ready'}
            onClick={handleGo}
            onStop={stopBuild}
            uiState={uiState}
          />
          <ReadinessBadge health={health} loading={healthLoading} />
        </div>
      </header>

      {/* Hidden file input for Open */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".elisa"
        className="hidden"
        onChange={handleOpenNugget}
      />

      {/* Main area: tabbed content */}
      <main className="flex flex-1 overflow-hidden relative z-10">
        {/* Workspace tab: sidebar + BlockCanvas (always mounted, hidden when not active) */}
        <div className={activeMainTab === 'workspace' ? 'flex w-full h-full' : 'hidden'}>
          <WorkspaceSidebar
            onOpen={() => fileInputRef.current?.click()}
            onSave={handleSaveNugget}
            onSkills={() => setSkillsModalOpen(true)}
            onRules={() => setRulesModalOpen(true)}
            onPortals={() => setPortalsModalOpen(true)}
            onExamples={() => setExamplePickerOpen(true)}
            onHelp={() => setHelpOpen(true)}
            onFolder={handleOpenFolder}
            saveDisabled={!workspaceJson}
            workspacePath={workspacePath}
          />
          <div className="flex-1 relative">
            <BlockCanvas
              ref={blockCanvasRef}
              onWorkspaceChange={handleWorkspaceChange}
              readOnly={uiState !== 'design'}
              skills={skills}
              rules={rules}
              portals={portals}
              initialWorkspace={initialWorkspace}
            />
          </div>
        </div>

        {/* Mission Control tab */}
        {activeMainTab === 'mission' && (
          <div className="w-full h-full">
            <MissionControlPanel
              tasks={tasks}
              agents={agents}
              events={events}
              narratorMessages={narratorMessages}
              spec={spec}
              uiState={uiState}
              isPlanning={isPlanning}
            />
          </div>
        )}
      </main>

      {/* Bottom bar */}
      <BottomBar
        commits={commits}
        testResults={testResults}
        coveragePct={coveragePct}
        teachingMoments={teachingMoments}
        serialLines={serialLines}
        uiState={uiState}
        tasks={tasks}
        agents={agents}
        deployProgress={deployProgress ?? null}
        deployChecklist={deployChecklist ?? null}
        tokenUsage={tokenUsage}
        boardInfo={boardInfo}
      />

      {/* Human gate modal */}
      {gateRequest && sessionId && (
        <HumanGateModal
          taskId={gateRequest.task_id}
          question={gateRequest.question}
          context={gateRequest.context}
          sessionId={sessionId}
          onClose={clearGateRequest}
        />
      )}

      {/* Question modal */}
      {questionRequest && sessionId && (
        <QuestionModal
          taskId={questionRequest.task_id}
          questions={questionRequest.questions}
          sessionId={sessionId}
          onClose={clearQuestionRequest}
        />
      )}

      {/* Skills modal */}
      {skillsModalOpen && (
        <SkillsModal
          skills={skills}
          onSkillsChange={setSkills}
          onClose={() => setSkillsModalOpen(false)}
        />
      )}

      {/* Rules modal */}
      {rulesModalOpen && (
        <RulesModal
          rules={rules}
          onRulesChange={setRules}
          onClose={() => setRulesModalOpen(false)}
        />
      )}

      {/* Portals modal */}
      {portalsModalOpen && (
        <PortalsModal
          portals={portals}
          onPortalsChange={setPortals}
          onClose={() => setPortalsModalOpen(false)}
          boardInfo={boardInfo}
        />
      )}

      {/* Directory picker modal (fallback for non-Electron) */}
      {dirPickerOpen && (
        <DirectoryPickerModal
          onSelect={handleDirPickerSelect}
          onCancel={handleDirPickerCancel}
        />
      )}

      {/* Board detected modal */}
      {boardDetectedModalOpen && boardInfo && (
        <BoardDetectedModal
          boardInfo={boardInfo}
          hasExistingPortal={portals.some(p => p.mechanism === 'serial' && p.serialConfig?.port === boardInfo.port)}
          onCreatePortal={handleBoardCreatePortal}
          onDismiss={handleBoardDismiss}
        />
      )}

      {/* Example picker modal */}
      {examplePickerOpen && (
        <ExamplePickerModal
          examples={EXAMPLE_NUGGETS}
          onSelect={handleSelectExample}
          onClose={() => setExamplePickerOpen(false)}
        />
      )}

      {/* Help modal */}
      {helpOpen && (
        <div className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="help-modal-title" onClick={() => setHelpOpen(false)}>
          <div className="glass-elevated rounded-2xl shadow-2xl p-6 max-w-md mx-4 animate-float-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 id="help-modal-title" className="text-lg font-display font-bold gradient-text-warm">Getting Started</h2>
              <button onClick={() => setHelpOpen(false)} className="text-atelier-text-secondary hover:text-atelier-text cursor-pointer" aria-label="Close">x</button>
            </div>
            <div className="space-y-3 text-sm text-atelier-text-secondary">
              <div>
                <h3 className="font-semibold text-atelier-text mb-1">1. Design your nugget</h3>
                <p>Drag blocks from the toolbox to describe what you want to build. Start with a Goal block.</p>
              </div>
              <div>
                <h3 className="font-semibold text-atelier-text mb-1">2. Add skills and rules</h3>
                <p>Use the Skills sidebar to teach Elisa custom abilities and constraints.</p>
              </div>
              <div>
                <h3 className="font-semibold text-atelier-text mb-1">3. Press GO</h3>
                <p>Elisa plans tasks, sends your minion squad, and builds your project automatically.</p>
              </div>
              <div className="pt-2 border-t border-border-subtle">
                <h3 className="font-semibold text-atelier-text mb-1">Sidebar</h3>
                <ul className="space-y-0.5">
                  <li><span className="text-atelier-text">Open / Save</span> - Load or save .elisa nugget files</li>
                  <li><span className="text-atelier-text">Skills</span> - Custom agent skills and behaviors</li>
                  <li><span className="text-atelier-text">Rules</span> - Constraints and checks for your agents</li>
                  <li><span className="text-atelier-text">Portals</span> - Connect external tools (MCP, CLI, hardware)</li>
                  <li><span className="text-atelier-text">Examples</span> - Load a pre-built example nugget</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error notification banner */}
      {errorNotification && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-lg w-full mx-4 animate-float-in" role="alert">
          <div className="glass-elevated rounded-xl border border-red-500/30 bg-red-950/40 px-5 py-3 flex items-start gap-3 shadow-lg">
            <span className="text-red-400 text-lg leading-none mt-0.5">!</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-200">Error</p>
              <p className="text-sm text-red-300/80 mt-0.5 break-words whitespace-pre-line">{errorNotification.message}</p>
            </div>
            <button
              onClick={clearErrorNotification}
              className="text-red-400/60 hover:text-red-300 text-lg leading-none cursor-pointer"
              aria-label="Dismiss error"
            >
              x
            </button>
          </div>
        </div>
      )}

      {/* Workspace path indicator */}
      {(nuggetDir || workspacePath) && uiState !== 'design' && (
        <div className="fixed bottom-32 right-4 z-30">
          <div className="glass-panel rounded-lg px-3 py-1.5 text-xs text-atelier-text-secondary max-w-xs truncate"
               title={nuggetDir || workspacePath || ''}>
            Output: {nuggetDir || workspacePath}
          </div>
        </div>
      )}

      {/* Done mode overlay */}
      {uiState === 'done' && (
        <div className="fixed inset-0 modal-backdrop z-40 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="done-modal-title">
          <div className="glass-elevated rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center animate-float-in">
            <h2 id="done-modal-title" className="text-2xl font-display font-bold mb-4 gradient-text-warm">Nugget Complete!</h2>
            <p className="text-atelier-text-secondary mb-4">
              {events.find(e => e.type === 'session_complete')?.type === 'session_complete'
                ? (events.find(e => e.type === 'session_complete') as { type: 'session_complete'; summary: string }).summary
                : 'Your nugget has been built successfully.'}
            </p>
            {teachingMoments.length > 0 && (
              <div className="text-left mb-4 bg-accent-lavender/10 rounded-xl p-4 border border-accent-lavender/20">
                <h3 className="text-sm font-semibold text-accent-lavender mb-2">What you learned:</h3>
                <ul className="text-sm text-atelier-text-secondary space-y-1">
                  {teachingMoments.map((m, i) => (
                    <li key={i}>- {m.headline}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              {deployUrl && (
                <a
                  href={deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="go-btn px-6 py-2.5 rounded-xl text-sm inline-block"
                >
                  Open in Browser
                </a>
              )}
              <button
                onClick={() => {
                  if (sessionId) {
                    navigator.sendBeacon(`/api/sessions/${sessionId}/stop`, '');
                  }
                  window.location.reload();
                }}
                className="go-btn px-6 py-2.5 rounded-xl text-sm cursor-pointer"
              >
                Build something new
              </button>
              <button
                onClick={() => {
                  resetToDesign();
                  setActiveMainTab('workspace');
                }}
                className="px-6 py-2.5 rounded-xl text-sm cursor-pointer border border-atelier-text-muted/30 text-atelier-text-secondary hover:bg-atelier-surface/60 hover:text-atelier-text transition-colors"
              >
                Keep working on this nugget
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teaching toast overlay */}
      <TeachingToast moment={currentToast} onDismiss={handleDismissToast} />
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from 'react';
import BlockCanvas from './components/BlockCanvas/BlockCanvas';
import type { BlockCanvasHandle } from './components/BlockCanvas/BlockCanvas';
import BottomBar from './components/BottomBar/BottomBar';
import GoButton from './components/shared/GoButton';
import MainTabBar, { type MainTab } from './components/shared/MainTabBar';
import WorkspaceSidebar from './components/BlockCanvas/WorkspaceSidebar';
import MissionControlPanel from './components/MissionControl/MissionControlPanel';
import TeachingToast from './components/shared/TeachingToast';
import MeetingInviteToast from './components/shared/MeetingInviteToast';
import MeetingInviteCard from './components/shared/MeetingInviteCard';
import MeetingModal from './components/Meeting/MeetingModal';
import ReadinessBadge from './components/shared/ReadinessBadge';
import LevelBadge from './components/shared/LevelBadge';
import ModalHost from './components/shared/ModalHost';
import { useWebSocket } from './hooks/useWebSocket';
import { useHealthCheck } from './hooks/useHealthCheck';
import { useBoardDetect } from './hooks/useBoardDetect';
import { setAuthToken, authFetch } from './lib/apiClient';
import { registerDeviceBlocks, type DeviceManifest } from './lib/deviceBlocks';
import { playChime } from './lib/playChime';
import { BuildSessionProvider } from './contexts/BuildSessionContext';
import { useBuildSessionContext } from './contexts/BuildSessionContext';
import { MeetingProvider } from './contexts/MeetingContext';
import { useMeetingContext } from './contexts/MeetingContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { useWorkspaceContext } from './contexts/WorkspaceContext';
import type { TeachingMoment, WSEvent } from './types';
import elisaLogo from '../assets/elisa.svg';

export default function App() {
  const blockCanvasRef = useRef<BlockCanvasHandle>(null);

  // Fetch auth token on mount
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasElectronAuth = !!(window as unknown as Record<string, any>).elisaAPI?.getAuthToken;
  const [authReady, setAuthReady] = useState(!hasElectronAuth);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as unknown as Record<string, any>).elisaAPI;
    if (api?.getAuthToken) {
      api.getAuthToken().then((token: string | null) => {
        if (token) setAuthToken(token);
        setAuthReady(true);
      });
    } else {
      setAuthToken('dev-token');
    }
  }, []);

  // Device manifests from backend plugin registry
  const [deviceManifests, setDeviceManifests] = useState<DeviceManifest[]>([]);

  useEffect(() => {
    if (!authReady) return;
    authFetch('/api/devices')
      .then(r => r.ok ? r.json() : [])
      .then((data: DeviceManifest[]) => {
        registerDeviceBlocks(data);
        setDeviceManifests(data);
      })
      .catch(() => { /* device plugins unavailable -- not critical */ });
  }, [authReady]);

  return (
    <BuildSessionProvider>
      <AppWithBuildSession
        blockCanvasRef={blockCanvasRef}
        authReady={authReady}
        deviceManifests={deviceManifests}
      />
    </BuildSessionProvider>
  );
}

interface AppWithBuildSessionProps {
  blockCanvasRef: React.RefObject<BlockCanvasHandle | null>;
  authReady: boolean;
  deviceManifests: DeviceManifest[];
}

function AppWithBuildSession({ blockCanvasRef, authReady, deviceManifests }: AppWithBuildSessionProps) {
  const { sessionId, handleEvent } = useBuildSessionContext();

  return (
    <MeetingProvider sessionId={sessionId}>
      <WorkspaceProvider
        blockCanvasRef={blockCanvasRef}
        deviceManifests={deviceManifests}
        sessionId={sessionId}
      >
        <AppShell
          blockCanvasRef={blockCanvasRef}
          authReady={authReady}
          handleBuildEvent={handleEvent}
        />
      </WorkspaceProvider>
    </MeetingProvider>
  );
}

interface AppShellProps {
  blockCanvasRef: React.RefObject<BlockCanvasHandle | null>;
  authReady: boolean;
  handleBuildEvent: (event: WSEvent) => void;
}

function AppShell({ blockCanvasRef, authReady, handleBuildEvent }: AppShellProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    uiState, tasks, agents, events, sessionId,
    teachingMoments, deployUrls, errorNotification,
    nuggetDir, startBuild, stopBuild, clearErrorNotification, resetToDesign,
  } = useBuildSessionContext();

  const {
    inviteQueue, nextInvite, activeMeeting, isAgentThinking,
    messages: meetingMessages, canvasState: meetingCanvasState,
    handleMeetingEvent, acceptInvite, declineInvite,
    sendMessage: sendMeetingMessage, endMeeting, updateCanvas: updateMeetingCanvas,
    materializeArtifacts: materializeMeetingArtifacts,
    resetMeetings,
  } = useMeetingContext();

  const {
    skills, rules, portals, spec, workspacePath, workspaceJson, initialWorkspace,
    setExamplePickerOpen, handleWorkspaceChange, handleSaveNugget, handleOpenNugget,
    handleOpenFolder, ensureWorkspacePath, reinterpretWorkspace, systemLevel,
    deviceManifests,
  } = useWorkspaceContext();

  // Route WS events to both build session and meeting session handlers
  const handleAllEvents = useCallback((event: WSEvent) => {
    handleMeetingEvent(event);
    handleBuildEvent(event);
  }, [handleMeetingEvent, handleBuildEvent]);

  const { waitForOpen } = useWebSocket({ sessionId, onEvent: handleAllEvents });
  const { health, loading: healthLoading } = useHealthCheck(uiState === 'design');

  const { boardInfo, justConnected, acknowledgeConnection } = useBoardDetect(uiState === 'design' && authReady);

  // Main tab state
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('workspace');

  // Modal toggles
  const [skillsModalOpen, setSkillsModalOpen] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [portalsModalOpen, setPortalsModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [boardDetectedModalOpen, setBoardDetectedModalOpen] = useState(false);
  const boardDismissedPortsRef = useRef<Set<string>>(new Set());

  // Teaching toast
  const [currentToast, setCurrentToast] = useState<TeachingMoment | null>(null);
  const lastToastIndexRef = useRef(-1);

  useEffect(() => {
    const latestIndex = teachingMoments.length - 1;
    if (latestIndex > lastToastIndexRef.current && teachingMoments.length > 0) {
      setCurrentToast(teachingMoments[latestIndex]); // eslint-disable-line react-hooks/set-state-in-effect -- derived from WS events
      lastToastIndexRef.current = latestIndex;
    }
  }, [teachingMoments]);

  const handleDismissToast = useCallback(() => {
    setCurrentToast(null);
  }, []);

  // Persist skills/rules/portals to localStorage on change
  useEffect(() => {
    localStorage.setItem('elisa:skills', JSON.stringify(skills));
  }, [skills]);

  useEffect(() => {
    localStorage.setItem('elisa:rules', JSON.stringify(rules));
  }, [rules]);

  useEffect(() => {
    localStorage.setItem('elisa:portals', JSON.stringify(portals));
  }, [portals]);

  // Re-interpret workspace when skills/rules/portals change
  useEffect(() => {
    reinterpretWorkspace();
  }, [skills, rules, portals, deviceManifests]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-switch to mission tab when build starts
  useEffect(() => {
    if (uiState === 'building' && activeMainTab === 'workspace') {
      setActiveMainTab('mission'); // eslint-disable-line react-hooks/set-state-in-effect -- intentional tab auto-switch
    }
  }, [uiState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show board-detected modal when a board is newly plugged in
  useEffect(() => {
    if (!justConnected || !boardInfo) return;
    if (boardDismissedPortsRef.current.has(boardInfo.port)) {
      acknowledgeConnection();
      return;
    }
    playChime();
    setBoardDetectedModalOpen(true); // eslint-disable-line react-hooks/set-state-in-effect -- responding to hardware event
    acknowledgeConnection();
  }, [justConnected, boardInfo, acknowledgeConnection]);

  // Resize Blockly when returning to workspace tab
  useEffect(() => {
    if (activeMainTab === 'workspace') {
      const timer = setTimeout(() => {
        blockCanvasRef.current?.resize();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeMainTab, blockCanvasRef]);

  const handleGo = async () => {
    if (!spec) return;
    const wp = await ensureWorkspacePath();
    if (!wp) return;
    lastToastIndexRef.current = -1;
    setCurrentToast(null);
    await startBuild(spec, waitForOpen, wp, workspaceJson ?? undefined);
  };

  const handleBoardDismiss = useCallback(() => {
    if (boardInfo) boardDismissedPortsRef.current.add(boardInfo.port);
    setBoardDetectedModalOpen(false);
  }, [boardInfo]);

  return (
    <div className="flex flex-col h-screen atelier-bg noise-overlay text-atelier-text">
      {/* Header */}
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
          {spec && <LevelBadge level={systemLevel} />}
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
        {/* Workspace tab (always mounted, hidden when not active) */}
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
              deviceManifests={deviceManifests}
            />
          </div>
        </div>

        {/* Mission Control tab */}
        {activeMainTab === 'mission' && (
          <div className="w-full h-full">
            <MissionControlPanel />
          </div>
        )}
      </main>

      {/* Bottom bar */}
      <BottomBar boardInfo={boardInfo} />

      {/* All modals */}
      <ModalHost
        skillsModalOpen={skillsModalOpen}
        setSkillsModalOpen={setSkillsModalOpen}
        rulesModalOpen={rulesModalOpen}
        setRulesModalOpen={setRulesModalOpen}
        portalsModalOpen={portalsModalOpen}
        setPortalsModalOpen={setPortalsModalOpen}
        boardDetectedModalOpen={boardDetectedModalOpen}
        boardInfo={boardInfo}
        onBoardDismiss={handleBoardDismiss}
        helpOpen={helpOpen}
        setHelpOpen={setHelpOpen}
      />

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

      {/* Done mode overlay -- hidden when a meeting modal is active (z-50 > z-40) */}
      {uiState === 'done' && !activeMeeting && (
        <div className="fixed inset-0 modal-backdrop z-40 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="done-modal-title">
          <div className={`glass-elevated rounded-2xl shadow-2xl p-8 mx-4 text-center animate-float-in ${inviteQueue.length > 0 ? 'max-w-lg' : 'max-w-md'}`}>
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
            {/* Meeting invite cards embedded in done modal */}
            {inviteQueue.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-accent-sky mb-3">Your agents want to meet!</h3>
                <div className="flex gap-3 justify-center flex-wrap">
                  {inviteQueue.map(invite => (
                    <MeetingInviteCard
                      key={invite.meetingId}
                      invite={invite}
                      onAccept={acceptInvite}
                      onDecline={declineInvite}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              {Object.entries(deployUrls).map(([target, url]) => (
                <a
                  key={target}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="go-btn px-6 py-2.5 rounded-xl text-sm inline-block"
                >
                  {Object.keys(deployUrls).length > 1 ? `Open ${target}` : 'Open in Browser'}
                </a>
              ))}
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
                  resetMeetings();
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

      {/* Meeting invite toast -- shown during builds, hidden at completion (cards shown in done modal instead) */}
      {uiState !== 'done' && (
        <MeetingInviteToast
          invite={nextInvite}
          onAccept={acceptInvite}
          onDecline={declineInvite}
          pauseAutoDismiss={!!activeMeeting}
        />
      )}

      {/* Active meeting modal */}
      {activeMeeting && (
        <MeetingModal
          meetingId={activeMeeting.meetingId}
          agentName={activeMeeting.agentName}
          canvasType={activeMeeting.canvasType}
          canvasState={meetingCanvasState}
          messages={meetingMessages}
          isAgentThinking={isAgentThinking}
          onSendMessage={sendMeetingMessage}
          onCanvasUpdate={updateMeetingCanvas}
          onEndMeeting={endMeeting}
          onMaterialize={materializeMeetingArtifacts}
        />
      )}
    </div>
  );
}

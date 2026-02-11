import { useState, useCallback, useEffect, useRef } from 'react';
import BlockCanvas from './components/BlockCanvas/BlockCanvas';
import { interpretWorkspace, type ProjectSpec } from './components/BlockCanvas/blockInterpreter';
import MissionControl from './components/MissionControl/MissionControl';
import BottomBar from './components/BottomBar/BottomBar';
import GoButton from './components/shared/GoButton';
import TeachingToast from './components/shared/TeachingToast';
import HumanGateModal from './components/shared/HumanGateModal';
import SkillsRulesModal from './components/Skills/SkillsRulesModal';
import { useWebSocket } from './hooks/useWebSocket';
import { useBuildSession } from './hooks/useBuildSession';
import type { TeachingMoment } from './types';
import type { Skill, Rule } from './components/Skills/types';

export default function App() {
  const [spec, setSpec] = useState<ProjectSpec | null>(null);
  const {
    uiState, tasks, agents, commits, events, sessionId,
    teachingMoments, testResults, coveragePct, tokenUsage,
    serialLines, deployProgress, gateRequest,
    handleEvent, startBuild, clearGateRequest,
  } = useBuildSession();
  const { connected } = useWebSocket({ sessionId, onEvent: handleEvent });

  const [skills, setSkills] = useState<Skill[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [skillsModalOpen, setSkillsModalOpen] = useState(false);

  const [currentToast, setCurrentToast] = useState<TeachingMoment | null>(null);
  const lastToastIndexRef = useRef(-1);

  // Show toast when a new teaching moment arrives
  useEffect(() => {
    const latestIndex = teachingMoments.length - 1;
    if (latestIndex > lastToastIndexRef.current && teachingMoments.length > 0) {
      setCurrentToast(teachingMoments[latestIndex]);
      lastToastIndexRef.current = latestIndex;
    }
  }, [teachingMoments]);

  const handleDismissToast = useCallback(() => {
    setCurrentToast(null);
  }, []);

  const handleWorkspaceChange = useCallback((json: Record<string, unknown>) => {
    setSpec(interpretWorkspace(json, skills, rules));
  }, [skills, rules]);

  const handleGo = async () => {
    if (!spec) return;
    lastToastIndexRef.current = -1;
    setCurrentToast(null);
    await startBuild(spec);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <h1 className="text-xl font-bold tracking-tight">Elisa</h1>
        <nav className="flex gap-2">
          <button className="px-3 py-1 text-sm rounded bg-gray-100 text-gray-500 cursor-not-allowed">
            My Projects
          </button>
          <button
            onClick={() => setSkillsModalOpen(true)}
            className="px-3 py-1 text-sm rounded bg-purple-100 text-purple-700 hover:bg-purple-200"
          >
            Skills
          </button>
          <button className="px-3 py-1 text-sm rounded bg-gray-100 text-gray-500 cursor-not-allowed">
            Help
          </button>
        </nav>
        <span className={`text-xs px-2 py-1 rounded ${connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: BlockCanvas */}
        <div className="flex-1 relative">
          <BlockCanvas onWorkspaceChange={handleWorkspaceChange} readOnly={uiState !== 'design'} skills={skills} rules={rules} />
        </div>

        {/* Right: Mission Control */}
        <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto">
          <MissionControl
            spec={spec}
            tasks={tasks}
            agents={agents}
            events={events}
            uiState={uiState}
            tokenUsage={tokenUsage}
            deployProgress={deployProgress}
          />
        </div>
      </div>

      {/* Bottom bar */}
      <BottomBar
        commits={commits}
        testResults={testResults}
        coveragePct={coveragePct}
        teachingMoments={teachingMoments}
        serialLines={serialLines}
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

      {/* Skills & Rules modal */}
      {skillsModalOpen && (
        <SkillsRulesModal
          skills={skills}
          rules={rules}
          onSkillsChange={setSkills}
          onRulesChange={setRules}
          onClose={() => setSkillsModalOpen(false)}
        />
      )}

      {/* Done mode overlay */}
      {uiState === 'done' && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md mx-4 text-center">
            <h2 className="text-2xl font-bold mb-4">Project Complete!</h2>
            <p className="text-gray-600 mb-4">
              {events.find(e => e.type === 'session_complete')?.type === 'session_complete'
                ? (events.find(e => e.type === 'session_complete') as { type: 'session_complete'; summary: string }).summary
                : 'Your project has been built successfully.'}
            </p>
            {teachingMoments.length > 0 && (
              <div className="text-left mb-4 bg-blue-50 rounded-lg p-3">
                <h3 className="text-sm font-semibold text-blue-800 mb-2">What you learned:</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  {teachingMoments.map((m, i) => (
                    <li key={i}>- {m.headline}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              onClick={() => {
                window.location.reload();
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Build something new
            </button>
          </div>
        </div>
      )}

      {/* Teaching toast overlay */}
      <TeachingToast moment={currentToast} onDismiss={handleDismissToast} />

      {/* Footer with GO button */}
      <footer className="flex items-center justify-center px-4 py-3 bg-white border-t border-gray-200">
        <GoButton
          disabled={uiState !== 'design' || !spec?.project.goal}
          onClick={handleGo}
        />
      </footer>
    </div>
  );
}

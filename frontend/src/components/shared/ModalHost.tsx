import { useRef, useCallback, type KeyboardEvent } from 'react';
import HumanGateModal from './HumanGateModal';
import QuestionModal from './QuestionModal';
import FlashWizardModal from './FlashWizardModal';
import SkillsModal from '../Skills/SkillsModal';
import RulesModal from '../Rules/RulesModal';
import PortalsModal from '../Portals/PortalsModal';
import DirectoryPickerModal from './DirectoryPickerModal';
import BoardDetectedModal from './BoardDetectedModal';
import ExamplePickerModal from './ExamplePickerModal';
import type { GateRequest, QuestionRequest, FlashWizardState } from '../../hooks/useBuildSession';
import type { Skill, Rule } from '../Skills/types';
import type { Portal } from '../Portals/types';
import type { DeviceManifest } from '../../lib/deviceBlocks';
import type { BoardInfo } from '../../hooks/useBoardDetect';
import { EXAMPLE_NUGGETS } from '../../lib/examples';
import { authFetch } from '../../lib/apiClient';

export interface ModalHostProps {
  // Session
  sessionId: string | null;

  // Gate + question modals
  gateRequest: GateRequest | null;
  clearGateRequest: () => void;
  questionRequest: QuestionRequest | null;
  clearQuestionRequest: () => void;

  // Flash wizard
  flashWizardState: FlashWizardState | null;

  // Skills/rules/portals modals
  skillsModalOpen: boolean;
  setSkillsModalOpen: (open: boolean) => void;
  skills: Skill[];
  onSkillsChange: (skills: Skill[]) => void;

  rulesModalOpen: boolean;
  setRulesModalOpen: (open: boolean) => void;
  rules: Rule[];
  onRulesChange: (rules: Rule[]) => void;

  portalsModalOpen: boolean;
  setPortalsModalOpen: (open: boolean) => void;
  portals: Portal[];
  onPortalsChange: (portals: Portal[]) => void;

  // Directory picker
  dirPickerOpen: boolean;
  onDirPickerSelect: (dir: string) => void;
  onDirPickerCancel: () => void;

  // Board detected
  boardDetectedModalOpen: boolean;
  boardInfo: BoardInfo | null;
  deviceManifests: DeviceManifest[];
  onBoardDismiss: () => void;

  // Example picker
  examplePickerOpen: boolean;
  onSelectExample: (example: typeof EXAMPLE_NUGGETS[number]) => void;
  onCloseExamplePicker: () => void;

  // Help
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
}

export default function ModalHost({
  sessionId,
  gateRequest,
  clearGateRequest,
  questionRequest,
  clearQuestionRequest,
  flashWizardState,
  skillsModalOpen,
  setSkillsModalOpen,
  skills,
  onSkillsChange,
  rulesModalOpen,
  setRulesModalOpen,
  rules,
  onRulesChange,
  portalsModalOpen,
  setPortalsModalOpen,
  portals,
  onPortalsChange,
  dirPickerOpen,
  onDirPickerSelect,
  onDirPickerCancel,
  boardDetectedModalOpen,
  boardInfo,
  deviceManifests,
  onBoardDismiss,
  examplePickerOpen,
  onSelectExample,
  onCloseExamplePicker,
  helpOpen,
  setHelpOpen,
}: ModalHostProps) {
  const helpModalRef = useRef<HTMLDivElement>(null);

  const handleFocusTrap = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const modal = helpModalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  return (
    <>
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

      {/* Flash wizard modal */}
      {flashWizardState?.visible && sessionId && (
        <FlashWizardModal
          deviceRole={flashWizardState.deviceRole}
          message={flashWizardState.message}
          isFlashing={flashWizardState.isFlashing}
          progress={flashWizardState.progress}
          deviceName={flashWizardState.deviceName}
          flashMethod={flashWizardState.flashMethod}
          agentName={flashWizardState.agentName}
          wakeWord={flashWizardState.wakeWord}
          agentId={flashWizardState.agentId}
          preFlashChecklist={flashWizardState.preFlashChecklist}
          onReady={() => {
            authFetch(`/api/sessions/${sessionId}/gate`, {
              method: 'POST',
              body: JSON.stringify({ approved: true }),
            });
          }}
          onCancel={() => {
            authFetch(`/api/sessions/${sessionId}/stop`, { method: 'POST' });
          }}
        />
      )}

      {/* Skills modal */}
      {skillsModalOpen && (
        <SkillsModal
          skills={skills}
          onSkillsChange={onSkillsChange}
          onClose={() => setSkillsModalOpen(false)}
        />
      )}

      {/* Rules modal */}
      {rulesModalOpen && (
        <RulesModal
          rules={rules}
          onRulesChange={onRulesChange}
          onClose={() => setRulesModalOpen(false)}
        />
      )}

      {/* Portals modal */}
      {portalsModalOpen && (
        <PortalsModal
          portals={portals}
          onPortalsChange={onPortalsChange}
          onClose={() => setPortalsModalOpen(false)}
        />
      )}

      {/* Directory picker modal */}
      {dirPickerOpen && (
        <DirectoryPickerModal
          onSelect={onDirPickerSelect}
          onCancel={onDirPickerCancel}
        />
      )}

      {/* Board detected modal */}
      {boardDetectedModalOpen && boardInfo && (
        <BoardDetectedModal
          boardInfo={boardInfo}
          matchingPlugins={deviceManifests.filter(m => {
            if (!m.board) return false;
            const det = m.board.detection;
            if (det?.usb_vid && boardInfo.vendorId) {
              const manifestVid = det.usb_vid.replace(/^0x/i, '').toUpperCase();
              return manifestVid === boardInfo.vendorId.toUpperCase();
            }
            return boardInfo.boardType.toLowerCase().includes(m.board.type.toLowerCase());
          })}
          onDismiss={onBoardDismiss}
        />
      )}

      {/* Example picker modal */}
      {examplePickerOpen && (
        <ExamplePickerModal
          examples={EXAMPLE_NUGGETS}
          availableDeviceIds={deviceManifests.map(m => m.id)}
          onSelect={onSelectExample}
          onClose={onCloseExamplePicker}
        />
      )}

      {/* Help modal */}
      {helpOpen && (
        <div ref={helpModalRef} className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="help-modal-title" onClick={() => setHelpOpen(false)} onKeyDown={handleFocusTrap}>
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
    </>
  );
}

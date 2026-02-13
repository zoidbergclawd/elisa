import { useEffect, useRef, useState, useCallback } from 'react';
import * as Blockly from 'blockly';
import { registerSkillFlowBlocks } from '../BlockCanvas/skillFlowBlocks';
import { skillFlowToolbox } from '../BlockCanvas/skillFlowToolbox';
import { interpretSkillWorkspace } from '../BlockCanvas/skillInterpreter';
import { useSkillSession } from '../../hooks/useSkillSession';
import SkillQuestionModal from './SkillQuestionModal';
import type { Skill } from './types';

interface Props {
  skill: Skill;
  allSkills: Skill[];
  onSave: (workspace: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function SkillFlowEditor({ skill, allSkills, onSave, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const [skillName, setSkillName] = useState(skill.name);

  const {
    sessionId,
    running,
    result,
    error,
    steps,
    outputs,
    questionRequest,
    startRun,
  } = useSkillSession();

  useEffect(() => {
    registerSkillFlowBlocks();

    if (!containerRef.current) return;

    const ws = Blockly.inject(containerRef.current, {
      toolbox: skillFlowToolbox,
      grid: { spacing: 20, length: 3, colour: 'rgba(0, 0, 0, 0.04)', snap: true },
      zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3 },
      trashcan: true,
    });
    workspaceRef.current = ws;

    if (skill.workspace) {
      try {
        Blockly.serialization.workspaces.load(
          skill.workspace as Blockly.serialization.blocks.State,
          ws,
        );
      } catch {
        // ignore
      }
    }

    return () => {
      ws.dispose();
      workspaceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(() => {
    if (!workspaceRef.current) return;
    const state = Blockly.serialization.workspaces.save(workspaceRef.current);
    onSave(state as Record<string, unknown>);
  }, [onSave]);

  const handleRun = useCallback(() => {
    if (!workspaceRef.current) return;
    const state = Blockly.serialization.workspaces.save(workspaceRef.current);
    const plan = interpretSkillWorkspace(
      state as Record<string, unknown>,
      skill.id,
      skillName || skill.name,
    );
    startRun(plan, allSkills);
  }, [skill.id, skill.name, skillName, allSkills, startRun]);

  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const totalSteps = steps.length;

  return (
    <div className="fixed inset-0 bg-atelier-base z-50 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 glass-panel border-t-0 border-x-0">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={skillName}
            onChange={e => setSkillName(e.target.value)}
            placeholder="Skill name"
            className="bg-atelier-surface border border-border-medium rounded-xl px-3 py-1.5 text-sm text-atelier-text placeholder-atelier-text-muted focus:outline-none focus:ring-2 focus:ring-accent-lavender/40 w-60"
          />
          <span className="text-xs text-atelier-text-muted">Composite Skill</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={running}
            className="go-btn px-4 py-1.5 rounded-xl text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            {running ? 'Running...' : 'Run'}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-accent-lavender text-white rounded-xl hover:bg-accent-lavender/80 text-sm font-medium transition-colors"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-atelier-surface text-atelier-text-secondary rounded-xl hover:bg-atelier-elevated text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Progress / result bar */}
      {(running || result !== null || error !== null) && (
        <div className="px-4 py-2 glass-panel border-t-0 border-x-0 text-sm">
          {running && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-accent-mint border-t-transparent rounded-full animate-spin" />
              <span className="text-atelier-text-secondary">
                Step {completedSteps}/{totalSteps > 0 ? totalSteps : '?'}
              </span>
              {outputs.length > 0 && (
                <span className="text-atelier-text-muted ml-2 truncate">
                  {outputs[outputs.length - 1]}
                </span>
              )}
            </div>
          )}
          {result !== null && !running && (
            <div className="text-accent-mint">
              Result: {result}
            </div>
          )}
          {error !== null && !running && (
            <div className="text-accent-coral">
              Error: {error}
            </div>
          )}
        </div>
      )}

      {/* Blockly canvas */}
      <div ref={containerRef} className="flex-1" />

      {/* Question modal for skill questions */}
      {questionRequest && sessionId && (
        <SkillQuestionModal
          stepId={questionRequest.stepId}
          questions={questionRequest.questions}
          sessionId={sessionId}
          onClose={() => {
            // Modal handles the fetch internally
          }}
        />
      )}
    </div>
  );
}

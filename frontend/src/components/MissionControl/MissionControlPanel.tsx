import type { Task, Agent, WSEvent, NarratorMessage, UIState, CorrectionCycleState } from '../../types';
import type { NuggetSpec } from '../BlockCanvas/blockInterpreter';
import type { ContextFlow } from '../../hooks/useBuildSession';
import TaskDAG from './TaskDAG';
import MinionSquadPanel from './MinionSquadPanel';
import NarratorFeed from './NarratorFeed';
import PlanningIndicator from './PlanningIndicator';
import FeedbackLoopIndicator from './FeedbackLoopIndicator';

interface MissionControlPanelProps {
  tasks: Task[];
  agents: Agent[];
  events: WSEvent[];
  narratorMessages: NarratorMessage[];
  spec: NuggetSpec | null;
  uiState: UIState;
  isPlanning?: boolean;
  contextFlows?: ContextFlow[];
  correctionCycles?: Record<string, CorrectionCycleState>;
}

export default function MissionControlPanel({
  tasks,
  agents,
  events,
  narratorMessages,
  spec,
  uiState,
  isPlanning = false,
  contextFlows,
  correctionCycles = {},
}: MissionControlPanelProps) {
  const hasContent = tasks.length > 0;
  const isComplete = uiState === 'done';
  const systemLevel = spec?.workflow?.system_level;
  const requirements = spec?.requirements;

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden">
      {/* Left panel: Task DAG */}
      <div className="flex-1 lg:w-3/5 min-h-0 overflow-hidden p-4">
        {hasContent ? (
          <TaskDAG
            tasks={tasks}
            agents={agents}
            className="h-full"
            systemLevel={systemLevel}
            contextFlows={contextFlows}
            requirements={requirements}
            isComplete={isComplete}
          />
        ) : isPlanning ? (
          <PlanningIndicator />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-atelier-text-muted text-center">
              Mission Control will light up when you press GO
            </p>
          </div>
        )}
      </div>

      {/* Right panel: Squad + Narrator */}
      <div className="lg:w-2/5 flex flex-col border-t lg:border-t-0 lg:border-l border-border-subtle min-h-0 overflow-hidden">
        {/* Top: Minion Squad */}
        <div className="border-b border-border-subtle shrink-0">
          <MinionSquadPanel agents={agents} uiState={uiState} isPlanning={isPlanning} />
        </div>

        {/* Active correction cycles */}
        {Object.values(correctionCycles).some(c => !c.converged) && (
          <div className="border-b border-border-subtle shrink-0 px-3 py-2 space-y-1.5">
            {Object.values(correctionCycles)
              .filter(c => !c.converged)
              .map(cycle => (
                <div key={cycle.task_id} className="flex items-center gap-2">
                  <span className="text-xs text-atelier-text-muted truncate max-w-[120px]" title={cycle.task_id}>
                    {cycle.task_id.length > 20 ? cycle.task_id.slice(0, 20) + '...' : cycle.task_id}
                  </span>
                  <FeedbackLoopIndicator cycle={cycle} />
                </div>
              ))}
          </div>
        )}

        {/* Bottom: Narrator Feed */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <NarratorFeed narratorMessages={narratorMessages} events={events} isPlanning={isPlanning} />
        </div>
      </div>
    </div>
  );
}

import type { Task, Agent, WSEvent, NarratorMessage, UIState } from '../../types';
import type { NuggetSpec } from '../BlockCanvas/blockInterpreter';
import TaskDAG from './TaskDAG';
import MinionSquadPanel from './MinionSquadPanel';
import NarratorFeed from './NarratorFeed';
import PlanningIndicator from './PlanningIndicator';

interface MissionControlPanelProps {
  tasks: Task[];
  agents: Agent[];
  events: WSEvent[];
  narratorMessages: NarratorMessage[];
  spec: NuggetSpec | null;
  uiState: UIState;
  isPlanning?: boolean;
}

export default function MissionControlPanel({
  tasks,
  agents,
  events,
  narratorMessages,
  uiState,
  isPlanning = false,
}: MissionControlPanelProps) {
  const hasContent = tasks.length > 0;

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden">
      {/* Left panel: Task DAG */}
      <div className="flex-1 lg:w-3/5 min-h-0 overflow-hidden p-4">
        {hasContent ? (
          <TaskDAG tasks={tasks} agents={agents} className="h-full" />
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

        {/* Bottom: Narrator Feed */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <NarratorFeed narratorMessages={narratorMessages} events={events} isPlanning={isPlanning} />
        </div>
      </div>
    </div>
  );
}

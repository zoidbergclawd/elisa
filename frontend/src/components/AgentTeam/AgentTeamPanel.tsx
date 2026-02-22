import type { Agent, WSEvent } from '../../types';
import type { NuggetSpec } from '../BlockCanvas/blockInterpreter';
import AgentAvatar from '../shared/AgentAvatar';
import CommsFeed from '../MissionControl/CommsFeed';
import { formatModelName, modelPillClasses } from '../../lib/modelBadge';

interface AgentTeamPanelProps {
  spec: NuggetSpec | null;
  agents: Agent[];
  events: WSEvent[];
}

export default function AgentTeamPanel({ spec, agents, events }: AgentTeamPanelProps) {
  const displayAgents = agents.length > 0
    ? agents
    : (spec?.agents ?? []).map(a => ({
        ...a,
        status: 'idle' as const,
      }));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Agent cards grid */}
      <div className="p-4 border-b border-border-subtle">
        <h3 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-3">Agent Team</h3>
        {displayAgents.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {displayAgents.map((a, i) => {
              const modelLabel = formatModelName(a.model);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3 bg-atelier-surface/60 rounded-xl border border-border-subtle"
                >
                  <AgentAvatar
                    name={a.name}
                    role={a.role as Agent['role']}
                    status={a.status as Agent['status']}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-atelier-text truncate">{a.name}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-atelier-text-muted">{a.role}</p>
                      {modelLabel && (
                        <span className={modelPillClasses(modelLabel)}>{modelLabel}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-atelier-text-muted">No agents added yet</p>
        )}
      </div>

      {/* Comms feed - fills remaining space */}
      <div className="flex-1 overflow-hidden flex flex-col p-4">
        <h3 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-2">Comms Feed</h3>
        <div className="flex-1 overflow-hidden">
          <CommsFeed events={events} fullHeight />
        </div>
      </div>
    </div>
  );
}

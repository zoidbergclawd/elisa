import type { Agent, UIState } from '../../types';
import MinionAvatar from '../shared/MinionAvatar';
import { TERMS, displayRole } from '../../lib/terminology';

/** Shorten model IDs to human-friendly labels. */
function formatModelName(modelId: string | undefined): string | null {
  if (!modelId) return null;
  if (modelId.startsWith('claude-opus')) return 'Opus';
  if (modelId.startsWith('claude-sonnet')) return 'Sonnet';
  if (modelId.startsWith('claude-haiku')) return 'Haiku';
  return modelId;
}

interface MinionSquadPanelProps {
  agents: Agent[];
  uiState: UIState;
  isPlanning?: boolean;
}

export default function MinionSquadPanel({ agents, uiState, isPlanning = false }: MinionSquadPanelProps) {
  // Derive Elisa's status from build state
  const elisaStatus = uiState === 'building' || uiState === 'review'
    ? 'working'
    : uiState === 'done'
      ? 'done'
      : 'idle';

  return (
    <div className="p-3">
      <h3 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider mb-3">
        {TERMS.agentTeam}
      </h3>
      <div className="flex items-end justify-center gap-4 flex-wrap">
        {/* Elisa -- virtual narrator member, always central */}
        <div className="flex flex-col items-center gap-1">
          <MinionAvatar name="Elisa" role="narrator" status={elisaStatus} size="lg" />
          <span className="text-xs font-medium text-atelier-text">Elisa</span>
          <span className="text-[10px] text-atelier-text-muted">{displayRole('narrator')}</span>
        </div>

        {/* Worker minions */}
        {agents.map((agent) => {
          const modelLabel = formatModelName(agent.model);
          return (
            <div key={agent.name} className="flex flex-col items-center gap-1">
              <MinionAvatar
                name={agent.name}
                role={agent.role}
                status={agent.status}
                size="md"
              />
              <span className="text-xs font-medium text-atelier-text truncate max-w-[80px]">{agent.name}</span>
              <span className="text-[10px] text-atelier-text-muted">{displayRole(agent.role)}</span>
              {modelLabel && (
                <span className="text-[9px] text-atelier-text-muted/60 font-mono">{modelLabel}</span>
              )}
            </div>
          );
        })}

        {agents.length === 0 && (
          <p className="text-xs text-atelier-text-muted">
            {isPlanning ? 'Assembling the squad...' : 'Minions will appear when you press GO'}
          </p>
        )}
      </div>
    </div>
  );
}

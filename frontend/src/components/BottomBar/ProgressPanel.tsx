import type { UIState, Task } from '../../types';
import type { DeployProgress } from '../../hooks/useBuildSession';

interface ProgressPanelProps {
  uiState: UIState;
  tasks: Task[];
  deployProgress: DeployProgress | null;
  deployChecklist: Array<{ name: string; prompt: string }> | null;
}

export default function ProgressPanel({ uiState, tasks, deployProgress, deployChecklist }: ProgressPanelProps) {
  const doneCount = tasks.filter(t => t.status === 'done').length;
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const isPlanning = uiState === 'building' && tasks.length === 0;
  const isDeploying = uiState === 'building' && deployProgress != null;

  const getPhaseText = () => {
    if (uiState === 'done') return 'Done!';
    if (isDeploying) return deployProgress!.step;
    if (isPlanning) return 'Planning...';
    if (totalCount > 0) {
      const inProgress = tasks.find(t => t.status === 'in_progress');
      if (inProgress) return `Building (${doneCount}/${totalCount})... ${inProgress.name}`;
      return `Building (${doneCount}/${totalCount})...`;
    }
    return `State: ${uiState}`;
  };

  const getProgressBarGradient = () => {
    if (uiState === 'done') return 'bg-gradient-to-r from-accent-mint to-accent-mint/70';
    if (isDeploying) return 'bg-gradient-to-r from-accent-lavender to-accent-lavender/70';
    if (tasks.some(t => t.status === 'failed')) return 'bg-gradient-to-r from-accent-gold to-accent-coral';
    return 'bg-gradient-to-r from-accent-sky to-accent-lavender';
  };

  if (uiState === 'design') {
    return <p className="text-sm text-atelier-text-muted p-4">Progress will appear during a build</p>;
  }

  return (
    <div className="p-4 space-y-2">
      {deployChecklist && deployChecklist.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-accent-coral mb-1">Deploy checklist:</p>
          <ul className="text-xs text-atelier-text-secondary space-y-0.5">
            {deployChecklist.map((rule, i) => (
              <li key={i}><span className="text-atelier-text">{rule.name}</span> -- {rule.prompt}</li>
            ))}
          </ul>
        </div>
      )}
      {isDeploying ? (
        <div>
          <p className="text-sm text-accent-lavender font-medium mb-1.5">{getPhaseText()}</p>
          <div className="w-full h-1.5 bg-atelier-surface rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressBarGradient()} transition-all duration-300 rounded-full`}
              style={{ width: `${deployProgress!.progress}%` }}
            />
          </div>
        </div>
      ) : isPlanning ? (
        <p className="text-sm text-accent-sky font-medium">{getPhaseText()}</p>
      ) : totalCount > 0 ? (
        <div>
          <p className="text-sm text-atelier-text-secondary mb-1.5">{getPhaseText()}</p>
          <div className="w-full h-1.5 bg-atelier-surface rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressBarGradient()} transition-all duration-300 rounded-full`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      ) : uiState === 'done' ? (
        <p className="text-sm text-accent-mint font-bold">{getPhaseText()}</p>
      ) : (
        <p className="text-sm text-atelier-text-muted">{getPhaseText()}</p>
      )}
    </div>
  );
}

import type { TokenUsage } from '../../types';

interface Props {
  tokenUsage: TokenUsage;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

export default function MetricsPanel({ tokenUsage }: Props) {
  if (tokenUsage.total === 0) {
    return <p className="text-sm text-atelier-text-muted">No token data yet</p>;
  }

  const agentNames = Object.keys(tokenUsage.perAgent);
  const budgetPct = Math.min(100, Math.round((tokenUsage.total / tokenUsage.maxBudget) * 100));
  const isWarning = budgetPct >= 80;

  return (
    <div className="space-y-2">
      <div className="text-sm">
        <p className="font-medium text-atelier-text">
          Total tokens: {formatNumber(tokenUsage.total)}
        </p>
        <p className="text-xs text-atelier-text-muted">
          Input: {formatNumber(tokenUsage.input)} | Output: {formatNumber(tokenUsage.output)}
          {tokenUsage.costUsd > 0 && <> | Cost: {formatCost(tokenUsage.costUsd)}</>}
        </p>
      </div>
      <div className="text-xs">
        <div className="flex justify-between mb-1">
          <span className="text-atelier-text-muted">Budget</span>
          <span className={`font-mono ${isWarning ? 'text-amber-600' : 'text-atelier-text-muted'}`}>
            {budgetPct}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-atelier-surface rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isWarning ? 'bg-amber-500' : 'bg-blue-500'}`}
            style={{ width: `${budgetPct}%` }}
          />
        </div>
      </div>
      {agentNames.length > 0 && (
        <ul className="text-xs space-y-1">
          {agentNames.map(name => {
            const agent = tokenUsage.perAgent[name];
            return (
              <li key={name} className="flex justify-between px-2.5 py-1.5 bg-atelier-surface/50 rounded-lg border border-border-subtle">
                <span className="font-medium text-atelier-text-secondary">{name}</span>
                <span className="text-atelier-text-muted font-mono">
                  {formatNumber(agent.input + agent.output)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

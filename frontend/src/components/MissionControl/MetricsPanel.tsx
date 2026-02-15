import type { TokenUsage, Agent } from '../../types';

interface Props {
  tokenUsage: TokenUsage;
  agents?: Agent[];
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

const ROLE_COLORS: Record<string, string> = {
  builder: 'bg-accent-sky',
  tester: 'bg-emerald-400',
  reviewer: 'bg-violet-400',
};

const ROLE_LABELS: Record<string, string> = {
  builder: 'Builders',
  tester: 'Testers',
  reviewer: 'Reviewers',
};

export default function MetricsPanel({ tokenUsage, agents = [] }: Props) {
  if (tokenUsage.total === 0) {
    return <p className="text-sm text-atelier-text-muted">No token data yet</p>;
  }

  const agentNames = Object.keys(tokenUsage.perAgent);
  const budgetPct = Math.min(100, Math.round((tokenUsage.total / tokenUsage.maxBudget) * 100));
  const isWarning = budgetPct >= 80;

  // Build role-grouped token breakdown
  const roleTokens: Record<string, number> = {};
  if (agents.length > 0) {
    const agentRoleMap = new Map(agents.map(a => [a.name, a.role]));
    for (const name of agentNames) {
      const role = agentRoleMap.get(name) ?? 'custom';
      const agent = tokenUsage.perAgent[name];
      roleTokens[role] = (roleTokens[role] ?? 0) + agent.input + agent.output;
    }
  }
  const roleEntries = Object.entries(roleTokens).sort((a, b) => b[1] - a[1]);

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
      {roleEntries.length > 0 && (
        <ul className="text-xs space-y-1">
          {roleEntries.map(([role, tokens]) => {
            const pct = tokenUsage.total > 0 ? Math.round((tokens / tokenUsage.total) * 100) : 0;
            return (
              <li key={role} className="flex items-center justify-between px-2.5 py-1.5 bg-atelier-surface/50 rounded-lg border border-border-subtle">
                <span className="flex items-center gap-1.5">
                  <span className={`inline-block w-2 h-2 rounded-full ${ROLE_COLORS[role] ?? 'bg-amber-400'}`} />
                  <span className="font-medium text-atelier-text-secondary">{ROLE_LABELS[role] ?? role}</span>
                </span>
                <span className="text-atelier-text-muted font-mono">
                  {formatNumber(tokens)} <span className="text-atelier-text-muted/60">({pct}%)</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
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

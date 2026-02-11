import type { HealthStatus } from '../../hooks/useHealthCheck';

interface ReadinessBadgeProps {
  health: HealthStatus;
  loading: boolean;
}

function buildTooltip(health: HealthStatus): string {
  if (health.status === 'ready') {
    return 'API key valid, Claude CLI available';
  }
  if (health.status === 'offline') {
    return 'Backend not reachable';
  }
  const issues: string[] = [];
  if (health.apiKey === 'missing') issues.push('API key not set');
  else if (health.apiKey === 'invalid') issues.push(`API key invalid: ${health.apiKeyError ?? 'unknown error'}`);
  else if (health.apiKey === 'unchecked') issues.push('API key not yet checked');
  if (health.claudeCli === 'not_found') issues.push('Claude CLI not found');
  return issues.join('; ');
}

export default function ReadinessBadge({ health, loading }: ReadinessBadgeProps) {
  if (loading) {
    return (
      <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500">
        Checking...
      </span>
    );
  }

  if (health.status === 'ready') {
    return (
      <span
        className="text-xs px-2 py-1 rounded bg-green-100 text-green-700"
        title={buildTooltip(health)}
      >
        Ready
      </span>
    );
  }

  if (health.status === 'offline') {
    return (
      <span
        className="text-xs px-2 py-1 rounded bg-red-100 text-red-700"
        title={buildTooltip(health)}
      >
        Offline
      </span>
    );
  }

  // degraded
  return (
    <span
      className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700"
      title={buildTooltip(health)}
    >
      Not Ready
    </span>
  );
}

export function formatNdjsonLine(event: Record<string, unknown>): string {
  return JSON.stringify(event) + '\n';
}

export function formatHumanReadable(event: Record<string, unknown>): string {
  const type = event.type as string;

  switch (type) {
    case 'planning_started':
      return 'Planning your project...';
    case 'plan_ready':
      return `Plan ready — ${event.taskCount ?? '?'} tasks identified`;
    case 'task_started':
      return `Starting: ${event.task_name ?? event.task_id}`;
    case 'task_completed':
      return `Completed: ${event.task_name ?? event.task_id}`;
    case 'task_failed':
      return `Failed: ${event.task_name ?? event.task_id} — ${event.error ?? ''}`;
    case 'agent_output':
      return `[${event.task_id}] ${event.message ?? event.content ?? ''}`;
    case 'commit_created':
      return `Committed: ${event.short_sha} ${event.message}`;
    case 'token_usage':
      return `Tokens: ${event.input_tokens}in/${event.output_tokens}out ($${event.cost_usd})`;
    case 'test_result':
      return `Tests: ${event.passed} passed, ${event.failed} failed`;
    case 'deploy_started':
      return `Deploying (${event.target})...`;
    case 'deploy_complete':
      return `Deployed${event.url ? ` at ${event.url}` : ''}`;
    case 'error':
      return `Error: ${event.message}`;
    case 'session_complete':
      return `Complete: ${event.summary}`;
    default:
      return `[${type}] ${JSON.stringify(event)}`;
  }
}

export interface BuildSummary {
  tasksCompleted: number;
  tasksFailed: number;
  testsPassed: number;
  testsFailed: number;
  summary: string;
  events: Record<string, unknown>[];
}

export function collectSummary() {
  const events: Record<string, unknown>[] = [];
  let tasksCompleted = 0;
  let tasksFailed = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  let summary = '';

  return {
    push(event: Record<string, unknown>) {
      events.push(event);
      const type = event.type as string;
      if (type === 'task_completed') tasksCompleted++;
      if (type === 'task_failed') tasksFailed++;
      if (type === 'test_result') {
        testsPassed += (event.passed as number) ?? 0;
        testsFailed += (event.failed as number) ?? 0;
      }
      if (type === 'session_complete') {
        summary = (event.summary as string) ?? '';
      }
    },
    getSummary(): BuildSummary {
      return { tasksCompleted, tasksFailed, testsPassed, testsFailed, summary, events };
    },
  };
}

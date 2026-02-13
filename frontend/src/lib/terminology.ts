/** Centralized display-name mappings for agent -> minion terminology. */

export const TERMS = {
  agent: 'minion',
  agents: 'minions',
  Agent: 'Minion',
  Agents: 'Minions',
  agentTeam: 'Minion Squad',
  commsFeed: 'Narrator',
} as const;

export function displayRole(role: string): string {
  const map: Record<string, string> = {
    builder: 'Builder',
    tester: 'Tester',
    reviewer: 'Reviewer',
    custom: 'Helper',
    narrator: 'Narrator',
  };
  return map[role] ?? role;
}

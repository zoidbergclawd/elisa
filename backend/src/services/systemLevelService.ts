/**
 * System level service: pure functions that determine feature gating
 * based on the progressive mastery system level.
 *
 * Three levels:
 *   Explorer -- "See Systems" (default): maximum automation, full narration
 *   Builder  -- "Understand Systems": manual control, selective narration
 *   Architect -- "Design Systems": nothing automatic, minimal narration
 */

export type SystemLevel = 'explorer' | 'builder' | 'architect';

export type DAGDetailLevel = 'agent' | 'task';

export type NarrationLevel = 'full' | 'selective' | 'minimal';

/** Extract the system level from a NuggetSpec, defaulting to 'explorer'. */
export function getLevel(spec: Record<string, unknown>): SystemLevel {
  const workflow = spec.workflow as Record<string, unknown> | undefined;
  const level = workflow?.system_level;
  if (level === 'builder' || level === 'architect') return level;
  return 'explorer';
}

/** At Explorer level, tests are auto-paired to requirements. */
export function shouldAutoMatchTests(level: SystemLevel): boolean {
  return level === 'explorer';
}

/**
 * Narration level for the given system level:
 *   explorer  -> full    (everything is narrated)
 *   builder   -> selective (key events only)
 *   architect -> minimal (almost nothing)
 */
export function getNarrationLevel(level: SystemLevel): NarrationLevel {
  switch (level) {
    case 'explorer': return 'full';
    case 'builder': return 'selective';
    case 'architect': return 'minimal';
  }
}

/** Convenience: should any narration happen at all for this event importance? */
export function shouldNarrate(level: SystemLevel, importance: 'low' | 'medium' | 'high' = 'medium'): boolean {
  const narration = getNarrationLevel(level);
  if (narration === 'full') return true;
  if (narration === 'selective') return importance !== 'low';
  // minimal: only high-importance events
  return importance === 'high';
}

/**
 * DAG detail level determines what the system map shows:
 *   explorer  -> 'agent' (simplified, one node per agent)
 *   builder   -> 'task'  (full task-level detail)
 *   architect -> 'task'  (full task-level detail)
 */
export function getDAGDetailLevel(level: SystemLevel): DAGDetailLevel {
  return level === 'explorer' ? 'agent' : 'task';
}

/** At Explorer level, Agent Meeting invites appear automatically. */
export function shouldAutoInviteMeetings(level: SystemLevel): boolean {
  return level === 'explorer';
}

/**
 * Maximum number of nuggets that can be composed at this level:
 *   explorer  -> 1  (single nugget only)
 *   builder   -> 3  (2-3 nuggets)
 *   architect -> Infinity (unlimited)
 */
export function getMaxNuggets(level: SystemLevel): number {
  switch (level) {
    case 'explorer': return 1;
    case 'builder': return 3;
    case 'architect': return Infinity;
  }
}

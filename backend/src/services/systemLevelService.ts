/**
 * System level service: pure functions that determine feature gating
 * based on the progressive mastery system level.
 *
 * Three levels:
 *   Explorer -- "See Systems" (default): maximum automation, full narration
 *   Builder  -- "Understand Systems": manual control, selective narration
 *   Architect -- "Design Systems": nothing automatic, minimal narration
 */

import type { NuggetSpec } from '../utils/specValidator.js';

export type SystemLevel = 'explorer' | 'builder' | 'architect';

export type DAGDetailLevel = 'agent' | 'task';

export type NarrationLevel = 'full' | 'selective' | 'minimal';

/** Extract the system level from a NuggetSpec, defaulting to 'explorer'. */
export function getLevel(spec: NuggetSpec): SystemLevel {
  const level = spec.workflow?.system_level;
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

/** Agent Meeting invites appear automatically at all levels. */
export function shouldAutoInviteMeetings(_level: SystemLevel): boolean {
  return true;
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

// ---------------------------------------------------------------------------
// Level Progression
// ---------------------------------------------------------------------------

/** Tunable thresholds for level progression. */
export const LEVEL_PROGRESSION_CRITERIA = {
  explorer_to_builder: {
    min_builds: 3,
    min_builds_with_tests: 1,
    min_meeting_interactions: 1,
  },
  builder_to_architect: {
    min_builds: 5,
    min_builds_with_custom_feedback: 1,
    min_high_health_builds: 2,
    high_health_threshold: 80,
  },
} as const;

/** A single completed build in the kid's history. */
export interface BuildRecord {
  used_behavioral_tests: boolean;
  used_custom_feedback_loops: boolean;
  meeting_interactions: number;
  health_score: number | null;
}

/** A single criterion in the progression progress report. */
export interface ProgressionCriterion {
  name: string;
  met: boolean;
  progress: string;
}

/** Progression progress report for UI display. */
export interface ProgressionProgress {
  current_level: SystemLevel;
  next_level: SystemLevel | null;
  criteria: ProgressionCriterion[];
}

/** Event type suggestion for when a kid levels up. */
export interface LevelUpEvent {
  type: 'level_up';
  from_level: SystemLevel;
  to_level: SystemLevel;
}

/**
 * Check whether the kid should level up based on build history.
 * Pure function: takes current level and build history, returns the new level
 * (or the same level if no progression is warranted).
 */
export function checkProgression(currentLevel: SystemLevel, history: BuildRecord[]): SystemLevel {
  if (currentLevel === 'architect') return 'architect';

  if (currentLevel === 'explorer') {
    const c = LEVEL_PROGRESSION_CRITERIA.explorer_to_builder;
    const totalBuilds = history.length;
    const buildsWithTests = history.filter(b => b.used_behavioral_tests).length;
    const totalMeetingInteractions = history.reduce((sum, b) => sum + b.meeting_interactions, 0);

    if (
      totalBuilds >= c.min_builds &&
      buildsWithTests >= c.min_builds_with_tests &&
      totalMeetingInteractions >= c.min_meeting_interactions
    ) {
      return 'builder';
    }
    return 'explorer';
  }

  // builder -> architect
  const c = LEVEL_PROGRESSION_CRITERIA.builder_to_architect;
  const totalBuilds = history.length;
  const buildsWithCustomFeedback = history.filter(b => b.used_custom_feedback_loops).length;
  const highHealthBuilds = history.filter(
    b => b.health_score !== null && b.health_score >= c.high_health_threshold
  ).length;

  if (
    totalBuilds >= c.min_builds &&
    buildsWithCustomFeedback >= c.min_builds_with_custom_feedback &&
    highHealthBuilds >= c.min_high_health_builds
  ) {
    return 'architect';
  }
  return 'builder';
}

/**
 * Get current progress toward the next level for UI display.
 * Pure function: takes current level and build history, returns progress report.
 */
export function getProgressionProgress(currentLevel: SystemLevel, history: BuildRecord[]): ProgressionProgress {
  if (currentLevel === 'architect') {
    return { current_level: 'architect', next_level: null, criteria: [] };
  }

  if (currentLevel === 'explorer') {
    const c = LEVEL_PROGRESSION_CRITERIA.explorer_to_builder;
    const totalBuilds = history.length;
    const buildsWithTests = history.filter(b => b.used_behavioral_tests).length;
    const totalMeetingInteractions = history.reduce((sum, b) => sum + b.meeting_interactions, 0);

    return {
      current_level: 'explorer',
      next_level: 'builder',
      criteria: [
        {
          name: 'Complete builds',
          met: totalBuilds >= c.min_builds,
          progress: `${totalBuilds}/${c.min_builds}`,
        },
        {
          name: 'Use behavioral tests',
          met: buildsWithTests >= c.min_builds_with_tests,
          progress: `${buildsWithTests}/${c.min_builds_with_tests}`,
        },
        {
          name: 'Interact with Agent Meetings',
          met: totalMeetingInteractions >= c.min_meeting_interactions,
          progress: `${totalMeetingInteractions}/${c.min_meeting_interactions}`,
        },
      ],
    };
  }

  // builder -> architect
  const c = LEVEL_PROGRESSION_CRITERIA.builder_to_architect;
  const totalBuilds = history.length;
  const buildsWithCustomFeedback = history.filter(b => b.used_custom_feedback_loops).length;
  const highHealthBuilds = history.filter(
    b => b.health_score !== null && b.health_score >= c.high_health_threshold
  ).length;

  return {
    current_level: 'builder',
    next_level: 'architect',
    criteria: [
      {
        name: 'Complete builds',
        met: totalBuilds >= c.min_builds,
        progress: `${totalBuilds}/${c.min_builds}`,
      },
      {
        name: 'Use custom feedback loops',
        met: buildsWithCustomFeedback >= c.min_builds_with_custom_feedback,
        progress: `${buildsWithCustomFeedback}/${c.min_builds_with_custom_feedback}`,
      },
      {
        name: 'Achieve 80%+ health scores',
        met: highHealthBuilds >= c.min_high_health_builds,
        progress: `${highHealthBuilds}/${c.min_high_health_builds}`,
      },
    ],
  };
}

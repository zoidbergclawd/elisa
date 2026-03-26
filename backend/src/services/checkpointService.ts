/** HITL checkpoint service: decides when to fire checkpoints and creates checkpoint data. */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DESIGN_KEYWORDS } from './taskMeetingTypes.js';
import type { Task } from '../models/session.js';

export type CheckpointType = 'visual' | 'choice' | 'progress';

export interface CheckpointChoice {
  id: string;
  label: string;
  description: string;
}

export interface CheckpointData {
  checkpoint_id: string;
  checkpoint_type: CheckpointType;
  task_id: string;
  screenshot_base64?: string;
  choices?: CheckpointChoice[];
  summary?: string;
  progress_pct: number;
  narrator_message?: string;
}

export interface CheckpointResponse {
  response: 'approve' | 'reject' | 'choice';
  choice_id?: string;
  comment?: string;
}

export interface DecisionFile {
  choices: CheckpointChoice[];
  question: string;
}

/**
 * Determine whether a checkpoint should fire after a task completes.
 * Returns the checkpoint type or null if no checkpoint should fire.
 */
export function shouldFireCheckpoint(
  task: Task,
  completedCount: number,
  totalCount: number,
  checkpointsFired: number,
  maxCheckpoints: number,
): CheckpointType | null {
  if (checkpointsFired >= maxCheckpoints) return null;
  if (totalCount === 0) return null;

  // Visual checkpoint for design-related tasks
  const text = `${task.name ?? ''} ${task.description ?? ''}`.toLowerCase();
  if (DESIGN_KEYWORDS.test(text)) return 'visual';

  // Progress checkpoints at ~33% and ~66% completion
  // Skip if only 1 task (nothing meaningful to check in on) or at 100% (build about to end)
  if (totalCount <= 1 || completedCount >= totalCount) return null;
  const pct = completedCount / totalCount;
  const prevPct = (completedCount - 1) / totalCount;
  if (prevPct < 0.33 && pct >= 0.33) return 'progress';
  if (prevPct < 0.66 && pct >= 0.66) return 'progress';

  return null;
}

/**
 * Create checkpoint data for a given type and task context.
 */
export function createCheckpoint(
  type: CheckpointType,
  task: Task,
  completedCount: number,
  totalCount: number,
): CheckpointData {
  const progress_pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    checkpoint_id: randomUUID(),
    checkpoint_type: type,
    task_id: task.id,
    summary: `Completed "${task.name}" (${completedCount}/${totalCount} tasks done)`,
    progress_pct,
  };
}

/**
 * Read decision files written by agents for choice checkpoints.
 */
export function readDecisionFiles(nuggetDir: string, taskId: string): DecisionFile | null {
  const decisionPath = path.join(nuggetDir, '.elisa', 'decisions', `${taskId}.json`);
  try {
    if (!fs.existsSync(decisionPath)) return null;
    const raw = fs.readFileSync(decisionPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.choices || !Array.isArray(data.choices)) return null;
    return data as DecisionFile;
  } catch {
    return null;
  }
}

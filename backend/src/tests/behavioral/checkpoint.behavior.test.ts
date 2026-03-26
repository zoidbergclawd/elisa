/** Behavioral tests for the HITL checkpoint system. */

import { describe, it, expect, vi } from 'vitest';
import { shouldFireCheckpoint, createCheckpoint, readDecisionFiles } from '../../services/checkpointService.js';
import type { Task } from '../../models/session.js';
import type { CheckpointResponse } from '../../services/checkpointService.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Build feature',
    description: 'Implement the feature',
    status: 'done',
    agent_name: 'builder-1',
    dependencies: [],
    ...overrides,
  };
}

describe('HITL Checkpoint System', () => {
  describe('checkpoint trigger logic', () => {
    it('fires visual checkpoint for design tasks', () => {
      const task = makeTask({ name: 'Create sprite sheet' });
      const result = shouldFireCheckpoint(task, 2, 10, 0, 3);
      expect(result).toBe('visual');
    });

    it('does not fire progress checkpoints (disabled -- not actionable without preview)', () => {
      const task = makeTask({ name: 'Add game logic' });
      expect(shouldFireCheckpoint(task, 4, 10, 0, 3)).toBeNull();
      expect(shouldFireCheckpoint(task, 7, 10, 0, 3)).toBeNull();
    });

    it('respects max checkpoint limit', () => {
      const task = makeTask({ name: 'Design the logo' });
      const result = shouldFireCheckpoint(task, 2, 10, 3, 3);
      expect(result).toBeNull();
    });

    it('does not fire between thresholds', () => {
      const task = makeTask({ name: 'Add code' });
      // 5/10 = 50%, previous was 4/10 = 40% -> no boundary crossed
      const result = shouldFireCheckpoint(task, 5, 10, 0, 3);
      expect(result).toBeNull();
    });
  });

  describe('checkpoint data creation', () => {
    it('creates checkpoint with progress percentage', () => {
      const task = makeTask();
      const cp = createCheckpoint('progress', task, 5, 10);
      expect(cp.progress_pct).toBe(50);
      expect(cp.checkpoint_type).toBe('progress');
      expect(cp.task_id).toBe('task-1');
    });

    it('creates unique checkpoint IDs', () => {
      const task = makeTask();
      const cp1 = createCheckpoint('progress', task, 3, 10);
      const cp2 = createCheckpoint('progress', task, 7, 10);
      expect(cp1.checkpoint_id).not.toBe(cp2.checkpoint_id);
    });

    it('includes task name in summary', () => {
      const task = makeTask({ name: 'Create player controls' });
      const cp = createCheckpoint('visual', task, 3, 10);
      expect(cp.summary).toContain('Create player controls');
    });
  });

  describe('checkpoint resolver pattern', () => {
    it('resolver map stores and resolves checkpoint responses', () => {
      const resolvers = new Map<string, (response: CheckpointResponse) => void>();
      let capturedResponse: CheckpointResponse | null = null;

      const promise = new Promise<CheckpointResponse>((resolve) => {
        resolvers.set('cp-1', resolve);
      });

      promise.then((r) => { capturedResponse = r; });

      // Simulate kid responding
      const resolver = resolvers.get('cp-1');
      expect(resolver).toBeTruthy();
      resolver!({ response: 'approve', comment: 'Looks great!' });
      resolvers.delete('cp-1');

      return promise.then((response) => {
        expect(response.response).toBe('approve');
        expect(response.comment).toBe('Looks great!');
      });
    });

    it('choice response includes selected choice_id', async () => {
      const resolvers = new Map<string, (response: CheckpointResponse) => void>();

      const promise = new Promise<CheckpointResponse>((resolve) => {
        resolvers.set('cp-2', resolve);
      });

      resolvers.get('cp-2')!({ response: 'choice', choice_id: 'opt-a' });

      const response = await promise;
      expect(response.response).toBe('choice');
      expect(response.choice_id).toBe('opt-a');
    });
  });

  describe('decision file reading', () => {
    it('returns null for nonexistent files', () => {
      const result = readDecisionFiles('/nonexistent/path', 'task-1');
      expect(result).toBeNull();
    });
  });
});

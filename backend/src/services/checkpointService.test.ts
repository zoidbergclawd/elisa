import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { shouldFireCheckpoint, createCheckpoint, readDecisionFiles } from './checkpointService.js';
import type { Task } from '../models/session.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Build UI',
    description: 'Create the main interface',
    status: 'done',
    agent_name: 'builder-1',
    dependencies: [],
    ...overrides,
  };
}

describe('shouldFireCheckpoint', () => {
  it('returns null when max checkpoints reached', () => {
    const task = makeTask();
    expect(shouldFireCheckpoint(task, 3, 10, 3, 3)).toBeNull();
  });

  it('returns null when totalCount is zero', () => {
    const task = makeTask();
    expect(shouldFireCheckpoint(task, 0, 0, 0, 3)).toBeNull();
  });

  it('returns visual for design-related tasks', () => {
    const task = makeTask({ name: 'Create sprite animations' });
    expect(shouldFireCheckpoint(task, 1, 10, 0, 3)).toBe('visual');
  });

  it('returns visual for tasks with design keywords in description', () => {
    const task = makeTask({ name: 'Task 1', description: 'Apply color palette to header' });
    expect(shouldFireCheckpoint(task, 1, 10, 0, 3)).toBe('visual');
  });

  it('does not fire progress checkpoints (disabled -- not actionable without preview)', () => {
    const task = makeTask({ name: 'Add logic' });
    // 33% boundary
    expect(shouldFireCheckpoint(task, 4, 10, 0, 3)).toBeNull();
    // 66% boundary
    expect(shouldFireCheckpoint(task, 7, 10, 0, 3)).toBeNull();
  });

  it('still fires visual even at progress boundaries', () => {
    const task = makeTask({ name: 'Design the logo' });
    expect(shouldFireCheckpoint(task, 4, 10, 0, 3)).toBe('visual');
  });
});

describe('createCheckpoint', () => {
  it('creates checkpoint with correct fields', () => {
    const task = makeTask();
    const cp = createCheckpoint('progress', task, 5, 10);
    expect(cp.checkpoint_id).toBeTruthy();
    expect(cp.checkpoint_type).toBe('progress');
    expect(cp.task_id).toBe('task-1');
    expect(cp.progress_pct).toBe(50);
    expect(cp.summary).toContain('Build UI');
    expect(cp.summary).toContain('5/10');
  });

  it('handles zero total gracefully', () => {
    const task = makeTask();
    const cp = createCheckpoint('visual', task, 0, 0);
    expect(cp.progress_pct).toBe(0);
  });
});

describe('readDecisionFiles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when file does not exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(readDecisionFiles('/tmp/nugget', 'task-1')).toBeNull();
  });

  it('reads and parses valid decision file', () => {
    const data = {
      choices: [{ id: 'a', label: 'Option A', description: 'First option' }],
      question: 'Which style?',
    };
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(data));
    const result = readDecisionFiles('/tmp/nugget', 'task-1');
    expect(result).toEqual(data);
  });

  it('returns null for invalid JSON', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('not json');
    expect(readDecisionFiles('/tmp/nugget', 'task-1')).toBeNull();
  });

  it('returns null when choices is missing', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ question: 'hi' }));
    expect(readDecisionFiles('/tmp/nugget', 'task-1')).toBeNull();
  });

  it('constructs the correct file path', () => {
    const spy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    readDecisionFiles('/tmp/nugget', 'task-42');
    const expectedPath = path.join('/tmp/nugget', '.elisa', 'decisions', 'task-42.json');
    expect(spy).toHaveBeenCalledWith(expectedPath);
  });

  it('returns decision data with multiple choices for choice checkpoint', () => {
    const data = {
      choices: [
        { id: 'dark', label: 'Dark Mode', description: 'Use dark background' },
        { id: 'light', label: 'Light Mode', description: 'Use light background' },
      ],
      question: 'Which color theme should we use?',
    };
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(data));
    const result = readDecisionFiles('/tmp/nugget', 'task-1');
    expect(result).not.toBeNull();
    expect(result!.choices).toHaveLength(2);
    expect(result!.choices[0].id).toBe('dark');
    expect(result!.question).toBe('Which color theme should we use?');
  });
});

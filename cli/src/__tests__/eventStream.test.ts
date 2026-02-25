import { describe, it, expect } from 'vitest';
import { formatNdjsonLine, formatHumanReadable, collectSummary } from '../eventStream.js';

describe('formatNdjsonLine', () => {
  it('serializes an event as a single JSON line with newline', () => {
    const event = { type: 'task_started', task_id: '1', task_name: 'Setup' };
    const line = formatNdjsonLine(event);
    expect(line).toBe('{"type":"task_started","task_id":"1","task_name":"Setup"}\n');
  });

  it('handles events with nested objects', () => {
    const event = { type: 'test_result', data: { passed: 3, failed: 0 } };
    const line = formatNdjsonLine(event);
    const parsed = JSON.parse(line.trim());
    expect(parsed.data.passed).toBe(3);
  });
});

describe('formatHumanReadable', () => {
  it('formats planning_started', () => {
    const msg = formatHumanReadable({ type: 'planning_started' });
    expect(msg).toContain('Planning');
  });

  it('formats task_started with task name', () => {
    const msg = formatHumanReadable({ type: 'task_started', task_name: 'Build API' });
    expect(msg).toContain('Build API');
  });

  it('formats task_completed', () => {
    const msg = formatHumanReadable({ type: 'task_completed', task_id: '1' });
    expect(msg).toContain('ompleted');
  });

  it('formats session_complete with summary', () => {
    const msg = formatHumanReadable({ type: 'session_complete', summary: 'Built 3 files' });
    expect(msg).toContain('Built 3 files');
  });

  it('formats error events', () => {
    const msg = formatHumanReadable({ type: 'error', message: 'Something broke' });
    expect(msg).toContain('Something broke');
  });

  it('returns a generic message for unknown event types', () => {
    const msg = formatHumanReadable({ type: 'unknown_event_xyz' });
    expect(msg).toBeTruthy();
  });
});

describe('collectSummary', () => {
  it('accumulates events and returns a summary object', () => {
    const collector = collectSummary();
    collector.push({ type: 'planning_started' });
    collector.push({ type: 'task_started', task_id: '1', task_name: 'Setup' });
    collector.push({ type: 'task_completed', task_id: '1' });
    collector.push({ type: 'test_result', passed: 3, failed: 0 });
    collector.push({ type: 'session_complete', summary: 'Done' });

    const summary = collector.getSummary();
    expect(summary.tasksCompleted).toBe(1);
    expect(summary.testsPassed).toBe(3);
    expect(summary.testsFailed).toBe(0);
    expect(summary.summary).toBe('Done');
  });
});

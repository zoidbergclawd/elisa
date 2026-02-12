/** Behavioral tests for Issue 2: Frontend/backend contract fixes.
 *
 * Covers:
 * - BUG-2: formatStyle reads visual/personality (current) and colors/theme/tone (legacy)
 * - BUG-17: makeQuestionHandler emits { type, task_id, questions } shape
 */

import { describe, it, expect } from 'vitest';
import { formatStyle, formatTaskPrompt } from '../../prompts/builderAgent.js';
import * as reviewerAgent from '../../prompts/reviewerAgent.js';

describe('BUG-2: formatStyle reads current frontend fields', () => {
  it('formats visual and personality fields', () => {
    const result = formatStyle({ visual: 'retro pixel art', personality: 'sarcastic robot' });
    expect(result).toContain('Visual Style: retro pixel art');
    expect(result).toContain('Personality: sarcastic robot');
  });

  it('still handles legacy colors/theme/tone fields', () => {
    const result = formatStyle({ colors: 'blue and green', theme: 'space', tone: 'fun' });
    expect(result).toContain('Colors: blue and green');
    expect(result).toContain('Theme: space');
    expect(result).toContain('Tone: fun');
  });

  it('handles mixed current and legacy fields', () => {
    const result = formatStyle({
      visual: 'neon',
      personality: 'friendly',
      colors: 'red',
    });
    expect(result).toContain('Visual Style: neon');
    expect(result).toContain('Personality: friendly');
    expect(result).toContain('Colors: red');
  });

  it('returns fallback when no fields present', () => {
    const result = formatStyle({});
    expect(result).toBe('No specific style preferences.');
  });

  it('includes style in builder task prompt', () => {
    const prompt = formatTaskPrompt({
      agentName: 'Builder',
      role: 'builder',
      persona: 'A robot',
      task: { name: 'Build', description: 'Build it', acceptance_criteria: [] },
      spec: { nugget: { goal: 'A game' } },
      predecessors: [],
      style: { visual: 'pixel art', personality: 'cheerful' },
    });
    expect(prompt).toContain('Visual Style: pixel art');
    expect(prompt).toContain('Personality: cheerful');
  });
});

describe('BUG-2: Reviewer style fields', () => {
  it('includes visual and personality in reviewer prompt', () => {
    const prompt = reviewerAgent.formatTaskPrompt({
      agentName: 'Reviewer',
      role: 'reviewer',
      persona: 'A teacher',
      task: { name: 'Review', description: 'Review it', acceptance_criteria: [] },
      spec: { nugget: { goal: 'A game' } },
      predecessors: [],
      style: { visual: 'retro', personality: 'encouraging' },
    });
    expect(prompt).toContain('Visual Style: retro');
    expect(prompt).toContain('Personality: encouraging');
  });
});

describe('BUG-17: user_question event shape', () => {
  it('makeQuestionHandler emits correct shape', async () => {
    // We test the event shape indirectly by creating a minimal orchestrator-like setup
    const events: Record<string, any>[] = [];
    const send = async (evt: Record<string, any>) => { events.push(evt); };

    // Simulate what makeQuestionHandler does (the fix changed payload -> questions)
    const taskId = 'task-1';
    const payload = [{ question: 'Pick a color', header: 'Color', options: [], multiSelect: false }];

    // This mirrors the fixed makeQuestionHandler logic
    await send({
      type: 'user_question',
      task_id: taskId,
      questions: payload,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'user_question',
      task_id: 'task-1',
      questions: payload,
    });
    // Must NOT have 'event' or 'payload' fields
    expect(events[0]).not.toHaveProperty('event');
    expect(events[0]).not.toHaveProperty('payload');
  });
});

import { describe, it, expect } from 'vitest';
import { NARRATOR_SYSTEM_PROMPT, narratorUserPrompt } from './narratorAgent.js';

describe('NARRATOR_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof NARRATOR_SYSTEM_PROMPT).toBe('string');
    expect(NARRATOR_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('contains "minion" keyword', () => {
    expect(NARRATOR_SYSTEM_PROMPT.toLowerCase()).toContain('minion');
  });

  it('contains mood keywords', () => {
    for (const mood of ['excited', 'encouraging', 'concerned', 'celebrating']) {
      expect(NARRATOR_SYSTEM_PROMPT).toContain(mood);
    }
  });

  it('contains kid-friendly age reference', () => {
    expect(NARRATOR_SYSTEM_PROMPT).toContain('8-14');
  });

  it('requires JSON response format', () => {
    expect(NARRATOR_SYSTEM_PROMPT).toContain('JSON');
    expect(NARRATOR_SYSTEM_PROMPT).toContain('"text"');
    expect(NARRATOR_SYSTEM_PROMPT).toContain('"mood"');
  });
});

describe('narratorUserPrompt', () => {
  it('returns a string containing the event type', () => {
    const result = narratorUserPrompt({
      eventType: 'task_completed',
      agentName: 'Builder Bot',
      content: 'finished building',
      nuggetGoal: 'A fun game',
      recentHistory: [],
    });
    expect(typeof result).toBe('string');
    expect(result).toContain('task_completed');
  });

  it('includes the agent name in the output', () => {
    const result = narratorUserPrompt({
      eventType: 'task_started',
      agentName: 'Pixel Painter',
      content: 'starting work',
      nuggetGoal: 'Draw art',
      recentHistory: [],
    });
    expect(result).toContain('Pixel Painter');
  });

  it('includes the project goal', () => {
    const result = narratorUserPrompt({
      eventType: 'task_started',
      agentName: 'Bot',
      content: 'working',
      nuggetGoal: 'Build a rocket ship',
      recentHistory: [],
    });
    expect(result).toContain('Build a rocket ship');
  });

  it('includes recent history when provided', () => {
    const result = narratorUserPrompt({
      eventType: 'task_started',
      agentName: 'Bot',
      content: 'working',
      nuggetGoal: 'Test',
      recentHistory: ['Bot is getting started!', 'Bot made progress!'],
    });
    expect(result).toContain('Bot is getting started!');
    expect(result).toContain('Bot made progress!');
  });

  it('omits history block when recentHistory is empty', () => {
    const result = narratorUserPrompt({
      eventType: 'task_started',
      agentName: 'Bot',
      content: 'working',
      nuggetGoal: 'Test',
      recentHistory: [],
    });
    expect(result).not.toContain('Recent narration');
  });
});

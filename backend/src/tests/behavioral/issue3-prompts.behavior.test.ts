/** Behavioral tests for Issue 3: Prompt engineering and injection hardening.
 *
 * Covers:
 * - PROMPT-4: Nugget goal/type/description appear in assembled system prompts
 * - PROMPT-7: Team briefing section in system prompts
 * - PROMPT-11: Tester prompt includes tech stack section
 * - SEC-S3: Skills/rules appear in user prompt (not system prompt)
 */

import { describe, it, expect } from 'vitest';
import * as builderAgent from '../../prompts/builderAgent.js';
import * as testerAgent from '../../prompts/testerAgent.js';
import * as reviewerAgent from '../../prompts/reviewerAgent.js';

describe('PROMPT-4: Nugget placeholders in system prompts', () => {
  it('builder system prompt contains nugget placeholders', () => {
    expect(builderAgent.SYSTEM_PROMPT).toContain('{nugget_goal}');
    expect(builderAgent.SYSTEM_PROMPT).toContain('{nugget_type}');
    expect(builderAgent.SYSTEM_PROMPT).toContain('{nugget_description}');
  });

  it('tester system prompt contains nugget placeholders', () => {
    expect(testerAgent.SYSTEM_PROMPT).toContain('{nugget_goal}');
    expect(testerAgent.SYSTEM_PROMPT).toContain('{nugget_type}');
    expect(testerAgent.SYSTEM_PROMPT).toContain('{nugget_description}');
  });

  it('reviewer system prompt contains nugget placeholders', () => {
    expect(reviewerAgent.SYSTEM_PROMPT).toContain('{nugget_goal}');
    expect(reviewerAgent.SYSTEM_PROMPT).toContain('{nugget_type}');
    expect(reviewerAgent.SYSTEM_PROMPT).toContain('{nugget_description}');
  });
});

describe('PROMPT-7: Team briefing in system prompts', () => {
  it('builder has team briefing', () => {
    expect(builderAgent.SYSTEM_PROMPT).toContain('Team Briefing');
    expect(builderAgent.SYSTEM_PROMPT).toContain('multi-agent team');
  });

  it('tester has team briefing', () => {
    expect(testerAgent.SYSTEM_PROMPT).toContain('Team Briefing');
    expect(testerAgent.SYSTEM_PROMPT).toContain('multi-agent team');
  });

  it('reviewer has team briefing', () => {
    expect(reviewerAgent.SYSTEM_PROMPT).toContain('Team Briefing');
    expect(reviewerAgent.SYSTEM_PROMPT).toContain('multi-agent team');
  });
});

describe('PROMPT-11: Tester tech stack section', () => {
  it('includes hardware tech stack for ESP32 nuggets', () => {
    const prompt = testerAgent.formatTaskPrompt({
      agentName: 'Test Bot',
      role: 'tester',
      persona: 'A detective',
      task: { name: 'Test', description: 'Test it', acceptance_criteria: [] },
      spec: {
        nugget: { goal: 'Blink LED', type: 'hardware' },
        deployment: { target: 'esp32' },
      },
      predecessors: [],
    });
    expect(prompt).toContain('Tech Stack');
    expect(prompt).toContain('MicroPython');
    expect(prompt).toContain('py_compile');
  });

  it('includes software tech stack for web nuggets', () => {
    const prompt = testerAgent.formatTaskPrompt({
      agentName: 'Test Bot',
      role: 'tester',
      persona: 'A detective',
      task: { name: 'Test', description: 'Test it', acceptance_criteria: [] },
      spec: {
        nugget: { goal: 'A game', type: 'software' },
        deployment: { target: 'preview' },
      },
      predecessors: [],
    });
    expect(prompt).toContain('Tech Stack');
    expect(prompt).toContain('pytest');
    expect(prompt).toContain('Vitest');
  });
});

describe('SEC-S3: Skills/rules in user prompt, not system prompt', () => {
  it('system prompt templates do not contain skills/rules sections', () => {
    // System prompts should not have kid's custom instructions hardcoded.
    // Those are injected at runtime into the user prompt by orchestrator.
    for (const mod of [builderAgent, testerAgent, reviewerAgent]) {
      expect(mod.SYSTEM_PROMPT).not.toContain("Kid's Custom Instructions");
    }
  });
});

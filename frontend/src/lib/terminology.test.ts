import { describe, it, expect } from 'vitest';
import { TERMS, displayRole } from './terminology';

describe('TERMS constant', () => {
  it('maps agent to minion', () => {
    expect(TERMS.agent).toBe('minion');
  });

  it('maps agents to minions', () => {
    expect(TERMS.agents).toBe('minions');
  });

  it('maps capitalized Agent to Minion', () => {
    expect(TERMS.Agent).toBe('Minion');
  });

  it('maps capitalized Agents to Minions', () => {
    expect(TERMS.Agents).toBe('Minions');
  });

  it('maps agentTeam to Minion Squad', () => {
    expect(TERMS.agentTeam).toBe('Minion Squad');
  });

  it('maps commsFeed to Narrator', () => {
    expect(TERMS.commsFeed).toBe('Narrator');
  });
});

describe('displayRole', () => {
  it('maps builder to Builder', () => {
    expect(displayRole('builder')).toBe('Builder');
  });

  it('maps tester to Tester', () => {
    expect(displayRole('tester')).toBe('Tester');
  });

  it('maps reviewer to Reviewer', () => {
    expect(displayRole('reviewer')).toBe('Reviewer');
  });

  it('maps custom to Helper', () => {
    expect(displayRole('custom')).toBe('Helper');
  });

  it('maps narrator to Narrator', () => {
    expect(displayRole('narrator')).toBe('Narrator');
  });

  it('returns unknown role string as-is', () => {
    expect(displayRole('wizard')).toBe('wizard');
  });

  it('returns empty string as-is', () => {
    expect(displayRole('')).toBe('');
  });
});

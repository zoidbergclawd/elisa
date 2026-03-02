import { describe, it, expect } from 'vitest';
import { DESIGN_KEYWORDS, SCAFFOLD_SKIP_KEYWORDS } from '../services/taskMeetingTypes.js';

describe('DESIGN_KEYWORDS', () => {
  it('matches visual/design-related words', () => {
    const matches = ['sprite', 'art', 'icon', 'theme', 'logo', 'animation', 'design', 'visual', 'image', 'graphic', 'appearance', 'style', 'color', 'palette', 'layout'];
    for (const word of matches) {
      expect(DESIGN_KEYWORDS.test(word), `expected "${word}" to match`).toBe(true);
    }
  });

  it('does not match non-design words', () => {
    expect(DESIGN_KEYWORDS.test('database')).toBe(false);
    expect(DESIGN_KEYWORDS.test('api endpoint')).toBe(false);
    expect(DESIGN_KEYWORDS.test('login system')).toBe(false);
  });
});

describe('SCAFFOLD_SKIP_KEYWORDS', () => {
  it('matches scaffold/setup-related words', () => {
    const matches = ['scaffold', 'setup', 'initialization', 'configure', 'install', 'boilerplate', 'test', 'testing', 'unit test', 'lint'];
    for (const word of matches) {
      expect(SCAFFOLD_SKIP_KEYWORDS.test(word), `expected "${word}" to match`).toBe(true);
    }
  });

  it('does not match design words', () => {
    expect(SCAFFOLD_SKIP_KEYWORDS.test('sprite')).toBe(false);
    expect(SCAFFOLD_SKIP_KEYWORDS.test('design spaceship')).toBe(false);
  });
});

describe('keyword interaction: skip takes priority over match', () => {
  it('scaffold task with design keywords should be skipped', () => {
    const text = 'scaffold project with visual theme setup';
    const shouldSkip = SCAFFOLD_SKIP_KEYWORDS.test(text);
    const hasDesign = DESIGN_KEYWORDS.test(text);
    expect(shouldSkip).toBe(true);
    expect(hasDesign).toBe(true);
    // skip takes priority
    const wouldTrigger = !shouldSkip && hasDesign;
    expect(wouldTrigger).toBe(false);
  });

  it('pure design task triggers meeting', () => {
    const text = 'implement spaceship sprite with animation';
    const shouldSkip = SCAFFOLD_SKIP_KEYWORDS.test(text);
    const hasDesign = DESIGN_KEYWORDS.test(text);
    expect(shouldSkip).toBe(false);
    expect(hasDesign).toBe(true);
    const wouldTrigger = !shouldSkip && hasDesign;
    expect(wouldTrigger).toBe(true);
  });

  it('non-design non-scaffold task does not trigger', () => {
    const text = 'implement game logic for scoring';
    const shouldSkip = SCAFFOLD_SKIP_KEYWORDS.test(text);
    const hasDesign = DESIGN_KEYWORDS.test(text);
    expect(shouldSkip).toBe(false);
    expect(hasDesign).toBe(false);
  });

  it('test task is skipped even with design words', () => {
    const text = 'unit test for visual rendering';
    const shouldSkip = SCAFFOLD_SKIP_KEYWORDS.test(text);
    const hasDesign = DESIGN_KEYWORDS.test(text);
    expect(shouldSkip).toBe(true);
    expect(hasDesign).toBe(true);
    const wouldTrigger = !shouldSkip && hasDesign;
    expect(wouldTrigger).toBe(false);
  });
});

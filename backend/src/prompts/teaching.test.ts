import { describe, it, expect } from 'vitest';
import {
  CONCEPT_CURRICULUM,
  getCurriculumMoment,
  TEACHING_SYSTEM_PROMPT,
  teachingUserPrompt,
  type TeachingMomentData,
} from './teaching.js';

describe('CONCEPT_CURRICULUM', () => {
  it('contains all expected top-level concept categories', () => {
    const expected = [
      'source_control',
      'testing',
      'decomposition',
      'hardware',
      'prompt_engineering',
      'code_review',
    ];
    for (const cat of expected) {
      expect(CONCEPT_CURRICULUM).toHaveProperty(cat);
    }
  });

  it('source_control has expected sub-concepts', () => {
    const sc = CONCEPT_CURRICULUM.source_control;
    expect(sc).toHaveProperty('first_commit');
    expect(sc).toHaveProperty('multiple_commits');
    expect(sc).toHaveProperty('commit_messages');
  });

  it('testing has expected sub-concepts', () => {
    const t = CONCEPT_CURRICULUM.testing;
    expect(t).toHaveProperty('first_test_run');
    expect(t).toHaveProperty('test_pass');
    expect(t).toHaveProperty('test_fail');
    expect(t).toHaveProperty('coverage');
  });

  it('decomposition has expected sub-concepts', () => {
    const d = CONCEPT_CURRICULUM.decomposition;
    expect(d).toHaveProperty('task_breakdown');
    expect(d).toHaveProperty('dependencies');
  });

  it('hardware has expected sub-concepts', () => {
    const h = CONCEPT_CURRICULUM.hardware;
    expect(h).toHaveProperty('gpio');
    expect(h).toHaveProperty('lora');
    expect(h).toHaveProperty('compilation');
    expect(h).toHaveProperty('flashing');
  });

  it('prompt_engineering has expected sub-concepts', () => {
    const pe = CONCEPT_CURRICULUM.prompt_engineering;
    expect(pe).toHaveProperty('first_skill');
    expect(pe).toHaveProperty('first_rule');
  });

  it('code_review has expected sub-concepts', () => {
    const cr = CONCEPT_CURRICULUM.code_review;
    expect(cr).toHaveProperty('first_review');
    expect(cr).toHaveProperty('review_feedback');
    expect(cr).toHaveProperty('review_approval');
  });

  it('every curriculum entry has required fields', () => {
    for (const [concept, subConcepts] of Object.entries(CONCEPT_CURRICULUM)) {
      for (const [subKey, data] of Object.entries(subConcepts)) {
        const entry = data as TeachingMomentData;
        expect(entry.concept, `${concept}.${subKey}.concept`).toBe(concept);
        expect(entry.headline, `${concept}.${subKey}.headline`).toBeTruthy();
        expect(entry.explanation, `${concept}.${subKey}.explanation`).toBeTruthy();
        expect(entry.tell_me_more, `${concept}.${subKey}.tell_me_more`).toBeTruthy();
      }
    }
  });

  it('explanations are kid-friendly (not too long)', () => {
    for (const [concept, subConcepts] of Object.entries(CONCEPT_CURRICULUM)) {
      for (const [subKey, data] of Object.entries(subConcepts)) {
        const entry = data as TeachingMomentData;
        // Each explanation should be reasonable length for kids
        expect(
          entry.explanation.length,
          `${concept}.${subKey}.explanation too long`,
        ).toBeLessThan(500);
      }
    }
  });
});

describe('getCurriculumMoment', () => {
  it('returns data for valid concept + sub-concept', () => {
    const result = getCurriculumMoment('source_control', 'first_commit');
    expect(result).not.toBeNull();
    expect(result!.concept).toBe('source_control');
    expect(result!.headline).toContain('saving their work');
  });

  it('returns data for testing.test_pass', () => {
    const result = getCurriculumMoment('testing', 'test_pass');
    expect(result).not.toBeNull();
    expect(result!.concept).toBe('testing');
    expect(result!.headline).toContain('passing');
  });

  it('returns data for testing.test_fail', () => {
    const result = getCurriculumMoment('testing', 'test_fail');
    expect(result).not.toBeNull();
    expect(result!.headline).toContain('issues');
  });

  it('returns data for hardware.gpio', () => {
    const result = getCurriculumMoment('hardware', 'gpio');
    expect(result).not.toBeNull();
    expect(result!.headline).toContain('GPIO');
  });

  it('returns data for hardware.lora', () => {
    const result = getCurriculumMoment('hardware', 'lora');
    expect(result).not.toBeNull();
    expect(result!.headline).toContain('LoRa');
  });

  it('returns data for decomposition.dependencies', () => {
    const result = getCurriculumMoment('decomposition', 'dependencies');
    expect(result).not.toBeNull();
    expect(result!.headline).toContain('depend');
  });

  it('returns data for prompt_engineering.first_skill', () => {
    const result = getCurriculumMoment('prompt_engineering', 'first_skill');
    expect(result).not.toBeNull();
    expect(result!.headline).toContain('prompt engineering');
  });

  it('returns data for code_review.first_review', () => {
    const result = getCurriculumMoment('code_review', 'first_review');
    expect(result).not.toBeNull();
    expect(result!.headline).toContain('reviewing');
  });

  it('returns null for unknown concept', () => {
    expect(getCurriculumMoment('nonexistent', 'first_commit')).toBeNull();
  });

  it('returns null for unknown sub-concept', () => {
    expect(getCurriculumMoment('source_control', 'nonexistent')).toBeNull();
  });

  it('returns null for both unknown concept and sub-concept', () => {
    expect(getCurriculumMoment('x', 'y')).toBeNull();
  });
});

describe('TEACHING_SYSTEM_PROMPT', () => {
  it('targets kids aged 8-14', () => {
    expect(TEACHING_SYSTEM_PROMPT).toContain('8-14');
  });

  it('requests JSON response format', () => {
    expect(TEACHING_SYSTEM_PROMPT).toContain('JSON');
    expect(TEACHING_SYSTEM_PROMPT).toContain('concept');
    expect(TEACHING_SYSTEM_PROMPT).toContain('headline');
    expect(TEACHING_SYSTEM_PROMPT).toContain('explanation');
    expect(TEACHING_SYSTEM_PROMPT).toContain('tell_me_more');
  });

  it('asks for simple encouraging language', () => {
    expect(TEACHING_SYSTEM_PROMPT).toContain('simple');
    expect(TEACHING_SYSTEM_PROMPT).toContain('encouraging');
  });
});

describe('teachingUserPrompt', () => {
  it('includes event type and details', () => {
    const result = teachingUserPrompt('commit_created', 'Added login page');
    expect(result).toContain('commit_created');
    expect(result).toContain('Added login page');
  });

  it('includes nugget type', () => {
    const result = teachingUserPrompt('test_pass', '5 tests passed', 'hardware');
    expect(result).toContain('hardware nugget');
  });

  it('defaults nugget type to software', () => {
    const result = teachingUserPrompt('test_fail', '2 tests failed');
    expect(result).toContain('software nugget');
  });

  it('requests JSON response format', () => {
    const result = teachingUserPrompt('task_started', 'Building UI');
    expect(result).toContain('JSON');
    expect(result).toContain('concept');
    expect(result).toContain('headline');
    expect(result).toContain('explanation');
    expect(result).toContain('tell_me_more');
  });

  it('mentions kid-friendly context', () => {
    const result = teachingUserPrompt('plan_ready', 'Plan has 5 tasks');
    expect(result).toContain('kid');
    expect(result).toContain('AI agents');
  });
});

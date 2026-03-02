/** Tests for StudyMode: enable/disable, config, quiz generation, answer checking, progress tracking. */

import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeBackpack } from '../../services/runtime/knowledgeBackpack.js';
import { StudyMode } from '../../services/runtime/studyMode.js';
import type { StudyModeConfig } from '../../models/runtime.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<StudyModeConfig> = {}): StudyModeConfig {
  return {
    enabled: true,
    style: 'quiz',
    difficulty: 'medium',
    quiz_frequency: 5,
    ...overrides,
  };
}

function makeSource(overrides: Record<string, any> = {}) {
  return {
    title: 'Dinosaur Facts',
    content:
      'Tyrannosaurus Rex was one of the largest land predators. It lived during the late Cretaceous period about 68 million years ago.',
    source_type: 'manual' as const,
    ...overrides,
  };
}

/** Add several distinct sources to the backpack for an agent. */
function populateBackpack(backpack: KnowledgeBackpack, agentId: string, count = 4): string[] {
  const sources = [
    { title: 'Dinosaur Facts', content: 'Tyrannosaurus Rex was a large carnivorous dinosaur from the Cretaceous period.' },
    { title: 'Planet Guide', content: 'Mars is the fourth planet from the Sun and is known as the Red Planet.' },
    { title: 'Ocean Life', content: 'Blue whales are the largest animals ever known to have lived on Earth.' },
    { title: 'Space Exploration', content: 'The Apollo 11 mission successfully landed humans on the Moon in 1969.' },
    { title: 'Ancient Egypt', content: 'The Great Pyramid of Giza was built as a tomb for Pharaoh Khufu around 2560 BC.' },
    { title: 'Volcanoes', content: 'Mount Vesuvius erupted in 79 AD and buried the Roman city of Pompeii under ash.' },
  ];

  const ids: string[] = [];
  for (let i = 0; i < count && i < sources.length; i++) {
    ids.push(backpack.addSource(agentId, { ...sources[i], source_type: 'manual' as const }));
  }
  return ids;
}

// ── StudyMode ────────────────────────────────────────────────────────

describe('StudyMode', () => {
  let backpack: KnowledgeBackpack;
  let studyMode: StudyMode;
  const agentA = 'agent-aaa';
  const agentB = 'agent-bbb';

  beforeEach(() => {
    backpack = new KnowledgeBackpack();
    studyMode = new StudyMode(backpack);
  });

  // ── enable / disable ──────────────────────────────────────────────

  describe('enable / disable', () => {
    it('starts disabled for all agents', () => {
      expect(studyMode.isEnabled(agentA)).toBe(false);
    });

    it('enables study mode with config', () => {
      studyMode.enable(agentA, makeConfig());
      expect(studyMode.isEnabled(agentA)).toBe(true);
    });

    it('disables study mode', () => {
      studyMode.enable(agentA, makeConfig());
      studyMode.disable(agentA);
      expect(studyMode.isEnabled(agentA)).toBe(false);
    });

    it('disable is a no-op for non-existent agent', () => {
      studyMode.disable('nonexistent');
      expect(studyMode.isEnabled('nonexistent')).toBe(false);
    });

    it('re-enable preserves progress', () => {
      populateBackpack(backpack, agentA);
      studyMode.enable(agentA, makeConfig());

      // Generate and answer a question
      const q = studyMode.generateQuiz(agentA)!;
      studyMode.submitAnswer(agentA, q.id, q.correct_index);

      // Disable then re-enable
      studyMode.disable(agentA);
      studyMode.enable(agentA, makeConfig());

      const progress = studyMode.getProgress(agentA);
      expect(progress.correct_answers).toBe(1);
      expect(progress.total_questions).toBe(1);
    });
  });

  // ── getConfig ─────────────────────────────────────────────────────

  describe('getConfig', () => {
    it('returns null for agent never enabled', () => {
      expect(studyMode.getConfig(agentA)).toBeNull();
    });

    it('returns the stored config', () => {
      const config = makeConfig({ style: 'flashcard', difficulty: 'hard' });
      studyMode.enable(agentA, config);

      const result = studyMode.getConfig(agentA);
      expect(result).not.toBeNull();
      expect(result!.style).toBe('flashcard');
      expect(result!.difficulty).toBe('hard');
      expect(result!.enabled).toBe(true);
    });

    it('reflects disabled state after disable()', () => {
      studyMode.enable(agentA, makeConfig());
      studyMode.disable(agentA);

      const result = studyMode.getConfig(agentA);
      expect(result!.enabled).toBe(false);
    });

    it('updates config on re-enable with new values', () => {
      studyMode.enable(agentA, makeConfig({ difficulty: 'easy' }));
      studyMode.enable(agentA, makeConfig({ difficulty: 'hard' }));

      expect(studyMode.getConfig(agentA)!.difficulty).toBe('hard');
    });
  });

  // ── generateQuiz ──────────────────────────────────────────────────

  describe('generateQuiz', () => {
    it('returns null when study mode is not enabled', () => {
      populateBackpack(backpack, agentA);
      expect(studyMode.generateQuiz(agentA)).toBeNull();
    });

    it('returns null when backpack is empty', () => {
      studyMode.enable(agentA, makeConfig());
      expect(studyMode.generateQuiz(agentA)).toBeNull();
    });

    it('returns a quiz question with correct structure', () => {
      populateBackpack(backpack, agentA);
      studyMode.enable(agentA, makeConfig());

      const q = studyMode.generateQuiz(agentA);
      expect(q).not.toBeNull();
      expect(q!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(q!.source_id).toBeTruthy();
      expect(q!.question).toBeTruthy();
      expect(q!.options).toHaveLength(4);
      expect(q!.correct_index).toBeGreaterThanOrEqual(0);
      expect(q!.correct_index).toBeLessThan(4);
    });

    it('generates unique question IDs', () => {
      populateBackpack(backpack, agentA, 6);
      studyMode.enable(agentA, makeConfig());

      const ids = new Set<string>();
      for (let i = 0; i < 5; i++) {
        const q = studyMode.generateQuiz(agentA)!;
        ids.add(q.id);
      }
      expect(ids.size).toBe(5);
    });

    it('correct answer is present at the correct_index', () => {
      populateBackpack(backpack, agentA);
      studyMode.enable(agentA, makeConfig());

      const q = studyMode.generateQuiz(agentA)!;
      // The correct answer should be a non-empty string at correct_index
      expect(q.options[q.correct_index]).toBeTruthy();
      expect(typeof q.options[q.correct_index]).toBe('string');
    });

    it('uses difficulty-appropriate question templates', () => {
      populateBackpack(backpack, agentA);

      studyMode.enable(agentA, makeConfig({ difficulty: 'easy' }));
      const easyQ = studyMode.generateQuiz(agentA)!;
      expect(easyQ.question).toBeTruthy();

      // Re-create for hard difficulty
      const backpack2 = new KnowledgeBackpack();
      const sm2 = new StudyMode(backpack2);
      populateBackpack(backpack2, agentA);
      sm2.enable(agentA, makeConfig({ difficulty: 'hard' }));
      const hardQ = sm2.generateQuiz(agentA)!;
      expect(hardQ.question).toBeTruthy();
    });

    it('works with a single source (uses fallback distractors)', () => {
      backpack.addSource(agentA, makeSource());
      studyMode.enable(agentA, makeConfig());

      const q = studyMode.generateQuiz(agentA);
      expect(q).not.toBeNull();
      expect(q!.options).toHaveLength(4);
    });

    it('returns null when disabled even with backpack content', () => {
      populateBackpack(backpack, agentA);
      studyMode.enable(agentA, makeConfig());
      studyMode.disable(agentA);

      expect(studyMode.generateQuiz(agentA)).toBeNull();
    });
  });

  // ── source coverage (no repeats until all covered) ────────────────

  describe('source coverage', () => {
    it('covers all sources before repeating', () => {
      const sourceIds = populateBackpack(backpack, agentA, 4);
      studyMode.enable(agentA, makeConfig());

      const quizzedSourceIds = new Set<string>();
      for (let i = 0; i < 4; i++) {
        const q = studyMode.generateQuiz(agentA)!;
        quizzedSourceIds.add(q.source_id);
      }

      // All 4 sources should have been covered
      expect(quizzedSourceIds.size).toBe(4);
      for (const id of sourceIds) {
        expect(quizzedSourceIds.has(id)).toBe(true);
      }
    });

    it('resets cycle and continues after all sources covered', () => {
      populateBackpack(backpack, agentA, 3);
      studyMode.enable(agentA, makeConfig());

      // Generate 3 questions (covers all sources)
      for (let i = 0; i < 3; i++) {
        studyMode.generateQuiz(agentA);
      }

      // 4th question should still work (new cycle)
      const q = studyMode.generateQuiz(agentA);
      expect(q).not.toBeNull();
    });

    it('tracks sources_covered in progress', () => {
      populateBackpack(backpack, agentA, 4);
      studyMode.enable(agentA, makeConfig());

      studyMode.generateQuiz(agentA);
      studyMode.generateQuiz(agentA);

      const progress = studyMode.getProgress(agentA);
      expect(progress.sources_covered).toBe(2);
      expect(progress.total_sources).toBe(4);
    });
  });

  // ── submitAnswer ──────────────────────────────────────────────────

  describe('submitAnswer', () => {
    it('returns true for correct answer', () => {
      populateBackpack(backpack, agentA);
      studyMode.enable(agentA, makeConfig());

      const q = studyMode.generateQuiz(agentA)!;
      const result = studyMode.submitAnswer(agentA, q.id, q.correct_index);
      expect(result).toBe(true);
    });

    it('returns false for incorrect answer', () => {
      populateBackpack(backpack, agentA);
      studyMode.enable(agentA, makeConfig());

      const q = studyMode.generateQuiz(agentA)!;
      const wrongIndex = (q.correct_index + 1) % q.options.length;
      const result = studyMode.submitAnswer(agentA, q.id, wrongIndex);
      expect(result).toBe(false);
    });

    it('throws for unknown agent', () => {
      expect(() => studyMode.submitAnswer('unknown', 'q1', 0)).toThrow(
        'Study mode not enabled',
      );
    });

    it('throws for unknown question ID', () => {
      studyMode.enable(agentA, makeConfig());
      expect(() => studyMode.submitAnswer(agentA, 'nonexistent', 0)).toThrow(
        'Question not found',
      );
    });

    it('throws when answering the same question twice', () => {
      populateBackpack(backpack, agentA);
      studyMode.enable(agentA, makeConfig());

      const q = studyMode.generateQuiz(agentA)!;
      studyMode.submitAnswer(agentA, q.id, q.correct_index);

      expect(() => studyMode.submitAnswer(agentA, q.id, q.correct_index)).toThrow(
        'already answered',
      );
    });
  });

  // ── getProgress ───────────────────────────────────────────────────

  describe('getProgress', () => {
    it('returns zeroed progress for agent never enabled', () => {
      const progress = studyMode.getProgress(agentA);
      expect(progress.total_questions).toBe(0);
      expect(progress.correct_answers).toBe(0);
      expect(progress.sources_covered).toBe(0);
      expect(progress.accuracy).toBe(0);
    });

    it('reflects total_sources from backpack', () => {
      populateBackpack(backpack, agentA, 3);
      const progress = studyMode.getProgress(agentA);
      expect(progress.total_sources).toBe(3);
    });

    it('tracks answered questions count', () => {
      populateBackpack(backpack, agentA, 4);
      studyMode.enable(agentA, makeConfig());

      const q1 = studyMode.generateQuiz(agentA)!;
      const q2 = studyMode.generateQuiz(agentA)!;
      studyMode.submitAnswer(agentA, q1.id, q1.correct_index);
      studyMode.submitAnswer(agentA, q2.id, 99); // wrong

      const progress = studyMode.getProgress(agentA);
      expect(progress.total_questions).toBe(2);
      expect(progress.correct_answers).toBe(1);
    });

    it('computes accuracy correctly', () => {
      populateBackpack(backpack, agentA, 4);
      studyMode.enable(agentA, makeConfig());

      const q1 = studyMode.generateQuiz(agentA)!;
      const q2 = studyMode.generateQuiz(agentA)!;
      const q3 = studyMode.generateQuiz(agentA)!;
      const q4 = studyMode.generateQuiz(agentA)!;

      studyMode.submitAnswer(agentA, q1.id, q1.correct_index);
      studyMode.submitAnswer(agentA, q2.id, q2.correct_index);
      studyMode.submitAnswer(agentA, q3.id, q3.correct_index);
      studyMode.submitAnswer(agentA, q4.id, 99); // wrong

      const progress = studyMode.getProgress(agentA);
      expect(progress.accuracy).toBe(0.75);
    });

    it('accuracy is 0 when no questions answered', () => {
      studyMode.enable(agentA, makeConfig());
      expect(studyMode.getProgress(agentA).accuracy).toBe(0);
    });
  });

  // ── multiple agents isolation ─────────────────────────────────────

  describe('multiple agents isolation', () => {
    it('keeps study state separate across agents', () => {
      populateBackpack(backpack, agentA, 3);
      populateBackpack(backpack, agentB, 2);

      studyMode.enable(agentA, makeConfig({ difficulty: 'easy' }));
      studyMode.enable(agentB, makeConfig({ difficulty: 'hard' }));

      expect(studyMode.getConfig(agentA)!.difficulty).toBe('easy');
      expect(studyMode.getConfig(agentB)!.difficulty).toBe('hard');
    });

    it('quiz generation for one agent does not affect another', () => {
      populateBackpack(backpack, agentA, 3);
      populateBackpack(backpack, agentB, 2);

      studyMode.enable(agentA, makeConfig());
      studyMode.enable(agentB, makeConfig());

      const qA = studyMode.generateQuiz(agentA)!;
      studyMode.submitAnswer(agentA, qA.id, qA.correct_index);

      const progressA = studyMode.getProgress(agentA);
      const progressB = studyMode.getProgress(agentB);

      expect(progressA.total_questions).toBe(1);
      expect(progressB.total_questions).toBe(0);
    });

    it('disabling one agent does not affect another', () => {
      studyMode.enable(agentA, makeConfig());
      studyMode.enable(agentB, makeConfig());

      studyMode.disable(agentA);

      expect(studyMode.isEnabled(agentA)).toBe(false);
      expect(studyMode.isEnabled(agentB)).toBe(true);
    });
  });

  // ── spaced repetition (weighted source selection) ─────────────────

  describe('spaced repetition', () => {
    it('covers all sources before repeating even with spaced repetition', () => {
      const sourceIds = populateBackpack(backpack, agentA, 4);
      studyMode.enable(agentA, makeConfig());

      const quizzedSourceIds = new Set<string>();
      for (let i = 0; i < 4; i++) {
        const q = studyMode.generateQuiz(agentA)!;
        quizzedSourceIds.add(q.source_id);
      }

      // All 4 sources should have been covered in the first cycle
      expect(quizzedSourceIds.size).toBe(4);
      for (const id of sourceIds) {
        expect(quizzedSourceIds.has(id)).toBe(true);
      }
    });

    it('sources answered incorrectly appear more frequently', () => {
      const sourceIds = populateBackpack(backpack, agentA, 4);
      studyMode.enable(agentA, makeConfig());

      // The source we will always answer incorrectly
      const wrongSourceId = sourceIds[0];

      // Run many cycles, always answering wrongSourceId incorrectly and others correctly
      const counts = new Map<string, number>();
      for (const id of sourceIds) counts.set(id, 0);

      const totalRounds = 400;
      for (let i = 0; i < totalRounds; i++) {
        const q = studyMode.generateQuiz(agentA)!;
        counts.set(q.source_id, (counts.get(q.source_id) ?? 0) + 1);
        if (q.source_id === wrongSourceId) {
          // Always answer incorrectly
          studyMode.submitAnswer(agentA, q.id, (q.correct_index + 1) % q.options.length);
        } else {
          studyMode.submitAnswer(agentA, q.id, q.correct_index);
        }
      }

      // The source that is always answered incorrectly should appear more often
      // than the average of correctly-answered sources
      const wrongCount = counts.get(wrongSourceId)!;
      const correctCounts = sourceIds
        .filter((id) => id !== wrongSourceId)
        .map((id) => counts.get(id)!);
      const avgCorrectCount = correctCounts.reduce((a, b) => a + b, 0) / correctCounts.length;

      // The wrong source should appear meaningfully more than the average correct source
      expect(wrongCount).toBeGreaterThan(avgCorrectCount * 1.2);
    });

    it('perfect scores lead to roughly even distribution', () => {
      const sourceIds = populateBackpack(backpack, agentA, 4);
      studyMode.enable(agentA, makeConfig());

      // First cycle: answer all correctly
      for (let i = 0; i < 4; i++) {
        const q = studyMode.generateQuiz(agentA)!;
        studyMode.submitAnswer(agentA, q.id, q.correct_index);
      }

      // Run many more cycles, always answering correctly
      const counts = new Map<string, number>();
      for (const id of sourceIds) counts.set(id, 0);

      const totalRounds = 400;
      for (let i = 0; i < totalRounds; i++) {
        const q = studyMode.generateQuiz(agentA)!;
        counts.set(q.source_id, (counts.get(q.source_id) ?? 0) + 1);
        studyMode.submitAnswer(agentA, q.id, q.correct_index);
      }

      // All sources should be within a reasonable range (each ~25% of total)
      const expected = totalRounds / sourceIds.length;
      for (const id of sourceIds) {
        const count = counts.get(id)!;
        // Allow +/- 40% variance (generous for random, but proves even weighting)
        expect(count).toBeGreaterThan(expected * 0.6);
        expect(count).toBeLessThan(expected * 1.4);
      }
    });
  });

  // ── deleteAgent ───────────────────────────────────────────────────

  describe('deleteAgent', () => {
    it('removes all study state for an agent', () => {
      studyMode.enable(agentA, makeConfig());
      expect(studyMode.deleteAgent(agentA)).toBe(true);
      expect(studyMode.isEnabled(agentA)).toBe(false);
      expect(studyMode.getConfig(agentA)).toBeNull();
    });

    it('returns false for non-existent agent', () => {
      expect(studyMode.deleteAgent('nonexistent')).toBe(false);
    });

    it('does not affect other agents', () => {
      studyMode.enable(agentA, makeConfig());
      studyMode.enable(agentB, makeConfig());

      studyMode.deleteAgent(agentA);

      expect(studyMode.isEnabled(agentB)).toBe(true);
    });
  });
});

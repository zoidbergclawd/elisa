/**
 * Study Mode service for the Elisa Agent Runtime.
 *
 * Provides spaced-repetition style tutoring based on Knowledge Backpack
 * content. Generates quiz questions programmatically from backpack sources,
 * tracks progress per agent, and ensures source coverage before repeating.
 *
 * Follows the same in-memory Map pattern as agentStore.ts and
 * knowledgeBackpack.ts.
 */

import { randomUUID } from 'node:crypto';
import type {
  StudyModeConfig,
  QuizQuestion,
  StudyProgress,
} from '../../models/runtime.js';
import type { KnowledgeBackpack } from './knowledgeBackpack.js';

// ── Internal State ───────────────────────────────────────────────────

interface SourceStats {
  correct: number;
  incorrect: number;
}

interface StudyState {
  config: StudyModeConfig;
  /** Questions generated so far, keyed by question ID. */
  questions: Map<string, QuizQuestion>;
  /** Source IDs that have been quizzed in the current cycle. */
  quizzedSourceIds: Set<string>;
  /** Number of correct answers. */
  correctAnswers: number;
  /** Set of question IDs that have been answered. */
  answeredQuestionIds: Set<string>;
  /** Per-source correctness tracking for spaced repetition. */
  sourceStats: Map<string, SourceStats>;
}

// ── Question Templates ───────────────────────────────────────────────

const EASY_TEMPLATES = [
  (title: string) => `Which of the following is related to "${title}"?`,
  (title: string) => `What topic does "${title}" cover?`,
];

const MEDIUM_TEMPLATES = [
  (title: string) => `Based on the source "${title}", which statement is most accurate?`,
  (title: string) => `What can you learn from "${title}"?`,
];

const HARD_TEMPLATES = [
  (title: string) => `Which detail is specifically mentioned in "${title}"?`,
  (title: string) => `According to "${title}", which of the following is correct?`,
];

const TEMPLATES: Record<string, ((title: string) => string)[]> = {
  easy: EASY_TEMPLATES,
  medium: MEDIUM_TEMPLATES,
  hard: HARD_TEMPLATES,
};

/**
 * Extract a short phrase from content to use as a correct answer option.
 * Takes the first sentence or up to 80 characters.
 */
function extractAnswerPhrase(content: string): string {
  // Take first sentence
  const sentenceEnd = content.search(/[.!?]/);
  if (sentenceEnd !== -1 && sentenceEnd < 120) {
    return content.slice(0, sentenceEnd + 1).trim();
  }
  // Fall back to first 80 chars
  const trimmed = content.slice(0, 80).trim();
  return trimmed.endsWith('.') ? trimmed : trimmed + '...';
}

/**
 * Generate distractor options from other sources' content.
 * Returns up to `count` distractors that differ from the correct answer.
 */
function generateDistractors(
  correctContent: string,
  otherContents: string[],
  count: number,
): string[] {
  const distractors: string[] = [];
  const correctPhrase = extractAnswerPhrase(correctContent).toLowerCase();

  for (const content of otherContents) {
    if (distractors.length >= count) break;
    const phrase = extractAnswerPhrase(content);
    // Avoid duplicates or phrases too similar to correct answer
    if (phrase.toLowerCase() !== correctPhrase && !distractors.includes(phrase)) {
      distractors.push(phrase);
    }
  }

  // If not enough distractors from other sources, generate generic ones
  const fallbacks = [
    'None of the above applies.',
    'This topic is not covered in the backpack.',
    'The source does not discuss this.',
  ];
  for (const fb of fallbacks) {
    if (distractors.length >= count) break;
    if (!distractors.includes(fb)) {
      distractors.push(fb);
    }
  }

  return distractors.slice(0, count);
}

// ── Study Mode Service ───────────────────────────────────────────────

export class StudyMode {
  private states = new Map<string, StudyState>();

  constructor(private backpack: KnowledgeBackpack) {}

  /**
   * Check if study mode is active for an agent.
   */
  isEnabled(agentId: string): boolean {
    const state = this.states.get(agentId);
    return state?.config.enabled === true;
  }

  /**
   * Enable study mode for an agent with the given configuration.
   */
  enable(agentId: string, config: StudyModeConfig): void {
    const existing = this.states.get(agentId);
    if (existing) {
      // Update config, preserve progress
      existing.config = { ...config, enabled: true };
    } else {
      this.states.set(agentId, {
        config: { ...config, enabled: true },
        questions: new Map(),
        quizzedSourceIds: new Set(),
        correctAnswers: 0,
        answeredQuestionIds: new Set(),
        sourceStats: new Map(),
      });
    }
  }

  /**
   * Disable study mode for an agent. Preserves state for re-enable.
   */
  disable(agentId: string): void {
    const state = this.states.get(agentId);
    if (state) {
      state.config.enabled = false;
    }
  }

  /**
   * Get the current study mode config for an agent, or null if never enabled.
   */
  getConfig(agentId: string): StudyModeConfig | null {
    return this.states.get(agentId)?.config ?? null;
  }

  /**
   * Generate a quiz question from the agent's backpack content.
   *
   * Picks a source that hasn't been quizzed yet in the current cycle.
   * When all sources have been covered, resets the cycle and starts over.
   *
   * Returns null if the backpack is empty.
   */
  generateQuiz(agentId: string): QuizQuestion | null {
    const state = this.states.get(agentId);
    if (!state || !state.config.enabled) return null;

    const sources = this.backpack.getSources(agentId);
    if (sources.length === 0) return null;

    // Find sources not yet quizzed in this cycle
    const unquizzed = sources.filter((s) => !state.quizzedSourceIds.has(s.id));

    let targetSource: { id: string; title: string; content: string };

    if (unquizzed.length > 0) {
      // First cycle: cover all sources before repeating (random among unquizzed)
      targetSource = unquizzed[Math.floor(Math.random() * unquizzed.length)];
    } else {
      // All sources covered at least once — use weighted selection based on performance
      targetSource = this.selectSource(sources, state);
    }

    // Generate question text from template
    const difficulty = state.config.difficulty;
    const templates = TEMPLATES[difficulty] ?? TEMPLATES.medium;
    const template = templates[Math.floor(Math.random() * templates.length)];
    const questionText = template(targetSource.title);

    // Correct answer: extract from the target source
    const correctAnswer = extractAnswerPhrase(targetSource.content);

    // Distractors: extract from other sources
    const otherContents = sources
      .filter((s) => s.id !== targetSource.id)
      .map((s) => s.content);
    const distractors = generateDistractors(targetSource.content, otherContents, 3);

    // Build options array with correct answer at a random position
    const options = [...distractors];
    const correctIndex = Math.floor(Math.random() * (options.length + 1));
    options.splice(correctIndex, 0, correctAnswer);

    const question: QuizQuestion = {
      id: randomUUID(),
      source_id: targetSource.id,
      question: questionText,
      options,
      correct_index: correctIndex,
    };

    // Track this source as quizzed and store the question
    state.quizzedSourceIds.add(targetSource.id);
    state.questions.set(question.id, question);

    return question;
  }

  /**
   * Submit an answer for a quiz question.
   *
   * Returns true if the answer is correct, false otherwise.
   * Throws if the question ID is not found or already answered.
   */
  submitAnswer(agentId: string, questionId: string, answer: number): boolean {
    const state = this.states.get(agentId);
    if (!state) throw new Error(`Study mode not enabled for agent: ${agentId}`);

    const question = state.questions.get(questionId);
    if (!question) throw new Error(`Question not found: ${questionId}`);

    if (state.answeredQuestionIds.has(questionId)) {
      throw new Error(`Question already answered: ${questionId}`);
    }

    state.answeredQuestionIds.add(questionId);

    const isCorrect = answer === question.correct_index;
    if (isCorrect) {
      state.correctAnswers++;
    }

    // Track per-source stats for spaced repetition
    const stats = state.sourceStats.get(question.source_id) ?? { correct: 0, incorrect: 0 };
    if (isCorrect) {
      stats.correct++;
    } else {
      stats.incorrect++;
    }
    state.sourceStats.set(question.source_id, stats);

    return isCorrect;
  }

  /**
   * Get study progress for an agent.
   */
  getProgress(agentId: string): StudyProgress {
    const state = this.states.get(agentId);
    const sources = this.backpack.getSources(agentId);
    const totalSources = sources.length;

    if (!state) {
      return {
        total_questions: 0,
        correct_answers: 0,
        sources_covered: 0,
        total_sources: totalSources,
        accuracy: 0,
      };
    }

    const totalQuestions = state.answeredQuestionIds.size;
    const correct = state.correctAnswers;

    return {
      total_questions: totalQuestions,
      correct_answers: correct,
      sources_covered: state.quizzedSourceIds.size,
      total_sources: totalSources,
      accuracy: totalQuestions > 0 ? correct / totalQuestions : 0,
    };
  }

  /**
   * Select a source from candidates using weighted random selection.
   *
   * Sources with no stats (never answered) get weight 1 (uniform random).
   * Sources with stats are weighted by inverse accuracy: lower accuracy = higher weight.
   * A perfect source (100% accuracy) still gets a small base weight so it is not starved.
   */
  private selectSource(
    candidates: { id: string; title: string; content: string }[],
    state: StudyState,
  ): { id: string; title: string; content: string } {
    // If no source stats exist yet, use uniform random (first cycle)
    if (state.sourceStats.size === 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // Compute weights: base weight 0.1, plus (1 - accuracy) for answered sources.
    // Never-answered sources get weight 1 (highest priority).
    const weights = candidates.map((source) => {
      const stats = state.sourceStats.get(source.id);
      if (!stats) return 1; // never answered — high priority
      const total = stats.correct + stats.incorrect;
      if (total === 0) return 1;
      const accuracy = stats.correct / total;
      return 0.1 + (1 - accuracy); // range: 0.1 (perfect) to 1.1 (all wrong)
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalWeight;

    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return candidates[i];
    }

    // Fallback (floating-point edge case)
    return candidates[candidates.length - 1];
  }

  /**
   * Delete all study state for an agent.
   */
  deleteAgent(agentId: string): boolean {
    return this.states.delete(agentId);
  }
}

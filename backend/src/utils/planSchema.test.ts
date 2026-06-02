import { describe, it, expect } from 'vitest';
import {
  PlanStateSchema,
  QuestionWidgetSchema,
  PlanningTurnOutputSchema,
  TeachingAnnotationSchema,
  CanvasBlockSpecSchema,
  CanvasBlockSchema,
  LearningSummarySchema,
  type PlanState,
} from './planSchema.js';

// --- Helpers ---

function validPlanState(): PlanState {
  return {
    idea: 'A study buddy that quizzes kids on science',
    goal: { description: 'AI study buddy', confidence: 'solid' as const },
    promises: [
      {
        description: 'Only uses uploaded material',
        category: 'behavior' as const,
        proofs: [{ description: 'Redirects off-topic questions' }],
      },
      {
        description: 'Never gives answer directly',
        category: 'constraint' as const,
        proofs: [{ description: 'Uses hints instead of answers' }],
      },
    ],
    skills: [{ name: 'Generate quiz', description: 'Creates quiz questions from source material' }],
    portals: [{ name: 'Claude API', subtype: 'api' as const, description: 'Reasoning and conversation' }],
    deploy: { target: 'cli' as const, constraints: ['Must run offline'] },
    open_questions: [],
    ready: true,
    conversation_turn: 4,
  };
}

function validQuestionWidget() {
  return {
    text: 'How should students interact?',
    type: 'single_select' as const,
    options: [
      { label: 'Text in terminal', value: 'cli' },
      { label: 'Web interface', value: 'web' },
      { label: 'Not sure yet', value: 'undecided' },
    ],
  };
}

function validTeachingAnnotation() {
  return {
    why_asking: 'This determines what Portals and Deploy target you need.',
    primitive_connection: ['Portal', 'Deploy'],
    pattern_spotted: null,
    what_if: 'Voice would add speech-to-text and speaker Portals.',
  };
}

// --- PlanState ---

describe('PlanStateSchema', () => {
  it('validates a complete valid plan', () => {
    const result = PlanStateSchema.safeParse(validPlanState());
    expect(result.success).toBe(true);
  });

  it('validates an empty/initial plan', () => {
    const result = PlanStateSchema.safeParse({
      idea: 'My project',
      goal: { description: null, confidence: 'vague' },
      promises: [],
      skills: [],
      portals: [],
      deploy: { target: null, constraints: [] },
      open_questions: ['What is the core goal?'],
      ready: false,
      conversation_turn: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid confidence value', () => {
    const plan = validPlanState();
    plan.goal.confidence = 'maybe' as 'solid';
    const result = PlanStateSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects invalid promise category', () => {
    const plan = validPlanState();
    plan.promises[0].category = 'speed' as 'behavior';
    const result = PlanStateSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects invalid portal subtype', () => {
    const plan = validPlanState();
    plan.portals[0].subtype = 'database' as 'api';
    const result = PlanStateSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects invalid deploy target', () => {
    const plan = validPlanState();
    plan.deploy.target = 'mobile' as 'cli';
    const result = PlanStateSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects idea exceeding max length', () => {
    const plan = validPlanState();
    plan.idea = 'x'.repeat(2001);
    const result = PlanStateSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects negative conversation turn', () => {
    const plan = validPlanState();
    plan.conversation_turn = -1;
    const result = PlanStateSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('rejects extra fields (strict mode)', () => {
    const plan = { ...validPlanState(), extraField: 'should fail' };
    const result = PlanStateSchema.safeParse(plan);
    expect(result.success).toBe(false);
  });

  it('allows all deploy target values', () => {
    const targets: Array<'cli' | 'web' | 'device' | 'cloud' | null> = ['cli', 'web', 'device', 'cloud', null];
    for (const target of targets) {
      const plan = validPlanState();
      plan.deploy.target = target;
      const result = PlanStateSchema.safeParse(plan);
      expect(result.success).toBe(true);
    }
  });

  it('allows all promise categories', () => {
    const categories: Array<'behavior' | 'constraint' | 'security' | 'performance'> = ['behavior', 'constraint', 'security', 'performance'];
    for (const cat of categories) {
      const plan = validPlanState();
      plan.promises[0].category = cat;
      const result = PlanStateSchema.safeParse(plan);
      expect(result.success).toBe(true);
    }
  });
});

// --- QuestionWidget ---

describe('QuestionWidgetSchema', () => {
  it('validates a valid single_select widget', () => {
    const result = QuestionWidgetSchema.safeParse(validQuestionWidget());
    expect(result.success).toBe(true);
  });

  it('validates multi_select type', () => {
    const widget = { ...validQuestionWidget(), type: 'multi_select' };
    const result = QuestionWidgetSchema.safeParse(widget);
    expect(result.success).toBe(true);
  });

  it('validates rank_priorities type', () => {
    const widget = { ...validQuestionWidget(), type: 'rank_priorities' };
    const result = QuestionWidgetSchema.safeParse(widget);
    expect(result.success).toBe(true);
  });

  it('rejects invalid question type', () => {
    const widget = { ...validQuestionWidget(), type: 'dropdown' };
    const result = QuestionWidgetSchema.safeParse(widget);
    expect(result.success).toBe(false);
  });

  it('rejects fewer than 2 options', () => {
    const widget = { ...validQuestionWidget(), options: [{ label: 'Only one', value: 'one' }] };
    const result = QuestionWidgetSchema.safeParse(widget);
    expect(result.success).toBe(false);
  });

  it('rejects more than 8 options', () => {
    const options = Array.from({ length: 9 }, (_, i) => ({ label: `Option ${i}`, value: `opt${i}` }));
    const widget = { ...validQuestionWidget(), options };
    const result = QuestionWidgetSchema.safeParse(widget);
    expect(result.success).toBe(false);
  });

  it('allows exactly 8 options', () => {
    const options = Array.from({ length: 8 }, (_, i) => ({ label: `Option ${i}`, value: `opt${i}` }));
    const widget = { ...validQuestionWidget(), options };
    const result = QuestionWidgetSchema.safeParse(widget);
    expect(result.success).toBe(true);
  });
});

// --- TeachingAnnotation ---

describe('TeachingAnnotationSchema', () => {
  it('validates a complete annotation', () => {
    const result = TeachingAnnotationSchema.safeParse(validTeachingAnnotation());
    expect(result.success).toBe(true);
  });

  it('validates with null pattern_spotted and what_if', () => {
    const annotation = { ...validTeachingAnnotation(), pattern_spotted: null, what_if: null };
    const result = TeachingAnnotationSchema.safeParse(annotation);
    expect(result.success).toBe(true);
  });

  it('validates with a pattern spotted', () => {
    const annotation = { ...validTeachingAnnotation(), pattern_spotted: 'Adaptive Memory' };
    const result = TeachingAnnotationSchema.safeParse(annotation);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = TeachingAnnotationSchema.safeParse({ why_asking: 'test' });
    expect(result.success).toBe(false);
  });
});

// --- PlanningTurnOutput ---

describe('PlanningTurnOutputSchema', () => {
  it('validates a complete turn output', () => {
    const output = {
      message: 'Great idea! Let me help you think this through.',
      question: validQuestionWidget(),
      plan_mutation_map: {
        cli: { 'deploy.target': 'cli' },
        web: { 'deploy.target': 'web' },
        undecided: null,
      },
      plan: validPlanState(),
      teaching: validTeachingAnnotation(),
    };
    const result = PlanningTurnOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  it('validates with null question (readiness turn)', () => {
    const output = {
      message: 'I think we have enough to build this.',
      question: null,
      plan_mutation_map: {},
      plan: validPlanState(),
    };
    const result = PlanningTurnOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  it('validates with optional teaching omitted', () => {
    const output = {
      message: 'Next question...',
      question: validQuestionWidget(),
      plan_mutation_map: { cli: { target: 'cli' } },
      plan: validPlanState(),
    };
    const result = PlanningTurnOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  it('validates with null teaching', () => {
    const output = {
      message: 'Next question...',
      question: validQuestionWidget(),
      plan_mutation_map: { cli: { target: 'cli' } },
      plan: validPlanState(),
      teaching: null,
    };
    const result = PlanningTurnOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  it('rejects missing message', () => {
    const output = {
      question: validQuestionWidget(),
      plan_mutation_map: {},
      plan: validPlanState(),
    };
    const result = PlanningTurnOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });
});

// --- CanvasBlockSpec ---

describe('CanvasBlockSpecSchema', () => {
  it('validates a complete block spec', () => {
    const spec = {
      blocks: [
        { id: 'goal-1', type: 'Goal', category: 'primitive', content: 'Study buddy', position: { x: 0, y: 0 } },
        {
          id: 'promise-1', type: 'Promise', category: 'primitive', content: 'Only uses uploaded material', position: { x: 0, y: 120 },
          children: [{ id: 'proof-1', type: 'Proof', category: 'primitive', content: 'Redirects off-topic' }],
        },
        { id: 'skill-1', type: 'Skill', category: 'primitive', content: 'Generate quiz questions', position: { x: 0, y: 360 } },
        { id: 'portal-1', type: 'Portal', category: 'primitive', content: 'Claude API', position: { x: 400, y: 0 }, subtype: 'api' },
        { id: 'deploy-1', type: 'Deploy', category: 'primitive', content: 'CLI tool', position: { x: 0, y: 600 } },
      ],
    };
    const result = CanvasBlockSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('validates an empty block spec', () => {
    const result = CanvasBlockSpecSchema.safeParse({ blocks: [] });
    expect(result.success).toBe(true);
  });

  it('rejects invalid block type', () => {
    const spec = {
      blocks: [{ id: 'x', type: 'Rule', category: 'primitive', content: 'test', position: { x: 0, y: 0 } }],
    };
    const result = CanvasBlockSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('rejects invalid category', () => {
    const spec = {
      blocks: [{ id: 'x', type: 'Goal', category: 'custom', content: 'test', position: { x: 0, y: 0 } }],
    };
    const result = CanvasBlockSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('validates block with optional subtype', () => {
    const block = { id: 'p1', type: 'Portal', category: 'primitive', content: 'API', position: { x: 0, y: 0 }, subtype: 'device' };
    const result = CanvasBlockSchema.safeParse(block);
    expect(result.success).toBe(true);
  });

  it('validates block without subtype', () => {
    const block = { id: 'g1', type: 'Goal', category: 'primitive', content: 'My goal', position: { x: 0, y: 0 } };
    const result = CanvasBlockSchema.safeParse(block);
    expect(result.success).toBe(true);
  });

  it('rejects more than 50 blocks', () => {
    const blocks = Array.from({ length: 51 }, (_, i) => ({
      id: `b${i}`, type: 'Skill' as const, category: 'primitive' as const, content: `Skill ${i}`, position: { x: 0, y: i * 100 },
    }));
    const result = CanvasBlockSpecSchema.safeParse({ blocks });
    expect(result.success).toBe(false);
  });
});

// --- LearningSummary ---

describe('LearningSummarySchema', () => {
  it('validates a complete summary', () => {
    const summary = {
      decisions: ['Chose CLI over web', 'Added persistence'],
      patterns_discovered: ['Adaptive Memory'],
      tradeoffs: ['Simplicity over richness'],
      next_time_suggestion: 'Try starting with Deploy first',
    };
    const result = LearningSummarySchema.safeParse(summary);
    expect(result.success).toBe(true);
  });

  it('validates with null suggestion', () => {
    const summary = {
      decisions: [],
      patterns_discovered: [],
      tradeoffs: [],
      next_time_suggestion: null,
    };
    const result = LearningSummarySchema.safeParse(summary);
    expect(result.success).toBe(true);
  });
});

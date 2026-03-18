/** Zod schemas for Planning Mode data structures (PRD-004). */

import { z } from 'zod';

// --- Plan State Schema (Section 3.3) ---

export const GoalConfidenceSchema = z.enum(['vague', 'rough', 'solid']);

export const PlanGoalSchema = z.object({
  description: z.string().max(2000).nullable(),
  confidence: GoalConfidenceSchema,
}).strict();

export const PlanProofSchema = z.object({
  description: z.string().max(2000),
}).strict();

export const PlanPromiseSchema = z.object({
  description: z.string().max(2000),
  category: z.enum(['behavior', 'constraint', 'security', 'performance']),
  proofs: z.array(PlanProofSchema).max(20),
}).strict();

export const PlanSkillSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(2000),
}).strict();

export const PortalSubtypeSchema = z.enum(['api', 'device', 'knowledge', 'service']);

export const PlanPortalSchema = z.object({
  name: z.string().max(200),
  subtype: PortalSubtypeSchema,
  description: z.string().max(2000),
}).strict();

export const DeployTargetSchema = z.enum(['cli', 'web', 'device', 'cloud']).nullable();

export const PlanDeploySchema = z.object({
  target: DeployTargetSchema,
  constraints: z.array(z.string().max(500)).max(20),
}).strict();

export const PlanStateSchema = z.object({
  idea: z.string().max(2000),
  goal: PlanGoalSchema,
  promises: z.array(PlanPromiseSchema).max(20),
  skills: z.array(PlanSkillSchema).max(20),
  portals: z.array(PlanPortalSchema).max(20),
  deploy: PlanDeploySchema,
  open_questions: z.array(z.string().max(500)).max(20),
  ready: z.boolean(),
  conversation_turn: z.number().int().min(0).max(100),
}).strict();

// --- Question Widget Schema (Section 3.4) ---

export const QuestionTypeSchema = z.enum(['single_select', 'multi_select', 'rank_priorities']);

export const QuestionOptionSchema = z.object({
  label: z.string().max(500),
  value: z.string().max(200),
}).strict();

export const QuestionWidgetSchema = z.object({
  text: z.string().max(2000),
  type: QuestionTypeSchema,
  options: z.array(QuestionOptionSchema).min(2).max(8),
}).strict();

// --- Teaching Annotation Schema (Section 7.1) ---

export const TeachingAnnotationSchema = z.object({
  why_asking: z.string().max(2000),
  primitive_connection: z.array(z.string().max(50)).max(6),
  pattern_spotted: z.string().max(200).nullable(),
  what_if: z.string().max(2000).nullable(),
}).strict();

// --- Planning Turn Output Schema (Section 3.4) ---

export const PlanMutationMapSchema = z.record(
  z.string().max(200),
  z.record(z.string(), z.unknown()).nullable(),
);

export const PlanningTurnOutputSchema = z.object({
  message: z.string().max(5000),
  question: QuestionWidgetSchema.nullable(),
  plan_mutation_map: PlanMutationMapSchema,
  plan: PlanStateSchema,
  teaching: TeachingAnnotationSchema.nullable().optional(),
}).strict();

// --- Lenient versions for parsing Claude's output (strips extra keys instead of rejecting) ---

const QuestionOptionLenientSchema = z.object({
  label: z.string().max(500),
  value: z.string().max(200),
});

const QuestionWidgetLenientSchema = z.object({
  text: z.string().max(2000),
  type: QuestionTypeSchema,
  options: z.array(QuestionOptionLenientSchema).min(2).max(8),
});

const TeachingAnnotationLenientSchema = z.object({
  why_asking: z.string().max(2000),
  primitive_connection: z.array(z.string().max(50)).max(6),
  pattern_spotted: z.string().max(200).nullable(),
  what_if: z.string().max(2000).nullable(),
});

const PlanStateLenientSchema = PlanStateSchema.strip();

/** Lenient schema for parsing Claude's planning output. Strips extra keys instead of rejecting. */
export const PlanningTurnOutputLenientSchema = z.object({
  message: z.string().max(5000),
  question: QuestionWidgetLenientSchema.nullable(),
  plan_mutation_map: PlanMutationMapSchema,
  plan: PlanStateLenientSchema,
  teaching: TeachingAnnotationLenientSchema.nullable().optional(),
});

// --- Canvas Block Spec Schema (Section 5.2) ---

export const BlockPrimitiveTypeSchema = z.enum([
  'Goal', 'Promise', 'Proof', 'Skill', 'Portal', 'Deploy',
]);

export const BlockPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
}).strict();

const CanvasBlockBaseSchema = z.object({
  id: z.string().max(200),
  type: BlockPrimitiveTypeSchema,
  category: z.literal('primitive'),
  content: z.string().max(2000),
  position: BlockPositionSchema,
  subtype: z.string().max(50).optional(),
});

export const CanvasBlockChildSchema = z.object({
  id: z.string().max(200),
  type: BlockPrimitiveTypeSchema,
  category: z.literal('primitive'),
  content: z.string().max(2000),
}).strict();

export const CanvasBlockSchema = CanvasBlockBaseSchema.extend({
  children: z.array(CanvasBlockChildSchema).max(10).optional(),
}).strict();

export const CanvasBlockSpecSchema = z.object({
  blocks: z.array(CanvasBlockSchema).max(50),
}).strict();

// --- Learning Summary Schema (Section 7.2) ---

export const LearningSummarySchema = z.object({
  decisions: z.array(z.string().max(500)).max(20),
  patterns_discovered: z.array(z.string().max(200)).max(10),
  tradeoffs: z.array(z.string().max(500)).max(10),
  next_time_suggestion: z.string().max(500).nullable(),
}).strict();

// --- Inferred TypeScript types ---

export type GoalConfidence = z.infer<typeof GoalConfidenceSchema>;
export type PlanState = z.infer<typeof PlanStateSchema>;
export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type QuestionWidget = z.infer<typeof QuestionWidgetSchema>;
export type TeachingAnnotation = z.infer<typeof TeachingAnnotationSchema>;
export type PlanningTurnOutput = z.infer<typeof PlanningTurnOutputSchema>;
export type CanvasBlockSpec = z.infer<typeof CanvasBlockSpecSchema>;
export type CanvasBlock = z.infer<typeof CanvasBlockSchema>;
export type LearningSummary = z.infer<typeof LearningSummarySchema>;
export type PortalSubtype = z.infer<typeof PortalSubtypeSchema>;
export type DeployTarget = z.infer<typeof DeployTargetSchema>;

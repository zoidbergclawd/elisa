/** Prompt templates for the Planning Mode agent (PRD-004 Section 3.2). */

import type { PlanState, QuestionWidget, TeachingAnnotation } from '../utils/planSchema.js';
import type { CanvasContext } from '../models/planning.js';

const PLANNING_AGENT_BASE = `\
You are the Planning Agent for Elisa, a kids' coding IDE. A child has an idea for a \
software nugget and you help them think it through before building, using Socratic \
questioning and the 6 primitives: Goal, Promise, Proof, Skill, Portal, Deploy.

## Your Job

Through conversation, guide the kid to fill in their plan. You ask ONE question at a time \
(never more). Each question should map to the highest-priority gap in the plan. You \
must output three things every turn:

1. **message**: A short, encouraging, kid-friendly message (2-4 sentences, ages 8-14).
2. **question**: A structured widget (single_select, multi_select, or rank_priorities) \
with 2-8 labeled options OR null if the plan is ready.
3. **plan**: The updated PlanState reflecting any new information from the kid's answer.

## The 6 Primitives

- **Goal**: What the nugget does (one sentence)
- **Promise**: A commitment the nugget honors (behavior, constraint, security, performance)
- **Proof**: A verifiable check that a promise is kept (child of a promise)
- **Skill**: A reusable multi-step behavior (the "how")
- **Portal**: An external connection (api, device, knowledge, service)
- **Deploy**: Where/how the nugget ships (cli, web, device, cloud)

## Question Priority Hierarchy

Ask questions in this order, skipping areas already filled:
1. Clarify the Goal until confidence is "solid"
2. Identify Promises (features, constraints, behavior)
3. Attach Proofs to each Promise
4. Determine Portals (external interfaces needed)
5. Determine Skills (reusable behaviors)
6. Set Deploy target and constraints
7. Resolve remaining open_questions

## Structured Widget Rules

- Every question MUST be a structured widget (single_select, multi_select, or rank_priorities)
- Options are for the kid to click, not type
- Include an "other" or "not sure" option when appropriate
- Each option's "value" field should be a short identifier (e.g. "web", "cli", "api")
- The plan_mutation_map maps each option value to the plan changes that would apply \
if selected (or null if no mutation needed)

## plan_mutation_map

For each option value in the question, provide a flat key-value map of plan mutations \
using dot-notation paths. For example:
- "web": { "deploy.target": "web" }
- "add_auth": { "promises.push": { "description": "User must log in", "category": "security", "proofs": [] } }
- "not_sure": null (no mutation)

Use these mutation operations:
- "field.path": value -- set a field
- "array.push": value -- append to an array
- "goal.confidence": "solid" -- promote confidence

## Teaching Mode

When a question connects to a computer science concept, include an optional "teaching" \
annotation with:
- why_asking: Why this question matters for their nugget
- primitive_connection: Which primitives this relates to (max 6)
- pattern_spotted: A named CS pattern if applicable (null otherwise)
- what_if: A "what if" scenario to spark curiosity (null if none)

## Readiness Criteria

Set plan.ready = true when ALL of these are met:
- goal.confidence is "solid"
- At least 2 promises, each with at least 1 proof
- At least 1 portal
- At least 1 skill
- deploy.target is set (not null)
- open_questions is empty

When ready, set question to null and write a congratulatory message.

## Rules

- NEVER ask more than one question per turn
- NEVER generate free-text input fields -- structured widgets only
- Keep messages short and enthusiastic (ages 8-14)
- Reference specific parts of their emerging plan
- Use simple language, avoid jargon
- If the kid's idea is unclear, start with a goal-clarification question
- conversation_turn increments by 1 each turn`;


const MID_PROJECT_TEMPLATE = `\

## Mid-Project Context

The kid already has blocks on their canvas. Help them fill gaps rather than starting from scratch.

Current canvas state:
- Has goal: {{hasGoal}}
- Promises: {{promiseCount}}
- Skills: {{skillCount}}
- Portals: {{portalCount}}
- Has deploy target: {{hasDeployTarget}}

Existing blocks:
{{blockList}}

Focus on what's MISSING, not what's already there. Reference their existing blocks \
when asking about gaps.`;


export const PLANNING_AGENT_SYSTEM_PROMPT = PLANNING_AGENT_BASE;

export function buildPlanningSystemPrompt(
  planState: PlanState,
  canvasContext?: CanvasContext | null,
): string {
  let prompt = PLANNING_AGENT_BASE;

  if (canvasContext) {
    const blockList = canvasContext.blocks
      .map(b => `- ${b.type}: ${b.content}${b.subtype ? ` (${b.subtype})` : ''}`)
      .join('\n');

    const midProject = MID_PROJECT_TEMPLATE
      .replace('{{hasGoal}}', String(canvasContext.hasGoal))
      .replace('{{promiseCount}}', String(canvasContext.promiseCount))
      .replace('{{skillCount}}', String(canvasContext.skillCount))
      .replace('{{portalCount}}', String(canvasContext.portalCount))
      .replace('{{hasDeployTarget}}', String(canvasContext.hasDeployTarget))
      .replace('{{blockList}}', blockList || '(none)');

    prompt += midProject;
  }

  prompt += `\n\n## Current Plan State\n\`\`\`json\n${JSON.stringify(planState, null, 2)}\n\`\`\``;

  return prompt;
}

/** Build the JSON schema for structured output enforcement of the planning turn. */
export function buildPlanningOutputSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Kid-friendly conversational message (2-4 sentences)' },
      question: {
        anyOf: [
          {
            type: 'object',
            properties: {
              text: { type: 'string' },
              type: { type: 'string', enum: ['single_select', 'multi_select', 'rank_priorities'] },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'string' },
                  },
                  required: ['label', 'value'],
                },
                minItems: 2,
                maxItems: 8,
              },
            },
            required: ['text', 'type', 'options'],
          },
          { type: 'null' },
        ],
        description: 'Structured question widget or null when plan is ready',
      },
      plan_mutation_map: {
        type: 'object',
        additionalProperties: true,
        description: 'Maps option values to plan mutations (dot-path key-value objects or null)',
      },
      plan: {
        type: 'object',
        description: 'The full updated PlanState',
      },
      teaching: {
        anyOf: [
          {
            type: 'object',
            properties: {
              why_asking: { type: 'string' },
              primitive_connection: { type: 'array', items: { type: 'string' } },
              pattern_spotted: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              what_if: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            },
            required: ['why_asking', 'primitive_connection', 'pattern_spotted', 'what_if'],
          },
          { type: 'null' },
        ],
        description: 'Optional teaching annotation',
      },
    },
    required: ['message', 'question', 'plan_mutation_map', 'plan'],
  };
}

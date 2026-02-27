/** Skill execution route handlers: /api/skills/* */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AgentRunner } from '../services/agentRunner.js';
import { SkillRunner } from '../services/skillRunner.js';
import type { SkillPlan } from '../models/skillPlan.js';
import type { SessionStore } from '../services/sessionStore.js';
import type { WSEvent } from '../services/phases/types.js';

// --- Zod schemas for SkillPlan and SkillSpec validation ---

const BaseStepSchema = z.object({
  id: z.string().max(200),
});

const AskUserStepSchema = BaseStepSchema.extend({
  type: z.literal('ask_user'),
  question: z.string().max(2000),
  header: z.string().max(200),
  options: z.array(z.string().max(500)).max(50),
  storeAs: z.string().max(200),
});

const InvokeSkillStepSchema = BaseStepSchema.extend({
  type: z.literal('invoke_skill'),
  skillId: z.string().max(200),
  storeAs: z.string().max(200),
});

const RunAgentStepSchema = BaseStepSchema.extend({
  type: z.literal('run_agent'),
  prompt: z.string().max(5000),
  storeAs: z.string().max(200),
});

const SetContextStepSchema = BaseStepSchema.extend({
  type: z.literal('set_context'),
  key: z.string().max(200),
  value: z.string().max(5000),
});

const OutputStepSchema = BaseStepSchema.extend({
  type: z.literal('output'),
  template: z.string().max(5000),
});

// BranchStep contains recursive thenSteps -- use z.lazy for the union
const SkillStepSchema: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion('type', [
    AskUserStepSchema,
    BranchStepSchema,
    InvokeSkillStepSchema,
    RunAgentStepSchema,
    SetContextStepSchema,
    OutputStepSchema,
  ]),
);

const BranchStepSchema = BaseStepSchema.extend({
  type: z.literal('branch'),
  contextKey: z.string().max(200),
  matchValue: z.string().max(500),
  thenSteps: z.array(SkillStepSchema).max(50),
});

export const SkillPlanSchema = z.object({
  skillId: z.string().max(200).optional(),
  skillName: z.string().max(200),
  steps: z.array(SkillStepSchema).max(50),
});

const SkillSpecSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(200),
  prompt: z.string().max(5000),
  category: z.string().max(200),
  workspace: z.record(z.string(), z.unknown()).optional(),
});

const SkillRunBodySchema = z.object({
  plan: SkillPlanSchema,
  allSkills: z.array(SkillSpecSchema).max(50).optional(),
});

// --- Route definitions ---

interface SkillRouterDeps {
  store: SessionStore;
  sendEvent: (sessionId: string, event: WSEvent) => Promise<void>;
}

export function createSkillRouter({ store, sendEvent }: SkillRouterDeps): Router {
  const router = Router();

  // Start standalone skill execution
  router.post('/run', (req, res) => {
    const parsed = SkillRunBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ detail: 'Invalid skill plan', errors: parsed.error.issues });
      return;
    }
    const { plan, allSkills } = parsed.data;

    const sessionId = randomUUID();
    const entry = store.create(sessionId, {
      id: sessionId,
      state: 'executing',
      spec: null,
      tasks: [],
      agents: [],
    });

    const agentRunner = new AgentRunner();
    const runner = new SkillRunner(
      (evt) => sendEvent(sessionId, evt),
      allSkills ?? [],
      agentRunner,
    );
    entry.skillRunner = runner;

    // Run async
    runner.execute(plan as SkillPlan).catch((err) => {
      console.error('SkillRunner error:', err);
    }).finally(() => {
      entry.session.state = 'done';
    });

    res.json({ session_id: sessionId });
  });

  // Answer a skill's ask_user question
  router.post('/:sessionId/answer', (req, res) => {
    const entry = store.get(req.params.sessionId);
    if (!entry?.skillRunner) { res.status(404).json({ detail: 'Skill session not found' }); return; }
    entry.skillRunner.respondToQuestion(req.body.step_id, req.body.answers ?? {});
    res.json({ status: 'ok' });
  });

  return router;
}

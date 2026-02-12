/** Skill execution route handlers: /api/skills/* */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { AgentRunner } from '../services/agentRunner.js';
import { SkillRunner } from '../services/skillRunner.js';
import type { SessionStore } from '../services/sessionStore.js';

interface SkillRouterDeps {
  store: SessionStore;
  sendEvent: (sessionId: string, event: Record<string, any>) => Promise<void>;
}

export function createSkillRouter({ store, sendEvent }: SkillRouterDeps): Router {
  const router = Router();

  // Start standalone skill execution
  router.post('/run', (req, res) => {
    const { plan, allSkills } = req.body;
    if (!plan) { res.status(400).json({ detail: 'plan is required' }); return; }

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
    runner.execute(plan).catch((err) => {
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

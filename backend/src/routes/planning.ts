/** Planning Mode route handlers: /api/sessions/:id/planning/* */

import { Router } from 'express';
import type { PlanningService } from '../services/planningService.js';
import type { SessionStore } from '../services/sessionStore.js';
import type { WSEvent, SendEvent } from '../services/phases/types.js';

interface PlanningRouterDeps {
  store: SessionStore;
  planningService: PlanningService;
  sendEvent: (sessionId: string, event: WSEvent) => Promise<void>;
  /** Resolve workspace path for a session (for auto-save). */
  getWorkspacePath?: (sessionId: string) => string | null;
}

export function createPlanningRouter({
  store,
  planningService,
  sendEvent,
  getWorkspacePath,
}: PlanningRouterDeps): Router {
  const router = Router({ mergeParams: true });

  /** Auto-save plan after state changes. Best-effort, never throws. */
  function autoSave(sessionId: string): void {
    if (!getWorkspacePath) return;
    const wp = getWorkspacePath(sessionId);
    if (wp) {
      planningService.savePlan(sessionId, wp);
    }
  }

  // GET /api/sessions/:id/planning -- get current planning state
  router.get('/', (req, res) => {
    const sessionId = req.params.id;
    const entry = store.get(sessionId);
    if (!entry) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    const state = planningService.getState(sessionId);
    if (!state) {
      res.json({ status: 'idle', plan: null });
      return;
    }

    res.json({
      status: state.status,
      plan: state.plan,
      currentQuestion: state.currentQuestion,
      conversationHistory: state.conversationHistory,
      generatedBlocks: state.generatedBlocks,
    });
  });

  // POST /api/sessions/:id/planning/start -- begin planning
  router.post('/start', async (req, res) => {
    const sessionId = req.params.id;
    const entry = store.get(sessionId);
    if (!entry) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    const { idea, canvasContext } = req.body;
    if (!idea || typeof idea !== 'string') {
      res.status(400).json({ detail: 'idea is required and must be a string' });
      return;
    }

    try {
      console.log(`[planning] starting session ${sessionId} with idea: "${idea.slice(0, 80)}"`);
      const result = await planningService.startPlanning(
        sessionId,
        idea,
        canvasContext ?? null,
      );
      console.log(`[planning] start result: question=${result.question ? result.question.type : 'null'}, status=${result.status}`);

      // Emit WS events
      await sendEvent(sessionId, {
        type: 'planning_mode_started',
        sessionId,
      });
      await sendEvent(sessionId, {
        type: 'planning_turn',
        message: result.message,
        streaming: false,
      });
      await sendEvent(sessionId, {
        type: 'planning_plan_updated',
        plan: result.plan,
      });
      if (result.question) {
        const state = planningService.getState(sessionId);
        await sendEvent(sessionId, {
          type: 'planning_question',
          question: result.question,
          plan_mutation_map: (state?.currentMutationMap ?? {}) as Record<string, Record<string, unknown> | null>,
        });
      }
      if (result.teaching) {
        await sendEvent(sessionId, {
          type: 'planning_teaching',
          teaching: result.teaching,
        });
      }

      // Store planning session reference on build session
      const planState = planningService.getState(sessionId);
      if (planState) {
        entry.session.planningSession = planState;
      }

      autoSave(sessionId);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[planning] start failed:', message);
      await sendEvent(sessionId, {
        type: 'planning_error',
        error: message,
      });
      res.status(500).json({ detail: message });
    }
  });

  // POST /api/sessions/:id/planning/answer -- structured answer
  router.post('/answer', async (req, res) => {
    const sessionId = req.params.id;
    const entry = store.get(sessionId);
    if (!entry) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    if (planningService.isGeneratingFollowUp(sessionId)) {
      res.status(409).json({ detail: 'A follow-up question is still being generated. Please wait.' });
      return;
    }

    const { optionValue } = req.body;
    // Accept string (single_select) or array of strings (multi_select, rank_priorities)
    const normalizedValue = Array.isArray(optionValue) ? optionValue.join(', ') : optionValue;
    if (!normalizedValue || typeof normalizedValue !== 'string') {
      res.status(400).json({ detail: 'optionValue is required and must be a string or string[]' });
      return;
    }

    try {
      const mutationResult = planningService.handleStructuredAnswer(sessionId, normalizedValue);

      // Emit plan update from the mutation
      await sendEvent(sessionId, {
        type: 'planning_plan_updated',
        plan: mutationResult.plan,
      });

      if (mutationResult.status === 'ready') {
        await sendEvent(sessionId, {
          type: 'planning_ready',
          plan: mutationResult.plan,
          summary: 'Plan is ready to build!',
        });
        autoSave(sessionId);
        res.json(mutationResult);
        return;
      }

      // After applying the mutation, make a follow-up Claude call to get the next question
      // (PRD-004 Section 3.4: structured answers are instant, next question requires a Claude call)
      res.json(mutationResult);
      autoSave(sessionId);

      // Fire-and-forget: generate next question asynchronously
      console.log(`[planning] structured answer applied: "${normalizedValue}", generating next question...`);
      planningService.setGeneratingFollowUp(sessionId, true);
      (async () => {
        try {
          const followUp = await planningService.generateNextQuestion(sessionId);

          await sendEvent(sessionId, {
            type: 'planning_turn',
            message: followUp.message,
            streaming: false,
          });
          await sendEvent(sessionId, {
            type: 'planning_plan_updated',
            plan: followUp.plan,
          });
          if (followUp.question) {
            const state = planningService.getState(sessionId);
            await sendEvent(sessionId, {
              type: 'planning_question',
              question: followUp.question,
              plan_mutation_map: (state?.currentMutationMap ?? {}) as Record<string, Record<string, unknown> | null>,
            });
          }
          if (followUp.teaching) {
            await sendEvent(sessionId, {
              type: 'planning_teaching',
              teaching: followUp.teaching,
            });
          }
          if (followUp.status === 'ready') {
            await sendEvent(sessionId, {
              type: 'planning_ready',
              plan: followUp.plan,
              summary: 'Your plan looks complete! Review it and click Generate Canvas when ready.',
            });
          }
          autoSave(sessionId);
        } catch (followUpErr) {
          const msg = followUpErr instanceof Error ? followUpErr.message : String(followUpErr);
          console.error('[planning] follow-up question failed:', msg);
          await sendEvent(sessionId, {
            type: 'planning_error',
            error: `Follow-up failed: ${msg}. You can type a message to continue.`,
          });
        } finally {
          planningService.setGeneratingFollowUp(sessionId, false);
        }
      })();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[planning] answer failed:', message);
      await sendEvent(sessionId, {
        type: 'planning_error',
        error: message,
      });
      res.status(500).json({ detail: message });
    }
  });

  // POST /api/sessions/:id/planning/message -- free-text answer
  router.post('/message', async (req, res) => {
    const sessionId = req.params.id;
    const entry = store.get(sessionId);
    if (!entry) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ detail: 'text is required and must be a string' });
      return;
    }

    try {
      console.log(`[planning] free-text message: "${text.slice(0, 80)}"`);
      const result = await planningService.handleFreeTextAnswer(sessionId, text);
      console.log(`[planning] message result: question=${result.question ? result.question.type : 'null'}, status=${result.status}`);

      // Emit WS events
      await sendEvent(sessionId, {
        type: 'planning_turn',
        message: result.message,
        streaming: false,
      });
      await sendEvent(sessionId, {
        type: 'planning_plan_updated',
        plan: result.plan,
      });
      if (result.question) {
        const state = planningService.getState(sessionId);
        await sendEvent(sessionId, {
          type: 'planning_question',
          question: result.question,
          plan_mutation_map: (state?.currentMutationMap ?? {}) as Record<string, Record<string, unknown> | null>,
        });
      }
      if (result.teaching) {
        await sendEvent(sessionId, {
          type: 'planning_teaching',
          teaching: result.teaching,
        });
      }
      if (result.status === 'ready') {
        await sendEvent(sessionId, {
          type: 'planning_ready',
          plan: result.plan,
          summary: 'Plan is ready to build!',
        });
      }

      autoSave(sessionId);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[planning] message failed:', message);
      await sendEvent(sessionId, {
        type: 'planning_error',
        error: message,
      });
      res.status(500).json({ detail: message });
    }
  });

  // POST /api/sessions/:id/planning/generate -- generate canvas blocks
  router.post('/generate', async (req, res) => {
    const sessionId = req.params.id;
    const entry = store.get(sessionId);
    if (!entry) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    try {
      const blocks = await planningService.generateCanvas(sessionId);

      await sendEvent(sessionId, {
        type: 'planning_canvas_generated',
        blocks,
      });

      autoSave(sessionId);
      res.json({ blocks });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[planning] generate failed:', message);
      await sendEvent(sessionId, {
        type: 'planning_error',
        error: message,
      });
      res.status(500).json({ detail: message });
    }
  });

  return router;
}

/**
 * Build reconnection replay events for a planning session.
 * Called when a client reconnects mid-planning to catch up.
 */
export function buildPlanningReplayEvents(
  planningService: PlanningService,
  sessionId: string,
): WSEvent[] {
  const state = planningService.getState(sessionId);
  if (!state || state.status === 'idle') return [];

  const events: WSEvent[] = [];

  events.push({
    type: 'planning_mode_started',
    sessionId,
  });

  events.push({
    type: 'planning_plan_updated',
    plan: state.plan,
  });

  if (state.currentQuestion) {
    events.push({
      type: 'planning_question',
      question: state.currentQuestion,
      plan_mutation_map: (state.currentMutationMap ?? {}) as Record<string, Record<string, unknown> | null>,
    });
  }

  // Replay conversation history messages
  for (const msg of state.conversationHistory) {
    if (msg.role === 'agent') {
      events.push({
        type: 'planning_turn',
        message: msg.content,
        streaming: false,
      });
    }
  }

  if (state.status === 'ready') {
    events.push({
      type: 'planning_ready',
      plan: state.plan,
      summary: 'Plan is ready to build!',
    });
  }

  if (state.generatedBlocks) {
    events.push({
      type: 'planning_canvas_generated',
      blocks: state.generatedBlocks,
    });
  }

  return events;
}

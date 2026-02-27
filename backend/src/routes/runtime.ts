/**
 * Runtime API routes — REST surface for the Elisa Agent Runtime (PRD-001 Section 2.9).
 *
 * Endpoints:
 *   POST   /v1/agents              — Provision new agent
 *   PUT    /v1/agents/:id          — Update agent config
 *   DELETE /v1/agents/:id          — Deprovision agent
 *   POST   /v1/agents/:id/turn/text — Text conversation turn
 *   GET    /v1/agents/:id/history  — Conversation history
 *   GET    /v1/agents/:id/heartbeat — Agent health check
 *
 * Auth: All endpoints except POST /v1/agents require x-api-key header.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AgentStore } from '../services/runtime/agentStore.js';
import type { ConversationManager } from '../services/runtime/conversationManager.js';
import type { TurnPipeline } from '../services/runtime/turnPipeline.js';
import type { KnowledgeBackpack } from '../services/runtime/knowledgeBackpack.js';
import type { StudyMode } from '../services/runtime/studyMode.js';
import type { GapDetector } from '../services/runtime/gapDetector.js';

// ── Types ─────────────────────────────────────────────────────────────

export interface RuntimeRouterDeps {
  agentStore: AgentStore;
  conversationManager: ConversationManager;
  turnPipeline: TurnPipeline;
  knowledgeBackpack?: KnowledgeBackpack;
  studyMode?: StudyMode;
  gapDetector?: GapDetector;
}

// ── Auth Middleware ────────────────────────────────────────────────────

/**
 * Middleware that validates x-api-key header against the provisioned API key
 * for the agent identified by :id in the URL.
 */
function requireApiKey(agentStore: AgentStore) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const agentId = req.params.id;
    const apiKey = req.headers['x-api-key'];

    if (!agentId) {
      res.status(400).json({ detail: 'Agent ID is required' });
      return;
    }

    if (!apiKey || typeof apiKey !== 'string') {
      res.status(401).json({ detail: 'x-api-key header is required' });
      return;
    }

    if (!agentStore.validateApiKey(agentId, apiKey)) {
      res.status(403).json({ detail: 'Invalid API key' });
      return;
    }

    next();
  };
}

// ── Router ────────────────────────────────────────────────────────────

export function createRuntimeRouter(deps: RuntimeRouterDeps): Router {
  const { agentStore, conversationManager, turnPipeline, knowledgeBackpack, studyMode, gapDetector } = deps;
  const router = Router();

  const authMiddleware = requireApiKey(agentStore);

  // ── POST /v1/agents — Provision new agent ─────────────────────────
  // No auth required (this is the provisioning endpoint)
  router.post('/agents', (req: Request, res: Response) => {
    const spec = req.body;

    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      res.status(400).json({ detail: 'Request body must be a NuggetSpec object' });
      return;
    }

    try {
      const result = agentStore.provision(spec);
      res.status(201).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ detail: `Provisioning failed: ${message}` });
    }
  });

  // ── PUT /v1/agents/:id — Update agent config ─────────────────────
  router.put('/agents/:id', authMiddleware, (req: Request, res: Response) => {
    const spec = req.body;

    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      res.status(400).json({ detail: 'Request body must be a NuggetSpec object' });
      return;
    }

    try {
      agentStore.update(req.params.id, spec);
      res.json({ status: 'updated', agent_id: req.params.id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ detail: message });
      } else {
        res.status(500).json({ detail: `Update failed: ${message}` });
      }
    }
  });

  // ── DELETE /v1/agents/:id — Deprovision agent ─────────────────────
  router.delete('/agents/:id', authMiddleware, (req: Request, res: Response) => {
    const agentId = req.params.id;

    // Clean up conversation sessions
    conversationManager.deleteAgentSessions(agentId);

    // Clean up usage records
    turnPipeline.getUsageTracker().clear(agentId);

    // Clean up knowledge backpack
    knowledgeBackpack?.deleteAgent(agentId);

    // Clean up study mode
    studyMode?.deleteAgent(agentId);

    // Clean up gap detection
    gapDetector?.deleteAgent(agentId);

    // Remove agent
    const deleted = agentStore.delete(agentId);
    if (!deleted) {
      res.status(404).json({ detail: `Agent not found: ${agentId}` });
      return;
    }

    res.json({ status: 'deleted', agent_id: agentId });
  });

  // ── POST /v1/agents/:id/turn/text — Text conversation turn ────────
  router.post('/agents/:id/turn/text', authMiddleware, async (req: Request, res: Response) => {
    const { text, session_id } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ detail: 'text field is required' });
      return;
    }

    try {
      const result = await turnPipeline.receiveTurn(req.params.id, {
        text,
        session_id,
      });
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ detail: message });
      } else {
        res.status(500).json({ detail: `Turn failed: ${message}` });
      }
    }
  });

  // ── GET /v1/agents/:id/history — Conversation history ─────────────
  router.get('/agents/:id/history', authMiddleware, (req: Request, res: Response) => {
    const agentId = req.params.id;
    const sessionId = req.query.session_id as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    if (sessionId) {
      // Get history for a specific session
      try {
        const session = conversationManager.getSession(sessionId);
        if (!session) {
          res.status(404).json({ detail: `Session not found: ${sessionId}` });
          return;
        }
        if (session.agent_id !== agentId) {
          res.status(403).json({ detail: 'Session does not belong to this agent' });
          return;
        }
        const turns = conversationManager.getHistory(sessionId, limit);
        res.json({ session_id: sessionId, turns });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ detail: message });
      }
    } else {
      // List all sessions for the agent
      const sessions = conversationManager.getSessions(agentId);
      res.json({
        agent_id: agentId,
        sessions: sessions.map((s) => ({
          session_id: s.session_id,
          turn_count: s.turns.length,
          created_at: s.created_at,
        })),
      });
    }
  });

  // ── GET /v1/agents/:id/heartbeat — Agent health check ─────────────
  router.get('/agents/:id/heartbeat', (req: Request, res: Response) => {
    const agentId = req.params.id;
    const agent = agentStore.get(agentId);

    if (!agent) {
      res.status(404).json({ status: 'not_found' });
      return;
    }

    const usage = turnPipeline.getUsageTracker().getTotals(agentId);
    const sessions = conversationManager.getSessions(agentId);

    res.json({
      status: 'online',
      agent_id: agentId,
      agent_name: agent.agent_name,
      session_count: sessions.length,
      total_input_tokens: usage.input_tokens,
      total_output_tokens: usage.output_tokens,
    });
  });

  // ── GET /v1/agents/:id/gaps — Knowledge gap list ─────────────────────
  router.get('/agents/:id/gaps', authMiddleware, (req: Request, res: Response) => {
    if (!gapDetector) {
      res.status(501).json({ detail: 'Gap detection not available' });
      return;
    }

    const gaps = gapDetector.getGaps(req.params.id);
    res.json({ agent_id: req.params.id, gaps });
  });

  // ── Knowledge Backpack Endpoints ─────────────────────────────────────

  // POST /v1/agents/:id/backpack — Add source
  router.post('/agents/:id/backpack', authMiddleware, (req: Request, res: Response) => {
    if (!knowledgeBackpack) {
      res.status(501).json({ detail: 'Knowledge backpack not available' });
      return;
    }

    const { title, content, source_type, uri } = req.body;
    if (!title || typeof title !== 'string') {
      res.status(400).json({ detail: 'title field is required' });
      return;
    }
    if (!content || typeof content !== 'string') {
      res.status(400).json({ detail: 'content field is required' });
      return;
    }

    const sourceId = knowledgeBackpack.addSource(req.params.id, {
      title,
      content,
      source_type: source_type ?? 'manual',
      uri,
    });

    res.status(201).json({ source_id: sourceId, agent_id: req.params.id });
  });

  // DELETE /v1/agents/:id/backpack/:sourceId — Remove source
  router.delete('/agents/:id/backpack/:sourceId', authMiddleware, (req: Request, res: Response) => {
    if (!knowledgeBackpack) {
      res.status(501).json({ detail: 'Knowledge backpack not available' });
      return;
    }

    const removed = knowledgeBackpack.removeSource(req.params.id, req.params.sourceId);
    if (!removed) {
      res.status(404).json({ detail: `Source not found: ${req.params.sourceId}` });
      return;
    }

    res.json({ status: 'removed', source_id: req.params.sourceId });
  });

  // GET /v1/agents/:id/backpack — List sources
  router.get('/agents/:id/backpack', authMiddleware, (req: Request, res: Response) => {
    if (!knowledgeBackpack) {
      res.status(501).json({ detail: 'Knowledge backpack not available' });
      return;
    }

    const sources = knowledgeBackpack.getSources(req.params.id);
    res.json({ agent_id: req.params.id, sources });
  });

  // POST /v1/agents/:id/backpack/search — Search backpack
  router.post('/agents/:id/backpack/search', authMiddleware, (req: Request, res: Response) => {
    if (!knowledgeBackpack) {
      res.status(501).json({ detail: 'Knowledge backpack not available' });
      return;
    }

    const { query, limit } = req.body;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ detail: 'query field is required' });
      return;
    }

    const results = knowledgeBackpack.search(req.params.id, query, limit);
    res.json({ agent_id: req.params.id, results });
  });

  // ── Study Mode Endpoints ───────────────────────────────────────────

  // PUT /v1/agents/:id/study — Enable/disable study mode
  router.put('/agents/:id/study', authMiddleware, (req: Request, res: Response) => {
    if (!studyMode) {
      res.status(501).json({ detail: 'Study mode not available' });
      return;
    }

    const { enabled, style, difficulty, quiz_frequency } = req.body;

    if (enabled === false) {
      studyMode.disable(req.params.id);
      res.json({ status: 'disabled', agent_id: req.params.id });
      return;
    }

    studyMode.enable(req.params.id, {
      enabled: true,
      style: style ?? 'quiz',
      difficulty: difficulty ?? 'medium',
      quiz_frequency: quiz_frequency ?? 5,
    });

    res.json({ status: 'enabled', agent_id: req.params.id });
  });

  // GET /v1/agents/:id/study — Get study config + progress
  router.get('/agents/:id/study', authMiddleware, (req: Request, res: Response) => {
    if (!studyMode) {
      res.status(501).json({ detail: 'Study mode not available' });
      return;
    }

    const config = studyMode.getConfig(req.params.id);
    const progress = studyMode.getProgress(req.params.id);

    res.json({
      agent_id: req.params.id,
      config,
      progress,
    });
  });

  // POST /v1/agents/:id/study/quiz — Generate quiz question
  router.post('/agents/:id/study/quiz', authMiddleware, (req: Request, res: Response) => {
    if (!studyMode) {
      res.status(501).json({ detail: 'Study mode not available' });
      return;
    }

    const question = studyMode.generateQuiz(req.params.id);
    if (!question) {
      res.status(404).json({ detail: 'No quiz available. Is study mode enabled and backpack non-empty?' });
      return;
    }

    res.json(question);
  });

  // POST /v1/agents/:id/study/answer — Submit answer
  router.post('/agents/:id/study/answer', authMiddleware, (req: Request, res: Response) => {
    if (!studyMode) {
      res.status(501).json({ detail: 'Study mode not available' });
      return;
    }

    const { question_id, answer } = req.body;
    if (!question_id || typeof question_id !== 'string') {
      res.status(400).json({ detail: 'question_id field is required' });
      return;
    }
    if (answer === undefined || typeof answer !== 'number') {
      res.status(400).json({ detail: 'answer field (number) is required' });
      return;
    }

    try {
      const correct = studyMode.submitAnswer(req.params.id, question_id, answer);
      res.json({ correct, question_id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ detail: message });
    }
  });

  // ── Gap Detection Endpoints ─────────────────────────────────────────

  // GET /v1/agents/:id/gaps — List detected knowledge gaps
  router.get('/agents/:id/gaps', authMiddleware, (req: Request, res: Response) => {
    if (!gapDetector) {
      res.status(501).json({ detail: 'Gap detection not available' });
      return;
    }

    const gaps = gapDetector.getGaps(req.params.id);
    res.json({ agent_id: req.params.id, gaps });
  });

  return router;
}

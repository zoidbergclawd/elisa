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

// ── Types ─────────────────────────────────────────────────────────────

export interface RuntimeRouterDeps {
  agentStore: AgentStore;
  conversationManager: ConversationManager;
  turnPipeline: TurnPipeline;
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
  const { agentStore, conversationManager, turnPipeline } = deps;
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
    } catch (err: any) {
      res.status(500).json({ detail: `Provisioning failed: ${err.message}` });
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
    } catch (err: any) {
      if (err.message.includes('not found')) {
        res.status(404).json({ detail: err.message });
      } else {
        res.status(500).json({ detail: `Update failed: ${err.message}` });
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
    } catch (err: any) {
      if (err.message.includes('not found')) {
        res.status(404).json({ detail: err.message });
      } else {
        res.status(500).json({ detail: `Turn failed: ${err.message}` });
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
      } catch (err: any) {
        res.status(500).json({ detail: err.message });
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

  return router;
}

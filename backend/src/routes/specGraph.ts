/**
 * Spec Graph API routes — REST surface for managing directed graphs of NuggetSpecs.
 *
 * Endpoints:
 *   POST   /                    — Create new graph
 *   GET    /:id                 — Get full graph
 *   DELETE /:id                 — Delete graph
 *   POST   /:id/nodes           — Add node
 *   GET    /:id/nodes           — List all nodes
 *   GET    /:id/nodes/:nodeId   — Get single node
 *   DELETE /:id/nodes/:nodeId   — Remove node + its edges
 *   POST   /:id/edges           — Add edge
 *   DELETE /:id/edges           — Remove edge
 *   GET    /:id/neighbors/:nodeId — Get neighbors
 */

import { Router, type Request, type Response } from 'express';
import type { SpecGraphService } from '../services/specGraph.js';
import type { CompositionService } from '../services/compositionService.js';

export interface SpecGraphRouterDeps {
  specGraphService: SpecGraphService;
  compositionService?: CompositionService;
}

export function createSpecGraphRouter(deps: SpecGraphRouterDeps): Router {
  const { specGraphService, compositionService } = deps;
  const router = Router();

  // POST / — Create new graph
  router.post('/', (req: Request, res: Response) => {
    const { workspace_path } = req.body;

    if (!workspace_path || typeof workspace_path !== 'string') {
      res.status(400).json({ detail: 'workspace_path field is required' });
      return;
    }

    try {
      const graph_id = specGraphService.create(workspace_path);
      res.status(201).json({ graph_id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ detail: message });
    }
  });

  // GET /:id — Get full graph
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const graph = specGraphService.getGraph(req.params.id);
      if (!graph) {
        res.status(404).json({ detail: `Graph not found: ${req.params.id}` });
        return;
      }
      res.json({ graph });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ detail: message });
    }
  });

  // DELETE /:id — Delete graph
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const deleted = specGraphService.deleteGraph(req.params.id);
      if (!deleted) {
        res.status(404).json({ detail: `Graph not found: ${req.params.id}` });
        return;
      }
      res.json({ status: 'deleted' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ detail: message });
    }
  });

  // POST /:id/nodes — Add node
  router.post('/:id/nodes', (req: Request, res: Response) => {
    const { spec, label } = req.body;

    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      res.status(400).json({ detail: 'spec field is required and must be an object' });
      return;
    }

    if (!label || typeof label !== 'string') {
      res.status(400).json({ detail: 'label field is required' });
      return;
    }

    try {
      const node_id = specGraphService.addNode(req.params.id, spec, label);
      res.status(201).json({ node_id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ detail: message });
      } else {
        res.status(500).json({ detail: message });
      }
    }
  });

  // GET /:id/nodes — List all nodes
  router.get('/:id/nodes', (req: Request, res: Response) => {
    try {
      const nodes = specGraphService.getNodes(req.params.id);
      res.json({ nodes });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ detail: message });
      } else {
        res.status(500).json({ detail: message });
      }
    }
  });

  // GET /:id/nodes/:nodeId — Get single node
  router.get('/:id/nodes/:nodeId', (req: Request, res: Response) => {
    try {
      const node = specGraphService.getNode(req.params.id, req.params.nodeId);
      if (!node) {
        res.status(404).json({ detail: `Node not found: ${req.params.nodeId}` });
        return;
      }
      res.json({ node });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ detail: message });
      } else {
        res.status(500).json({ detail: message });
      }
    }
  });

  // DELETE /:id/nodes/:nodeId — Remove node + its edges
  router.delete('/:id/nodes/:nodeId', (req: Request, res: Response) => {
    try {
      const removed = specGraphService.removeNode(req.params.id, req.params.nodeId);
      if (!removed) {
        res.status(404).json({ detail: `Node not found: ${req.params.nodeId}` });
        return;
      }
      res.json({ status: 'removed' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ detail: message });
      } else {
        res.status(500).json({ detail: message });
      }
    }
  });

  // POST /:id/edges — Add edge
  router.post('/:id/edges', (req: Request, res: Response) => {
    const { from_id, to_id, relationship, description } = req.body;

    if (!from_id || typeof from_id !== 'string') {
      res.status(400).json({ detail: 'from_id field is required' });
      return;
    }

    if (!to_id || typeof to_id !== 'string') {
      res.status(400).json({ detail: 'to_id field is required' });
      return;
    }

    if (!relationship || typeof relationship !== 'string') {
      res.status(400).json({ detail: 'relationship field is required' });
      return;
    }

    try {
      specGraphService.addEdge(req.params.id, { from_id, to_id, relationship, description });
      res.status(201).json({ status: 'added' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ detail: message });
      } else if (message.includes('Self-edge') || message.includes('Duplicate')) {
        res.status(400).json({ detail: message });
      } else {
        res.status(500).json({ detail: message });
      }
    }
  });

  // DELETE /:id/edges — Remove edge
  router.delete('/:id/edges', (req: Request, res: Response) => {
    const { from_id, to_id } = req.body;

    if (!from_id || typeof from_id !== 'string') {
      res.status(400).json({ detail: 'from_id field is required' });
      return;
    }

    if (!to_id || typeof to_id !== 'string') {
      res.status(400).json({ detail: 'to_id field is required' });
      return;
    }

    try {
      const removed = specGraphService.removeEdge(req.params.id, from_id, to_id);
      if (!removed) {
        res.status(404).json({ detail: 'Edge not found' });
        return;
      }
      res.json({ status: 'removed' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ detail: message });
      } else {
        res.status(500).json({ detail: message });
      }
    }
  });

  // GET /:id/neighbors/:nodeId — Get neighbors
  router.get('/:id/neighbors/:nodeId', (req: Request, res: Response) => {
    try {
      const result = specGraphService.getNeighbors(req.params.id, req.params.nodeId);
      res.json({ incoming: result.incoming, outgoing: result.outgoing });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ detail: message });
      } else {
        res.status(500).json({ detail: message });
      }
    }
  });

  // ── Composition endpoints (require compositionService) ──────────────

  // POST /:id/compose — Compose multiple nodes into a merged NuggetSpec
  router.post('/:id/compose', (req: Request, res: Response) => {
    if (!compositionService) {
      res.status(501).json({ detail: 'CompositionService not available' });
      return;
    }

    const { node_ids, system_level } = req.body;

    if (!Array.isArray(node_ids) || node_ids.length === 0) {
      res.status(400).json({ detail: 'node_ids must be a non-empty array' });
      return;
    }

    try {
      const result = compositionService.compose(req.params.id, node_ids, system_level);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Invalid composition')) {
        res.status(400).json({ detail: message });
      } else if (message.includes('not found')) {
        res.status(404).json({ detail: message });
      } else {
        res.status(500).json({ detail: message });
      }
    }
  });

  // POST /:id/impact — Detect cross-nugget impact of changing a node
  router.post('/:id/impact', (req: Request, res: Response) => {
    if (!compositionService) {
      res.status(501).json({ detail: 'CompositionService not available' });
      return;
    }

    const { node_id } = req.body;

    if (!node_id || typeof node_id !== 'string') {
      res.status(400).json({ detail: 'node_id field is required' });
      return;
    }

    try {
      const result = compositionService.detectCrossNuggetImpact(req.params.id, node_id);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ detail: message });
      } else {
        res.status(500).json({ detail: message });
      }
    }
  });

  // GET /:id/interfaces — Resolve interface contracts among nodes
  router.get('/:id/interfaces', (req: Request, res: Response) => {
    if (!compositionService) {
      res.status(501).json({ detail: 'CompositionService not available' });
      return;
    }

    const nodeIdsParam = req.query.node_ids;

    if (!nodeIdsParam || typeof nodeIdsParam !== 'string') {
      res.status(400).json({ detail: 'node_ids query parameter is required' });
      return;
    }

    const nodeIds = nodeIdsParam.split(',').map((s) => s.trim()).filter(Boolean);

    if (nodeIds.length === 0) {
      res.status(400).json({ detail: 'node_ids must contain at least one ID' });
      return;
    }

    try {
      const contracts = compositionService.resolveInterfaces(req.params.id, nodeIds);
      res.json({ contracts });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ detail: message });
      } else {
        res.status(500).json({ detail: message });
      }
    }
  });

  return router;
}

/** Hardware-related route handlers: /api/hardware/* */

import { Router } from 'express';
import type { SessionStore } from '../services/sessionStore.js';
import type { HardwareService } from '../services/hardwareService.js';

interface HardwareRouterDeps {
  store: SessionStore;
  hardwareService: HardwareService;
}

export function createHardwareRouter({ store, hardwareService }: HardwareRouterDeps): Router {
  const router = Router();

  // Hardware detect (fast VID:PID only -- safe for polling)
  router.get('/detect', async (_req, res) => {
    const board = await hardwareService.detectBoardFast();
    if (board) {
      res.json({ detected: true, port: board.port, board_type: board.boardType });
    } else {
      res.json({ detected: false });
    }
  });

  // Hardware flash
  router.post('/flash/:id', async (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry?.orchestrator) { res.status(404).json({ detail: 'Session not found' }); return; }
    const result = await hardwareService.flash(entry.orchestrator.nuggetDir);
    res.json({ success: result.success, message: result.message });
  });

  return router;
}

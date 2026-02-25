import { Router } from 'express';
import type { DeviceRegistry } from '../services/deviceRegistry.js';

export function createDeviceRouter({ registry }: { registry: DeviceRegistry }): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(registry.getAllDevices());
  });

  return router;
}

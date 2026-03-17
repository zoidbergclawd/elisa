import { describe, it, expect } from 'vitest';
import { SHIPPED_NUGGETS } from './shippedNuggets';

describe('shipped nuggets', () => {
  it('exports at least 3 shipped nuggets', () => {
    expect(SHIPPED_NUGGETS.length).toBeGreaterThanOrEqual(3);
  });

  for (const nugget of SHIPPED_NUGGETS) {
    describe(nugget.name, () => {
      it('has required fields', () => {
        expect(nugget.id).toBeTruthy();
        expect(nugget.name).toBeTruthy();
        expect(nugget.description).toBeTruthy();
        expect(nugget.spec).toBeDefined();
      });

      it('has a valid spec with a goal', () => {
        expect(nugget.spec.nugget.goal).toBeTruthy();
        expect(nugget.spec.nugget.description).toBeTruthy();
      });

      it('has a deployment target', () => {
        expect(nugget.spec.deployment.target).toBeTruthy();
        expect(['web', 'esp32', 'both', 'preview']).toContain(nugget.spec.deployment.target);
      });

      it('has at least one requirement', () => {
        expect(nugget.spec.requirements.length).toBeGreaterThanOrEqual(1);
      });
    });
  }

  it('includes Web Dashboard nugget', () => {
    const dashboard = SHIPPED_NUGGETS.find(n => n.id === 'shipped-web-dashboard');
    expect(dashboard).toBeDefined();
    expect(dashboard!.spec.deployment.target).toBe('web');
  });

  it('includes REST API Server nugget', () => {
    const api = SHIPPED_NUGGETS.find(n => n.id === 'shipped-rest-api');
    expect(api).toBeDefined();
    expect(api!.spec.deployment.target).toBe('web');
  });

  it('includes Sensor Node nugget', () => {
    const sensor = SHIPPED_NUGGETS.find(n => n.id === 'shipped-sensor-node');
    expect(sensor).toBeDefined();
    expect(sensor!.spec.deployment.target).toBe('esp32');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ModelRouter,
  MODEL_CATALOG,
  DEFAULT_TIER_MAP,
  computeComplexity,
  type ModelDefinition,
  type RoutingContext,
} from './modelRouter.js';

describe('ModelRouter', () => {
  let router: ModelRouter;

  beforeEach(() => {
    // Clear env overrides
    delete process.env.CLAUDE_MODEL;
    delete process.env.ELISA_MODELS;
    router = new ModelRouter(MODEL_CATALOG);
  });

  afterEach(() => {
    delete process.env.CLAUDE_MODEL;
    delete process.env.ELISA_MODELS;
  });

  describe('default tier mapping', () => {
    it('routes metaplanner to high tier (opus)', () => {
      const decision = router.resolve({ role: 'metaplanner' });
      expect(decision.tier).toBe('high');
      expect(decision.model).toBe('claude-opus-4-6');
    });

    it('routes builder to high tier (opus)', () => {
      const decision = router.resolve({ role: 'builder' });
      expect(decision.tier).toBe('high');
      expect(decision.model).toBe('claude-opus-4-6');
    });

    it('routes tester to medium tier (sonnet)', () => {
      const decision = router.resolve({ role: 'tester' });
      expect(decision.tier).toBe('medium');
      expect(decision.model).toBe('claude-sonnet-4-6');
    });

    it('routes reviewer to medium tier (sonnet)', () => {
      const decision = router.resolve({ role: 'reviewer' });
      expect(decision.tier).toBe('medium');
      expect(decision.model).toBe('claude-sonnet-4-6');
    });

    it('routes custom to high tier (opus)', () => {
      const decision = router.resolve({ role: 'custom' });
      expect(decision.tier).toBe('high');
      expect(decision.model).toBe('claude-opus-4-6');
    });

    it('routes narrator to low tier (haiku)', () => {
      const decision = router.resolve({ role: 'narrator' });
      expect(decision.tier).toBe('low');
      expect(decision.model).toBe('claude-haiku-4-5-20241022');
    });

    it('routes teaching to low tier (haiku)', () => {
      const decision = router.resolve({ role: 'teaching' });
      expect(decision.tier).toBe('low');
      expect(decision.model).toBe('claude-haiku-4-5-20241022');
    });

    it('routes unknown role to high tier by default', () => {
      const decision = router.resolve({ role: 'unknown_role' });
      expect(decision.tier).toBe('high');
    });
  });

  describe('complexity promotion', () => {
    it('promotes medium to high when complexity >= 0.5', () => {
      const decision = router.resolve({ role: 'tester', taskComplexity: 0.6 });
      expect(decision.tier).toBe('high');
      expect(decision.model).toBe('claude-opus-4-6');
      expect(decision.reason).toBe('complexity promotion');
    });

    it('does not promote when complexity < 0.5', () => {
      const decision = router.resolve({ role: 'tester', taskComplexity: 0.3 });
      expect(decision.tier).toBe('medium');
    });

    it('does not promote high tier further', () => {
      const decision = router.resolve({ role: 'builder', taskComplexity: 0.9 });
      expect(decision.tier).toBe('high');
    });
  });

  describe('retry promotion', () => {
    it('promotes medium to high on retryCount >= 1', () => {
      const decision = router.resolve({ role: 'tester', retryCount: 1 });
      expect(decision.tier).toBe('high');
      expect(decision.reason).toBe('retry promotion');
    });

    it('promotes low to medium on retryCount >= 1', () => {
      const decision = router.resolve({ role: 'narrator', retryCount: 1 });
      expect(decision.tier).toBe('medium');
      expect(decision.reason).toBe('retry promotion');
    });

    it('does not promote if already at high', () => {
      const decision = router.resolve({ role: 'builder', retryCount: 2 });
      expect(decision.tier).toBe('high');
    });
  });

  describe('budget-aware demotion', () => {
    it('demotes when budget < 20% remaining', () => {
      const decision = router.resolve({
        role: 'builder',
        budgetRemaining: 50_000,
        budgetTotal: 500_000,
      });
      expect(decision.tier).toBe('medium');
      expect(decision.reason).toBe('budget low (<20%) demotion');
    });

    it('does not demote metaplanner even when budget is low', () => {
      const decision = router.resolve({
        role: 'metaplanner',
        budgetRemaining: 50_000,
        budgetTotal: 500_000,
      });
      expect(decision.tier).toBe('high');
    });

    it('does not demote when budget is sufficient', () => {
      const decision = router.resolve({
        role: 'builder',
        budgetRemaining: 300_000,
        budgetTotal: 500_000,
      });
      expect(decision.tier).toBe('high');
    });
  });

  describe('budget mode', () => {
    it('demotes all tiers except metaplanner in budget mode', () => {
      const budgetRouter = new ModelRouter(MODEL_CATALOG, { budget_mode: true });

      const builder = budgetRouter.resolve({ role: 'builder' });
      expect(builder.tier).toBe('medium');

      const tester = budgetRouter.resolve({ role: 'tester' });
      expect(tester.tier).toBe('low');

      const metaplanner = budgetRouter.resolve({ role: 'metaplanner' });
      expect(metaplanner.tier).toBe('high');
    });
  });

  describe('user role_overrides', () => {
    it('uses override model for specified role', () => {
      const overrideRouter = new ModelRouter(MODEL_CATALOG, {
        role_overrides: { builder: 'claude-sonnet-4-6' },
      });
      const decision = overrideRouter.resolve({ role: 'builder' });
      expect(decision.model).toBe('claude-sonnet-4-6');
      expect(decision.reason).toContain('role_override');
    });

    it('falls through to default for roles without override', () => {
      const overrideRouter = new ModelRouter(MODEL_CATALOG, {
        role_overrides: { builder: 'claude-sonnet-4-6' },
      });
      const decision = overrideRouter.resolve({ role: 'tester' });
      expect(decision.model).toBe('claude-sonnet-4-6');
      expect(decision.tier).toBe('medium');
    });
  });

  describe('CLAUDE_MODEL env override', () => {
    it('overrides all routing when CLAUDE_MODEL is set', () => {
      process.env.CLAUDE_MODEL = 'claude-sonnet-4-6';
      const decision = router.resolve({ role: 'builder' });
      expect(decision.model).toBe('claude-sonnet-4-6');
      expect(decision.reason).toBe('CLAUDE_MODEL env override');
    });

    it('takes precedence over role_overrides', () => {
      process.env.CLAUDE_MODEL = 'claude-sonnet-4-6';
      const overrideRouter = new ModelRouter(MODEL_CATALOG, {
        role_overrides: { builder: 'claude-opus-4-6' },
      });
      const decision = overrideRouter.resolve({ role: 'builder' });
      expect(decision.model).toBe('claude-sonnet-4-6');
    });
  });

  describe('resolveFallback', () => {
    it('demotes high to medium', () => {
      const decision = router.resolveFallback('claude-opus-4-6');
      expect(decision.tier).toBe('medium');
      expect(decision.model).toBe('claude-sonnet-4-6');
    });

    it('demotes medium to low', () => {
      const decision = router.resolveFallback('claude-sonnet-4-6');
      expect(decision.tier).toBe('low');
      expect(decision.model).toBe('claude-haiku-4-5-20241022');
    });

    it('stays at low when already lowest', () => {
      const decision = router.resolveFallback('claude-haiku-4-5-20241022');
      expect(decision.tier).toBe('low');
      expect(decision.model).toBe('claude-haiku-4-5-20241022');
      expect(decision.reason).toBe('already at lowest tier');
    });

    it('falls back to medium for unknown model', () => {
      const decision = router.resolveFallback('unknown-model');
      expect(decision.tier).toBe('medium');
      expect(decision.reason).toContain('unknown');
    });
  });

  describe('fromEnv', () => {
    it('returns full catalog when ELISA_MODELS not set', () => {
      const models = ModelRouter.fromEnv();
      expect(models.length).toBe(MODEL_CATALOG.length);
    });

    it('filters catalog based on ELISA_MODELS env var', () => {
      process.env.ELISA_MODELS = 'claude-opus-4-6,claude-sonnet-4-6';
      const models = ModelRouter.fromEnv();
      expect(models.length).toBe(2);
      expect(models.map(m => m.id)).toEqual(['claude-opus-4-6', 'claude-sonnet-4-6']);
    });

    it('ignores unknown model IDs in ELISA_MODELS', () => {
      process.env.ELISA_MODELS = 'claude-opus-4-6,fake-model';
      const models = ModelRouter.fromEnv();
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('claude-opus-4-6');
    });

    it('returns full catalog if ELISA_MODELS yields no valid models', () => {
      process.env.ELISA_MODELS = 'fake-a,fake-b';
      const models = ModelRouter.fromEnv();
      expect(models.length).toBe(MODEL_CATALOG.length);
    });

    it('handles whitespace and empty entries', () => {
      process.env.ELISA_MODELS = ' claude-opus-4-6 , , claude-sonnet-4-6 ';
      const models = ModelRouter.fromEnv();
      expect(models.length).toBe(2);
    });
  });

  describe('fallback when tier missing from available models', () => {
    it('falls back to higher tier if requested tier unavailable', () => {
      // Only provide high and low tier models
      const limited: ModelDefinition[] = [
        { id: 'claude-opus-4-6', tier: 'high', inputCostPer1M: 15, outputCostPer1M: 75 },
        { id: 'claude-haiku-4-5-20241022', tier: 'low', inputCostPer1M: 0.8, outputCostPer1M: 4 },
      ];
      const limitedRouter = new ModelRouter(limited);
      // Tester wants medium, but no medium available -> falls back to high
      const decision = limitedRouter.resolve({ role: 'tester' });
      expect(decision.tier).toBe('medium');
      expect(decision.model).toBe('claude-opus-4-6');
    });
  });
});

describe('computeComplexity', () => {
  it('returns 0 for minimal task and spec', () => {
    const score = computeComplexity({}, {});
    expect(score).toBe(0);
  });

  it('scores higher for long descriptions', () => {
    const short = computeComplexity({ description: 'Fix bug' }, {});
    const long = computeComplexity({ description: 'x'.repeat(600) }, {});
    expect(long).toBeGreaterThan(short);
  });

  it('scores higher for many dependencies', () => {
    const none = computeComplexity({ dependencies: [] }, {});
    const many = computeComplexity({ dependencies: ['a', 'b', 'c'] }, {});
    expect(many).toBeGreaterThan(none);
  });

  it('scores higher for many acceptance criteria', () => {
    const few = computeComplexity({ acceptance_criteria: ['a'] }, {});
    const many = computeComplexity({ acceptance_criteria: ['a', 'b', 'c', 'd'] }, {});
    expect(many).toBeGreaterThan(few);
  });

  it('scores higher with portals', () => {
    const without = computeComplexity({}, {});
    const withPortals = computeComplexity({}, { portals: [{ id: 'p1' }] });
    expect(withPortals).toBeGreaterThan(without);
  });

  it('scores higher with hardware target', () => {
    const without = computeComplexity({}, {});
    const withHw = computeComplexity({}, { deployment: { target: 'esp32' } });
    expect(withHw).toBeGreaterThan(without);
  });

  it('caps at 1.0', () => {
    const maxed = computeComplexity(
      {
        description: 'x'.repeat(1000),
        dependencies: ['a', 'b', 'c', 'd'],
        acceptance_criteria: ['1', '2', '3', '4', '5'],
      },
      { portals: [{ id: 'p1' }], deployment: { target: 'esp32' } },
    );
    expect(maxed).toBeLessThanOrEqual(1);
  });
});

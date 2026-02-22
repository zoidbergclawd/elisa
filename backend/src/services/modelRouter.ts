/** Rule-based model routing: maps agent roles to model tiers with overrides. */

import {
  DEFAULT_MODEL,
} from '../utils/constants.js';

// -- Types --

export type ModelTier = 'low' | 'medium' | 'high';

export interface ModelDefinition {
  id: string;
  tier: ModelTier;
  /** Approximate cost per 1M input tokens (USD). */
  inputCostPer1M: number;
  /** Approximate cost per 1M output tokens (USD). */
  outputCostPer1M: number;
}

export interface RoutingContext {
  role: string;
  taskComplexity?: number;
  budgetRemaining?: number;
  budgetTotal?: number;
  userOverride?: string;
  retryCount?: number;
}

export interface RoutingDecision {
  model: string;
  tier: ModelTier;
  reason: string;
}

export interface ModelRoutingConfig {
  budget_mode?: boolean;
  role_overrides?: Record<string, string>;
}

// -- Catalog --

export const MODEL_CATALOG: ModelDefinition[] = [
  { id: 'claude-opus-4-6', tier: 'high', inputCostPer1M: 15, outputCostPer1M: 75 },
  { id: 'claude-sonnet-4-6', tier: 'medium', inputCostPer1M: 3, outputCostPer1M: 15 },
  { id: 'claude-haiku-4-5-20241022', tier: 'low', inputCostPer1M: 0.8, outputCostPer1M: 4 },
  { id: 'claude-haiku-4-20250414', tier: 'low', inputCostPer1M: 0.8, outputCostPer1M: 4 },
];

// -- Default tier map --

export const DEFAULT_TIER_MAP: Record<string, ModelTier> = {
  metaplanner: 'high',
  builder: 'high',
  tester: 'medium',
  reviewer: 'medium',
  custom: 'high',
  narrator: 'low',
  teaching: 'low',
};

const TIER_ORDER: ModelTier[] = ['low', 'medium', 'high'];

function tierRank(tier: ModelTier): number {
  return TIER_ORDER.indexOf(tier);
}

function promoteTier(tier: ModelTier): ModelTier {
  const rank = tierRank(tier);
  return rank < TIER_ORDER.length - 1 ? TIER_ORDER[rank + 1] : tier;
}

function demoteTier(tier: ModelTier): ModelTier {
  const rank = tierRank(tier);
  return rank > 0 ? TIER_ORDER[rank - 1] : tier;
}

// -- Complexity heuristic --

/**
 * Compute a 0-1 complexity score for a task based on heuristics.
 * Higher scores indicate more complex tasks.
 */
export function computeComplexity(
  task: Record<string, any>,
  spec: Record<string, any>,
): number {
  let score = 0;

  // Description length (longer = more complex)
  const descLen = (task.description ?? '').length;
  if (descLen > 500) score += 0.2;
  else if (descLen > 200) score += 0.1;

  // Dependency count
  const deps = task.dependencies ?? [];
  if (deps.length >= 3) score += 0.2;
  else if (deps.length >= 1) score += 0.1;

  // Acceptance criteria count
  const criteria = task.acceptance_criteria ?? [];
  if (criteria.length >= 4) score += 0.2;
  else if (criteria.length >= 2) score += 0.1;

  // Portal usage in spec (indicates hardware/integration complexity)
  const portals = spec.portals ?? [];
  if (portals.length > 0) score += 0.15;

  // Hardware target
  const target = spec.deployment?.target ?? '';
  if (target === 'esp32' || target === 'both') score += 0.15;

  return Math.min(1, score);
}

// -- Router --

export class ModelRouter {
  private models: Map<string, ModelDefinition>;
  private modelsByTier: Map<ModelTier, ModelDefinition>;
  private config: ModelRoutingConfig;

  constructor(availableModels: ModelDefinition[], config?: ModelRoutingConfig) {
    this.models = new Map(availableModels.map(m => [m.id, m]));
    this.config = config ?? {};

    // Pick cheapest model per tier from available models
    this.modelsByTier = new Map();
    for (const tier of TIER_ORDER) {
      const candidates = availableModels
        .filter(m => m.tier === tier)
        .sort((a, b) => a.inputCostPer1M - b.inputCostPer1M);
      if (candidates.length > 0) {
        this.modelsByTier.set(tier, candidates[0]);
      }
    }
  }

  /**
   * Resolve the model for a given routing context.
   *
   * Precedence (highest to lowest):
   * 1. CLAUDE_MODEL env var (global override)
   * 2. role_overrides in config
   * 3. Retry promotion (medium -> high on retryCount >= 1)
   * 4. Budget-aware demotion (when budget < 20% remaining)
   * 5. Complexity-based promotion (medium -> high when complexity >= 0.5)
   * 6. Default tier mapping
   */
  resolve(ctx: RoutingContext): RoutingDecision {
    // 1. Global env override
    const envModel = process.env.CLAUDE_MODEL;
    if (envModel) {
      const def = this.models.get(envModel);
      return {
        model: envModel,
        tier: def?.tier ?? 'high',
        reason: 'CLAUDE_MODEL env override',
      };
    }

    // 2. User role overrides from NuggetSpec
    const roleOverride = this.config.role_overrides?.[ctx.role];
    if (roleOverride) {
      const def = this.models.get(roleOverride);
      return {
        model: roleOverride,
        tier: def?.tier ?? 'high',
        reason: `role_override for ${ctx.role}`,
      };
    }

    // 6. Start from default tier
    let tier: ModelTier = DEFAULT_TIER_MAP[ctx.role] ?? 'high';
    let reason = `default tier for ${ctx.role}`;

    // 5. Complexity-based promotion (only promotes medium -> high)
    if (tier === 'medium' && (ctx.taskComplexity ?? 0) >= 0.5) {
      tier = promoteTier(tier);
      reason = 'complexity promotion';
    }

    // 4. Budget-aware demotion
    if (this.config.budget_mode && ctx.role !== 'metaplanner') {
      tier = demoteTier(tier);
      reason = 'budget mode demotion';
    } else if (
      ctx.budgetTotal &&
      ctx.budgetRemaining !== undefined &&
      ctx.budgetTotal > 0
    ) {
      const pctRemaining = ctx.budgetRemaining / ctx.budgetTotal;
      if (pctRemaining < 0.2 && ctx.role !== 'metaplanner') {
        tier = demoteTier(tier);
        reason = 'budget low (<20%) demotion';
      }
    }

    // 3. Retry promotion (overrides budget demotion for quality)
    if ((ctx.retryCount ?? 0) >= 1 && tier !== 'high') {
      tier = promoteTier(tier);
      reason = 'retry promotion';
    }

    const model = this.getModelForTier(tier);
    return { model: model.id, tier, reason };
  }

  /**
   * Resolve a fallback model by demoting one tier.
   * Used for rate-limit retries to try a cheaper model.
   */
  resolveFallback(currentModel: string): RoutingDecision {
    const def = this.models.get(currentModel);
    if (!def) {
      // Unknown model, return default
      const fallback = this.getModelForTier('medium');
      return { model: fallback.id, tier: 'medium', reason: 'fallback from unknown model' };
    }

    const demoted = demoteTier(def.tier);
    if (demoted === def.tier) {
      // Already at lowest tier, return as-is
      return { model: currentModel, tier: def.tier, reason: 'already at lowest tier' };
    }

    const fallback = this.getModelForTier(demoted);
    return { model: fallback.id, tier: demoted, reason: `rate-limit fallback from ${def.tier} to ${demoted}` };
  }

  /** Parse ELISA_MODELS env var or return full catalog. */
  static fromEnv(): ModelDefinition[] {
    const envModels = process.env.ELISA_MODELS;
    if (!envModels) return [...MODEL_CATALOG];

    const ids = envModels.split(',').map(s => s.trim()).filter(Boolean);
    const catalogMap = new Map(MODEL_CATALOG.map(m => [m.id, m]));

    const result: ModelDefinition[] = [];
    for (const id of ids) {
      const def = catalogMap.get(id);
      if (def) {
        result.push({ ...def });
      }
    }

    // Must have at least one model; fall back to full catalog if parsing yields nothing
    return result.length > 0 ? result : [...MODEL_CATALOG];
  }

  private getModelForTier(tier: ModelTier): ModelDefinition {
    const model = this.modelsByTier.get(tier);
    if (model) return model;

    // Fall back: try higher tiers, then lower tiers
    for (let i = tierRank(tier) + 1; i < TIER_ORDER.length; i++) {
      const m = this.modelsByTier.get(TIER_ORDER[i]);
      if (m) return m;
    }
    for (let i = tierRank(tier) - 1; i >= 0; i--) {
      const m = this.modelsByTier.get(TIER_ORDER[i]);
      if (m) return m;
    }

    // Absolute fallback
    return { id: DEFAULT_MODEL, tier: 'high', inputCostPer1M: 15, outputCostPer1M: 75 };
  }
}

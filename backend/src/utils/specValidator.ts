/** Zod schema for NuggetSpec validation. Caps string lengths and array sizes. */

import { z } from 'zod';

const CapabilitySchema = z.object({
  id: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  kind: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
}).strict();

const InteractionSchema = z.object({
  type: z.string().max(100).optional(),
  capabilityId: z.string().max(200).optional(),
  params: z.record(z.string().max(200), z.union([z.string().max(2000), z.number(), z.boolean()])).optional(),
}).strict();

/** Shell metacharacters forbidden in portal args. */
const SHELL_META_RE = /[;&|`$(){}[\]<>!\n\r\\'"]/;
const noShellMeta = z.string().max(500).refine(
  (s) => !SHELL_META_RE.test(s),
  { message: 'Arg contains forbidden shell metacharacters' },
);

const McpConfigSchema = z.object({
  command: z.string().max(200),
  args: z.array(noShellMeta).max(50).optional(),
  env: z.record(z.string().max(200), z.string().max(1000)).optional(),
}).strict();

const CliConfigSchema = z.object({
  command: z.string().max(200),
  args: z.array(noShellMeta).max(50).optional(),
}).strict();

const PortalSchema = z.object({
  id: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  mechanism: z.string().max(50).optional(),
  capabilities: z.array(CapabilitySchema).max(50).optional(),
  interactions: z.array(InteractionSchema).max(50).optional(),
  mcpConfig: McpConfigSchema.optional(),
  cliConfig: CliConfigSchema.optional(),
}).strict();

const SkillSchema = z.object({
  id: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  category: z.string().max(50).optional(),
  prompt: z.string().max(5000).optional(),
  description: z.string().max(2000).optional(),
}).strict();

const RuleSchema = z.object({
  id: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  trigger: z.string().max(100).optional(),
  prompt: z.string().max(5000).optional(),
}).strict();

const BehavioralTestSchema = z.object({
  id: z.string().max(200).optional(),
  when: z.string().max(500),
  then: z.string().max(500),
  requirement_id: z.string().max(200).optional(),
}).strict();

const RequirementSchema = z.object({
  type: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  test_id: z.string().max(200).optional(),
}).strict();

const AgentSchema = z.object({
  name: z.string().max(200).optional(),
  role: z.string().max(50).optional(),
  persona: z.string().max(500).optional(),
  allowed_paths: z.array(z.string().max(200)).max(50).optional(),
  restricted_paths: z.array(z.string().max(200)).max(50).optional(),
}).strict();

// --- Device plugin instance schema ---

export const DeviceInstanceSchema = z.object({
  pluginId: z.string().max(60),
  instanceId: z.string().max(100),
  fields: z.record(z.string(), z.unknown()),
});

// --- Systems Thinking: Feedback loop schema ---

const FeedbackLoopSchema = z.object({
  id: z.string().max(200),
  trigger: z.enum(['test_failure', 'review_rejection', 'custom']),
  exit_condition: z.string().max(500),
  max_iterations: z.number().int().min(1).max(10),
  connects_from: z.string().max(200),
  connects_to: z.string().max(200),
}).strict();

// --- PRD-001: Agent runtime configuration ---

const RuntimeConfigSchema = z.object({
  agent_name: z.string().max(100).optional(),
  greeting: z.string().max(500).optional(),
  fallback_response: z.string().max(500).optional(),
  voice: z.string().max(50).optional(),
  display_theme: z.string().max(50).optional(),
}).strict();

// --- PRD-001: Knowledge backpack source ---

const BackpackSourceSchema = z.object({
  id: z.string().max(100),
  type: z.enum(['pdf', 'url', 'youtube', 'drive', 'topic_pack', 'sports_feed', 'news_feed', 'custom_feed']),
  title: z.string().max(200),
  uri: z.string().max(2000).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
}).strict();

// --- PRD-001: Study mode configuration ---

const StudyModeSchema = z.object({
  enabled: z.boolean(),
  style: z.enum(['explain', 'quiz_me', 'flashcards', 'socratic']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  quiz_frequency: z.number().int().min(1).max(20),
}).strict();

// --- PRD-001: Knowledge configuration ---

const KnowledgeConfigSchema = z.object({
  backpack_sources: z.array(BackpackSourceSchema).max(50).optional(),
  study_mode: StudyModeSchema.optional(),
}).strict();

// --- Spec Graph: Composition schema ---

const InterfaceProvideSchema = z.object({
  name: z.string().max(200),
  type: z.string().max(100),
  description: z.string().max(500).optional(),
}).strict();

const InterfaceRequireSchema = z.object({
  name: z.string().max(200),
  type: z.string().max(100),
  from_node_id: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
}).strict();

const CompositionSchema = z.object({
  parent_graph_id: z.string().max(100).optional(),
  node_id: z.string().max(100).optional(),
  provides: z.array(InterfaceProvideSchema).max(20).optional(),
  requires: z.array(InterfaceRequireSchema).max(20).optional(),
}).strict();

export const NuggetSpecSchema = z.object({
  nugget: z.object({
    goal: z.string().max(2000).optional(),
    type: z.string().max(100).optional(),
    description: z.string().max(2000).optional(),
  }).strict().optional(),
  style: z.object({
    visual: z.string().max(500).nullable().optional(),
    personality: z.string().max(500).nullable().optional(),
    // Legacy fields
    colors: z.string().max(500).optional(),
    theme: z.string().max(500).optional(),
    tone: z.string().max(500).optional(),
  }).strict().nullable().optional(),
  requirements: z.array(RequirementSchema).max(50).optional(),
  agents: z.array(AgentSchema).max(20).optional(),
  deployment: z.object({
    target: z.string().max(100).optional(),
    auto_flash: z.boolean().optional(),
    runtime_url: z.string().max(500).optional(),
    provision_runtime: z.boolean().optional(),
  }).strict().optional(),
  workflow: z.object({
    review_enabled: z.boolean().optional(),
    testing_enabled: z.boolean().optional(),
    human_gates: z.array(z.string().max(200)).max(10).optional(),
    flow_hints: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    iteration_conditions: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
    behavioral_tests: z.array(BehavioralTestSchema).max(20).optional(),
    feedback_loops: z.array(FeedbackLoopSchema).max(10).optional(),
    system_level: z.enum(['explorer', 'builder', 'architect']).optional(),
  }).strict().optional(),
  skills: z.array(SkillSchema).max(50).optional(),
  rules: z.array(RuleSchema).max(50).optional(),
  portals: z.array(PortalSchema).max(20).optional(),
  devices: z.array(DeviceInstanceSchema).max(20).optional(),
  permissions: z.object({
    auto_approve_workspace_writes: z.boolean().optional(),
    auto_approve_safe_commands: z.boolean().optional(),
    allow_network: z.boolean().optional(),
    escalation_threshold: z.number().int().min(1).max(10).optional(),
  }).strict().optional(),
  runtime: RuntimeConfigSchema.optional(),
  knowledge: KnowledgeConfigSchema.optional(),
  composition: CompositionSchema.optional(),
}).strict();

/** Inferred TypeScript type from the NuggetSpec Zod schema. */
export type NuggetSpec = z.infer<typeof NuggetSpecSchema>;

/** A field whose string value exceeds a Zod `.max()` cap. */
export interface TruncationWarning {
  path: string;
  maxLength: number;
  actualLength: number;
}

/** Known string length caps from the NuggetSpec schema. Paths use dot notation. */
const STRING_CAPS: Record<string, number> = {
  'nugget.goal': 2000,
  'nugget.type': 100,
  'nugget.description': 2000,
  'style.visual': 500,
  'style.personality': 500,
  'style.colors': 500,
  'style.theme': 500,
  'style.tone': 500,
  'deployment.target': 100,
  'deployment.runtime_url': 500,
  'runtime.agent_name': 100,
  'runtime.greeting': 500,
  'runtime.fallback_response': 500,
  'runtime.voice': 50,
  'runtime.display_theme': 50,
};

/** Array-item string caps. The key is the array path; values are field->max pairs. */
const ARRAY_ITEM_CAPS: Record<string, Record<string, number>> = {
  skills: { id: 200, name: 200, category: 50, prompt: 5000, description: 2000 },
  rules: { id: 200, name: 200, trigger: 100, prompt: 5000 },
  requirements: { type: 100, description: 2000, test_id: 200 },
  agents: { name: 200, role: 50, persona: 500 },
  portals: { id: 200, name: 200, description: 2000, mechanism: 50 },
};

/**
 * Detect fields in the raw NuggetSpec input that exceed Zod schema `.max()` caps.
 * Returns an array of warnings for fields that would fail validation due to length.
 */
export function detectTruncations(rawSpec: unknown): TruncationWarning[] {
  if (!rawSpec || typeof rawSpec !== 'object') return [];
  const spec = rawSpec as Record<string, unknown>;
  const warnings: TruncationWarning[] = [];

  // Check top-level nested object fields
  for (const [path, maxLen] of Object.entries(STRING_CAPS)) {
    const parts = path.split('.');
    let val: unknown = spec;
    for (const part of parts) {
      if (val && typeof val === 'object') {
        val = (val as Record<string, unknown>)[part];
      } else {
        val = undefined;
        break;
      }
    }
    if (typeof val === 'string' && val.length > maxLen) {
      warnings.push({ path, maxLength: maxLen, actualLength: val.length });
    }
  }

  // Check array item fields
  for (const [arrayPath, fieldCaps] of Object.entries(ARRAY_ITEM_CAPS)) {
    const arr = spec[arrayPath];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!item || typeof item !== 'object') continue;
      for (const [field, maxLen] of Object.entries(fieldCaps)) {
        const val = (item as Record<string, unknown>)[field];
        if (typeof val === 'string' && val.length > maxLen) {
          warnings.push({
            path: `${arrayPath}[${i}].${field}`,
            maxLength: maxLen,
            actualLength: val.length,
          });
        }
      }
    }
  }

  return warnings;
}

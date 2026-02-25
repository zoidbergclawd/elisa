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

const SerialConfigSchema = z.object({
  port: z.string().max(200).optional(),
  baudRate: z.number().int().positive().optional(),
  boardType: z.string().max(100).optional(),
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
  serialConfig: SerialConfigSchema.optional(),
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
  when: z.string().max(500),
  then: z.string().max(500),
}).strict();

const RequirementSchema = z.object({
  type: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
}).strict();

const AgentSchema = z.object({
  name: z.string().max(200).optional(),
  role: z.string().max(50).optional(),
  persona: z.string().max(500).optional(),
  allowed_paths: z.array(z.string().max(200)).max(50).optional(),
  restricted_paths: z.array(z.string().max(200)).max(50).optional(),
}).strict();

// --- IoT Hardware schemas ---

const LoRaConfigSchema = z.object({
  channel: z.number().int().min(0).max(255),
  frequency: z.number().optional(),
});

const HardwareDeviceSchema = z.object({
  role: z.enum(['sensor_node', 'gateway_node']),
  board: z.enum(['heltec_lora_v3']),
  sensors: z.array(z.enum(['dht22', 'reed_switch', 'pir'])).optional(),
  display: z.enum(['oled_ssd1306']).optional(),
  lora: LoRaConfigSchema,
});

const CloudConfigSchema = z.object({
  platform: z.enum(['cloud_run']),
  project: z.string().max(100).optional(),
  region: z.string().max(50).optional(),
});

const HardwareConfigSchema = z.object({
  devices: z.array(HardwareDeviceSchema).min(1).max(10),
  cloud: CloudConfigSchema.optional(),
});

const DocumentationConfigSchema = z.object({
  generate: z.boolean(),
  focus: z.enum(['how_it_works', 'setup', 'parts', 'all']),
});

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
  }).strict().optional(),
  workflow: z.object({
    review_enabled: z.boolean().optional(),
    testing_enabled: z.boolean().optional(),
    human_gates: z.array(z.string().max(200)).max(10).optional(),
    flow_hints: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    iteration_conditions: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
    behavioral_tests: z.array(BehavioralTestSchema).max(20).optional(),
  }).strict().optional(),
  skills: z.array(SkillSchema).max(50).optional(),
  rules: z.array(RuleSchema).max(50).optional(),
  portals: z.array(PortalSchema).max(20).optional(),
  hardware: HardwareConfigSchema.optional(),
  documentation: DocumentationConfigSchema.optional(),
  permissions: z.object({
    auto_approve_workspace_writes: z.boolean().optional(),
    auto_approve_safe_commands: z.boolean().optional(),
    allow_network: z.boolean().optional(),
    escalation_threshold: z.number().int().min(1).max(10).optional(),
  }).strict().optional(),
}).strict();

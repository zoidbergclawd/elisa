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

// --- OpenClaw config sub-schemas (Phase 3) ---

const OcAgentModelSchema = z.object({
  primary: z.string().max(200).optional(),
  fallbacks: z.array(z.string().max(200)).max(10).optional(),
}).strict().optional();

const OcAgentToolsSchema = z.object({
  profile: z.string().max(50).optional(),
  allow: z.array(z.string().max(200)).max(50).optional(),
  deny: z.array(z.string().max(200)).max(50).optional(),
  exec: z.object({
    security: z.string().max(50).optional(),
    safeBins: z.array(z.string().max(500)).max(50).optional(),
  }).strict().optional(),
  fs: z.object({
    workspaceOnly: z.boolean().optional(),
  }).strict().optional(),
  elevated: z.object({
    enabled: z.boolean().optional(),
    allowFrom: z.array(z.string().max(200)).max(50).optional(),
  }).strict().optional(),
}).strict().optional();

const OcAgentSandboxSchema = z.object({
  mode: z.string().max(50).optional(),
  scope: z.string().max(50).optional(),
  workspaceAccess: z.string().max(10).optional(),
}).strict().optional();

const OcAgentSchema = z.object({
  id: z.string().max(200).optional(),
  workspace: z.string().max(500).optional(),
  personality: z.string().max(5000).optional(),
  model: OcAgentModelSchema,
  tools: OcAgentToolsSchema,
  sandbox: OcAgentSandboxSchema,
}).strict();

const OcChannelGroupSchema = z.object({
  requireMention: z.boolean().optional(),
  mentionPatterns: z.array(z.string().max(200)).max(50).optional(),
}).strict();

const OcChannelSchema = z.object({
  enabled: z.boolean().optional(),
  botToken: z.string().max(500).optional(),
  dmPolicy: z.string().max(50).optional(),
  allowFrom: z.array(z.string().max(200)).max(100).optional(),
  groups: z.record(z.string().max(200), OcChannelGroupSchema).optional(),
}).strict();

const OcBindingSchema = z.object({
  agentId: z.string().max(200),
  match: z.object({
    channel: z.string().max(50).optional(),
    peer: z.string().max(200).optional(),
    guild: z.string().max(200).optional(),
    accountId: z.string().max(200).optional(),
  }).strict(),
}).strict();

const OcSecuritySchema = z.object({
  gateway: z.object({
    bind: z.string().max(50).optional(),
    auth: z.object({ mode: z.string().max(50).optional(), token: z.string().max(500).optional() }).strict().optional(),
  }).strict().optional(),
  session: z.object({
    dmScope: z.string().max(50).optional(),
  }).strict().optional(),
  browser: z.object({
    ssrfPolicy: z.object({
      dangerouslyAllowPrivateNetwork: z.boolean().optional(),
      hostnameAllowlist: z.array(z.string().max(200)).max(100).optional(),
    }).strict().optional(),
  }).strict().optional(),
}).strict().optional();

const OcCronJobSchema = z.object({
  schedule: z.string().max(100),
  skill: z.string().max(200),
  agentId: z.string().max(200),
  sessionKey: z.string().max(200).optional(),
}).strict();

const OcCronSchema = z.object({
  enabled: z.boolean().optional(),
  jobs: z.array(OcCronJobSchema).max(50).optional(),
}).strict().optional();

const OcHookMappingSchema = z.object({
  match: z.object({ path: z.string().max(200) }).strict(),
  action: z.string().max(50),
  agentId: z.string().max(200),
  deliver: z.boolean().optional(),
}).strict();

const OcHooksSchema = z.object({
  enabled: z.boolean().optional(),
  token: z.string().max(500).optional(),
  path: z.string().max(200).optional(),
  mappings: z.array(OcHookMappingSchema).max(50).optional(),
}).strict().optional();

const OcSkillSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(2000),
  userInvocable: z.boolean().optional(),
  disableModelInvocation: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  body: z.string().max(10000).optional(),
}).strict();

const OpenClawConfigSchema = z.object({
  agents: z.array(OcAgentSchema).max(20).optional(),
  channels: z.record(z.string().max(50), OcChannelSchema).optional(),
  bindings: z.array(OcBindingSchema).max(50).optional(),
  security: OcSecuritySchema,
  cron: OcCronSchema,
  hooks: OcHooksSchema,
  skills: z.array(OcSkillSchema).max(50).optional(),
}).strict().optional();

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
  }).strict().optional(),
  skills: z.array(SkillSchema).max(50).optional(),
  rules: z.array(RuleSchema).max(50).optional(),
  portals: z.array(PortalSchema).max(20).optional(),
  openclawConfig: OpenClawConfigSchema,
  permissions: z.object({
    auto_approve_workspace_writes: z.boolean().optional(),
    auto_approve_safe_commands: z.boolean().optional(),
    allow_network: z.boolean().optional(),
    escalation_threshold: z.number().int().min(1).max(10).optional(),
  }).strict().optional(),
}).strict();

/** OpenClaw block definitions for Elisa's Blockly editor.
 *
 * All blocks use the oc_ prefix. Six categories:
 * Agents, Channels & Routing, Security, Automations, Skills, Deploy & Validate
 */

export const OC_HUE = 20;

/* eslint-disable @typescript-eslint/no-explicit-any */
export const OPENCLAW_BLOCK_DEFS: any[] = [
  // ===== AGENTS =====
  {
    type: 'oc_create_agent',
    message0: 'Create Agent %1 described as %2',
    args0: [
      { type: 'field_input', name: 'AGENT_ID', text: 'my-agent' },
      { type: 'field_input', name: 'PERSONALITY', text: 'A helpful assistant' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Create a new OpenClaw agent with a personality',
    helpUrl: 'https://docs.openclaw.ai/concepts/agent-runtime',
  },
  {
    type: 'oc_agent_model',
    message0: 'Agent %1 uses model %2 with fallback %3',
    args0: [
      { type: 'field_input', name: 'AGENT_ID', text: 'my-agent' },
      { type: 'field_input', name: 'PRIMARY_MODEL', text: 'anthropic/claude-opus-4-6' },
      { type: 'field_input', name: 'FALLBACK_MODEL', text: 'anthropic/claude-sonnet-4-5' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Set which AI model an agent uses',
    helpUrl: 'https://docs.openclaw.ai/concepts/model-failover',
  },
  {
    type: 'oc_agent_tools',
    message0: 'Agent %1 gets %2 access, also allow %3 deny %4',
    args0: [
      { type: 'field_input', name: 'AGENT_ID', text: 'my-agent' },
      { type: 'field_dropdown', name: 'PROFILE', options: [['Messaging', 'messaging'], ['Full', 'full'], ['Minimal', 'minimal']] },
      { type: 'field_input', name: 'ALLOW_TOOLS', text: '' },
      { type: 'field_input', name: 'DENY_TOOLS', text: '' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Set agent tool access profile and overrides (comma-separated)',
    helpUrl: 'https://docs.openclaw.ai/gateway/security',
  },
  {
    type: 'oc_agent_sandbox',
    message0: 'Agent %1 sandboxed %2 with workspace access %3',
    args0: [
      { type: 'field_input', name: 'AGENT_ID', text: 'my-agent' },
      { type: 'field_dropdown', name: 'MODE', options: [['Off', 'off'], ['All', 'all'], ['Tool', 'tool']] },
      { type: 'field_dropdown', name: 'WORKSPACE_ACCESS', options: [['Read/Write', 'rw'], ['Read Only', 'ro'], ['None', 'none']] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Set agent sandbox isolation mode',
    helpUrl: 'https://docs.openclaw.ai/gateway/sandboxing',
  },
  // ===== CHANNELS & ROUTING =====
  {
    type: 'oc_connect_channel',
    message0: 'Connect %1',
    args0: [{ type: 'field_dropdown', name: 'CHANNEL_TYPE', options: [['Telegram', 'telegram'], ['WhatsApp', 'whatsapp'], ['Discord', 'discord'], ['Slack', 'slack'], ['iMessage', 'imessage'], ['Signal', 'signal'], ['Matrix', 'matrix'], ['IRC', 'irc']] }],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Connect a messaging channel to OpenClaw',
    helpUrl: 'https://docs.openclaw.ai/channels',
  },
  {
    type: 'oc_dm_policy',
    message0: '%1 DM policy: %2 allowing %3',
    args0: [
      { type: 'field_dropdown', name: 'CHANNEL', options: [['Telegram', 'telegram'], ['WhatsApp', 'whatsapp'], ['Discord', 'discord'], ['Slack', 'slack'], ['iMessage', 'imessage'], ['Signal', 'signal']] },
      { type: 'field_dropdown', name: 'POLICY', options: [['Pairing', 'pairing'], ['Allowlist', 'allowlist'], ['Open', 'open'], ['Disabled', 'disabled']] },
      { type: 'field_input', name: 'ALLOW_FROM', text: '' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Set DM policy for a channel (comma-separated sender IDs for allowlist)',
    helpUrl: 'https://docs.openclaw.ai/channels/pairing',
  },
  {
    type: 'oc_group_mentions',
    message0: '%1 groups require mention matching %2',
    args0: [
      { type: 'field_dropdown', name: 'CHANNEL', options: [['Discord', 'discord'], ['Telegram', 'telegram'], ['Slack', 'slack'], ['WhatsApp', 'whatsapp']] },
      { type: 'field_input', name: 'PATTERNS', text: '@bot, hey bot' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Require @mention in group chats (comma-separated patterns)',
    helpUrl: 'https://docs.openclaw.ai/channels/groups',
  },
  {
    type: 'oc_route_to_agent',
    message0: 'Route %1 %2 %3 to agent %4',
    args0: [
      { type: 'field_dropdown', name: 'CHANNEL', options: [['Telegram', 'telegram'], ['WhatsApp', 'whatsapp'], ['Discord', 'discord'], ['Slack', 'slack'], ['iMessage', 'imessage'], ['Signal', 'signal']] },
      { type: 'field_dropdown', name: 'MATCH_TYPE', options: [['All', 'all'], ['Sender', 'peer'], ['Guild/Group', 'guild']] },
      { type: 'field_input', name: 'MATCH_VALUE', text: '' },
      { type: 'field_input', name: 'AGENT_ID', text: 'main' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Route messages from a channel to a specific agent',
    helpUrl: 'https://docs.openclaw.ai/concepts/multi-agent-routing',
  },
  {
    type: 'oc_session_isolation',
    message0: 'Session isolation: %1',
    args0: [{ type: 'field_dropdown', name: 'SCOPE', options: [['Per Channel+Peer', 'per-channel-peer'], ['Per Peer', 'per-peer'], ['Main (shared)', 'main'], ['Per Account+Channel+Peer', 'per-account-channel-peer']] }],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Set conversation session isolation mode',
    helpUrl: 'https://docs.openclaw.ai/concepts/session-management',
  },
  // ===== SECURITY =====
  {
    type: 'oc_exec_policy',
    message0: 'Agent %1 exec policy: %2',
    args0: [
      { type: 'field_input', name: 'AGENT_ID', text: 'my-agent' },
      { type: 'field_dropdown', name: 'POLICY', options: [['Deny', 'deny'], ['Ask', 'ask'], ['Sandbox', 'sandbox'], ['Always', 'always']] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Set command execution policy for an agent',
    helpUrl: 'https://docs.openclaw.ai/gateway/security',
  },
  {
    type: 'oc_allow_commands',
    message0: 'Agent %1 allow commands %2',
    args0: [
      { type: 'field_input', name: 'AGENT_ID', text: 'my-agent' },
      { type: 'field_input', name: 'COMMANDS', text: '/usr/bin/python3, /usr/bin/node' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Allowlist specific commands for an agent (comma-separated paths)',
    helpUrl: 'https://docs.openclaw.ai/gateway/security',
  },
  {
    type: 'oc_fs_restriction',
    message0: 'Agent %1 filesystem: workspace only %2',
    args0: [
      { type: 'field_input', name: 'AGENT_ID', text: 'my-agent' },
      { type: 'field_checkbox', name: 'WORKSPACE_ONLY', checked: true },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Restrict agent filesystem access to workspace directory only',
    helpUrl: 'https://docs.openclaw.ai/gateway/security',
  },
  {
    type: 'oc_elevated_access',
    message0: 'Agent %1 elevated access: %2 from senders %3',
    args0: [
      { type: 'field_input', name: 'AGENT_ID', text: 'my-agent' },
      { type: 'field_checkbox', name: 'ENABLED', checked: false },
      { type: 'field_input', name: 'ALLOW_FROM', text: '' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Enable elevated (host) access for specific senders (comma-separated)',
    helpUrl: 'https://docs.openclaw.ai/tools/elevated-mode',
  },
  {
    type: 'oc_browser_policy',
    message0: 'Browser: allow private network %1 allowed hosts %2',
    args0: [
      { type: 'field_checkbox', name: 'ALLOW_PRIVATE', checked: false },
      { type: 'field_input', name: 'HOSTS', text: '*.github.com' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Set browser SSRF policy and hostname allowlist (comma-separated)',
    helpUrl: 'https://docs.openclaw.ai/tools/browser',
  },
  {
    type: 'oc_security_preset',
    message0: 'Apply security preset: %1',
    args0: [{ type: 'field_dropdown', name: 'PRESET', options: [['Strict', 'strict'], ['Standard', 'standard'], ['Permissive', 'permissive']] }],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Apply a pre-built security configuration',
    helpUrl: 'https://docs.openclaw.ai/gateway/security',
  },
  // ===== AUTOMATIONS =====
  {
    type: 'oc_cron_schedule',
    message0: 'Every %1 run skill %2 as agent %3',
    args0: [
      { type: 'field_input', name: 'SCHEDULE', text: '0 9 * * *' },
      { type: 'field_input', name: 'SKILL', text: 'daily-summary' },
      { type: 'field_input', name: 'AGENT_ID', text: 'main' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Schedule a skill to run on a cron schedule',
    helpUrl: 'https://docs.openclaw.ai/automation/cron-jobs',
  },
  {
    type: 'oc_webhook',
    message0: 'When webhook %1 received, run skill %2 as agent %3',
    args0: [
      { type: 'field_input', name: 'WEBHOOK_PATH', text: 'github' },
      { type: 'field_input', name: 'SKILL', text: 'pr-review' },
      { type: 'field_input', name: 'AGENT_ID', text: 'dev-bot' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Trigger a skill when a webhook is received',
    helpUrl: 'https://docs.openclaw.ai/automation/webhooks',
  },
  {
    type: 'oc_message_trigger',
    message0: 'When message matches %1 on %2 run skill %3',
    args0: [
      { type: 'field_input', name: 'PATTERN', text: 'deploy *' },
      { type: 'field_dropdown', name: 'CHANNEL', options: [['Any', 'any'], ['Telegram', 'telegram'], ['WhatsApp', 'whatsapp'], ['Discord', 'discord'], ['Slack', 'slack']] },
      { type: 'field_input', name: 'SKILL', text: 'deploy-project' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Trigger a skill when a message matches a pattern',
    helpUrl: 'https://docs.openclaw.ai/tools/skills',
  },
  // ===== SKILLS =====
  {
    type: 'oc_create_skill',
    message0: 'Create Skill %1 that %2',
    args0: [
      { type: 'field_input', name: 'SKILL_NAME', text: 'my-skill' },
      { type: 'field_input', name: 'DESCRIPTION', text: 'does something useful' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Create a new OpenClaw skill (generated by Elisa agents)',
    helpUrl: 'https://docs.openclaw.ai/tools/skills',
  },
  {
    type: 'oc_skill_requirements',
    message0: 'Skill %1 requires binaries %2 and env vars %3',
    args0: [
      { type: 'field_input', name: 'SKILL_NAME', text: 'my-skill' },
      { type: 'field_input', name: 'BINS', text: '' },
      { type: 'field_input', name: 'ENV_VARS', text: '' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Set gating requirements for a skill (comma-separated)',
    helpUrl: 'https://docs.openclaw.ai/tools/skills',
  },
  {
    type: 'oc_skill_invocation',
    message0: 'Skill %1 invocable by %2',
    args0: [
      { type: 'field_input', name: 'SKILL_NAME', text: 'my-skill' },
      { type: 'field_dropdown', name: 'MODE', options: [['User and Model', 'both'], ['User only', 'user'], ['Model only', 'model']] },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Control who can invoke this skill',
    helpUrl: 'https://docs.openclaw.ai/tools/skills',
  },
  // ===== DEPLOY & VALIDATE =====
  {
    type: 'oc_deploy',
    message0: 'Deploy to OpenClaw',
    args0: [],
    previousStatement: null,
    colour: OC_HUE,
    tooltip: 'Deploy all configuration and skills to OpenClaw gateway',
    helpUrl: 'https://docs.openclaw.ai/cli/gateway',
  },
  {
    type: 'oc_validate_config',
    message0: 'Validate OpenClaw Config',
    args0: [],
    previousStatement: null,
    nextStatement: null,
    colour: OC_HUE,
    tooltip: 'Run openclaw doctor and security audit on generated configuration',
    helpUrl: 'https://docs.openclaw.ai/cli/doctor',
  },
  {
    type: 'oc_publish_clawhub',
    message0: 'Publish %1 to ClawHub',
    args0: [{ type: 'field_input', name: 'SKILL_NAME', text: 'my-skill' }],
    previousStatement: null,
    colour: OC_HUE,
    tooltip: 'Publish a skill to the ClawHub community registry',
    helpUrl: 'https://docs.openclaw.ai/tools/clawhub',
  },
];

export const OPENCLAW_BLOCK_TYPES: Set<string> = new Set(
  OPENCLAW_BLOCK_DEFS.map((d) => d.type as string),
);

export const OPENCLAW_TOOLBOX_CATEGORIES = [
  { kind: 'category', name: 'OC: Agents', colour: String(OC_HUE), contents: [{ kind: 'block', type: 'oc_create_agent' }, { kind: 'block', type: 'oc_agent_model' }, { kind: 'block', type: 'oc_agent_tools' }, { kind: 'block', type: 'oc_agent_sandbox' }] },
  { kind: 'category', name: 'OC: Channels', colour: String(OC_HUE), contents: [{ kind: 'block', type: 'oc_connect_channel' }, { kind: 'block', type: 'oc_dm_policy' }, { kind: 'block', type: 'oc_group_mentions' }, { kind: 'block', type: 'oc_route_to_agent' }, { kind: 'block', type: 'oc_session_isolation' }] },
  { kind: 'category', name: 'OC: Security', colour: String(OC_HUE), contents: [{ kind: 'block', type: 'oc_exec_policy' }, { kind: 'block', type: 'oc_allow_commands' }, { kind: 'block', type: 'oc_fs_restriction' }, { kind: 'block', type: 'oc_elevated_access' }, { kind: 'block', type: 'oc_browser_policy' }, { kind: 'block', type: 'oc_security_preset' }] },
  { kind: 'category', name: 'OC: Automations', colour: String(OC_HUE), contents: [{ kind: 'block', type: 'oc_cron_schedule' }, { kind: 'block', type: 'oc_webhook' }, { kind: 'block', type: 'oc_message_trigger' }] },
  { kind: 'category', name: 'OC: Skills', colour: String(OC_HUE), contents: [{ kind: 'block', type: 'oc_create_skill' }, { kind: 'block', type: 'oc_skill_requirements' }, { kind: 'block', type: 'oc_skill_invocation' }] },
  { kind: 'category', name: 'OC: Deploy', colour: String(OC_HUE), contents: [{ kind: 'block', type: 'oc_deploy' }, { kind: 'block', type: 'oc_validate_config' }, { kind: 'block', type: 'oc_publish_clawhub' }] },
];

let registered = false;

/** Register all OpenClaw blocks with Blockly. Idempotent. */
export async function registerOpenClawBlocks(): Promise<void> {
  if (registered) return;
  const Blockly = await import('blockly');
  Blockly.common.defineBlocks(
    Blockly.common.createBlockDefinitionsFromJsonArray(OPENCLAW_BLOCK_DEFS),
  );
  registered = true;
}

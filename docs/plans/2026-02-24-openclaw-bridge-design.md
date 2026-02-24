# OpenClaw Bridge — Design Document

**Date**: 2026-02-24
**Status**: Draft

## Vision

Elisa is the IDE for OpenClaw. OpenClaw is a self-hosted gateway that connects messaging apps (WhatsApp, Telegram, Discord, iMessage, 30+ channels) to AI coding agents. It's powerful but complex — configuring agents, routing, security, and skills requires editing nested JSON and hand-writing markdown files.

Elisa makes all of it visual, tested, and deployable from blocks. The relationship is **Xcode : iOS** — Elisa is the development environment, OpenClaw is the runtime. Elisa stands on its own for general software building, but has first-class OpenClaw support as an optional module.

### The Bridge Has Two Directions

**OpenClaw -> Elisa**: OpenClaw bots invoke Elisa as a headless build engine via CLI. "Build me X" from WhatsApp triggers a full multi-agent software build.

**Elisa -> OpenClaw**: Elisa designs, builds, tests, and deploys everything that runs inside OpenClaw — agents, skills, routing, security, automations, and full gateway setups.

### Composable Nuggets

Elisa projects (nuggets) are sharable building blocks. They contain intent (block specs), not just code. Agents discover and compose nuggets at build time, weaving multiple specs into unified codebases. Nuggets compose at the intent level — no dependency conflicts, no version pinning, always regenerated fresh.

## Architecture

```
USER'S MACHINE

  Elisa IDE (Electron)                    OpenClaw Gateway
  ┌─────────────────────┐                ┌──────────────────┐
  │ Block Editor         │                │ Agents           │
  │   OpenClaw blocks ───┼── compiles ──► │ Skills           │
  │   General blocks     │   & deploys    │ Routing          │
  │                      │                │ Security         │
  │ Mission Control      │                │ Channels         │
  │ Portals Modal        │                │ Cron/Hooks       │
  └──────────┬───────────┘                └────────┬─────────┘
             │ REST/WS                              │
             ▼                                      │
  ┌─────────────────────┐                          │
  │ Elisa Backend        │◄── openclaw CLI ────────┘
  │ (Express server)     │     (delegation during builds)
  │                      │
  │ orchestrator         │
  │ agent teams          │──── elisa CLI ──────────►
  │ test runner          │     (OpenClaw invokes Elisa
  │ deploy phase         │      for software builds)
  └─────────────────────┘

  elisa CLI (standalone, no Electron)
  ┌─────────────────────┐
  │ elisa build "desc"   │
  │ elisa skill "desc"   │
  │ elisa openclaw setup │
  └─────────────────────┘
```

### Optional Module

The OpenClaw integration ships as an optional module:

- **Block definitions**: OpenClaw block category registered only when the module is active
- **Portal adapter**: `OpenClawPortalAdapter` loaded conditionally
- **CLI commands**: `elisa skill`, `elisa openclaw` available only with the module
- **Activation**: User enables via Elisa settings or by adding an OpenClaw portal in the Portals modal. Auto-detected if `openclaw` is on PATH.
- **Zero overhead**: Non-OpenClaw users never see OpenClaw blocks, commands, or configuration

Core Elisa (`elisa build`, general blocks, the orchestration engine) works without OpenClaw installed.

## Component 1: Elisa CLI

A command-line interface that exposes Elisa's backend as a headless build tool. OpenClaw (or anything) can invoke it.

### Commands

| Command | Purpose |
|---------|---------|
| `elisa build "description"` | Natural language -> NuggetSpec -> full build pipeline |
| `elisa build --spec nugget.json` | Build from existing NuggetSpec file |
| `elisa skill "description"` | Generate, validate, and deploy an OpenClaw skill |
| `elisa openclaw setup` | Full zero-to-running OpenClaw installation and configuration |
| `elisa status <session-id>` | Check build progress |
| `elisa stop <session-id>` | Cancel a running build |
| `elisa publish` | Export nugget to registry |

### Flags

| Flag | Purpose |
|------|---------|
| `--output <dir>` | Workspace directory for generated code |
| `--workspace <dir>` | Reuse existing workspace (iterative builds) |
| `--stream` | Stream events to stdout as NDJSON |
| `--json` | Output final result as structured JSON |
| `--timeout <seconds>` | Max build time |
| `--model <model>` | Override agent model |
| `--deploy <path>` | Deploy skills to specified directory |

### Implementation

The CLI starts Elisa's backend in-process on an ephemeral port (same pattern as Electron — `findFreePort()` + `startServer()`), creates a session, submits the spec, and streams WebSocket events to stdout. When the build completes, it outputs the result and exits.

For `elisa build "description"`: the CLI uses Claude to convert the natural language description into a NuggetSpec before passing it to the orchestrator.

### NDJSON Streaming Format

```jsonl
{"event":"planning_started","ts":"2026-02-24T10:00:00Z"}
{"event":"plan_ready","ts":"...","data":{"taskCount":4}}
{"event":"task_started","ts":"...","data":{"taskId":"1","title":"Set up project structure"}}
{"event":"agent_output","ts":"...","data":{"taskId":"1","content":"Creating Express app..."}}
{"event":"task_completed","ts":"...","data":{"taskId":"1"}}
{"event":"test_result","ts":"...","data":{"passed":8,"failed":0}}
{"event":"session_complete","ts":"...","data":{"summary":"Built REST API","files":["src/index.ts","src/routes/bookmarks.ts"],"testsPassed":8}}
```

### Package Distribution

Published as `elisa-ide` on npm with a `bin` entry pointing to the CLI entrypoint. `npm install -g elisa-ide` puts `elisa` on PATH.

## Component 2: OpenClaw Portal Adapter (Elisa -> OpenClaw Delegation)

A new portal adapter type that lets Elisa delegate tasks to OpenClaw agents during builds.

### Adapter: `OpenClawPortalAdapter`

Added to `portalService.ts` alongside existing MCP, CLI, and Serial adapters. Shells out to the `openclaw` CLI to send messages to OpenClaw agents.

```
openclaw chat --agent <agentId> --session-key elisa:<sessionId> "<prompt>"
```

### Capability Tiers

| Tier | What it enables | Example |
|------|----------------|---------|
| **Research** | OpenClaw agent browses web, reads docs | "Find the current Stripe API auth flow" |
| **Verify** | OpenClaw agent runs commands, tests connectivity | "Check if this API endpoint returns valid JSON" |
| **Execute** | OpenClaw agent performs system operations | "Deploy these files to the server via SSH" |

### Configuration

In the Elisa Portals modal, users configure:
- OpenClaw agent ID to delegate to (default: `main`)
- Which capability tiers are enabled
- Timeout per delegation call

### Security

Elisa doesn't bypass any OpenClaw security. OpenClaw's exec approval gates, tool policies, and sandboxing apply to all delegated tasks. Two independent safety layers.

### Example: Delegation During a Build

User builds a "weather dashboard" in Elisa. The meta-planner creates:

```
Task 1: Research free weather APIs          <- needs live web access
Task 2: Scaffold React app                  <- sandboxed Elisa agent
Task 3: Build API integration               <- depends on Task 1
Task 4: Build UI components                 <- depends on Task 2, 3
Task 5: Write tests                         <- depends on Task 4
```

Task 1 delegates to OpenClaw:

```bash
openclaw chat --agent main --session-key elisa:abc123 \
  "Research free weather APIs. Compare OpenWeatherMap vs WeatherAPI vs Tomorrow.io. \
   Check current rate limits and free tier restrictions. Return a recommendation \
   with the API endpoint format."
```

The OpenClaw agent uses its browser tool to visit actual API documentation sites, reads current pricing, and returns grounded information. Elisa's builder agents in Tasks 3-4 work with verified, current data.

## Component 3: Skill Forge

Elisa generates, validates, and deploys OpenClaw skills from natural language descriptions.

### How OpenClaw Skills Work

An OpenClaw skill is a directory containing a `SKILL.md` file with YAML frontmatter and markdown instructions:

```yaml
---
name: skill-identifier
description: What this skill does
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["gh"],"env":["GITHUB_TOKEN"]},"primaryEnv":"GITHUB_TOKEN"}}
---

Instructions for the agent when this skill is invoked...
```

Key constraints Elisa's agents must follow:
- Frontmatter keys must be single-line only
- `metadata` must be a single-line JSON object
- Skills load from `~/.openclaw/skills/` (managed) or `<workspace>/skills` (per-agent)
- OpenClaw hot-reloads skills within 250ms of file changes

### Skill Generation Pipeline

```
User: elisa skill "summarize my GitHub PRs every morning"

Elisa meta-planner creates DAG:
  Task 1: Generate SKILL.md with proper frontmatter + instructions
  Task 2: Validate (single-line JSON, required fields, gating consistency)
  Task 3: Deploy to ~/.openclaw/skills/

Result: Working skill, hot-loaded, ready to use as /summarize-prs
```

### Validation Rules

Elisa's test phase validates generated skills:
- YAML frontmatter parses correctly
- `metadata` is a single-line JSON object (critical OpenClaw parser constraint)
- Required fields present (`name`, `description`)
- Gating requirements are consistent (if instructions reference `gh`, `requires.bins` includes it)
- Token cost estimate is reasonable (formula: `195 + sum(97 + name_len + desc_len + location_len)` characters)

### Deploy Targets

- **Local**: Write to `~/.openclaw/skills/<skill-name>/SKILL.md` — hot-reload picks it up
- **ClawHub**: Run `clawhub publish` — share with the community

### Example: Generated Skill

Input: `elisa skill "translate messages to Spanish when asked"`

Generated `~/.openclaw/skills/translate-spanish/SKILL.md`:

```yaml
---
name: translate-spanish
description: Translate messages or text to Spanish when the user asks for a translation.
user-invocable: true
metadata: {"openclaw":{"emoji":"\ud83c\uddea\ud83c\uddf8"}}
---

When the user asks you to translate something to Spanish, or uses /translate-spanish:

1. Identify the text to translate. If the user provided text directly, use that.
   If they reference a previous message, use that context.

2. Translate the text to natural, idiomatic Latin American Spanish.
   - Preserve formatting (lists, code blocks, etc.)
   - For technical terms, include the English original in parentheses
   - For ambiguous words, choose the most common Latin American usage

3. Present the translation clearly. If the original text was short (under 50 words),
   reply with just the translation. If longer, use a structured format:

   **Original:** (first 20 words...)
   **Traducci\u00f3n:**
   (full translation)
```

### Example: Skill with Gating Requirements

Input: `elisa skill "check my AWS billing and alert if spend exceeds $50"`

Generated `~/.openclaw/skills/aws-billing-alert/SKILL.md`:

```yaml
---
name: aws-billing-alert
description: Check current AWS billing and alert if monthly spend exceeds a threshold.
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["aws"],"env":["AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY"]},"primaryEnv":"AWS_ACCESS_KEY_ID","emoji":"\ud83d\udcb0"}}
---

When invoked, check the user's current AWS billing status:

1. Run `aws ce get-cost-and-usage` for the current month to date.
   Use `--granularity MONTHLY` and `--metrics "UnblendedCost"`.

2. Parse the total spend amount from the response.

3. Compare against the threshold (default: $50, or the amount the user specified).

4. Report the results:
   - Current month-to-date spend
   - Projected end-of-month spend (extrapolate from days elapsed)
   - Whether the threshold is exceeded or on track to be exceeded
   - Top 3 services by cost

5. If the threshold is exceeded or projected to be exceeded, format the
   response as an alert with clear action items.

If the `aws` CLI is not configured or credentials are missing, guide the
user through running `aws configure`.
```

## Component 4: OpenClaw Block Categories

Visual blocks that compile into validated OpenClaw configuration, skills, and bindings. Deployed via `openclaw config patch` and file writes.

### Category: Agents

#### Create Agent

Creates a new OpenClaw agent with workspace, model, and defaults.

**Block**: `Create Agent [name] described as [personality]`

**Example**: `Create Agent "research-bot" described as "A thorough research assistant that always cites sources"`

**Generates**:

Agent entry in `openclaw.json`:
```json5
{
  agents: {
    list: [{
      id: "research-bot",
      workspace: "~/.openclaw/workspaces/research-bot"
    }]
  }
}
```

Workspace file `~/.openclaw/workspaces/research-bot/SOUL.md`:
```markdown
You are a thorough research assistant. When answering questions:
- Always search for and cite primary sources
- Provide multiple perspectives when topics are debated
- Distinguish between established facts and emerging opinions
- Format responses with clear headings and bullet points
```

#### Set Agent Model

**Block**: `Agent [name] uses model [model] with fallback [model]`

**Example**: `Agent "research-bot" uses model "anthropic/claude-opus-4-6" with fallback "anthropic/claude-sonnet-4-5"`

**Generates**:
```json5
{
  agents: {
    list: [{
      id: "research-bot",
      model: {
        primary: "anthropic/claude-opus-4-6",
        fallbacks: ["anthropic/claude-sonnet-4-5"]
      }
    }]
  }
}
```

#### Agent Tool Profile

**Block**: `Agent [name] gets [profile] access, also allow [tools], deny [tools]`

**Example**: `Agent "research-bot" gets "messaging" access, also allow ["browser", "web_search"], deny ["exec", "group:automation"]`

**Generates**:
```json5
{
  agents: {
    list: [{
      id: "research-bot",
      tools: {
        profile: "messaging",
        allow: ["browser", "web_search"],
        deny: ["exec", "group:automation"]
      }
    }]
  }
}
```

#### Agent Sandbox

**Block**: `Agent [name] sandboxed [mode] with workspace access [level]`

**Example**: `Agent "untrusted-helper" sandboxed "all" with workspace access "ro"`

**Generates**:
```json5
{
  agents: {
    list: [{
      id: "untrusted-helper",
      sandbox: {
        mode: "all",
        scope: "agent",
        workspaceAccess: "ro"
      }
    }]
  }
}
```

### Category: Channels & Routing

#### Connect Channel

**Block**: `Connect [channel] with token [token]`

**Example**: `Connect Telegram with token [paste-from-botfather]`

**Generates**:
```json5
{
  channels: {
    telegram: {
      enabled: true,
      botToken: "123456:ABC-DEF..."
    }
  }
}
```

**Human gate**: During build, Elisa pauses and shows: "Go to @BotFather on Telegram, create a new bot with /newbot, and paste the token here."

#### Connect WhatsApp

**Block**: `Connect WhatsApp`

**Generates**:
```json5
{
  channels: {
    whatsapp: {
      enabled: true,
      dmPolicy: "pairing"
    }
  }
}
```

**Human gate**: "Open WhatsApp on your phone. Go to Linked Devices. Scan the QR code displayed by OpenClaw." Elisa runs `openclaw pairing list whatsapp` to surface the pairing flow.

#### DM Policy

**Block**: `[channel] DM policy: [mode] allowing [senders]`

**Example**: `Telegram DM policy: "allowlist" allowing ["tg:123456", "tg:789012"]`

**Generates**:
```json5
{
  channels: {
    telegram: {
      dmPolicy: "allowlist",
      allowFrom: ["tg:123456", "tg:789012"]
    }
  }
}
```

#### Group Chat Mentions

**Block**: `[channel] groups require mention matching [patterns]`

**Example**: `Discord groups require mention matching ["@research-bot", "hey bot"]`

**Generates**:
```json5
{
  channels: {
    discord: {
      groups: {
        "*": {
          requireMention: true,
          mentionPatterns: ["@research-bot", "hey bot"]
        }
      }
    }
  }
}
```

#### Route to Agent

**Block**: `Route [channel/sender/group] to agent [name]`

**Example 1**: `Route Telegram to agent "research-bot"`

**Generates**:
```json5
{
  bindings: [{
    agentId: "research-bot",
    match: { channel: "telegram" }
  }]
}
```

**Example 2**: `Route WhatsApp sender "wa:1234567890" to agent "personal"`

**Generates**:
```json5
{
  bindings: [{
    agentId: "personal",
    match: { channel: "whatsapp", peer: "wa:1234567890" }
  }]
}
```

**Example 3**: `Route Discord guild "my-server" to agent "team-bot"`

**Generates**:
```json5
{
  bindings: [{
    agentId: "team-bot",
    match: { channel: "discord", guild: "my-server" }
  }]
}
```

#### Session Isolation

**Block**: `Session isolation: [mode]`

**Example**: `Session isolation: "per-channel-peer"`

**Generates**:
```json5
{
  session: {
    dmScope: "per-channel-peer"
  }
}
```

### Category: Security

#### Exec Policy

**Block**: `Agent [name] exec policy: [deny/ask/sandbox]`

**Example**: `Agent "research-bot" exec policy: "deny"`

**Generates**:
```json5
{
  agents: {
    list: [{
      id: "research-bot",
      tools: {
        exec: {
          security: "deny"
        }
      }
    }]
  }
}
```

#### Allow Specific Commands

**Block**: `Agent [name] allow commands [list]`

**Example**: `Agent "dev-bot" allow commands ["/usr/bin/python3", "/usr/bin/node", "/usr/local/bin/npm"]`

**Generates**:
```json5
{
  agents: {
    list: [{
      id: "dev-bot",
      tools: {
        exec: {
          security: "ask",
          safeBins: ["/usr/bin/python3", "/usr/bin/node", "/usr/local/bin/npm"]
        }
      }
    }]
  }
}
```

#### Filesystem Restriction

**Block**: `Agent [name] filesystem: workspace only [yes/no]`

**Example**: `Agent "research-bot" filesystem: workspace only yes`

**Generates**:
```json5
{
  agents: {
    list: [{
      id: "research-bot",
      tools: {
        fs: {
          workspaceOnly: true
        }
      }
    }]
  }
}
```

#### Elevated Access

**Block**: `Agent [name] elevated access: [enabled/disabled] from senders [list]`

**Example**: `Agent "admin-bot" elevated access: enabled from senders ["tg:12345"]`

**Generates**:
```json5
{
  agents: {
    list: [{
      id: "admin-bot",
      tools: {
        elevated: {
          enabled: true,
          allowFrom: ["tg:12345"]
        }
      }
    }]
  }
}
```

#### Browser Policy

**Block**: `Browser: allow private network [yes/no], allowed hosts [list]`

**Example**: `Browser: allow private network no, allowed hosts ["*.github.com", "docs.anthropic.com"]`

**Generates**:
```json5
{
  browser: {
    ssrfPolicy: {
      dangerouslyAllowPrivateNetwork: false,
      hostnameAllowlist: ["*.github.com", "docs.anthropic.com"]
    }
  }
}
```

#### Security Preset

**Block**: `Apply security preset: [strict/standard/permissive]`

Strict preset generates the full secure baseline:
```json5
{
  gateway: {
    bind: "loopback",
    auth: { mode: "token" }
  },
  session: { dmScope: "per-channel-peer" },
  tools: {
    profile: "messaging",
    deny: ["group:automation", "group:runtime"],
    fs: { workspaceOnly: true },
    exec: { security: "deny", ask: "always" },
    elevated: { enabled: false }
  }
}
```

### Category: Automations

#### Cron Schedule

**Block**: `Every [schedule] run [skill/action] as agent [name]`

**Example**: `Every "0 9 * * *" run skill "daily-summary" as agent "main"`

**Generates**:

Cron entry in `openclaw.json`:
```json5
{
  cron: {
    enabled: true,
    jobs: [{
      schedule: "0 9 * * *",
      skill: "daily-summary",
      agentId: "main",
      sessionKey: "cron:daily-summary"
    }]
  }
}
```

#### Webhook

**Block**: `When webhook [path] received, run [action] as agent [name]`

**Example**: `When webhook "github" received, run skill "pr-review" as agent "dev-bot"`

**Generates**:
```json5
{
  hooks: {
    enabled: true,
    token: "<auto-generated>",
    path: "/hooks",
    mappings: [{
      match: { path: "github" },
      action: "agent",
      agentId: "dev-bot",
      deliver: true
    }]
  }
}
```

#### Message Trigger

**Block**: `When message matches [pattern] on [channel], do [action]`

**Example**: `When message matches "deploy *" on Telegram, run skill "deploy-project"`

**Generates** a `SKILL.md`:
```yaml
---
name: deploy-project
description: Deploy a project when triggered by a message matching "deploy *".
user-invocable: true
metadata: {"openclaw":{"emoji":"\ud83d\ude80"}}
---

When the user sends a message starting with "deploy" followed by a project name:

1. Identify the project name from the message.
2. Look for the project in the user's workspace directory.
3. Run the project's deploy script if one exists (package.json "deploy", Makefile, etc.).
4. If no deploy script exists, guide the user through deployment options.
5. Report the deployment status back to the user.
```

### Category: Skills (Blocks)

#### Create Skill

**Block**: `Create Skill [name] that [description]`

**Example**: `Create Skill "code-review" that "reviews pull requests and posts feedback"`

**Generates** `~/.openclaw/skills/code-review/SKILL.md` (via Elisa's agent pipeline — agents write the full instructions based on the description).

#### Skill Requirements

**Block**: `Skill [name] requires binaries [list] and env vars [list]`

**Example**: `Skill "code-review" requires binaries ["gh"] and env vars ["GITHUB_TOKEN"]`

**Generates** metadata in the skill's frontmatter:
```yaml
metadata: {"openclaw":{"requires":{"bins":["gh"],"env":["GITHUB_TOKEN"]},"primaryEnv":"GITHUB_TOKEN"}}
```

#### Skill Invocation Mode

**Block**: `Skill [name] invocable by [user/model/both]`

**Example**: `Skill "internal-lookup" invocable by "model"`

**Generates**:
```yaml
user-invocable: false
disable-model-invocation: false
```

### Category: Deploy & Validate

#### Deploy to OpenClaw

**Block**: `Deploy to OpenClaw`

**What it does during build**:
1. Elisa agents compile all OpenClaw blocks into config patches + skill files
2. Writes skill files to `~/.openclaw/skills/`
3. Applies config via `openclaw config patch --json '<patch>'`
4. OpenClaw hot-reloads (skills within 250ms, config per reload mode)
5. Runs `openclaw doctor --json` to validate
6. Reports any issues back to the user

#### Validate Configuration

**Block**: `Validate OpenClaw Config`

**What it does**: Runs `openclaw doctor --json` and `openclaw security audit --json` on the generated configuration. Reports findings as test results in Elisa's test phase.

#### Publish Skill to ClawHub

**Block**: `Publish [skill] to ClawHub`

**What it does**: Runs `clawhub publish` for the specified skill directory. Handles authentication and versioning.

## Component 5: Zero-to-Running Setup

`elisa openclaw setup` orchestrates full OpenClaw installation and configuration from scratch.

### Full Setup Flow

```
Phase 1: Install OpenClaw
  - Check: openclaw --version
  - If missing: run install script (platform-detected)
  - Verify installation

Phase 2: Configure Gateway
  - Set auth mode (token, auto-generated)
  - Set bind mode (loopback for security)
  - Apply via: openclaw config patch

Phase 3: Set Up API Keys
  HUMAN GATE: "Paste your Anthropic API key"
  - Store via openclaw config

Phase 4: Create Agents (from user's block design)
  - Create agent entries in config
  - Set up workspaces
  - Generate SOUL.md personality files
  - Set model preferences and fallbacks
  - Apply tool profiles and sandbox settings

Phase 5: Connect Channels (from user's block design)
  HUMAN GATE (WhatsApp): "Scan this QR code with WhatsApp"
  HUMAN GATE (Telegram): "Paste your BotFather token"
  HUMAN GATE (Discord): "Paste your Discord bot token"
  - Configure DM policies
  - Set up mention patterns
  - Apply routing bindings

Phase 6: Deploy Skills
  - Generate SKILL.md files from skill blocks
  - Write to ~/.openclaw/skills/
  - Configure skill entries in openclaw.json

Phase 7: Security Hardening
  - Apply security preset from blocks
  - Set per-agent exec policies
  - Set filesystem restrictions
  - Run: openclaw security audit --json
  - Auto-fix findings where safe

Phase 8: Start & Validate
  - openclaw doctor --fix
  - openclaw gateway start
  - openclaw gateway status
  - Report: "Your OpenClaw gateway is live"
```

### Example: Complete Setup Block Design

A user designs their entire OpenClaw setup visually:

```
[Set Up OpenClaw]
  |
  ├─ [Create Agent "personal" described as "My helpful daily assistant"]
  │    ├─ [Agent "personal" uses model "anthropic/claude-sonnet-4-5"]
  │    ├─ [Agent "personal" gets "messaging" access, also allow ["web_search"]]
  │    ├─ [Agent "personal" exec policy: "deny"]
  │    └─ [Agent "personal" filesystem: workspace only yes]
  │
  ├─ [Create Agent "dev-bot" described as "A senior software engineer"]
  │    ├─ [Agent "dev-bot" uses model "anthropic/claude-opus-4-6"]
  │    ├─ [Agent "dev-bot" gets "full" access]
  │    ├─ [Agent "dev-bot" allow commands ["/usr/bin/python3", "/usr/bin/node"]]
  │    └─ [Agent "dev-bot" sandboxed "tools" with workspace access "rw"]
  │
  ├─ [Connect WhatsApp]
  │    ├─ [WhatsApp DM policy: "pairing"]
  │    └─ [Route WhatsApp to agent "personal"]
  │
  ├─ [Connect Telegram]
  │    ├─ [Telegram DM policy: "allowlist" allowing ["tg:12345"]]
  │    └─ [Route Telegram to agent "dev-bot"]
  │
  ├─ [Connect Discord]
  │    ├─ [Discord groups require mention matching ["@bot", "hey bot"]]
  │    ├─ [Route Discord guild "my-team" to agent "dev-bot"]
  │    └─ [Route Discord DMs to agent "personal"]
  │
  ├─ [Create Skill "daily-digest" that "summarizes my messages across all channels"]
  ├─ [Every "0 21 * * *" run skill "daily-digest" as agent "personal"]
  │
  ├─ [Apply security preset: "strict"]
  ├─ [Session isolation: "per-channel-peer"]
  │
  ├─ [Validate OpenClaw Config]
  └─ [Deploy to OpenClaw]
```

Hit GO. Elisa's agents handle everything — install OpenClaw, generate all config, create agent personalities, write skills, connect channels (with guided pauses for QR codes and tokens), harden security, validate, and start the gateway.

**Result**: A fully running, secured, multi-channel AI assistant setup. From visual blocks to live gateway in one build.

### This Setup is a Nugget

The block design above can be exported as an `.elisa` nugget file and shared. Someone else opens it in their Elisa, hits GO, and gets the same setup — customized with their own API keys and QR codes via the human gates.

"Here's my two-agent setup — WhatsApp for personal, Telegram for dev, strict security, nightly digest. Import this nugget and you're running in 5 minutes."

## Component 6: Composable Nuggets

Elisa nuggets are sharable building blocks that contain intent (block specs), not just code.

### What's in a Nugget

- **Block graph**: The visual block design (NuggetSpec JSON)
- **Generated artifacts**: Code, config, skills (one rendering of the intent)
- **Test suite**: Validation results
- **Git history**: Every iteration tracked
- **Metadata**: Description, tags, compatibility info

### Intent-Level Composition

Nuggets compose at the specification level, not the code level. This means:

- No dependency conflicts (there are no code dependencies — just intent)
- Language/framework agnostic (agents choose the right tech at build time)
- Time-proof (specs don't decay — agents regenerate with current best practices)

### How Composition Works

A user drags multiple nuggets into their Elisa workspace:

```
[My SaaS App]
  ├─ [User Auth Nugget]        (community)
  ├─ [Stripe Payments Nugget]  (community)
  ├─ [Admin Dashboard Nugget]  (community)
  └─ [Custom business logic]   (user's own blocks)
```

When built, Elisa's meta-planner:
1. Expands each nugget into its constituent spec
2. Merges all specs into a unified NuggetSpec
3. Plans a DAG that covers all components
4. Agents generate a cohesive, unified codebase — not stitched-together copies
5. Integration code between components is written by agents with full awareness of all specs

### Agent-Driven Discovery

When an Elisa build starts, the meta-planner can search the nugget registry for existing components that match parts of the spec. If a "user auth" nugget exists with high quality scores, the planner incorporates it rather than building from scratch.

### Nugget Quality Signal

When agents use a nugget in a build and Elisa's test phase runs, that's quality signal:
- Tests pass in a new context: nugget is robust
- Tests fail: nugget may have issues
- Over time, nuggets used successfully in many contexts surface as high-quality

## Component 7: ClawHub Companion Skills

Two OpenClaw skills published to ClawHub that teach OpenClaw agents to use Elisa.

### `elisa-build`

```yaml
---
name: elisa-build
description: Build software projects using Elisa's multi-agent orchestration engine. Describe what you want and a team of AI agents will plan, build, test, and deploy it.
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["elisa"],"env":["ANTHROPIC_API_KEY"]},"primaryEnv":"ANTHROPIC_API_KEY","homepage":"https://github.com/...","emoji":"\ud83d\udd27"}}
---

When the user asks you to build, create, or develop software, use the Elisa
build engine. Elisa decomposes the request into tasks, runs multiple AI agents
in parallel, tests the result, and delivers working code.

## How to invoke

Run the `elisa` CLI with the user's request:

    elisa build "<user's description>" --stream --json --output ~/projects/<project-name>

## Streaming output

Parse the NDJSON stream from stdout. Relay progress to the user:
- On `planning_started`: "Planning your project..."
- On `plan_ready`: "Plan ready — {taskCount} tasks identified"
- On `task_started`: "Working on: {title}"
- On `task_completed`: "Completed: {title}"
- On `test_result`: "Tests: {passed} passed, {failed} failed"
- On `session_complete`: Summarize files created, tests passed, output location

## Iterative builds

If the user wants to modify an existing project, add `--workspace <dir>` to
pick up where the last build left off. Maintain a mapping of conversation
context to workspace directories for continuity.

## Error handling

If Elisa returns a non-zero exit code, report the error and suggest the user
check that `elisa` is installed (`npm install -g elisa-ide`) and that
`ANTHROPIC_API_KEY` is set.
```

### `elisa-skill-forge`

```yaml
---
name: elisa-skill-forge
description: Create new OpenClaw skills using Elisa's AI agent pipeline. Describe a skill and Elisa generates, validates, and deploys it.
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["elisa"],"env":["ANTHROPIC_API_KEY"]},"primaryEnv":"ANTHROPIC_API_KEY","emoji":"\u2692\ufe0f"}}
---

When the user wants to create a new OpenClaw skill, use Elisa's skill forge
to generate, validate, and deploy it.

## How to invoke

    elisa skill "<description>" --deploy ~/.openclaw/skills/ --json

## What Elisa does

1. Generates a complete SKILL.md with proper frontmatter and instructions
2. Validates frontmatter (single-line JSON metadata, required fields)
3. Checks gating consistency (referenced binaries in requires.bins, etc.)
4. Writes to ~/.openclaw/skills/<skill-name>/SKILL.md
5. OpenClaw hot-reloads the skill automatically

## After deployment

Confirm to the user:
- Skill name and slash command (e.g., /translate-spanish)
- What it does
- Any requirements (binaries, env vars) they need to have configured
- How to test it (just use the slash command)

## Error handling

If validation fails, report which checks failed and suggest fixes.
```

### Installation

```bash
npm install -g elisa-ide           # install the Elisa CLI
clawhub install elisa-build        # OpenClaw can trigger Elisa builds
clawhub install elisa-skill-forge  # OpenClaw can create skills via Elisa
```

Three commands to bridge the two systems.

## Implementation Phases

### Phase 1: Elisa CLI (Foundation)

Everything depends on the CLI. No OpenClaw integration — just Elisa as a command-line tool.

**Deliverables**:
- `elisa build --spec file.json` (direct NuggetSpec input)
- `elisa build "description"` (NL -> NuggetSpec conversion)
- `--stream` NDJSON output adapter
- `--json` final summary output
- `--output` and `--workspace` flags
- npm package with `bin` entry

**Standalone value**: Elisa is scriptable. CI pipelines, shell scripts, other tools can invoke it.

### Phase 2: OpenClaw Portal Adapter (parallel with Phase 3)

Elisa can delegate to OpenClaw agents during builds.

**Deliverables**:
- `OpenClawPortalAdapter` class in `portalService.ts`
- `openclaw` added to `ALLOWED_COMMANDS`
- Portal configuration UI (agent ID, capability tiers, timeout)
- NuggetSpec schema update for `openclawConfig`
- Builder agent prompt update for delegation awareness

### Phase 3: OpenClaw Block Categories + Skill Forge (parallel with Phase 2)

The visual IDE for OpenClaw.

**Deliverables**:
- OpenClaw block definitions (Agents, Channels, Security, Automations, Skills, Deploy)
- Block interpreter: blocks -> OpenClaw config patches + skill files
- Skill generation pipeline (generate, validate, deploy)
- `elisa skill` CLI command
- Deploy phase: `openclaw config patch` + file writes + `openclaw doctor`

### Phase 4: Zero-to-Running Setup

Full installation and configuration from blocks.

**Deliverables**:
- `Set Up OpenClaw` master block
- `elisa openclaw setup` CLI command
- Install detection and scripted installation
- Human gate integration for interactive channel setup (QR codes, tokens)
- Security preset application

### Phase 5: Composable Nuggets

Nuggets as reusable building blocks.

**Deliverables**:
- Nugget-as-block: drag a nugget into workspace as a composable component
- Meta-planner support for expanding nested nuggets
- Nugget registry (simple index, implementation TBD)
- `elisa publish` CLI command
- Agent-driven nugget discovery during planning

### Phase 6: ClawHub Publication

Ship the companion skills.

**Deliverables**:
- `elisa-build` and `elisa-skill-forge` SKILL.md files (generated by Elisa itself)
- ClawHub listings
- Getting started documentation

### Dependency Graph

```
Phase 1 (CLI)
  ├─► Phase 2 (Portal Adapter)
  ├─► Phase 3 (Blocks + Skill Forge)
  │     └─► Phase 4 (Zero-to-Running)
  │     └─► Phase 6 (ClawHub Skills)
  └─► Phase 5 (Composable Nuggets)
```

Phases 2, 3, and 5 can be built in parallel after Phase 1. Phase 4 depends on Phase 3. Phase 6 depends on Phases 1 and 3.

# Backend Services

Each service owns one concern. Orchestrator coordinates phase handlers.

## Service Map

### orchestrator.ts (thin coordinator)
Delegates to phase handlers in sequence: plan -> execute -> test -> deploy. Owns cancellation (AbortController), gate/question resolvers, and public accessors. Phases live in `phases/` subdirectory.

### phases/ (pipeline stages)
- **planPhase.ts** -- MetaPlanner invocation, DAG setup, teaching moments
- **executePhase.ts** -- Streaming-parallel task execution (Promise.race pool, up to 3 concurrent), workspace setup (cleans stale `.elisa/` artifacts on re-builds), git mutex, context chain, token budget enforcement
- **testPhase.ts** -- Test runner invocation, result reporting
- **deployPhase.ts** -- Web preview (local HTTP server), hardware flash, serial portal deployment, CLI portal execution, serial monitor
- **types.ts** -- Shared `PhaseContext` and `SendEvent` types

### agentRunner.ts (SDK agent runner)
Calls `query()` from `@anthropic-ai/claude-agent-sdk` to run agents programmatically. Streams `assistant` messages and extracts `result` metadata (tokens, cost). 300s timeout, 2 retries on failure.

### metaPlanner.ts (task decomposition)
Calls Claude API (opus model) with NuggetSpec + system prompt. Returns structured task DAG with dependencies, acceptance criteria, and role assignments. Validates DAG for cycles. Retry on JSON parse failure.

### gitService.ts (version control)
Wraps simple-git. Inits repo on first build, preserves existing `.git` on re-builds (iterative builds). Commits after each task with agent attribution. Tracks files changed per commit. Silently no-ops if git unavailable.

### hardwareService.ts (ESP32 integration)
Board detection via USB VID:PID matching. Compiles MicroPython with py_compile. Flashes via mpremote with Promise-chain mutex for concurrent flash protection. Serial monitor via serialport at 115200 baud. 60s flash timeout. Uses crypto.randomUUID() for temp file names. `probeForRepl` promisifies `sp.close()`.

### testRunner.ts (test execution)
Detects project type from file extensions in `tests/`. Runs `pytest` for `.py` files, `node` for `.js`/`.mjs` files, merges results if both exist. Parses PASS/FAIL and TAP output formats for JS; pytest verbose output for Python. Extracts coverage for Python only. 120s timeout per runner.

### skillRunner.ts (skill execution)
Executes SkillPlans step-by-step with user interaction. 6 step types: `ask_user`, `branch`, `invoke_skill`, `run_agent`, `set_context`, `output`. Context variables use `{{key}}` syntax with parent-chain resolution. Cycle detection at depth 10 (call stack tracks skill IDs). `ask_user` blocks via Promise with 5-minute timeout. Composite skills are interpreted from Blockly workspace JSON on the backend (no Blockly dependency). Sandboxed execution in temp directory (`elisa-skill-<uuid>`). Agent prompts wrapped in `<user-data>` tags to prevent prompt injection.

### sessionStore.ts (session state)
Consolidates all session state into a single `Map<string, SessionEntry>`. Optional JSON persistence via `SessionPersistence` for checkpoint/recovery. Methods: `create()`, `get()`, `getOrThrow()`, `has()`, `checkpoint()`, `recover()`, `scheduleCleanup()`, `pruneStale()`, `cancelAll()`.

### portalService.ts (portal adapters)
Manages portal adapters per session (MCP, CLI, Serial). Command allowlist validation (`ALLOWED_COMMANDS`) prevents shell injection. `CliPortalAdapter.execute()` runs CLI tools via `execFile` (no shell). `getMcpServers()` collects MCP configs for agent context. `getCliPortals()` collects CLI adapters for deploy phase.

### teachingEngine.ts (educational moments)
Fast-path curriculum lookup maps events to concepts. Deduplicates per concept per session. Falls back to Claude Sonnet API for dynamic generation. Targets ages 8-14.

### narratorService.ts (build narrator)
Translates raw build events into kid-friendly commentary via Claude Haiku (`NARRATOR_MODEL` env var, default `claude-haiku-4-5-20241022`). Mood selection from 4 options: `excited`, `encouraging`, `concerned`, `celebrating`. Rate limiting: max 1 narrator message per task per 15 seconds. `agent_output` events are accumulated per task via `accumulateOutput()` and translated after a 10-second silence window (debounce). Translatable events: `task_started`, `task_completed`, `task_failed`, `agent_message`, `error`, `session_complete`. Fallback templates used on API timeout. Deduplicates consecutive identical messages.

### permissionPolicy.ts (agent permissions)
Auto-resolves agent permission requests (`file_write`, `file_edit`, `bash`, `command`) based on configurable policy rules. Three decision outcomes: `approved`, `denied`, `escalate`. Workspace-scoped writes are auto-approved when within the nugget directory. Read-only commands (`ls`, `cat`, `grep`, etc.) are always safe. Workspace-restricted commands (`mkdir`, `python`, `npm`, etc.) require cwd to be within the nugget dir. Network commands (`curl`, `wget`, etc.) denied by default. Package installs (`pip install`, `npm install`) escalate to user. Denial counter per task escalates to user after threshold (default 3).

## Interaction Pattern

```
Orchestrator.run(spec)
  |-> PlanPhase.execute(ctx, spec)      returns tasks, agents, DAG
  |-> ExecutePhase.execute(ctx)
  |     streaming-parallel pool of ready tasks (up to 3 concurrent):
  |       AgentRunner.execute(prompt)   returns result + tokens
  |       GitService.commit()           serialized via mutex
  |       TeachingEngine.check()        returns teaching moment (if any)
  |       ContextManager.update()       writes summary + structural digest
  |-> TestPhase.execute(ctx)            returns test results + coverage
  |-> DeployPhase.deploy*(ctx)          web preview, hardware flash, or portal deploy
```

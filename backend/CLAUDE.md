# Backend Module

Express 5 + TypeScript server. Orchestrates AI agent teams via the Claude Agent SDK. Streams results to frontend over WebSocket.

## Stack

- Express 5, TypeScript 5.9, Node.js (ES modules)
- ws 8 (WebSocket), simple-git 3, serialport 12, @anthropic-ai/sdk, @anthropic-ai/claude-agent-sdk
- Zod 4 (NuggetSpec validation)
- archiver 7 (zip streaming for nugget export)
- Vitest (tests)

## Structure

```
src/
  server.ts              Thin composition root. Mounts route modules, WS server, exports startServer().
  routes/
    sessions.ts          /api/sessions/* endpoints (create, start, stop, gate, question, export)
    hardware.ts          /api/hardware/* endpoints (detect, flash)
    skills.ts            /api/skills/* endpoints (run, answer, list)
    workspace.ts         /api/workspace/* endpoints (save, load design files)
  models/
    session.ts           Type definitions: Session, Task, Agent, BuildPhase, WSEvent
  services/
    orchestrator.ts      Thin coordinator: delegates to phase handlers in sequence
    sessionStore.ts      Consolidated session state (replaces 4 parallel Maps)
    phases/
      types.ts           Shared PhaseContext and SendEvent types
      planPhase.ts       MetaPlanner invocation, DAG setup
      executePhase.ts    Task execution loop (parallel, git mutex, context chain)
      testPhase.ts       Test runner invocation, result reporting
      deployPhase.ts     Hardware flash, portal deployment
    agentRunner.ts       Runs agents via SDK query() API, streams output
    metaPlanner.ts       Calls Claude API to decompose NuggetSpec into task DAG
    gitService.ts        Git init, commit per task, diff tracking
    hardwareService.ts   ESP32 detect, compile, flash, serial monitor
    testRunner.ts        Runs pytest for Python, Node test runner for JS. Parses results + coverage.
    skillRunner.ts       Executes SkillPlans step-by-step (ask_user, branch, run_agent, invoke_skill)
    teachingEngine.ts    Generates contextual learning moments (curriculum + API fallback)
    narratorService.ts   Generates narrator messages for build events (Claude Haiku)
    permissionPolicy.ts  Auto-resolves agent permission requests based on policy rules
  prompts/
    metaPlanner.ts       System prompt for task decomposition
    builderAgent.ts      Builder role prompt template
    testerAgent.ts       Tester role prompt template
    reviewerAgent.ts     Reviewer role prompt template
    teaching.ts          Teaching moment curriculum and templates
    narratorAgent.ts     Narrator role prompt for build event narration
  utils/
    dag.ts               Task DAG with Kahn's topological sort, cycle detection
    contextManager.ts    Builds file manifests, nugget context, structural digests, state snapshots
    specValidator.ts     Zod schema for NuggetSpec validation (string caps, array limits)
    sessionLogger.ts     Per-session structured logging to .elisa/logs/
    sessionPersistence.ts Atomic JSON persistence for session checkpoint/recovery
    tokenTracker.ts      Tracks input/output tokens, cost per agent, budget limits
    withTimeout.ts       Generic promise timeout wrapper with AbortSignal support
    constants.ts         Named constants for timeouts, limits, intervals, default model
    pathValidator.ts     Workspace path validation (blocklist for system/sensitive dirs)
    safeEnv.ts           Sanitized process.env copy (strips ANTHROPIC_API_KEY)
    findFreePort.ts      Scans for available TCP port from a starting port
    anthropicClient.ts   Singleton factory for the Anthropic SDK client
```

## API Surface

### REST Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/health | Readiness check (API key + SDK status) |
| POST | /api/sessions | Create session |
| POST | /api/sessions/:id/start | Start build with NuggetSpec |
| POST | /api/sessions/:id/stop | Cancel build |
| POST | /api/sessions/:id/gate | Human gate response |
| POST | /api/sessions/:id/question | Answer agent question |
| GET | /api/sessions/:id | Session state |
| GET | /api/sessions/:id/tasks | Task list |
| GET | /api/sessions/:id/git | Commit history |
| GET | /api/sessions/:id/tests | Test results |
| GET | /api/sessions/:id/export | Export nugget directory as zip |
| POST | /api/workspace/save | Save design files to workspace directory |
| POST | /api/workspace/load | Load design files from workspace directory |
| POST | /api/skills/run | Start standalone skill execution |
| POST | /api/skills/:id/answer | Answer skill question |
| GET | /api/hardware/detect | Detect ESP32 (fast VID:PID only) |
| POST | /api/hardware/flash/:id | Flash to board |

### WebSocket Events (server -> client)
`planning_started`, `plan_ready`, `task_started`, `task_completed`, `task_failed`, `agent_output`, `commit_created`, `token_usage`, `budget_warning`, `test_result`, `coverage_update`, `deploy_started`, `deploy_progress`, `deploy_checklist`, `deploy_complete` (includes `url?` for web deploys), `serial_data`, `human_gate`, `user_question`, `skill_*`, `teaching_moment`, `narrator_message`, `permission_auto_resolved`, `minion_state_change`, `workspace_created`, `error`, `session_complete`

## Key Patterns

- **Session state**: In-memory Maps with optional JSON persistence for checkpoint/recovery. Auto-cleanup after 5-min grace period.
- **NuggetSpec validation**: Zod schema validates at `/api/sessions/:id/start` (string caps, array limits, portal command allowlist).
- **SDK query per task**: Each agent task calls `query()` from `@anthropic-ai/claude-agent-sdk` with `permissionMode: 'bypassPermissions'`. Default `maxTurns=25` (`MAX_TURNS_DEFAULT`). On retry, grants 10 additional turns per attempt (`MAX_TURNS_RETRY_INCREMENT`), so retries progress: 25 → 35 → 45.
- **Stale metadata cleanup**: On each build, `setupWorkspace()` removes `.elisa/{comms,context,status}` from previous sessions before recreating them. Preserves `.elisa/logs/`, source files, and `.git/`.
- **Structural digest injection**: Agent task prompts include function/class signatures extracted from workspace source files (via `ContextManager.buildStructuralDigest()`), allowing agents to orient without reading each file.
- **Retry context**: Failed tasks are retried (up to 2 retries) with a "Retry Attempt" header prepended to the prompt, instructing agents to skip orientation and go straight to implementation.
- **Streaming-parallel execution**: Up to 3 independent tasks run concurrently via Promise.race pool. New tasks schedule as soon as any completes. Git commits serialized via mutex.
- **Token budget**: Default 500k token limit per session. Warning event at 80%. Graceful stop when exceeded. Cost tracking per agent.
- **Context chain**: After each task, summary + structural digest written to `.elisa/context/nugget_context.md`.
- **Cancellation**: `Orchestrator.cancel()` via AbortController; signal propagated to Agent SDK `query()` calls. Session state set to `done` on error.
- **Content safety**: All agent prompts enforce age-appropriate output (8-14). Placeholder values sanitized before interpolation (`sanitizePlaceholder()`).
- **Flash mutex**: `HardwareService.flash()` serializes concurrent calls via Promise-chain mutex.
- **Graceful shutdown**: SIGTERM/SIGINT handlers cancel orchestrators, close WS server, 10s force-exit. `SessionStore.onCleanup` invokes `ConnectionManager.cleanup()` for WS teardown.
- **Graceful degradation**: Missing external tools (git, pytest, mpremote) produce warnings, not crashes.
- **Timeouts**: Agent=300s, Tests=120s, Flash=60s. Task retry limit=2.

## Server Modes

`server.ts` exports `startServer(port, staticDir?)` for use by Electron. When run standalone (`tsx src/server.ts`), it auto-detects direct execution and starts on `process.env.PORT` (default 8000).

- **Dev mode** (no `staticDir`): CORS enabled for `CORS_ORIGIN` env var (default `http://localhost:5173`). Frontend served by Vite separately.
- **Production** (with `staticDir`): No CORS. Express serves frontend static files + SPA fallback (`index.html` for non-API routes).

## Configuration

- `PORT`: Backend port (default 8000), or Electron picks a free port
- `CORS_ORIGIN`: Override CORS origin in dev mode (default `http://localhost:5173`)
- `CLAUDE_MODEL`: Override model for agents and teaching engine (default `claude-opus-4-6`)
- `ANTHROPIC_API_KEY`: Required for Claude API/SDK access
- Claude models: configurable via `CLAUDE_MODEL` env var (default claude-opus-4-6)

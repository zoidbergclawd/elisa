# Backend Module

Express 5 + TypeScript server. Orchestrates AI agent teams via the Claude Agent SDK. Streams results to frontend over WebSocket.

## Stack

- Express 5, TypeScript 5.9, Node.js (ES modules)
- ws 8 (WebSocket), simple-git 3, serialport 12, @anthropic-ai/sdk, @anthropic-ai/claude-agent-sdk
- archiver 7 (zip streaming for nugget export)
- Vitest (tests)

## Structure

```
src/
  server.ts              Express + WS server. Exports startServer(port, staticDir?). Routes, session management, connection tracking.
  models/
    session.ts           Type definitions: Session, Task, Agent, BuildPhase, WSEvent
  services/
    orchestrator.ts      Central pipeline: plan -> execute -> test -> review -> deploy
    agentRunner.ts       Runs agents via SDK query() API, streams output
    metaPlanner.ts       Calls Claude API to decompose NuggetSpec into task DAG
    gitService.ts        Git init, commit per task, diff tracking
    hardwareService.ts   ESP32 detect, compile, flash, serial monitor
    testRunner.ts        Runs pytest, parses results + coverage
    teachingEngine.ts    Generates contextual learning moments (curriculum + API fallback)
  prompts/
    metaPlanner.ts       System prompt for task decomposition
    builderAgent.ts      Builder role prompt template
    testerAgent.ts       Tester role prompt template
    reviewerAgent.ts     Reviewer role prompt template
    teaching.ts          Teaching moment curriculum and templates
  utils/
    dag.ts               Task DAG with Kahn's topological sort, cycle detection
    contextManager.ts    Builds file manifests, nugget context, state snapshots for agents
    tokenTracker.ts      Tracks input/output tokens and cost per agent
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
| POST | /api/hardware/detect | Detect ESP32 |
| POST | /api/hardware/flash/:id | Flash to board |

### WebSocket Events (server -> client)
`planning_started`, `plan_ready`, `task_started`, `task_completed`, `task_failed`, `agent_output`, `commit_created`, `token_usage`, `test_result`, `coverage_update`, `deploy_*`, `serial_data`, `human_gate`, `teaching_moment`, `error`, `session_complete`

## Key Patterns

- **In-memory only**: Sessions stored in `Map<string, Session>`. No database.
- **SDK query per task**: Each agent task calls `query()` from `@anthropic-ai/claude-agent-sdk` with `permissionMode: 'bypassPermissions'`, `maxTurns: 20`
- **Context chain**: After each task, summary written to `.elisa/context/nugget_context.md` in workspace. Next agent reads it.
- **Graceful degradation**: Missing external tools (git, pytest, mpremote) produce warnings, not crashes.
- **Timeouts**: Agent=300s, Tests=120s, Flash=60s. Task retry limit=2.

## Server Modes

`server.ts` exports `startServer(port, staticDir?)` for use by Electron. When run standalone (`tsx src/server.ts`), it auto-detects direct execution and starts on `process.env.PORT` (default 8000).

- **Dev mode** (no `staticDir`): CORS enabled for `http://localhost:5173`. Frontend served by Vite separately.
- **Production** (with `staticDir`): No CORS. Express serves frontend static files + SPA fallback (`index.html` for non-API routes).

## Configuration

- Port: `process.env.PORT` (default 8000), or Electron picks a free port
- CORS: Conditional -- enabled in dev mode only (`http://localhost:5173`)
- Claude models: claude-opus-4-6 (agents via SDK + meta-planner via API), claude-sonnet-4 (teaching via API)

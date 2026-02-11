# Backend Module

Express 5 + TypeScript server. Orchestrates AI agent teams via Claude Code CLI subprocesses. Streams results to frontend over WebSocket.

## Stack

- Express 5, TypeScript 5.9, Node.js (ES modules)
- ws 8 (WebSocket), simple-git 3, serialport 12, @anthropic-ai/sdk
- archiver 7 (zip streaming for nugget export)
- Vitest (tests)

## Structure

```
src/
  server.ts              Express + WS server. Routes, session management, connection tracking.
  models/
    session.ts           Type definitions: Session, Task, Agent, BuildPhase, WSEvent
  services/
    orchestrator.ts      Central pipeline: plan -> execute -> test -> review -> deploy
    agentRunner.ts       Spawns claude CLI as subprocess, parses stream-json output
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
    which.ts             Cross-platform PATH resolution for CLI tools
```

## API Surface

### REST Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/health | Readiness check (API key + CLI status) |
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
- **Subprocess per task**: Each agent task spawns `claude` CLI with `--output-format stream-json --permission-mode bypassPermissions --max-turns 20`
- **Context chain**: After each task, summary written to `.elisa/context/nugget_context.md` in workspace. Next agent reads it.
- **Graceful degradation**: Missing external tools (git, pytest, mpremote) produce warnings, not crashes.
- **Timeouts**: Agent=300s, Tests=120s, Flash=60s. Task retry limit=2.

## Configuration

- Port: `process.env.PORT` (default 8000)
- CORS: `http://localhost:5173`
- Claude models: opus (agents via CLI), claude-opus-4-6 (meta-planner via API), claude-sonnet-4 (teaching via API)

# Elisa Project Index

Block-based visual programming IDE where kids build software by snapping together blocks that orchestrate AI agents.

## Directory Map

```
elisa/
  electron/          Electron main process + preload
  backend/           Express 5 API server
    src/
      routes/        REST endpoints (sessions, health)
      services/      Orchestrator, phases, runners, hardware, portals
        phases/      Plan, execute, test, deploy phase handlers
      models/        TypeScript type definitions
      prompts/       Agent role prompts + curriculum
      utils/         DAG, validation, logging, tokens, context
      tests/         Backend unit tests
  frontend/          React 19 + Vite SPA
    src/
      components/    UI component tree
        BlockCanvas/ Blockly editor, block definitions, interpreter
        AgentTeam/   Agent cards + comms feed
        TaskMap/     DAG visualization (@xyflow/react)
        MissionControl/ Shared: TaskDAG, CommsFeed, MetricsPanel
        BottomBar/   Tabs: Timeline, Tests, Board, Learn, Progress, Tokens
        Skills/      Skills/rules CRUD modal
        Portals/     Portal connections modal
        shared/      Reusable: tabs, buttons, modals, toasts, avatars
      hooks/         useBuildSession (session state + WS), useHealthCheck
      lib/           Utility functions
      types/         TypeScript definitions
  hardware/          MicroPython ESP32 templates + shared lib
  scripts/           Build tooling
  docs/              Product + technical documentation
```

## Documentation Map

| File | Scope | Contents |
|------|-------|----------|
| `ARCHITECTURE.md` | System | Topology, data flow, state machine, module decomposition |
| `backend/CLAUDE.md` | Module | Services, API surface, phase handlers, key patterns |
| `backend/README.md` | Dev | Commands, structure, how to add endpoints/roles |
| `backend/src/services/CLAUDE.md` | Module | Orchestrator, phases, runners, interaction patterns |
| `frontend/CLAUDE.md` | Module | Components, state, Blockly integration, WS protocol |
| `frontend/README.md` | Dev | Commands, component structure, how to add blocks |
| `frontend/src/components/CLAUDE.md` | Module | Component hierarchy, BlockCanvas subsystem, UI patterns |
| `docs/getting-started.md` | User | Install, quick start, first build, troubleshooting |
| `docs/api-reference.md` | API | REST endpoints, WebSocket events, ProjectSpec schema |
| `docs/block-reference.md` | User | 9 block categories with descriptions |
| `docs/elisa-prd.md` | Product | PRD: vision, features, target audience |

## Key Source Files

### Backend Core Pipeline

| File | Role |
|------|------|
| `backend/src/server.ts` | Express app, WebSocket setup, route mounting |
| `backend/src/services/orchestrator.ts` | Thin coordinator: plan -> execute -> test -> deploy |
| `backend/src/services/metaPlanner.ts` | Decomposes NuggetSpec into task DAG via Claude API |
| `backend/src/services/agentRunner.ts` | Executes agents via Claude Agent SDK `query()` with streaming |
| `backend/src/services/phases/planPhase.ts` | Calls MetaPlanner, builds DAG, early teaching moments |
| `backend/src/services/phases/executePhase.ts` | Streaming-parallel task execution (3 concurrent, Promise.race) |
| `backend/src/services/phases/testPhase.ts` | Test runner invocation and result reporting |
| `backend/src/services/phases/deployPhase.ts` | Hardware flash, portal deploy, serial monitor |

### Backend Support Services

| File | Role |
|------|------|
| `backend/src/services/sessionStore.ts` | Session state management with JSON persistence |
| `backend/src/services/gitService.ts` | Per-session git init and task-based commits |
| `backend/src/services/hardwareService.ts` | ESP32 detection, MicroPython compile, flash, serial |
| `backend/src/services/testRunner.ts` | pytest / Node test runner with coverage parsing |
| `backend/src/services/skillRunner.ts` | Step-by-step SkillPlan execution with user interaction |
| `backend/src/services/teachingEngine.ts` | Age-appropriate learning moments (curriculum + Claude) |
| `backend/src/services/portalService.ts` | MCP + CLI portal adapters with command allowlist |

### Backend Utilities

| File | Role |
|------|------|
| `backend/src/utils/dag.ts` | Task DAG with Kahn's topological sort, cycle detection |
| `backend/src/utils/specValidator.ts` | Zod schema validation for NuggetSpec |
| `backend/src/utils/contextManager.ts` | File manifests, nugget context, structural digests |
| `backend/src/utils/sessionLogger.ts` | Per-session structured logging to `.elisa/logs/` |
| `backend/src/utils/sessionPersistence.ts` | Atomic JSON checkpoint/recovery |
| `backend/src/utils/tokenTracker.ts` | Token tracking, cost per agent, budget enforcement |

### Frontend Core

| File | Role |
|------|------|
| `frontend/src/App.tsx` | Root component, layout, modal routing |
| `frontend/src/hooks/useBuildSession.ts` | All session state + WebSocket event dispatching |
| `frontend/src/components/BlockCanvas/BlockCanvas.tsx` | Blockly editor wrapper |
| `frontend/src/components/BlockCanvas/blockInterpreter.ts` | Workspace -> NuggetSpec JSON conversion |
| `frontend/src/lib/skillTemplates.ts` | Pre-built skill and rule templates for template library |

### Electron

| File | Role |
|------|------|
| `electron/main.ts` | Window creation, backend lifecycle, API key storage |
| `electron/preload.ts` | Context bridge for renderer process |

## Data Flow

```
Blockly workspace
  -> blockInterpreter -> NuggetSpec JSON (Zod-validated)
  -> REST POST /api/sessions
  -> orchestrator -> metaPlanner -> task DAG
  -> executePhase (3 concurrent agents via Promise.race)
  -> WebSocket events -> useBuildSession -> React UI
```

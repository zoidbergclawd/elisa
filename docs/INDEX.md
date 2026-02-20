# Elisa Project Index

Block-based visual programming IDE where kids build software by snapping together blocks that orchestrate AI agents.

## Directory Map

| Path | Description |
|------|-------------|
| `electron/` | Electron main process, preload, settings dialog |
| `backend/` | Express 5 API server + orchestration engine |
| `backend/src/routes/` | REST endpoint handlers (sessions, hardware, skills, workspace) |
| `backend/src/services/` | Core services: orchestrator, runners, hardware, portals |
| `backend/src/services/phases/` | Pipeline stage handlers: plan, execute, test, deploy |
| `backend/src/models/` | TypeScript type definitions (session, skillPlan) |
| `backend/src/prompts/` | Agent role prompts + curriculum templates |
| `backend/src/utils/` | DAG, validation, logging, tokens, context, timeout |
| `backend/src/tests/` | Backend tests |
| `backend/src/tests/behavioral/` | Integration/behavioral tests for services and routes |
| `backend/src/tests/fixtures/` | Test fixture data (plans, specs) |
| `frontend/` | React 19 + Vite SPA |
| `frontend/src/components/` | UI component tree |
| `frontend/src/components/BlockCanvas/` | Blockly editor, block definitions, interpreter |
| `frontend/src/components/AgentTeam/` | Agent cards + comms feed |
| `frontend/src/components/TaskMap/` | DAG visualization (@xyflow/react) |
| `frontend/src/components/MissionControl/` | Shared: TaskDAG, CommsFeed, MetricsPanel |
| `frontend/src/components/BottomBar/` | Tabs: Timeline, Tests, Board, Learn, Progress, Tokens |
| `frontend/src/components/Skills/` | Skills CRUD modal + template library |
| `frontend/src/components/Rules/` | Rules CRUD modal + template library |
| `frontend/src/components/Portals/` | Portal connections modal |
| `frontend/src/components/shared/` | Reusable: tabs, buttons, modals, toasts, avatars |
| `frontend/src/hooks/` | React hooks (session state, health, WebSocket, board detect, skills) |
| `frontend/src/lib/` | Utility functions (nugget files, skill templates, terminology) |
| `frontend/src/types/` | TypeScript definitions |
| `hardware/` | MicroPython ESP32 templates + shared lib |
| `hardware/lib/` | Shared MicroPython library (`elisa_hardware.py`) |
| `hardware/templates/` | ESP32 project templates (blink, LoRa) |
| `scripts/` | Build tooling (esbuild backend bundler, port killer, subdirectory installer) |
| `docs/` | Product + technical documentation |
| `support/` | ESP32 firmware binaries |

## Documentation Map

| File | Scope | Contents |
|------|-------|----------|
| `ARCHITECTURE.md` | System | Topology, data flow, state machine, module decomposition |
| `.claude/CLAUDE.md` | Project | Tech stack, env vars, dev setup, conventions |
| `backend/CLAUDE.md` | Module | Services, API surface, phase handlers, key patterns |
| `backend/README.md` | Dev | Commands, structure, how to add endpoints/roles |
| `backend/src/services/CLAUDE.md` | Module | Orchestrator, phases, runners, interaction patterns |
| `frontend/CLAUDE.md` | Module | Components, state, Blockly integration, WS protocol |
| `frontend/README.md` | Dev | Commands, component structure, how to add blocks |
| `frontend/src/components/CLAUDE.md` | Module | Component hierarchy, BlockCanvas subsystem, UI patterns |
| `docs/INDEX.md` | Project | This file. Master index of structure, docs, key files |
| `docs/manual/README.md` | User | Complete user manual: workspace, blocks, building, skills, rules, portals, hardware |
| `docs/getting-started.md` | User | Install, quick start, first build, troubleshooting |
| `docs/api-reference.md` | API | REST endpoints, WebSocket events, NuggetSpec schema |
| `docs/block-reference.md` | User | Block categories with descriptions |
| `docs/elisa-prd.md` | Product | PRD: vision, features, target audience |

## Key Source Files

### Routes

| File | Role |
|------|------|
| `backend/src/routes/sessions.ts` | /api/sessions/* endpoints (create, start, stop, gate, question, export) |
| `backend/src/routes/hardware.ts` | /api/hardware/* endpoints (detect, flash) |
| `backend/src/routes/skills.ts` | /api/skills/* endpoints (run, answer, list) |
| `backend/src/routes/workspace.ts` | /api/workspace/* endpoints (save, load design files) |

### Services

| File | Role |
|------|------|
| `backend/src/services/orchestrator.ts` | Thin coordinator: plan -> execute -> test -> deploy |
| `backend/src/services/metaPlanner.ts` | Decomposes NuggetSpec into task DAG via Claude API |
| `backend/src/services/agentRunner.ts` | Executes agents via Claude Agent SDK `query()` with streaming |
| `backend/src/services/sessionStore.ts` | Session state management with JSON persistence |
| `backend/src/services/gitService.ts` | Per-session git init and task-based commits |
| `backend/src/services/hardwareService.ts` | ESP32 detection, MicroPython compile, flash, serial |
| `backend/src/services/testRunner.ts` | pytest / Node test runner with coverage parsing |
| `backend/src/services/skillRunner.ts` | Step-by-step SkillPlan execution with user interaction |
| `backend/src/services/teachingEngine.ts` | Age-appropriate learning moments (curriculum + Claude) |
| `backend/src/services/portalService.ts` | MCP + CLI portal adapters with command allowlist |
| `backend/src/services/narratorService.ts` | Generates narrator messages for build events (Claude Haiku) |
| `backend/src/services/permissionPolicy.ts` | Auto-resolves agent permission requests based on policy rules |

### Phases

| File | Role |
|------|------|
| `backend/src/services/phases/planPhase.ts` | MetaPlanner invocation, DAG setup, early teaching moments |
| `backend/src/services/phases/executePhase.ts` | Streaming-parallel task execution (3 concurrent, Promise.race) |
| `backend/src/services/phases/testPhase.ts` | Test runner invocation and result reporting |
| `backend/src/services/phases/deployPhase.ts` | Web preview, hardware flash, portal deploy, serial monitor |
| `backend/src/services/phases/types.ts` | Shared PhaseContext and SendEvent types |

### Utils

| File | Role |
|------|------|
| `backend/src/utils/dag.ts` | Task DAG with Kahn's topological sort, cycle detection |
| `backend/src/utils/specValidator.ts` | Zod schema validation for NuggetSpec |
| `backend/src/utils/contextManager.ts` | File manifests, nugget context, structural digests |
| `backend/src/utils/sessionLogger.ts` | Per-session structured logging to `.elisa/logs/` |
| `backend/src/utils/sessionPersistence.ts` | Atomic JSON checkpoint/recovery |
| `backend/src/utils/tokenTracker.ts` | Token tracking, cost per agent, budget enforcement |
| `backend/src/utils/withTimeout.ts` | Generic promise timeout wrapper with AbortSignal support |
| `backend/src/utils/constants.ts` | Named constants for timeouts, limits, intervals, default model |
| `backend/src/utils/pathValidator.ts` | Workspace path validation (blocklist for system/sensitive dirs) |
| `backend/src/utils/safeEnv.ts` | Sanitized process.env copy (strips ANTHROPIC_API_KEY) |
| `backend/src/utils/findFreePort.ts` | Scans for available TCP port from a starting port |
| `backend/src/utils/anthropicClient.ts` | Singleton factory for the Anthropic SDK client |

### Prompts

| File | Role |
|------|------|
| `backend/src/prompts/metaPlanner.ts` | System prompt for task decomposition |
| `backend/src/prompts/builderAgent.ts` | Builder role prompt template |
| `backend/src/prompts/testerAgent.ts` | Tester role prompt template |
| `backend/src/prompts/reviewerAgent.ts` | Reviewer role prompt template |
| `backend/src/prompts/narratorAgent.ts` | Narrator role prompt for build event narration |
| `backend/src/prompts/teaching.ts` | Teaching moment curriculum and templates |

### Components

| File | Role |
|------|------|
| `frontend/src/App.tsx` | Root component, layout, modal routing |
| `frontend/src/components/BlockCanvas/BlockCanvas.tsx` | Blockly editor wrapper |
| `frontend/src/components/BlockCanvas/blockDefinitions.ts` | Custom block types (10 categories) |
| `frontend/src/components/BlockCanvas/blockInterpreter.ts` | Workspace -> NuggetSpec JSON conversion |
| `frontend/src/components/BlockCanvas/toolbox.ts` | Blockly sidebar categories |
| `frontend/src/components/BlockCanvas/skillFlowBlocks.ts` | Skill flow block definitions |
| `frontend/src/components/BlockCanvas/skillInterpreter.ts` | Skill flow workspace -> SkillPlan conversion |
| `frontend/src/components/AgentTeam/AgentTeamPanel.tsx` | Full-width agent cards + comms feed |
| `frontend/src/components/TaskMap/TaskMapPanel.tsx` | Full-width interactive task DAG |
| `frontend/src/components/shared/MinionAvatar.tsx` | Animated avatar for narrator/minion characters |
| `frontend/src/components/MissionControl/MissionControlPanel.tsx` | Main mission control layout with narrator feed + minion squad |
| `frontend/src/components/MissionControl/MinionSquadPanel.tsx` | Minion cards with status badges and task assignments |
| `frontend/src/components/MissionControl/NarratorFeed.tsx` | Scrolling narrator message feed with mood indicators |

### Hooks

| File | Role |
|------|------|
| `frontend/src/hooks/useBuildSession.ts` | All session state + WebSocket event dispatching |
| `frontend/src/hooks/useSkillSession.ts` | Standalone skill execution state + WebSocket events |
| `frontend/src/hooks/useBoardDetect.ts` | ESP32 board detection polling |
| `frontend/src/hooks/useHealthCheck.ts` | Backend readiness polling |
| `frontend/src/hooks/useWebSocket.ts` | WebSocket connection with auto-reconnect |

### Lib

| File | Role |
|------|------|
| `frontend/src/lib/nuggetFile.ts` | .elisa nugget file save/load (JSZip-based) |
| `frontend/src/lib/skillTemplates.ts` | Pre-built skill and rule templates |
| `frontend/src/lib/terminology.ts` | Kid-friendly term mappings (technical -> friendly labels) |

### Electron

| File | Role |
|------|------|
| `electron/main.ts` | Window creation, backend lifecycle, API key storage |
| `electron/preload.ts` | Context bridge for renderer process |

## Data Flow

```
Blockly workspace
  -> blockInterpreter -> NuggetSpec JSON (Zod-validated)
  -> REST POST /api/sessions/:id/start
  -> orchestrator -> metaPlanner -> task DAG
  -> executePhase (3 concurrent agents via Promise.race)
  -> agent output streamed via SDK -> WebSocket events
  -> useBuildSession -> React UI state updates
  -> (optional) "Keep working" -> design phase -> re-build with existing workspace + git history
```

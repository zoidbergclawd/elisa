# Elisa Project Index

Block-based visual programming IDE where kids build software by snapping together blocks that orchestrate AI agents.

## Directory Map

| Path | Description |
|------|-------------|
| `electron/` | Electron main process, preload, settings dialog (HTML) |
| `backend/` | Express 5 API server + orchestration engine |
| `backend/src/routes/` | REST endpoint handlers (sessions, hardware, skills, workspace, meetings, runtime, specGraph, devices) |
| `backend/src/services/` | Core services: orchestrator, runners, hardware, portals |
| `backend/src/services/phases/` | Pipeline stage handlers: plan, execute, test, deploy |
| `backend/src/services/runtime/` | Agent Runtime: identity store, conversation, turn pipeline, safety, backpack, study, content filter, consent, usage limiter |
| `backend/src/models/` | TypeScript type definitions (session, skillPlan, runtime, display, meeting, specGraph, composition, parentDashboard) |
| `backend/src/prompts/` | Agent role prompts + curriculum templates |
| `backend/src/utils/` | DAG, validation, logging, tokens, context, timeout |
| `backend/src/tests/` | Backend tests |
| `backend/src/tests/behavioral/` | Integration/behavioral tests for services and routes |
| `backend/src/tests/fixtures/` | Test fixture data (plans, specs) |
| `backend/src/tests/runtime/` | Agent Runtime unit/integration tests (agentStore, conversationManager, displayManager, etc.) |
| `frontend/` | React 19 + Vite SPA |
| `frontend/src/components/` | UI component tree |
| `frontend/src/components/BlockCanvas/` | Blockly editor, block definitions, interpreter |
| `frontend/src/components/AgentTeam/` | Agent cards + comms feed |
| `frontend/src/components/TaskMap/` | DAG visualization (@xyflow/react) |
| `frontend/src/components/MissionControl/` | Shared: TaskDAG, CommsFeed, MetricsPanel |
| `frontend/src/components/BottomBar/` | Resizable tabs with contextual visibility: Timeline, Tests, Trace, Board, Learn, Progress, System, Health, Tokens |
| `frontend/src/components/Skills/` | Skills CRUD modal + template library |
| `frontend/src/components/Rules/` | Rules CRUD modal + template library |
| `frontend/src/components/Portals/` | Portal connections modal |
| `frontend/src/components/Meeting/` | Agent Meeting framework: modal, canvas registry, 8 specialized canvases |
| `frontend/src/components/shared/` | Reusable: tabs, buttons, modals, toasts, avatars |
| `frontend/src/hooks/` | React hooks (session state, health, WebSocket, board detect, skills) |
| `frontend/src/lib/` | Utility functions (nugget files, skill templates, terminology) |
| `frontend/src/types/` | TypeScript definitions |
| `devices/` | Device plugins (manifest-driven, `device.json` per plugin) |
| `devices/_shared/` | Shared MicroPython library (`elisa_hardware.py`) |
| `devices/heltec-sensor-node/` | Heltec ESP32 sensor node plugin (DHT22, reed, PIR, OLED) |
| `devices/heltec-gateway/` | Heltec ESP32 gateway plugin (LoRa aggregation) |
| `devices/heltec-blink/` | Simple LED blink plugin |
| `devices/cloud-dashboard/` | Cloud Run dashboard scaffold plugin |
| `devices/esp32-s3-box3-agent/` | ESP32-S3-BOX-3 voice agent plugin (mic, speaker, touchscreen, esptool deploy) |
| `scripts/` | Build tooling (esbuild backend bundler, port killer, subdirectory installer) |
| `docs/` | Product + technical documentation |
| `docs/plans/` | Design docs and implementation plans (dated, archival) |

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
| `docs/device-plugins.md` | User | Device plugins guide: using shipped hardware plugins |
| `docs/creating-device-plugins.md` | Dev | Developer guide for creating new device plugins |
| `docs/plans/` | Archive | Dated design docs and implementation plans (device plugins, IoT sensor network) |

## Key Source Files

### Routes

| File | Role |
|------|------|
| `backend/src/routes/sessions.ts` | /api/sessions/* endpoints (create, start, stop, gate, question, export) |
| `backend/src/routes/hardware.ts` | /api/hardware/* endpoints (detect, flash) |
| `backend/src/routes/skills.ts` | /api/skills/* endpoints (run, answer, list) |
| `backend/src/routes/workspace.ts` | /api/workspace/* endpoints (save, load design files) |
| `backend/src/routes/meetings.ts` | /api/sessions/:id/meetings/* endpoints (accept, decline, message, end) |
| `backend/src/routes/runtime.ts` | /v1/agents/* endpoints (provision, update, delete, turn, history, heartbeat) |
| `backend/src/routes/specGraph.ts` | /api/spec-graph/* endpoints (CRUD, compose, impact, interfaces) |
| `backend/src/routes/devices.ts` | /api/devices endpoint (list device plugin manifests) |

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
| `backend/src/services/deviceRegistry.ts` | Loads device plugin manifests, provides block defs + agent context |
| `backend/src/services/meetingRegistry.ts` | Meeting type registry + trigger engine for build events |
| `backend/src/services/meetingService.ts` | In-memory meeting session lifecycle management |
| `backend/src/services/systemLevelService.ts` | Progressive mastery level feature flags (Explorer/Builder/Architect) |
| `backend/src/services/autoTestMatcher.ts` | Explorer-level auto-generation of behavioral tests for when_then requirements |
| `backend/src/services/traceabilityTracker.ts` | Requirement-to-test traceability map with coverage tracking |
| `backend/src/services/feedbackLoopTracker.ts` | Passive observer tracking correction cycles, convergence trends, and debug meeting triggers |
| `backend/src/services/impactEstimator.ts` | Pre-execution complexity analysis (task count, complexity, heaviest requirements) |
| `backend/src/services/boundaryAnalyzer.ts` | System boundary analysis (inputs, outputs, boundary portals) |
| `backend/src/services/healthTracker.ts` | System health vital signs during and after execution (score 0-100, grades A-F) |
| `backend/src/services/runtime/displayManager.ts` | BOX-3 display command generator (screen layouts, themes, truncation) |
| `backend/src/services/runtime/agentStore.ts` | In-memory agent identity store (NuggetSpec -> AgentIdentity) |
| `backend/src/services/runtime/conversationManager.ts` | Per-agent conversation session and turn history management |
| `backend/src/services/runtime/turnPipeline.ts` | Core text conversation loop: input -> Claude API -> response |
| `backend/src/services/runtime/safetyGuardrails.ts` | Safety prompt generator for all agent system prompts (PRD-001 Section 6.3) |
| `backend/src/services/runtime/knowledgeBackpack.ts` | In-memory TF-IDF keyword search, per-agent document store |
| `backend/src/services/runtime/studyMode.ts` | Quiz generation from backpack sources, spaced-repetition progress tracking |
| `backend/src/services/runtime/contentFilter.ts` | PII detection/redaction, inappropriate topic flagging |
| `backend/src/services/runtime/consentManager.ts` | Parental consent tracking (COPPA compliance) |
| `backend/src/services/runtime/usageLimiter.ts` | Token/turn rate limiting with tiered usage (free/basic/unlimited) |
| `backend/src/services/runtime/toolExecutor.ts` | Tool execution engine for agent tool-use blocks |
| `backend/src/services/runtime/gapDetector.ts` | Knowledge gap detection from conversation history |
| `backend/src/services/runtimeProvisioner.ts` | Provisioner interface + Stub/Local implementations |
| `backend/src/services/flashStrategy.ts` | FlashStrategy interface, MpremoteFlashStrategy, EsptoolFlashStrategy |
| `backend/src/services/redeployClassifier.ts` | Redeploy decision matrix (config_only vs firmware_required) |
| `backend/src/services/specGraph.ts` | Spec Graph service: directed graph of NuggetSpecs with persistence |
| `backend/src/services/compositionService.ts` | Nugget composition orchestrator with emergence detection |
| `backend/src/services/integrationAgentMeeting.ts` | Integration meeting type for nugget composition |
| `backend/src/services/meetingTriggerWiring.ts` | Wires MeetingTriggerEngine into orchestrator pipeline per build event |
| `backend/src/services/healthHistoryService.ts` | Health-over-time persistence (20-entry cap, .elisa/health-history.json) |
| `backend/src/services/cloudDeployService.ts` | Google Cloud Run deployment (scaffold, gcloud CLI) |
| `backend/src/services/architectureAgentMeeting.ts` | Architecture Agent meeting type (canvasType: blueprint) |
| `backend/src/services/docAgentMeeting.ts` | Documentation Agent meeting type (canvasType: explain-it) |
| `backend/src/services/mediaAgentMeeting.ts` | Media Agent meeting type (canvasType: campaign) |
| `backend/src/services/webDesignAgentMeeting.ts` | Web Designer Agent meeting type (canvasType: launch-pad) |
| `backend/src/services/artAgentMeeting.ts` | Art Agent meeting type for BOX-3 theme customization |
| `backend/src/models/runtime.ts` | Agent Runtime types: AgentIdentity, ConversationTurn, UsageRecord, StudyModeConfig, QuizQuestion, BackpackSource |
| `backend/src/models/specGraph.ts` | Spec Graph types: SpecGraphNode, SpecGraphEdge, SpecGraph, SpecGraphPersistence |
| `backend/src/models/composition.ts` | Composition types: ComposeResult, EmergentBehavior, InterfaceContract, ImpactResult |
| `backend/src/models/display.ts` | BOX-3 display protocol types: DisplayCommand, TouchEvent, DisplayTheme, constraints |
| `backend/src/utils/deviceManifestSchema.ts` | Zod schema for device.json manifest validation |

### Phases

| File | Role |
|------|------|
| `backend/src/services/phases/planPhase.ts` | MetaPlanner invocation, DAG setup, early teaching moments |
| `backend/src/services/phases/executePhase.ts` | Streaming-parallel task execution (3 concurrent, Promise.race) |
| `backend/src/services/phases/promptBuilder.ts` | Prompt construction for agent tasks (system prompt, predecessors, skills, digests) |
| `backend/src/services/phases/taskExecutor.ts` | Single-task execution pipeline (retry, agent run, git, context chain) |
| `backend/src/services/phases/deviceFileValidator.ts` | Post-build device file validation and fixup agent |
| `backend/src/services/phases/testPhase.ts` | Test runner invocation and result reporting |
| `backend/src/services/phases/deployPhase.ts` | Web preview, device flash, portal deploy |
| `backend/src/services/phases/deployOrder.ts` | Device deploy ordering via provides/requires DAG |
| `backend/src/services/phases/types.ts` | Shared PhaseContext, SendEvent, WSEvent, GateResponse, QuestionAnswers types |

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
| `frontend/src/components/BlockCanvas/blockDefinitions.ts` | Custom block types (13 categories incl. Knowledge) |
| `frontend/src/components/BlockCanvas/blockInterpreter.ts` | Workspace -> NuggetSpec JSON conversion |
| `frontend/src/components/BlockCanvas/toolbox.ts` | Blockly sidebar categories |
| `frontend/src/components/BlockCanvas/skillFlowBlocks.ts` | Skill flow block definitions |
| `frontend/src/components/BlockCanvas/skillInterpreter.ts` | Skill flow workspace -> SkillPlan conversion |
| `frontend/src/components/AgentTeam/AgentTeamPanel.tsx` | Full-width agent cards + comms feed |
| `frontend/src/components/TaskMap/TaskMapPanel.tsx` | Full-width interactive task DAG |
| `frontend/src/components/shared/MinionAvatar.tsx` | Animated avatar for narrator/minion characters |
| `frontend/src/components/shared/FlashWizardModal.tsx` | Multi-device flash wizard modal for IoT deploy |
| `frontend/src/components/shared/MeetingInviteToast.tsx` | Floating meeting invite notification with accept/decline |
| `frontend/src/components/shared/MeetingInviteCard.tsx` | Inline meeting invite card for done modal |
| `frontend/src/components/shared/LevelBadge.tsx` | System level badge (Explorer/Builder/Architect) with tooltip |
| `frontend/src/components/shared/DisplayThemePreview.tsx` | BOX-3 display theme preview (320x240 ratio, theme colors, avatar style) |
| `frontend/src/components/Meeting/MeetingModal.tsx` | Full-screen meeting modal with chat panel and canvas area |
| `frontend/src/components/Meeting/canvasRegistry.ts` | Registry for pluggable meeting canvas components |
| `frontend/src/components/MissionControl/MissionControlPanel.tsx` | Main mission control layout with narrator feed + minion squad |
| `frontend/src/components/MissionControl/MinionSquadPanel.tsx` | Minion cards with status badges and task assignments |
| `frontend/src/components/MissionControl/NarratorFeed.tsx` | Scrolling narrator message feed with mood indicators |
| `frontend/src/components/MissionControl/FeedbackLoopIndicator.tsx` | Correction cycle animation and attempt counter for retrying tasks |
| `frontend/src/components/MissionControl/ConvergencePanel.tsx` | Convergence tracking panel showing attempt history, trends, and teaching moments |
| `frontend/src/components/MissionControl/ContextFlowAnimation.tsx` | Animated context flow dots between DAG nodes when tasks complete |
| `frontend/src/components/MissionControl/PlanningIndicator.tsx` | Planning phase status indicator |
| `frontend/src/components/BottomBar/SystemBoundaryView.tsx` | System boundary visualization (inputs/outputs/portals columns) |
| `frontend/src/components/BottomBar/HealthDashboard.tsx` | System health vital signs (live score + post-build grade + breakdown + Architect-level trend chart) |
| `frontend/src/components/BottomBar/TraceabilityView.tsx` | Requirement-to-test traceability table with status badges |
| `frontend/src/components/shared/ProofMeter.tsx` | Segmented progress bar for requirement verification (green/red/amber) |
| `frontend/src/components/shared/EsptoolFlashStep.tsx` | Esptool flash progress UI with port detection and manual override |
| `frontend/src/components/Meeting/ThemePickerCanvas.tsx` | BOX-3 display theme picker canvas for Art Agent meetings |
| `frontend/src/components/Meeting/BugDetectiveCanvas.tsx` | Bug diagnosis canvas for debug-convergence meetings |
| `frontend/src/components/Meeting/BlueprintCanvas.tsx` | System overview canvas for Architecture Agent meetings |
| `frontend/src/components/Meeting/CampaignCanvas.tsx` | Creative asset builder canvas for Media Agent meetings |
| `frontend/src/components/Meeting/ExplainItCanvas.tsx` | Document editor canvas for Documentation Agent meetings |
| `frontend/src/components/Meeting/InterfaceDesignerCanvas.tsx` | Interface contract builder canvas for Integration meetings |
| `frontend/src/components/Meeting/LaunchPadCanvas.tsx` | Launch page builder canvas for Web Designer Agent meetings |
| `frontend/src/components/shared/ImpactPreview.tsx` | Pre-execution impact preview card (task estimate, complexity, heaviest reqs) |

### Hooks

| File | Role |
|------|------|
| `frontend/src/hooks/useBuildSession.ts` | All session state + WebSocket event dispatching |
| `frontend/src/hooks/useSkillSession.ts` | Standalone skill execution state + WebSocket events |
| `frontend/src/hooks/useBoardDetect.ts` | ESP32 board detection polling |
| `frontend/src/hooks/useHealthCheck.ts` | Backend readiness polling |
| `frontend/src/hooks/useWebSocket.ts` | WebSocket connection with auto-reconnect |
| `frontend/src/hooks/useMeetingSession.ts` | Meeting session state via useReducer + WebSocket events |
| `frontend/src/hooks/useSystemLevel.ts` | Extract system level from NuggetSpec for feature gating |

### Lib

| File | Role |
|------|------|
| `frontend/src/lib/nuggetFile.ts` | .elisa nugget file save/load (JSZip-based) |
| `frontend/src/lib/skillTemplates.ts` | Pre-built skill and rule templates |
| `frontend/src/lib/terminology.ts` | Kid-friendly term mappings (technical -> friendly labels) |
| `frontend/src/lib/deviceBlocks.ts` | Dynamic Blockly block registration from device plugin manifests |
| `frontend/src/lib/apiClient.ts` | Auth token management and authenticated fetch wrapper |
| `frontend/src/lib/playChime.ts` | Web Audio API two-tone chime for board detection events |

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

### Device Plugin Pipeline

```
Blockly workspace (dynamic device blocks from plugin manifests)
  -> blockInterpreter -> NuggetSpec JSON (with devices array)
  -> orchestrator -> agents receive plugin context via DeviceRegistry.getAgentContext()
  -> deployPhase: resolveDeployOrder() -> FlashWizardModal per device
  -> selectFlashStrategy(method) dispatches to MpremoteFlashStrategy or EsptoolFlashStrategy
  -> flash files + shared libs from plugin manifest
```

### BOX-3 Deploy Flow

```
NuggetSpec (with esp32-s3-box3-agent device)
  -> deployPhase detects runtime_provision.required=true
  -> RuntimeProvisioner.provision() -> agent_id, api_key, runtime_url
  -> EsptoolFlashStrategy: resolve esptool, detect serial port, flash firmware binary
  -> Runtime config (agent_id, api_key, runtime_url) written as runtime_config.json
  -> Art Agent meeting triggered on deploy_started (ThemePickerCanvas for theme selection)
  -> On redeploy: redeployClassifier.classifyChanges() -> config_only or firmware_required
```

### Spec Graph & Composition Pipeline

```
POST /api/spec-graph -> SpecGraphService.create() -> graph_id
POST /api/spec-graph/:id/nodes -> addNode(spec, label) -> node_id (with composition.provides/requires)
POST /api/spec-graph/:id/edges -> addEdge(from, to, relationship)
POST /api/spec-graph/:id/compose -> CompositionService.compose()
  -> emits composition_started (graph_id, node_ids) via WebSocket
  -> resolveInterfaces() -> match requires to provides
  -> detectEmergence() -> feedback loops, pipelines, hubs
  -> merge NuggetSpecs -> ComposeResult
  -> emits composition_impact per affected node via WebSocket

Build with graph context:
  spec.composition.parent_graph_id -> SpecGraphService.buildGraphContext()
  -> injected into MetaPlanner system prompt
  -> agents aware of full application architecture
```

### Agent Runtime Pipeline (PRD-001)

```
NuggetSpec (from deploy)
  -> POST /v1/agents -> AgentStore.provision() -> AgentIdentity + api_key
  -> Deploy target (BOX-3, Telegram, Web) receives agent_id + api_key

User input (from any deploy target)
  -> POST /v1/agents/:id/turn/text (with x-api-key)
  -> TurnPipeline.receiveTurn()
    -> Load AgentIdentity (system prompt + safety guardrails)
    -> Load conversation history from ConversationManager
    -> Call Claude API with assembled context
    -> Store user + assistant turns in history
    -> Track usage via UsageTracker
  -> Return { response, session_id }
```

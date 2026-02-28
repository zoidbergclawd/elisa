# Backend Module

Express 5 + TypeScript server. Orchestrates AI agent teams via the Claude Agent SDK. Streams results to frontend over WebSocket.

## Stack

- Express 5, TypeScript 5.9, Node.js (ES modules)
- ws 8 (WebSocket), simple-git 3, serialport 12, @anthropic-ai/sdk, @anthropic-ai/claude-agent-sdk, openai (STT/TTS)
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
    devices.ts           /api/devices endpoint (list device plugin manifests)
    meetings.ts          /api/sessions/:id/meetings/* endpoints (accept, decline, message, end)
    runtime.ts           /v1/agents/* endpoints (provision, update, delete, turn, history, heartbeat)
    specGraph.ts         /api/spec-graph/* endpoints (CRUD, compose, impact, interfaces)
  models/
    session.ts           Type definitions: Session, Task, Agent, BuildPhase, WSEvent
    meeting.ts           Meeting framework types: MeetingType, MeetingSession, CanvasState, etc.
    display.ts           BOX-3 display protocol types: DisplayCommand, TouchEvent, DisplayTheme, constraints
    runtime.ts           Agent Runtime types: AgentIdentity, ConversationTurn, UsageRecord, ProvisionResult, StudyModeConfig, QuizQuestion, BackpackSource, AudioTurnResult, AudioTurnRequest
    specGraph.ts         Spec Graph types: SpecGraphNode, SpecGraphEdge, SpecGraph, SpecGraphPersistence
    composition.ts       Composition types: ComposeResult, EmergentBehavior, InterfaceContract, ImpactResult
    parentDashboard.ts   Parent Dashboard types: ParentDashboardData, UsageSummary, SafetyReport (Phase 2)
  services/
    orchestrator.ts      Thin coordinator: delegates to phase handlers in sequence
    sessionStore.ts      Consolidated session state (replaces 4 parallel Maps)
    phases/
      types.ts           Shared PhaseContext, SendEvent, GateResponse, QuestionAnswers types
      planPhase.ts       MetaPlanner invocation, DAG setup
      executePhase.ts    Task execution loop (parallel, git mutex, context chain)
      testPhase.ts       Test runner invocation, result reporting
      deployPhase.ts     Device flash, portal deployment, web preview
      deployOrder.ts     Device deploy ordering (provides/requires DAG)
      promptBuilder.ts   Prompt construction for agent tasks (system prompt, predecessors, skills, digests)
      taskExecutor.ts    Single-task execution pipeline (retry, agent run, git, context chain)
      deviceFileValidator.ts  Post-build device file validation and fixup agent
    agentRunner.ts       Runs agents via SDK query() API, streams output
    metaPlanner.ts       Calls Claude API to decompose NuggetSpec into task DAG
    gitService.ts        Git init, commit per task, diff tracking
    hardwareService.ts   ESP32 detect, compile, flash, serial monitor
    testRunner.ts        Runs pytest for Python, Node test runner for JS. Parses results + coverage.
    skillRunner.ts       Executes SkillPlans step-by-step (ask_user, branch, run_agent, invoke_skill)
    teachingEngine.ts    Generates contextual learning moments (curriculum + API fallback)
    narratorService.ts   Generates narrator messages for build events (Claude Haiku)
    permissionPolicy.ts  Auto-resolves agent permission requests based on policy rules
    deviceRegistry.ts    Loads device plugin manifests, provides block defs + agent context
    meetingRegistry.ts   Meeting type registry + trigger engine for build events
    meetingService.ts    In-memory meeting session lifecycle management
    meetingAgentService.ts  Claude-powered agent responses for meeting chat (Haiku)
    meetingMaterializer.ts  Materializes canvas data into real workspace files (HTML, JSON, Markdown)
    taskMeetingTypes.ts  Task-level meeting types (design review before art/visual tasks)
    systemLevelService.ts  Progressive mastery level flags (Explorer/Builder/Architect)
    autoTestMatcher.ts   Explorer-level auto-generation of behavioral tests
    cloudDeployService.ts Google Cloud Run deployment (scaffold, gcloud CLI)
    portalService.ts     Portal adapters (MCP, CLI) with command allowlist
    traceabilityTracker.ts  Requirement-to-test traceability map with coverage tracking
    feedbackLoopTracker.ts Passive feedback loop observer with convergence tracking
    impactEstimator.ts   Pre-execution complexity analysis (task count, complexity, heaviest requirements)
    boundaryAnalyzer.ts  System boundary analysis (inputs, outputs, boundary portals)
    healthTracker.ts     System health vital signs during and after execution (score 0-100, grades)
    healthHistoryService.ts  Health-over-time persistence (20-entry cap, .elisa/health-history.json)
    flashStrategy.ts     FlashStrategy interface + MpremoteFlashStrategy + EsptoolFlashStrategy
    redeployClassifier.ts  Redeploy decision matrix: classifyChanges(oldSpec, newSpec) -> action + reasons
    specGraph.ts         Spec Graph service: directed graph of NuggetSpecs with persistence
    compositionService.ts  Nugget composition orchestrator with emergence detection
    meetingTriggerWiring.ts  Wires MeetingTriggerEngine into orchestrator pipeline per build event
    artAgentMeeting.ts   Art Agent meeting type for BOX-3 display theme customization
    architectureAgentMeeting.ts  Architecture Agent meeting type (canvasType: blueprint)
    docAgentMeeting.ts   Documentation Agent meeting type (canvasType: explain-it)
    mediaAgentMeeting.ts Media Agent meeting type (canvasType: campaign)
    webDesignAgentMeeting.ts  Web Designer Agent meeting type (canvasType: launch-pad)
    integrationAgentMeeting.ts  Integration meeting type for nugget composition
    runtimeProvisioner.ts Interface + Stub/Local implementations for agent provisioning
    runtime/
      agentStore.ts      In-memory agent identity store (NuggetSpec -> AgentIdentity)
      conversationManager.ts  Per-agent conversation session and turn history
      turnPipeline.ts    Core conversation loop: input -> Claude API -> response
      audioPipeline.ts   Audio conversation turns: mic -> OpenAI Whisper STT -> Claude text turn -> OpenAI TTS -> audio
      safetyGuardrails.ts  Safety prompt generator (PRD-001 Section 6.3)
      knowledgeBackpack.ts  In-memory TF-IDF keyword search, per-agent document store
      studyMode.ts       Quiz generation from backpack sources, progress tracking
      contentFilter.ts   PII detection/redaction, inappropriate topic flagging
      toolExecutor.ts    Tool execution engine for agent tool-use blocks
      gapDetector.ts     Knowledge gap detection from conversation history
      usageLimiter.ts    Token/turn rate limiting with tiered usage
      consentManager.ts  Parental consent tracking (COPPA compliance)
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
    deviceManifestSchema.ts  Zod schema for device.json manifest validation
    sessionLogger.ts     Per-session structured logging to .elisa/logs/
    sessionPersistence.ts Atomic JSON persistence for session checkpoint/recovery
    tokenTracker.ts      Tracks input/output tokens, cost per agent, budget limits
    withTimeout.ts       Generic promise timeout wrapper with AbortSignal support
    constants.ts         Named constants for timeouts, limits, intervals, default model, meeting agent config
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
| GET | /api/devices | List device plugin manifests |
| GET | /api/hardware/detect | Detect ESP32 (fast VID:PID only) |
| POST | /api/hardware/flash/:id | Flash to board |
| GET | /api/sessions/:id/meetings | List meetings for session |
| GET | /api/sessions/:id/meetings/:mid | Get meeting details |
| POST | /api/sessions/:id/meetings/:mid/accept | Accept meeting invite |
| POST | /api/sessions/:id/meetings/:mid/decline | Decline meeting invite |
| POST | /api/sessions/:id/meetings/:mid/message | Send message in meeting |
| POST | /api/sessions/:id/meetings/:mid/outcome | Save meeting outcome |
| POST | /api/sessions/:id/meetings/:mid/end | End active meeting |
| POST | /api/sessions/:id/meetings/:mid/materialize | Materialize canvas data into workspace files |
| POST | /v1/agents | Provision new agent (returns agent_id, api_key, runtime_url) |
| PUT | /v1/agents/:id | Update agent config (x-api-key auth) |
| DELETE | /v1/agents/:id | Deprovision agent (x-api-key auth) |
| POST | /v1/agents/:id/turn/text | Text conversation turn (x-api-key auth) |
| POST | /v1/agents/:id/turn/audio | Audio conversation turn via OpenAI STT/TTS (x-api-key auth, 501 without OPENAI_API_KEY) |
| GET | /v1/agents/:id/history | Conversation history (x-api-key auth) |
| GET | /v1/agents/:id/gaps | Knowledge gap list (x-api-key auth) |
| GET | /v1/agents/:id/heartbeat | Agent health check (no auth) |
| POST | /v1/agents/:id/backpack | Add source to knowledge backpack (x-api-key auth) |
| GET | /v1/agents/:id/backpack | List backpack sources (x-api-key auth) |
| DELETE | /v1/agents/:id/backpack/:sourceId | Remove backpack source (x-api-key auth) |
| POST | /v1/agents/:id/backpack/search | Search backpack (x-api-key auth) |
| PUT | /v1/agents/:id/study | Update study mode config (x-api-key auth) |
| GET | /v1/agents/:id/study | Get study progress (x-api-key auth) |
| POST | /v1/agents/:id/study/quiz | Generate quiz (x-api-key auth) |
| POST | /v1/agents/:id/study/answer | Submit quiz answer (x-api-key auth) |
| WS | /v1/agents/:id/stream?api_key= | Streaming conversation turn (WebSocket) |
| POST | /api/spec-graph | Create new Spec Graph |
| GET | /api/spec-graph/:id | Get full graph (nodes + edges) |
| DELETE | /api/spec-graph/:id | Delete graph |
| POST | /api/spec-graph/:id/nodes | Add nugget node to graph |
| GET | /api/spec-graph/:id/nodes | List all nodes |
| GET | /api/spec-graph/:id/nodes/:nid | Get single node |
| DELETE | /api/spec-graph/:id/nodes/:nid | Remove node + its edges |
| POST | /api/spec-graph/:id/edges | Add edge (dependency/interface) |
| DELETE | /api/spec-graph/:id/edges | Remove edge |
| GET | /api/spec-graph/:id/neighbors/:nid | Get incoming/outgoing neighbors |
| POST | /api/spec-graph/:id/compose | Compose selected nodes into merged NuggetSpec |
| POST | /api/spec-graph/:id/impact | Detect cross-nugget impact of node change |
| GET | /api/spec-graph/:id/interfaces | Resolve interface contracts among nodes |

### WebSocket Events (server -> client)
`planning_started`, `plan_ready`, `task_started`, `task_completed`, `task_failed`, `agent_output`, `commit_created`, `token_usage`, `budget_warning`, `test_result`, `coverage_update`, `deploy_started`, `deploy_progress`, `deploy_checklist`, `deploy_complete` (includes `url?` for web deploys), `serial_data`, `human_gate`, `user_question`, `skill_*`, `teaching_moment`, `narrator_message`, `permission_auto_resolved`, `minion_state_change`, `workspace_created`, `flash_prompt`, `flash_progress`, `flash_complete`, `context_flow` (from_task_id, to_task_ids, summary_preview), `documentation_ready`, `meeting_invite`, `meeting_started`, `meeting_message`, `meeting_canvas_update`, `meeting_outcome`, `meeting_ended`, `traceability_update`, `traceability_summary`, `correction_cycle_started`, `correction_cycle_progress`, `convergence_update`, `composition_started` (graph_id, node_ids), `composition_impact` (graph_id, changed_node_id, affected_nodes, severity), `decomposition_narrated`, `impact_estimate`, `boundary_analysis`, `system_health_update`, `system_health_summary`, `health_history` (entries array for Architect trend tracking), `error`, `session_complete`

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
- **Spec Graph**: Persistent directed graph of NuggetSpecs persisted to `.elisa/spec-graph.json`. Nodes=nuggets, edges=dependencies/interfaces. Graph context injected into MetaPlanner when `composition.parent_graph_id` is set.
- **Nugget composition**: NuggetSpec `composition` field declares `provides`/`requires` interfaces. CompositionService merges selected nuggets, detects emergence (feedback loops, pipelines, hubs), resolves interface contracts. System level gates max nuggets (explorer=1, builder=3, architect=unlimited).

## Device Plugin Deploy Flow

Multi-device builds use the device plugin system:
1. Deploy phase checks `shouldDeployDevices()` (spec has `devices` array)
2. `resolveDeployOrder()` sorts devices by provides/requires DAG
3. Emits `flash_prompt` for each device -- frontend shows FlashWizardModal
4. User connects each device; `flash_progress` streams per-file flash status
5. `flash_complete` confirms each device is done
6. Files flashed from plugin manifest's `deploy.flash.files` + `deploy.flash.lib`
7. Shared libraries from `devices/_shared/` included via `deploy.flash.shared_lib`

## Server Modes

`server.ts` exports `startServer(port, staticDir?)` for use by Electron. When run standalone (`tsx src/server.ts`), it auto-detects direct execution and starts on `process.env.PORT` (default 8000).

- **Dev mode** (no `staticDir`): CORS enabled for `CORS_ORIGIN` env var (default `http://localhost:5173`). Frontend served by Vite separately.
- **Production** (with `staticDir`): No CORS. Express serves frontend static files + SPA fallback (`index.html` for non-API routes).

## Configuration

- `PORT`: Backend port (default 8000), or Electron picks a free port
- `CORS_ORIGIN`: Override CORS origin in dev mode (default `http://localhost:5173`)
- `CLAUDE_MODEL`: Override model for agents and teaching engine (default `claude-opus-4-6`)
- `ANTHROPIC_API_KEY`: Required for Claude API/SDK access
- `OPENAI_API_KEY`: Optional, enables audio features (STT via Whisper, TTS via OpenAI TTS)
- Claude models: configurable via `CLAUDE_MODEL` env var (default claude-opus-4-6)

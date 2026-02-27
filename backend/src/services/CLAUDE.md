# Backend Services

Each service owns one concern. Orchestrator coordinates phase handlers.

## Service Map

### orchestrator.ts (thin coordinator)
Delegates to phase handlers in sequence: plan -> execute -> test -> deploy. Owns cancellation (AbortController), gate/question resolvers, and public accessors. Phases live in `phases/` subdirectory.

### phases/ (pipeline stages)
- **planPhase.ts** -- MetaPlanner invocation, DAG setup, teaching moments
- **executePhase.ts** -- Streaming-parallel task execution (Promise.race pool, up to 3 concurrent), workspace setup (cleans stale `.elisa/` artifacts on re-builds), git mutex, context chain, token budget enforcement
- **promptBuilder.ts** -- Prompt construction for agent tasks. Assembles system prompt (role template, NuggetSpec, skills, digests), predecessor summaries, device plugin context, and MCP server config. Extracted from executePhase.ts for single-responsibility.
- **taskExecutor.ts** -- Single-task execution pipeline. Owns the retry loop (up to 2 retries), agent execution call (via AgentRunner), post-execution processing (comms file reading, summary validation, git commit, context chain update), token budget pre-check, narrator/teaching calls, human gate logic, and question handler factory. Extracted from executePhase.ts.
- **deviceFileValidator.ts** -- Post-build device file validation and fixup. After task execution, validates that required device files exist and conform to expected patterns. Runs a fixup agent to repair missing/malformed files. Extracted from executePhase.ts.
- **testPhase.ts** -- Test runner invocation, result reporting
- **deployPhase.ts** -- Web preview (local HTTP server), device flash (via plugin manifests), CLI portal execution
- **deployOrder.ts** -- Device deploy ordering via provides/requires dependency DAG
- **types.ts** -- Shared `PhaseContext`, `SendEvent`, `WSEvent` discriminated union, `GateResponse`, `QuestionAnswers` types

### agentRunner.ts (SDK agent runner)
Calls `query()` from `@anthropic-ai/claude-agent-sdk` to run agents programmatically. Streams `assistant` messages and extracts `result` metadata (tokens, cost). 300s timeout, default `maxTurns=25` (`MAX_TURNS_DEFAULT`), 2 retries with increasing turn budgets (25→35→45 via `MAX_TURNS_RETRY_INCREMENT`).

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
Manages portal adapters per session (MCP, CLI). Command allowlist validation (`ALLOWED_COMMANDS`) prevents shell injection. `CliPortalAdapter.execute()` runs CLI tools via `execFile` (no shell). `getMcpServers()` collects MCP configs for agent context. `getCliPortals()` collects CLI adapters for deploy phase.

### deviceRegistry.ts (device plugins)
Loads device plugin manifests from `devices/` directory at startup. Validates each `device.json` against `DeviceManifestSchema`. Provides: `getAllDevices()` for REST API, `getBlockDefinitions()` for frontend block registration, `getAgentContext()` for builder prompt injection (reads `prompts/agent-context.md` from plugin dir). Caches agent context per plugin. Skips `_shared/` and invalid plugins.

### meetingRegistry.ts (meeting type registry)
Registry for meeting type definitions (id, name, agentName, canvasType, triggerConditions, persona). Supports `register()`, `getById()`, `getAll()`, `unregister()`. `MeetingTriggerEngine` evaluates build events against registered trigger conditions to determine which meetings to propose. Multiple meeting types can match a single event.

### meetingService.ts (meeting session lifecycle)
In-memory meeting session management. Lifecycle: `createInvite()` -> invited -> `acceptMeeting()` -> active -> `sendMessage()` / `addOutcome()` / `updateCanvas()` -> `endMeeting()` -> completed. Also supports `declineMeeting()` from invited state. Sessions indexed by meeting ID and by build session ID. Each method sends the appropriate WebSocket event. `cleanupSession()` removes all meetings for a build session.

### systemLevelService.ts (progressive mastery levels)
Pure functions for the Explorer/Builder/Architect progressive mastery system. `getLevel(spec)` extracts system level from NuggetSpec (default: explorer). Feature flags: `shouldAutoMatchTests()`, `shouldNarrate()`, `getDAGDetailLevel()`, `shouldAutoInviteMeetings()`, `getMaxNuggets()`. No state, no side effects.

### autoTestMatcher.ts (explorer auto-test generation)
At Explorer level, auto-generates behavioral tests for `when_then` requirements that lack a `test_id`. Parses requirement descriptions to extract when/then clauses. Links generated tests back to requirements via `test_id` and `requirement_id`. Emits narrator messages for each generated test. No-op at Builder and Architect levels. Runs before MetaPlanner in the orchestrator pipeline.

### traceabilityTracker.ts (requirement-test traceability)
Builds a map from NuggetSpec requirements to behavioral tests at plan time. Updates status (untested/passing/failing) as test results arrive via `recordTestResult()`. Computes coverage statistics via `getCoverage()`. Emits `traceability_update` per linked test result and `traceability_summary` after all tests complete. Wired into orchestrator after TestPhase. Does not modify test execution logic -- observes only.

### feedbackLoopTracker.ts (feedback loop visualization)
Passive observer that tracks correction cycles during task execution. Created per build in the orchestrator and injected into ExecutePhase. Tracks attempts per task: `startAttempt()`, `markFixing()`, `markRetesting()`, `recordAttemptResult()`. Computes convergence trend (improving/stalled/diverging) by comparing test pass ratios across attempts. Emits `correction_cycle_started`, `correction_cycle_progress`, and `convergence_update` events for frontend visualization. After 2+ stalled attempts, triggers a `meeting_invite` for the registered `debug-convergence` meeting type (Bug Detective Meeting). Does NOT modify retry logic -- observes only.

### teachingEngine.ts (educational moments)
Fast-path curriculum lookup maps events to concepts. Deduplicates per concept per session. Falls back to Claude Sonnet API for dynamic generation. Targets ages 8-14.

### narratorService.ts (build narrator)
Translates raw build events into kid-friendly commentary via Claude Haiku (`NARRATOR_MODEL` env var, default `claude-haiku-4-5-20241022`). Mood selection from 4 options: `excited`, `encouraging`, `concerned`, `celebrating`. Rate limiting: max 1 narrator message per task per 15 seconds. `agent_output` events are accumulated per task via `accumulateOutput()` and translated after a 10-second silence window (debounce). Translatable events: `task_started`, `task_completed`, `task_failed`, `agent_message`, `error`, `session_complete`. Fallback templates used on API timeout. Deduplicates consecutive identical messages.

### permissionPolicy.ts (agent permissions)
Auto-resolves agent permission requests (`file_write`, `file_edit`, `bash`, `command`) based on configurable policy rules. Three decision outcomes: `approved`, `denied`, `escalate`. Workspace-scoped writes are auto-approved when within the nugget directory. Read-only commands (`ls`, `cat`, `grep`, etc.) are always safe. Workspace-restricted commands (`mkdir`, `python`, `npm`, etc.) require cwd to be within the nugget dir. Network commands (`curl`, `wget`, etc.) denied by default. Package installs (`pip install`, `npm install`) escalate to user. Denial counter per task escalates to user after threshold (default 3).

### impactEstimator.ts (pre-execution impact analysis)
Estimates build complexity before execution. Count-based heuristics: requirement count, behavioral test count, device count, portal count, feedback loops. Returns `{ estimated_tasks, complexity: 'simple'|'moderate'|'complex', heaviest_requirements }`. Complexity thresholds: simple (weight<=6), moderate (weight<=15), complex (weight>15). Heaviest requirements ranked by description length + behavioral test linkage.

### boundaryAnalyzer.ts (system boundary analysis)
Analyzes NuggetSpec to identify system inputs (user input, portal data, hardware signals), outputs (display, hardware commands, data output), and boundary portals. Scans requirements, behavioral tests, portals, and devices. Portals sit on the boundary. Returns `{ inputs: BoundaryItem[], outputs: BoundaryItem[], boundary_portals: string[] }`.

### healthTracker.ts (system health dashboard)
Tracks vital signs during execution: tasks completed/total, tests passing/total, tokens used, correction cycles. Health score formula (0-100): `(tasks/total*30) + (tests_passing/total*40) + (no_corrections*20) + (under_budget*10)`. Grades: A(90+), B(80+), C(70+), D(60+), F(<60). Emits `system_health_update` (periodic) and `system_health_summary` (post-execution).

### healthHistoryService.ts (health-over-time tracking)
Persists health summaries across builds for Architect-level trend tracking. Saves to `.elisa/health-history.json` in the nugget workspace. Each entry: `{ timestamp, goal, score, grade, breakdown: { tasks, tests, corrections, budget } }`. Loads on build start, records after health summary, emits `health_history` event. Caps at 20 entries (oldest trimmed). Graceful degradation on file corruption.

### runtime/displayManager.ts (BOX-3 display)
Generates `DisplayCommand[]` sequences for the BOX-3 2.4" IPS touchscreen (320x240). Screen generators: `getIdleScreen`, `getConversationScreen`, `getThinkingScreen`, `getErrorScreen`, `getStatusScreen`, `getMenuScreen`. Text truncation with ellipsis. Theme management from predefined `DEFAULT_THEMES` (4 themes). Types defined in `models/display.ts`.

### runtime/agentStore.ts (agent identity store)
In-memory store for provisioned agents. Compiles NuggetSpec into `AgentIdentity` (system prompt, greeting, tools, study config, topic index). Generates unique `api_key` per agent (prefixed `eart_`). Synthesizes system prompts from NuggetSpec fields with safety guardrails always appended. Methods: `provision()`, `update()`, `get()`, `delete()`, `validateApiKey()`, `has()`.

### runtime/conversationManager.ts (conversation sessions)
Manages per-agent conversation sessions and turn history. Sessions indexed by session_id and by agent_id. Window management truncates older turns when context exceeds `maxWindow` (default 50). Methods: `createSession()`, `addTurn()`, `getHistory()`, `getSessions()`, `deleteSession()`, `deleteAgentSessions()`, `formatForClaude()`.

### runtime/turnPipeline.ts (conversation loop)
Core text conversation pipeline: load agent identity, load conversation history, assemble context, call Claude API, store turn, track usage. Uses `getAnthropicClient()` singleton. Falls back to agent's `fallback_response` on API error. `UsageTracker` records per-agent token usage (input/output/tts/stt). No audio processing yet (Phase 2).

### runtime/safetyGuardrails.ts (safety prompt)
Generates the safety prompt section injected into every agent's system prompt at the runtime level (PRD-001 Section 6.3). Single source of truth for safety rules: age-appropriate content, no PII, medical/legal redirects, no impersonation, no harmful content, no dangerous activities, encourage learning. Exports `generateSafetyPrompt()` and `hasSafetyGuardrails()` for validation.

### runtime/knowledgeBackpack.ts (knowledge backpack)
In-memory per-agent document store with TF-IDF keyword search. Stores `BackpackSource` documents (title, content, metadata). `addSource()`, `removeSource()`, `search(query)` returns ranked `SearchResult[]`. `buildContext(query)` assembles relevant sources into a prompt-injectable context string. No vector DB, no embeddings — simple tokenization and term frequency/inverse document frequency scoring.

### runtime/studyMode.ts (study mode)
Spaced-repetition tutoring from Knowledge Backpack content. Generates `QuizQuestion` objects programmatically from backpack sources (fill-in-the-blank from key sentences). Tracks `StudyProgress` per agent: correct/total answers, source coverage. Ensures all sources are quizzed before repeating. Methods: `generateQuiz()`, `submitAnswer()`, `getProgress()`, `resetProgress()`.

### runtime/contentFilter.ts (content filter)
Post-processing regex-based filter for agent responses. Detects and redacts PII patterns (email, phone, physical address). Flags inappropriate topic indicators. Returns `FilterResult` with filtered content, flagged boolean, and descriptive flags array. No AI-powered filtering — lightweight regex patterns only.

### runtime/usageLimiter.ts (usage limiter)
Per-agent usage limit enforcement with tiered usage (free/basic/unlimited). Tracks daily turn counts and monthly token budgets. `checkLimit(agentId)` returns `LimitCheckResult` with allowed boolean and remaining turns. `recordUsage(agentId, tokens)` updates counters. Auto-resets daily/monthly counters.

### runtime/consentManager.ts (consent manager)
Parental consent tracking for COPPA compliance. Three consent levels: `full_transcripts` (full history retained), `session_summaries` (only summaries), `no_history` (nothing retained). `ConsentRecord` tracks kid_id, parent_email, consent_level, granted_at, expires_at. Methods: `setConsent()`, `getConsent()`, `hasConsent()`, `revokeConsent()`. Default level: `session_summaries`.

### flashStrategy.ts (flash strategy abstraction)
Defines `FlashStrategy` interface with `checkPrerequisites()` and `flash()` methods. Two implementations: `MpremoteFlashStrategy` for MicroPython file-by-file flash via mpremote, and `EsptoolFlashStrategy` for binary firmware flash via esptool. Factory function `selectFlashStrategy(method, hw)` dispatches based on the device manifest's `deploy.method` field. `EsptoolFlashStrategy` resolves the esptool command (tries `esptool.py`, `esptool`, then `python3 -m esptool`), detects serial port via USB VID:PID, writes runtime config as JSON, and streams flash progress. 120s timeout.

### redeployClassifier.ts (redeploy decision matrix)
Pure function `classifyChanges(oldSpec, newSpec)` compares two NuggetSpec objects and returns `{ action: 'config_only' | 'firmware_required' | 'no_change', reasons: string[] }`. Compares `devices` array (plugin IDs, field values), `deployment` section, and `runtime` config. Firmware fields (WiFi SSID/password, wake word, LoRa, device name) trigger `firmware_required`. Runtime config changes (agent name, voice, display theme, greeting) are `config_only`. Used by `RuntimeProvisioner.classifyChanges()`.

### artAgentMeeting.ts (art agent meeting type)
Registers the `art-agent` meeting type with `canvasType: 'theme-picker'`. Triggers on `deploy_started` when a BOX-3 device is present. Agent persona is "Pixel" (Art Director). Frontend canvas: `ThemePickerCanvas.tsx`. `registerArtAgentMeeting(registry)` called at startup.

### specGraph.ts (spec graph service)
Manages a persistent directed graph of NuggetSpecs. In-memory `Map<string, SpecGraph>` with JSON persistence to `.elisa/spec-graph.json`. Nodes wrap NuggetSpecs with labels and timestamps. Edges represent `depends_on`, `provides_to`, `shares_interface`, or `composes_into` relationships. Validates no self-edges or duplicate edges. DFS cycle detection with 3-color marking. Atomic save (write .tmp, rename). `buildGraphContext(graphId, excludeNodeId?)` generates human-readable summary for MetaPlanner prompt injection. Methods: `create()`, `load()`, `save()`, `addNode()`, `removeNode()` (cascades edges), `updateNode()`, `addEdge()`, `removeEdge()`, `getNeighbors()`, `detectCycles()`, `buildGraphContext()`, `getGraph()`, `deleteGraph()`. Types in `models/specGraph.ts`.

### compositionService.ts (nugget composition)
Orchestrates nugget composition and detects emergent behavior. `compose(graphId, nodeIds, systemLevel?)` validates, resolves interfaces, detects emergence, merges NuggetSpec fields (requirements, tests, skills, rules, portals). `detectEmergence()` finds three patterns: feedback_loop (A↔B via provides/requires), pipeline (A→B→C chain of 3+), hub (one node provides to 3+ others). `resolveInterfaces()` matches requires to provides by name and type. `validateComposition()` checks level gating via `getMaxNuggets()`, node existence, no cycles. `detectCrossNuggetImpact(graphId, changedNodeId)` finds affected nodes via edges and provides/requires matching, returns severity (none/minor/breaking). Types in `models/composition.ts`.

### integrationAgentMeeting.ts (integration meeting type)
Registers the `integration-agent` meeting type with `canvasType: 'interface-designer'`. Triggers on `composition_started` when a composed build begins. Agent persona is "Interface Designer" — helps kids connect nuggets together. `registerIntegrationAgentMeeting(registry)` called at startup.

### runtimeProvisioner.ts (provisioner interface)
Interface for agent provisioning during deploy. `StubRuntimeProvisioner`: returns mock values for dev/tests. `LocalRuntimeProvisioner`: delegates to the in-process `AgentStore` for real provisioning. Both implement `classifyChanges()` which delegates to `redeployClassifier` for firmware field detection, then checks manifest `config_fields` whitelist.

## Interaction Pattern

```
Orchestrator.run(spec)
  |-> autoMatchTests(spec, send)        Explorer: auto-generate tests for when_then reqs
  |-> PlanPhase.execute(ctx, spec)      returns tasks, agents, DAG
  |-> ExecutePhase.execute(ctx)
  |     streaming-parallel pool of ready tasks (up to 3 concurrent):
  |       AgentRunner.execute(prompt)   returns result + tokens
  |       GitService.commit()           serialized via mutex
  |       TeachingEngine.check()        returns teaching moment (if any)
  |       ContextManager.update()       writes summary + structural digest
  |-> TestPhase.execute(ctx)            returns test results + coverage
  |-> DeployPhase.deploy*(ctx)          web preview, device flash, or portal deploy
```

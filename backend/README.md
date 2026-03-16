# Elisa Backend

Express 5 + WebSocket server. Orchestrates AI agents, manages build sessions, and handles hardware integration.

## Stack

- Express 5, TypeScript 5.9, tsx (runtime)
- ws 8 (WebSocket)
- simple-git 3 (git operations)
- serialport 12 (ESP32 communication)
- @anthropic-ai/sdk + @anthropic-ai/claude-agent-sdk (Claude API + Agent SDK)
- zod 4 (validation)
- archiver 7 (zip streaming for nugget export)

## Dev Commands

```bash
npm run dev          # Start with tsx watch (port 8000, auto-reload)
npm run start        # Production start
npm run test         # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
```

## Structure

```
src/
  server.ts              Express app, route registration, WebSocket upgrade
  routes/
    sessions.ts          /api/sessions/* endpoints (create, start, stop, fix, launch, gate, question, export)
    hardware.ts          /api/hardware/* endpoints (detect, flash)
    skills.ts            /api/skills/* endpoints (run, answer, list)
    workspace.ts         /api/workspace/* endpoints (save, load design files)
    devices.ts           /api/devices endpoint (list device plugin manifests)
    meetings.ts          /api/sessions/:id/meetings/* endpoints (accept, decline, message, end, start, outcome, materialize)
    runtime.ts           /v1/agents/* endpoints (provision, update, delete, turn, history, heartbeat)
    specGraph.ts         /api/spec-graph/* endpoints (CRUD, compose, impact, interfaces)
  models/
    session.ts           Type definitions: Session, Task, Agent, BuildPhase, WSEvent
  services/
    orchestrator.ts      Build pipeline coordinator: delegates to phase handlers in sequence
    sessionStore.ts      Consolidated session state with JSON persistence

    Core Planning & Execution:
    metaPlanner.ts       NuggetSpec -> task DAG decomposition (Claude API)
    agentRunner.ts       Runs agents via SDK query() API per task
    gitService.ts        Per-session git repo init + commits
    taskExecutor.ts      Single-task execution pipeline (retry, agent run, git, context chain)
    promptBuilder.ts     Prompt construction for agent tasks (system prompt, predecessors, skills, digests)
    contextManager.ts    Builds file manifests, nugget context, structural digests, state snapshots

    Testing & Validation:
    testRunner.ts        pytest / Node test runner + coverage parsing
    autoTestMatcher.ts   Explorer-level auto-generation of behavioral tests
    specValidator.ts     Zod schema for NuggetSpec validation

    Hardware & Deployment:
    hardwareService.ts   ESP32 detect/compile/flash/serial monitor
    flashStrategy.ts     FlashStrategy interface + implementation (Mpremote, Esptool)
    cloudDeployService.ts Google Cloud Run deployment (scaffold, gcloud CLI)
    portalService.ts     Portal adapters (MCP, CLI) with command allowlist
    deployOrder.ts       Device deploy ordering (provides/requires DAG)

    Learning & Feedback:
    teachingEngine.ts    Contextual learning moments (curriculum + Claude)
    narratorService.ts   Narrator messages for build events (Claude Haiku)
    skillRunner.ts       Step-by-step SkillPlan execution (ask_user, branch, run_agent)
    permissionPolicy.ts  Auto-resolves agent permission requests

    Device Management:
    deviceRegistry.ts    Loads device plugin manifests, provides block defs + agent context
    runtimeProvisioner.ts Interface + implementations for agent provisioning

    Meeting System:
    meetingRegistry.ts   Meeting type registry + trigger engine for build events
    meetingService.ts    In-memory meeting session lifecycle management
    meetingAgentService.ts  Claude-powered agent responses for meeting chat (Haiku)
    meetingMaterializer.ts  Materializes canvas data into real workspace files
    meetingTriggerWiring.ts  Wires meeting triggers into orchestrator pipeline
    taskMeetingTypes.ts  Task-level meeting types (design review before art/visual tasks)
    buddyAgentMeeting.ts Buddy Agent meeting type (canvasType: explain-it)
    artAgentMeeting.ts   Art Agent meeting type for BOX-3 display theme customization
    architectureAgentMeeting.ts  Architecture Agent meeting type (canvasType: blueprint)
    docAgentMeeting.ts   Documentation Agent meeting type
    mediaAgentMeeting.ts Marketing Agent meeting type (canvasType: campaign)
    webDesignAgentMeeting.ts  Web Designer Agent meeting type
    socialMediaAgentMeeting.ts  Social Media Agent meeting type
    integrationAgentMeeting.ts  Integration meeting type for nugget composition

    System Health & Analytics:
    healthTracker.ts     System health vital signs (score 0-100, grades)
    healthHistoryService.ts  Health-over-time persistence
    traceabilityTracker.ts  Requirement-to-test traceability map + coverage tracking
    feedbackLoopTracker.ts Passive feedback loop observer with convergence tracking
    impactEstimator.ts   Pre-execution complexity analysis
    boundaryAnalyzer.ts  System boundary analysis (inputs, outputs, boundary portals)

    Composition & Spec Graph:
    specGraph.ts         Directed graph of NuggetSpecs with persistence
    compositionService.ts  Nugget composition orchestrator with emergence detection

    System Level & Mastery:
    systemLevelService.ts  Progressive mastery level flags (Explorer/Builder/Architect)
    redeployClassifier.ts  Redeploy decision matrix (classifyChanges -> action + reasons)
    phases/
      planPhase.ts       MetaPlanner invocation, DAG setup
      executePhase.ts    Task execution loop (parallel, git mutex, context chain)
      testPhase.ts       Test runner invocation, result reporting
      deployPhase.ts     Device flash, portal deployment, web preview
      deployOrder.ts     Device deploy ordering (provides/requires DAG)
  prompts/               Agent role prompts + curriculum templates
  utils/                 DAG, validation, logging, tokens, context, timeout
```

## Build Pipeline

Orchestrator delegates to phase handlers in sequence:

1. **Plan** -- `MetaPlanner.plan(spec)` decomposes NuggetSpec into a task DAG. Validates for cycles. Retries on parse failure.
2. **Execute** -- Up to 3 tasks run concurrently via Promise.race pool. Each task: `AgentRunner.execute()` -> `GitService.commit()` -> `TeachingEngine.check()`.
3. **Test** -- `TestRunner.runTests()` runs pytest or Node test runner. Parses output + coverage.
4. **Deploy** -- `HardwareService.flash()` for ESP32, `CloudDeployService` for Cloud Run, `PortalService` for portal connections.

All state is in-memory with optional JSON persistence. No database.

## Adding a New API Endpoint

1. Add the route handler in the appropriate file under `routes/`.
2. Register it in `server.ts`.
3. If it emits WebSocket events, add the event type to the `WSEvent` union in the types file.
4. Update the [API Reference](../docs/api-reference.md).

## Adding a New Agent Role

1. Add the role to the `AgentRole` type.
2. Update `MetaPlanner` prompt to understand the new role.
3. Configure any role-specific behavior in `AgentRunner`.
4. Add a corresponding block type in the frontend if users should be able to select it.

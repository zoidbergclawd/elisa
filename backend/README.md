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
    sessions.ts          /api/sessions/* endpoints (create, start, stop, gate, question, export)
    hardware.ts          /api/hardware/* endpoints (detect, flash)
    skills.ts            /api/skills/* endpoints (run, answer, list)
    workspace.ts         /api/workspace/* endpoints (save, load design files)
    devices.ts           /api/devices endpoint (list device plugin manifests)
  models/
    session.ts           Type definitions: Session, Task, Agent, BuildPhase, WSEvent
  services/
    orchestrator.ts      Thin coordinator: delegates to phase handlers in sequence
    sessionStore.ts      Consolidated session state with JSON persistence
    metaPlanner.ts       NuggetSpec -> task DAG decomposition (Claude API)
    agentRunner.ts       Runs agents via SDK query() API per task
    gitService.ts        Per-session git repo init + commits
    testRunner.ts        pytest / Node test runner + coverage parsing
    hardwareService.ts   ESP32 detect/compile/flash/serial monitor
    teachingEngine.ts    Contextual learning moments (curriculum + Claude)
    skillRunner.ts       Step-by-step SkillPlan execution (ask_user, branch, run_agent)
    narratorService.ts   Narrator messages for build events (Claude Haiku)
    permissionPolicy.ts  Auto-resolves agent permission requests
    deviceRegistry.ts    Loads device plugin manifests, provides block defs + agent context
    cloudDeployService.ts Google Cloud Run deployment (scaffold, gcloud CLI)
    portalService.ts     Portal adapters (MCP, CLI) with command allowlist
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

# Elisa Backend

Express 5 + WebSocket server. Orchestrates AI agents, manages build sessions, and handles hardware integration.

## Stack

- Express 5, TypeScript 5.9, tsx (runtime)
- ws 8 (WebSocket)
- simple-git 3 (git operations)
- serialport 12 (ESP32 communication)
- @anthropic-ai/sdk (Claude API for planner/teaching)
- zod 4 (validation)

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
  server.ts            Express app, route registration, WebSocket upgrade
  routes/
    sessions.ts        /api/sessions/* endpoints
    hardware.ts        /api/hardware/* endpoints
  services/
    orchestrator.ts    Central build pipeline controller
    metaPlanner.ts     ProjectSpec -> task DAG decomposition (Claude API)
    agentRunner.ts     Runs agents via SDK query() API per task
    gitService.ts      Per-session git repo init + commits
    testRunner.ts      pytest execution + coverage parsing
    hardwareService.ts ESP32 detect/compile/flash/serial monitor
    teachingEngine.ts  Concept curriculum, dedup, Claude Sonnet fallback
```

## Service Architecture

**Build pipeline** (managed by Orchestrator):

1. `MetaPlanner.plan(spec)` -- Calls Claude (model: `claude-opus-4-6`) to decompose ProjectSpec into a task DAG with dependencies. Validates for cycles. Retries on parse failure.
2. **Task execution loop** -- For each ready task:
   - `AgentRunner.execute(prompt)` -- Calls SDK `query()` to run agent. Streams output/tokens via async iteration. Timeout: 300s, retries: 2, model: `claude-opus-4-6`.
   - `GitService.commit()` -- Commits changes with agent attribution.
   - `TeachingEngine.check()` -- Surfaces teaching moments (deduped per concept per session). Falls back to Claude Sonnet.
3. `TestRunner.runTests()` -- Runs `pytest tests/ -v --cov=src`. Parses output. Timeout: 120s.
4. `HardwareService.flash()` -- If ESP32 target: detect USB, compile with `py_compile`, flash via `mpremote`. Timeout: 60s.

All state is in-memory. No database. Each session gets a temp workspace directory.

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

# Elisa Architecture

Elisa is a kid-friendly IDE that orchestrates AI agent teams to build real software and hardware nuggets. Kids compose nugget specs using visual blocks (Blockly); the backend decomposes specs into task DAGs, executes them via the Claude Agent SDK, and streams results back in real-time.

## System Topology

```
Electron main process (electron/main.ts)
  |-> Loads API key from encrypted store (OS keychain via safeStorage)
  |-> Picks a free port
  |-> Starts Express server in-process
  |-> Opens BrowserWindow -> http://localhost:{port}

frontend/ (React 19 + Vite)         backend/ (Express 5 + TypeScript)
+-----------------------+           +---------------------------+
| Blockly Editor        |  REST     | Express Server            |
| (BlockCanvas)         |---------->| POST /api/sessions/:id/*  |
|                       |           |                           |
| MissionControl        |  WS      | Orchestrator              |
| (TaskDAG, CommsFeed,  |<---------|  -> MetaPlanner (Claude)   |
|  Metrics, Deploy)     |  events  |  -> AgentRunner (SDK)      |
|                       |           |  -> TestRunner (pytest)    |
| BottomBar             |           |  -> GitService (simple-git)|
| (Git, Tests, Board,   |           |  -> HardwareService       |
|  Teaching)            |           |  -> TeachingEngine         |
|                       |           |  -> DeviceRegistry         |
| FlashWizardModal      |           |     (plugin manifests)     |
| (multi-device flash)  |           |                           |
+-----------------------+           +---------------------------+
                                              |
                                    runs agents via SDK query() API
                                    per task (async streaming)
```

In production, Express serves everything: `/api/*` (REST), `/ws/*` (WebSocket), and `/*` (built frontend static files). CORS is unnecessary (same-origin). In dev mode, the frontend runs on Vite (port 5173) with proxy to backend (port 8000), and CORS is enabled.

## Monorepo Layout

```
elisa/
  package.json       Root package: Electron deps, build/dev/dist scripts
  electron/          Electron main process, preload, settings dialog
  frontend/          React SPA - visual block editor + real-time dashboard
  backend/           Express server - orchestration, agents, hardware
  scripts/           Build tooling (esbuild backend bundler)
  devices/           Device plugins (manifest + templates + prompts)
  docs/              Product requirements (elisa-prd.md)
```

Root `package.json` manages Electron and build tooling. Frontend and backend remain independent Node.js projects with their own `package.json`.

## Data Flow: Build Session Lifecycle

```
1. User arranges blocks in Blockly editor
2. Click GO -> blockInterpreter converts workspace to NuggetSpec JSON
3. POST /api/sessions (create) -> POST /api/sessions/:id/start (with spec)
4. Backend Orchestrator.run():
   a. PLAN:    MetaPlanner calls Claude API to decompose spec into task DAG
   b. EXECUTE: Streaming-parallel pool (Promise.race, up to 3 concurrent tasks)
                Each agent gets: role prompt + task description + context from prior tasks
                Agent output streams via SDK -> WebSocket events to frontend
                Git commit after each completed task (serialized via mutex)
                Token budget tracked per agent; warning at 80%, halt on exceed
   c. TEST:    TestRunner executes pytest, parses results + coverage
   d. REVIEW:  Optional reviewer agent pass
   e. DEPLOY:  Surface before_deploy rules as deploy_checklist event
               If web: build -> find serve dir -> start local HTTP server -> open browser
               If devices: resolveDeployOrder -> flash wizard per device
               If CLI portals: execute via CliPortalAdapter (no shell)
5. session_complete event with summary
```

Human gates can pause execution at any point, requiring user approval via REST endpoint.

### Device Plugin System

Device plugins live in `devices/<plugin-id>/` and follow a manifest-driven convention:
- `device.json` — Zod-validated manifest (board info, capabilities, Blockly blocks, deploy config)
- `prompts/agent-context.md` — Injected into builder agent prompts for hardware-specific guidance
- `templates/` — MicroPython templates for code generation
- `lib/` — Shared MicroPython libraries flashed alongside user code

The `DeviceRegistry` service loads all plugins at startup, validates manifests, and provides:
- Block definitions for dynamic Blockly registration in the frontend
- Agent context injection via `getAgentContext()` in `formatTaskPrompt()`
- Deploy ordering via `resolveDeployOrder()` (provides/requires DAG)

## Communication Protocol

| Channel | Direction | Purpose |
|---------|-----------|---------|
| REST | client -> server | Commands: create session, start build, gate responses, question answers |
| WebSocket | server -> client | Events: task progress, agent output, test results, teaching moments, errors |

WebSocket path: `/ws/session/:sessionId`

In dev mode, Vite (port 5173) proxies `/api/*` and `/ws/*` to backend (port 8000). In production (Electron), Express serves the frontend statically on the same port -- no proxy needed.

## Core Abstractions

### NuggetSpec
JSON schema produced by blockInterpreter from Blockly workspace. Drives the entire pipeline. Contains: goal, requirements, style, agents, deployment target, workflow flags, skills, rules, portals, devices.

### Task DAG
Directed acyclic graph of tasks with dependencies. Generated by MetaPlanner. Executed in topological order by Orchestrator. Uses Kahn's algorithm (`utils/dag.ts`).

### Build Session
In-memory state for one execution run. Tracks: session ID, phase, tasks, agents, commits, events, teaching moments, test results, token usage. No database - everything lives in memory.

### Agent Roles
- **Builder**: Writes source code
- **Tester**: Writes and runs tests
- **Reviewer**: Reviews code quality
- **Custom**: User-defined persona

Each agent runs via the Claude Agent SDK's `query()` API with role-specific system prompts injected from `backend/src/prompts/`.

## State Machine

```
idle -> planning -> executing -> testing -> reviewing -> deploying -> done
                       ^                                               |
                   human gates (pause/resume via REST)          keep working
                                                                       |
                                                                       v
                                                                    design (iterative build)
```

## Key Patterns

- **Event-driven UI**: All frontend state updates flow through WebSocket event handlers. No polling.
- **Agent isolation**: Each agent task runs as a separate SDK `query()` call. No shared state between agents except via context summaries written to `.elisa/` in the workspace.
- **Context chain**: After each task, a summary is written to `.elisa/context/nugget_context.md`. Subsequent agents receive this as input, creating a chain of context.
- **Graceful degradation**: Missing tools (git, pytest, mpremote, serialport) cause warnings, not crashes.
- **Bearer token auth**: Server generates a random auth token on startup. All `/api/*` routes (except `/api/health`) require `Authorization: Bearer <token>`. WebSocket upgrades require `?token=<token>` query param. In Electron, token is shared to renderer via IPC.
- **Content safety**: All agent prompts include a Content Safety section enforcing age-appropriate output (ages 8-14). User-controlled placeholder values are sanitized before prompt interpolation.
- **Abort propagation**: Orchestrator's AbortController signal is forwarded to each agent's SDK `query()` call. On cancel or error, agents are aborted immediately.
- **API key management**: In dev, read from `ANTHROPIC_API_KEY` env var. In Electron, encrypted via OS keychain (`safeStorage`) and stored locally. Child processes (test runners, flash scripts, builds) receive sanitized env without the API key.

## Storage

- **Session state**: In-memory `Map<sessionId, Session>` with optional JSON persistence for crash recovery
- **Workspace**: Temp directory per session (`/tmp/elisa-nugget-{timestamp}`) or user-chosen directory. Contains generated code, tests, git repo, `.elisa/` metadata, and design artifacts (nugget.json, dag.json, workspace.json, etc.)
- **localStorage**: Workspace JSON, skills, and rules auto-saved in browser (`elisa:workspace`, `elisa:skills`, `elisa:rules`). Restored on page load.
- **Nugget files**: `.elisa` zip format for export/import (workspace + skills + rules + generated code)
- **No database**

## Hardware Path

ESP32 support via serialport library:
1. Detect boards by USB VID:PID (Heltec LoRa, ESP32-S3, CH9102)
2. Compile MicroPython via `py_compile`
3. Flash via `mpremote`
4. Serial monitor at 115200 baud, streamed to frontend via WebSocket

### Device Plugin Deploy

Multi-device builds use the device plugin system:
1. `DeployPhase.shouldDeployDevices()` checks if spec has `devices` array
2. `resolveDeployOrder()` sorts devices by provides/requires dependency DAG
3. `FlashWizardModal` prompts the user to connect each device sequentially (`flash_prompt` event)
4. Each device is flashed with files from its plugin manifest (`flash_progress` / `flash_complete` events)
5. Shared libraries from `devices/_shared/` are included automatically

## Module-Level Documentation

Deeper context for each subsystem lives in CLAUDE.md files within each directory:
- `frontend/CLAUDE.md` - Frontend architecture, component tree, state management
- `backend/CLAUDE.md` - Backend architecture, services, API surface
- `backend/src/services/CLAUDE.md` - Service responsibilities and interactions
- `frontend/src/components/CLAUDE.md` - Component hierarchy and patterns

## Electron Packaging

Elisa is distributed as an Electron desktop app. The build pipeline:
1. `npm run build:frontend` -- Vite builds React SPA into `frontend/dist/`
2. `npm run build:backend` -- esbuild bundles Express server into `backend/dist/server-entry.js`
3. `npm run build:electron` -- tsc compiles `electron/main.ts` and `preload.ts`
4. `npm run dist` -- electron-builder packages into installer (NSIS on Windows, DMG on macOS)

Dev mode (`npm run dev` at root): runs backend, frontend, and Electron concurrently. Electron loads `http://localhost:5173` (Vite HMR). Production: Electron loads `http://localhost:{free port}` where Express serves everything.

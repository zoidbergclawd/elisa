# Development Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Python 3.10+ (optional, for test runner)
- `ANTHROPIC_API_KEY` environment variable

## Setup

```bash
git clone https://github.com/zoidbergclawd/elisa.git
cd elisa
npm install              # Installs root + backend + frontend deps
npm run dev:electron     # Launches backend, frontend, and Electron window
```

## npm Scripts

### Root (repo root)

| Script | What It Does |
|--------|-------------|
| `npm run dev` | Start backend + frontend (browser-only, no Electron) |
| `npm run dev:electron` | Start backend + frontend + Electron window |
| `npm run build:frontend` | Vite production build → `frontend/dist/` |
| `npm run build:backend` | esbuild bundle → `backend/dist/server-entry.js` |
| `npm run build:electron` | tsc compile `electron/main.ts` + `preload.ts` |
| `npm run dist` | electron-builder → installer (NSIS/DMG) |

### Backend (`cd backend`)

| Script | What It Does |
|--------|-------------|
| `npm run dev` | Start with tsx watch (port 8000, auto-reload) |
| `npm run start` | Production start |
| `npm run test` | Vitest (single run) |
| `npm run test:watch` | Vitest (watch mode) |

### Frontend (`cd frontend`)

| Script | What It Does |
|--------|-------------|
| `npm run dev` | Dev server (port 5173, proxies /api and /ws to backend) |
| `npm run build` | Type-check + production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (single run) |
| `npm run test:watch` | Vitest (watch mode) |

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Yes | — | Claude API/SDK access |
| `CLAUDE_MODEL` | No | `claude-opus-4-6` | Override agent model |
| `NARRATOR_MODEL` | No | `claude-haiku-4-5-20241022` | Override narrator model |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Override CORS origin in dev |
| `PORT` | No | `8000` | Backend port |

## Project Structure

```
elisa/
  package.json          Root: Electron deps, build/dev scripts
  electron/             Electron main process, preload, settings
  frontend/             React 19 + Vite 7 SPA
    src/components/     UI component tree
    src/hooks/          React hooks (session, health, WebSocket)
    src/lib/            Utilities (nugget files, skill templates)
    src/types/          TypeScript definitions
  backend/              Express 5 + TypeScript server
    src/routes/         REST endpoint handlers
    src/services/       Core services (orchestrator, runners, hardware)
    src/services/phases/ Pipeline stages (plan, execute, test, deploy)
    src/prompts/        Agent role prompts + curriculum
    src/utils/          DAG, validation, logging, tokens
    src/tests/          Backend tests
  hardware/             ESP32 templates + shared MicroPython library
  scripts/              Build tooling (esbuild bundler)
  docs/                 Documentation
```

## Testing

Both backend and frontend use Vitest.

- **Backend tests**: `cd backend && npm test`
- **Frontend tests**: `cd frontend && npm test`
- Test files are colocated with source (`.test.ts` / `.test.tsx`)
- Behavioral/integration tests live in `backend/src/tests/behavioral/`

### Bug Fix Testing Requirement

Every bug fix **must** include tests that:
1. Reproduce the failure (the test would fail if the bug were reintroduced)
2. Prove the fix works

## How to Add a New API Endpoint

1. Add the route handler in the appropriate file under `backend/src/routes/`.
2. Register it in `backend/src/server.ts`.
3. If it emits WebSocket events, add the event type to the `WSEvent` union in the types file.
4. Update the [API Reference](API-Reference).
5. Update `backend/CLAUDE.md` API table.

## How to Add a New Block Type

1. Define the block in `frontend/src/components/BlockCanvas/blockDefinitions.ts` following existing patterns (colour, fields, connections).
2. Add it to the appropriate category in `frontend/src/components/BlockCanvas/toolbox.ts`.
3. Add interpretation logic in `frontend/src/components/BlockCanvas/blockInterpreter.ts` to map it into NuggetSpec.
4. Rebuild and test — the block appears in the palette automatically.

## How to Add a New Agent Role

1. Add the role to the `AgentRole` type in the backend types.
2. Create a new prompt template in `backend/src/prompts/`.
3. Update `MetaPlanner` prompt to understand the new role.
4. Configure any role-specific behavior in `AgentRunner`.
5. Add a corresponding block type in the frontend if users should be able to select it.

## Conventions

- No database. Session state is in-memory with optional JSON persistence.
- Each agent task runs via the Claude Agent SDK's `query()` API.
- Frontend communicates via REST (commands) + WebSocket (events).
- Blockly workspace → NuggetSpec JSON (Zod-validated) → backend orchestration pipeline.
- Up to 3 tasks execute concurrently when DAG dependencies allow.
- Functional components only, Tailwind utility classes for all styling.
- Status colors: blue=working, green=done, red=error, yellow=warning.

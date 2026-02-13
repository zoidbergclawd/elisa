# Elisa Project Instructions

## Start Here

**Read `docs/INDEX.md` first.** It is the master index of the project's directory structure, documentation, and key source files. Use it to orient before diving into code.

## Architecture Documentation

This project maintains an architectural map for both human and agent use:
- `docs/INDEX.md` - Master index: directory map, documentation map, key source files, data flow
- `ARCHITECTURE.md` (repo root) - System-level overview
- `CLAUDE.md` files in `frontend/`, `backend/`, `backend/src/services/`, `frontend/src/components/`

### Staleness Prevention

When making changes that alter the architecture, **update the relevant docs in the same commit**:

| Change Type | Update |
|-------------|--------|
| New module/service/component | Add to relevant CLAUDE.md + ARCHITECTURE.md if it changes system topology. Add to `docs/INDEX.md` key source files and directory map. |
| Removed module/service/component | Remove from relevant CLAUDE.md + ARCHITECTURE.md + `docs/INDEX.md` |
| New API endpoint | Add to `backend/CLAUDE.md` API table |
| New WebSocket event type | Add to `backend/CLAUDE.md` event list |
| Changed data flow or state machine | Update ARCHITECTURE.md diagram + `docs/INDEX.md` data flow |
| New dependency (major library) | Add to relevant module CLAUDE.md stack section |
| New documentation file | Add to `docs/INDEX.md` documentation map table |
| New top-level directory or significant subdirectory | Add to `docs/INDEX.md` directory map |

Do NOT update docs for internal implementation changes that don't affect the structural map.

## Tech Stack

- **Desktop**: Electron 35, electron-builder (packaging), electron-store + safeStorage (API key encryption)
- **Frontend**: React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, Blockly 12
- **Backend**: Express 5, TypeScript 5.9, ws 8, Zod 4 (validation), Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- **Hardware**: MicroPython on ESP32 via serialport + mpremote
- **Build**: esbuild (backend bundling), tsc (Electron), Vite (frontend)
- **Testing**: Vitest + Testing Library (frontend), Vitest (backend)

## Environment Variables

- `ANTHROPIC_API_KEY` -- Required for Claude API/SDK access
- `CLAUDE_MODEL` -- Override agent model (default: `claude-opus-4-6`)
- `CORS_ORIGIN` -- Override CORS origin in dev mode (default: `http://localhost:5173`)
- `PORT` -- Backend port (default: 8000)

## Dev Setup

```
# Option 1: Electron (recommended)
npm install && npm run dev    # runs backend + frontend + Electron window

# Option 2: Without Electron (two terminals)
cd backend && npm install && npm run dev    # port 8000
cd frontend && npm install && npm run dev   # port 5173 (proxies to 8000)
```

## Bug Fix Testing Requirement

Every bug fix **must** include tests that:
1. Reproduce the failure (the test would fail if the bug were reintroduced)
2. Prove the fix works

No bug fix is complete without a regression test.

## Conventions

- No database. Session state is in-memory with optional JSON file persistence for crash recovery. Auto-cleanup after 5-min grace period.
- Each agent task runs via the Claude Agent SDK's `query()` API.
- Frontend communicates via REST (commands) + WebSocket (events).
- Blockly workspace -> NuggetSpec JSON (Zod-validated) -> backend orchestration pipeline.
- NuggetSpec validated server-side via Zod schema (`backend/src/utils/specValidator.ts`). Portal commands restricted to allowlist.
- Up to 3 tasks execute concurrently (streaming-parallel via Promise.race pool) when DAG dependencies allow. Token budget enforced (default 500k).
- SessionLogger writes per-session logs to `.elisa/logs/` in nugget workspace.

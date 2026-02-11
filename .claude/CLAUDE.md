# Elisa Project Instructions

## Architecture Documentation

This project maintains an architectural map for both human and agent use:
- `ARCHITECTURE.md` (repo root) - System-level overview
- `CLAUDE.md` files in `frontend/`, `backend/`, `backend/src/services/`, `frontend/src/components/`

### Staleness Prevention

When making changes that alter the architecture, **update the relevant docs in the same commit**:

| Change Type | Update |
|-------------|--------|
| New module/service/component | Add to relevant CLAUDE.md + ARCHITECTURE.md if it changes system topology |
| Removed module/service/component | Remove from relevant CLAUDE.md + ARCHITECTURE.md |
| New API endpoint | Add to `backend/CLAUDE.md` API table |
| New WebSocket event type | Add to `backend/CLAUDE.md` event list |
| Changed data flow or state machine | Update ARCHITECTURE.md diagram |
| New dependency (major library) | Add to relevant module CLAUDE.md stack section |

Do NOT update docs for internal implementation changes that don't affect the structural map.

## Tech Stack

- **Frontend**: React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, Blockly 12
- **Backend**: Express 5, TypeScript 5.9, ws 8, Claude Code CLI
- **Hardware**: MicroPython on ESP32 via serialport + mpremote
- **Testing**: Vitest + Testing Library (frontend), Vitest (backend)

## Dev Setup

```
# Terminal 1: Backend
cd backend && npm install && npm run dev    # port 8000

# Terminal 2: Frontend
cd frontend && npm install && npm run dev   # port 5173 (proxies to 8000)
```

## Conventions

- No database. All session state is in-memory.
- Each agent task runs as a separate `claude` CLI subprocess.
- Frontend communicates via REST (commands) + WebSocket (events).
- Blockly workspace -> ProjectSpec JSON -> backend orchestration pipeline.

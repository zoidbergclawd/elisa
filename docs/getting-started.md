# Getting Started

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ | Required |
| npm | 10+ | Comes with Node.js |
| `ANTHROPIC_API_KEY` | -- | Environment variable. Get one at [console.anthropic.com](https://console.anthropic.com) |
| Claude Agent SDK | -- | Installed automatically via `npm install` in the backend. |
| Python + pytest | 3.10+ | Optional. Only needed if builds include test tasks. |
| ESP32 + mpremote | -- | Optional. Only needed for hardware deployment. `pip install mpremote` |

## Install and Run

```bash
# Clone the repo
git clone https://github.com/your-org/elisa.git
cd elisa

# Terminal 1: Backend
cd backend
npm install
npm run dev          # Starts on port 8000

# Terminal 2: Frontend
cd frontend
npm install
npm run dev          # Starts on port 5173, proxies API to 8000
```

Open `http://localhost:5173` in your browser.

## First Build Session

1. **Design** -- Drag blocks from the palette onto the canvas. At minimum, add a `project_goal` block with a description of what you want to build.
2. **Press Go** -- The large floating button sends your block workspace to the backend as a ProjectSpec JSON.
3. **Watch** -- The right sidebar shows a task dependency graph. Agents appear, pick up tasks, and stream output. The bottom bar fills with git commits, test results, and teaching moments.
4. **Interact** -- If you placed a "check with me" block, the build pauses with a modal asking for your approval. Agents may also ask questions mid-build.
5. **Done** -- When the session completes, you have a working project with git history.

## Skills and Rules

After your first build, try extending your agents with custom Skills and Rules.

**Create a Skill** -- Open the Skills modal from the sidebar (wrench icon). Give it a name, a prompt, and a category (`agent`, `feature`, or `style`). Drag a "Use Skill" block onto the canvas to include it in your next build.

**Create a Rule** -- Open the Rules modal from the sidebar (shield icon). Rules are guardrails that trigger automatically (`always`, `on_task_complete`, `on_test_fail`, `before_deploy`). Drag an "Apply Rule" block onto the canvas.

**Composite Skills** -- Open the flow editor inside the Skills modal to chain steps together: ask the user a question, branch on the answer, run agents, and invoke other skills. Use `{{key}}` syntax to reference context variables between steps.

Skills and Rules have separate sidebar buttons for quick access.

## Troubleshooting

**Backend won't start** -- Confirm `ANTHROPIC_API_KEY` is set in your environment. The server needs it for the meta-planner and teaching engine.

**WebSocket disconnects** -- The frontend auto-reconnects. If the backend crashed, restart it and create a new session.

**ESP32 not detected** -- Check USB connection. Supported chips: CP210x (Heltec WiFi LoRa 32 V3), ESP32-S3 Native USB, CH9102.

**Tests fail with "pytest not found"** -- Install Python and pytest: `pip install pytest pytest-cov`. The test runner calls `pytest tests/ -v --cov=src`.

**Port conflicts** -- Backend defaults to 8000, frontend to 5173. Change in `backend/src/server.ts` and `frontend/vite.config.ts` respectively.

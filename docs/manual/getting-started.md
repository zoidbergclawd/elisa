# Getting Started

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js 20+ | Required. Download from [nodejs.org](https://nodejs.org) |
| Anthropic API key | Required. Get one at [console.anthropic.com](https://console.anthropic.com) |
| Python 3.10+ | Optional. Needed only if your builds include test tasks |
| ESP32 + mpremote | Optional. Needed only for hardware projects. Install with `pip install mpremote` |

## Install

### Option 1: Electron app (recommended)

```bash
git clone https://github.com/zoidbergclawd/elisa.git
cd elisa
npm install
npm run dev
```

This starts the backend, frontend, and opens the Elisa window automatically.

### Option 2: Dev mode (two terminals)

```bash
# Terminal 1: Backend
cd backend
npm install
npm run dev          # Starts on port 8000

# Terminal 2: Frontend
cd frontend
npm install
npm run dev          # Starts on port 5173
```

Open `http://localhost:5173` in your browser.

## Setting your API key

- **Electron app**: A settings dialog prompts you on first launch. Your key is encrypted and stored securely.
- **Dev mode**: Set the `ANTHROPIC_API_KEY` environment variable before starting the backend.

The readiness badge in the top-right corner shows "Ready" (green) when everything is configured. If it shows "Needs API Key" (yellow) or "Offline" (red), check the [Troubleshooting](troubleshooting.md) section.

## What you see on first launch

The main screen has three areas:

- **Header** -- The Elisa logo, tab bar (Workspace / Mission Control), the GO button, and a readiness badge.
- **Main area** -- The block editor canvas with a toolbox on the left and a sidebar on the right.
- **Bottom bar** -- Tabs for Timeline, Tests, Board, Learn, Progress, and Tokens. These fill up during a build.

On your very first launch, an Example Picker opens so you can start from a pre-built project.

## Your first build

> **Try it**: Pick the "Simple Web App" example from the Example Picker. It loads a Goal block, a Feature block, and a Deploy Web block onto the canvas. Press the green GO button. Choose a folder where Elisa should save the output. Watch Mission Control as minions plan tasks, write code, and deploy your app.

1. **Design** -- Drag blocks from the toolbox onto the canvas. At minimum, you need one Goal block with a description.
2. **Press GO** -- The green button in the header sends your design to the AI agents.
3. **Choose a folder** -- Elisa asks where to save the generated project files.
4. **Watch** -- The view switches to Mission Control where you can see the task graph, minion cards, and a narrator feed.
5. **Done** -- When the build completes, a "Nugget Complete!" dialog shows a summary and any teaching moments.

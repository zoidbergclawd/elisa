# Getting Started

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js 20+ | Required. Download from [nodejs.org](https://nodejs.org) |
| Anthropic API key | Required. Get one at [console.anthropic.com](https://console.anthropic.com) |
| Python 3.10+ | Optional. Needed only if your builds include test tasks |
| ESP32 + mpremote | Optional. Needed only for hardware projects. Install with `pip install mpremote` |

## Install

### Electron App (Recommended)

```bash
git clone https://github.com/zoidbergclawd/elisa.git
cd elisa
npm install
npm run dev:electron
```

This installs all dependencies (root, backend, and frontend) and launches the Electron app with backend, frontend, and the desktop window.

> **Important:** Always use `npm run dev:electron`. Do NOT use `npm run dev` — that starts backend + frontend in a browser only, without the Electron desktop window.

### Browser-Only (Dev Mode)

Only use this if you specifically need to run without Electron:

```bash
npm install
npm run dev    # backend (port 8000) + frontend (port 5173)
```

Open `http://localhost:5173` in your browser.

## Setting Your API Key

- **Electron app**: A settings dialog prompts you on first launch. Your key is encrypted and stored securely via the OS keychain (safeStorage).
- **Dev mode**: Set the `ANTHROPIC_API_KEY` environment variable before starting the backend.

The readiness badge in the top-right corner shows the connection status:

| Badge | Color | Meaning |
|-------|-------|---------|
| Ready | Green | Everything is configured and working |
| Checking... | Gray | Testing the connection |
| Needs API Key | Yellow | No API key, or the key is invalid |
| Offline | Red | Cannot reach the backend server |

## What You See on First Launch

The main screen has three areas:

- **Header** — The Elisa logo, tab bar (Workspace / Mission Control), the GO button, and a readiness badge.
- **Main area** — The block editor canvas with a toolbox on the left and a sidebar on the right.
- **Bottom bar** — Tabs for Timeline, Tests, Board, Learn, Progress, and Tokens. These fill up during a build.

On your very first launch, an Example Picker opens so you can start from a pre-built project.

## Your First Build

1. **Design** — Drag blocks from the toolbox onto the canvas. At minimum, you need one Goal block with a description. Or pick an example from the Example Picker.
2. **Press GO** — The green button in the header sends your design to the AI agents.
3. **Choose a folder** — Elisa asks where to save the generated project files.
4. **Watch** — The view switches to Mission Control where you can see the task graph, minion cards, and a narrator feed.
5. **Done** — When the build completes, a "Nugget Complete!" dialog shows a summary and any teaching moments.

> **Try it**: Pick the "Simple Web App" example from the Example Picker. It loads a Goal block, a Feature block, and a Deploy Web block onto the canvas. Press the green GO button. Choose a folder. Watch Mission Control as minions plan tasks, write code, and deploy your app.

## Next Steps

- Learn about the [Workspace Editor](Workspace-Editor) layout and controls
- Explore all available [blocks](Block-Reference)
- Understand the [build lifecycle](Building-a-Nugget)

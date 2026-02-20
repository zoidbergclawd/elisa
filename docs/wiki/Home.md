# Elisa

**A kid-friendly IDE where children orchestrate AI agent teams to build real software and hardware.**

Elisa is a visual programming tool inspired by Scratch. Kids snap together blocks to describe what they want to build — goals, features, style, agent teams, and deployment targets. Behind the scenes, those blocks drive AI agents (powered by Claude) that plan tasks, write code, run tests, and deploy the result. The output is real, working software: a website they can share, or code flashed to an ESP32 microcontroller.

Elisa is simultaneously a **teaching tool** and a **doing tool**. At every step, it explains engineering concepts — source control, testing, decomposition, code review — in kid-friendly language, woven into the act of building.

## Key Features

- **Visual Block Editor** — Drag-and-drop blocks (Blockly) to compose project specs. 10 block categories: Goals, Requirements, Style, Skills, Rules, Portals, Minions, Flow, Deploy, and Skill Flow.
- **AI Agent Teams** — Configure builder, tester, reviewer, and custom "minion" agents with personalities. Up to 3 agents work in parallel.
- **Real-time Mission Control** — Watch agents plan tasks, write code, and deploy in real time. Interactive task DAG, narrator feed, and minion status cards.
- **Skills & Rules** — Create reusable prompt snippets (skills) and guardrails (rules) that shape agent behavior. Composite skills chain multiple steps with a visual flow editor.
- **Portals** — Connect to external tools and hardware via MCP servers, CLI tools, or serial/USB devices.
- **Hardware Integration** — Detect, flash, and monitor ESP32 boards over USB. MicroPython compilation and serial monitor built in.
- **Teaching Layer** — Contextual learning moments explain concepts like git commits, testing, and decomposition as they happen.
- **Save & Share** — Auto-save to browser, save to folder, or export as `.elisa` nugget files. Bundled example projects to get started.

## Quick Start

```bash
git clone https://github.com/zoidbergclawd/elisa.git
cd elisa
npm install
npm run dev:electron
```

See the [Getting Started](Getting-Started) guide for full setup instructions.

## User Guide

| Page | Description |
|------|-------------|
| [Getting Started](Getting-Started) | Prerequisites, install, first launch, first build |
| [Workspace Editor](Workspace-Editor) | Canvas, toolbox, sidebar, tabs |
| [Block Reference](Block-Reference) | All 10 block categories with fields and behaviors |
| [Building a Nugget](Building-a-Nugget) | GO button, build phases, Mission Control, human gates |
| [Skills](Skills) | Creating, editing, composite skills, templates, context vars |
| [Rules](Rules) | Creating, triggers, templates |
| [Portals](Portals) | MCP/CLI/Serial, templates, capabilities |
| [Hardware Integration](Hardware-Integration) | ESP32 setup, detection, flash, serial monitor |
| [Saving and Loading](Saving-and-Loading) | Auto-save, .elisa files, workspace save/load, examples |
| [Troubleshooting](Troubleshooting) | Readiness badge, API key, connection, build errors |

## Developer Guide

| Page | Description |
|------|-------------|
| [Architecture](Architecture) | System topology, monorepo layout, data flow, state machine |
| [API Reference](API-Reference) | REST endpoints, WebSocket events, NuggetSpec schema |
| [Development Guide](Development-Guide) | Dev setup, npm scripts, testing, how to add endpoints/blocks/agents |
| [Agent System](Agent-System) | Agent roles, prompts, execution model, context chain, permissions |

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Desktop | Electron 35, electron-builder, electron-store + safeStorage |
| Frontend | React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, Blockly 12 |
| Backend | Express 5, TypeScript 5.9, ws 8, Zod 4, Claude Agent SDK |
| Hardware | MicroPython on ESP32 via serialport + mpremote |
| Testing | Vitest + Testing Library |

## Links

- [GitHub Repository](https://github.com/zoidbergclawd/elisa)
- [Product Requirements Document](https://github.com/zoidbergclawd/elisa/blob/main/docs/elisa-prd.md)

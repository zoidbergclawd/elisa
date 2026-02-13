# Project Description Draft (for hackathon submission form)

Edit this to your voice before submitting. This is a starting point.

---

## Title

Elisa: Block-Based AI Agent Orchestration for Kids

## One-liner

A visual programming environment where you snap blocks together to describe software, then watch a team of AI agents plan, code, test, and deploy it in real time.

## Description

Elisa turns block-based visual programming into a full AI-powered build pipeline. Instead of writing code, you drag and drop blocks across 9 categories -- goals, requirements, style, agent roles, flow control, hardware targets, deployment, skills, and rules -- to describe what you want built. Hit GO and a meta-planner powered by Claude decomposes your spec into a task DAG. Builder, tester, and reviewer agents execute tasks with dependency ordering, up to 3 running concurrently via streaming-parallel execution. The entire process is visible: a real-time task graph, agent communication feeds, git timelines, test results, and token usage meters.

What makes Elisa different from a chatbot that writes code:

- **You design, agents build.** The block editor is the interface, not a text prompt. This makes the creative process accessible to kids (and adults) who don't know how to describe software in words.
- **Full pipeline, not just code generation.** Agents plan task dependencies, write code, run tests, review each other's work, and deploy -- including flashing MicroPython to ESP32 boards over USB.
- **Human-in-the-loop by design.** "Check with me" gate blocks let you insert approval checkpoints anywhere in the pipeline. Agents pause and ask questions mid-build when they need clarification.
- **Teaching engine.** Every build session surfaces age-appropriate explanations of the programming concepts agents are using, turning passive observation into active learning.
- **Extensible agent behavior.** Skills (reusable prompt snippets) and rules (trigger-based behavior modifiers) let you shape how agents work without touching code. Portal blocks connect external tools via MCP servers or CLI commands.

Built entirely during the hackathon with Claude Code as the primary development tool. The codebase uses strict TypeScript throughout, Zod validation at all boundaries, 930+ tests across 60 test files, and comprehensive architecture documentation maintained alongside the code.

## Track

Build a tool that should exist.

## Tech Stack

Electron 35, React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, Blockly 12, Express 5, Claude Agent SDK, WebSocket streaming, MicroPython/ESP32.

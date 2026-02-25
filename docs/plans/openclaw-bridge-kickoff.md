# OpenClaw Bridge — Session Kickoff Prompt

Copy the prompt below into a fresh Claude Code session to continue the work.

---

## Prompt

I'm building the OpenClaw Bridge for the Elisa IDE. Phase 1 (CLI Foundation) is complete on the `feature/openclaw-bridge` branch. I need to continue with the remaining phases.

**Read these files first to get full context:**
- `docs/plans/2026-02-24-openclaw-bridge-design.md` — the complete design doc
- `docs/plans/2026-02-24-openclaw-bridge-plan.md` — the implementation plan (Phase 1 detailed, Phases 2-6 summarized)
- `ARCHITECTURE.md` — system architecture (includes CLI module added in Phase 1)

**What's done:**
- Phase 1: CLI Foundation — 28 tests, 12 commits on `feature/openclaw-bridge`
  - `cli/` package: Commander CLI, headless server, session client, WS listener, event formatters, build command
  - Wired into root build/install pipeline
  - Architecture docs updated

**What's next (GitHub issues, priority order):**
1. #113 — Phase 3: OpenClaw Block Categories + Skill Forge (unblocks Phase 4 and 6)
2. #114 — Phase 2: OpenClaw Portal Adapter (independent, can parallel with Phase 3)
3. #115 — Phase 4: Zero-to-Running Setup (blocked by Phase 3)
4. #116 — Phase 6: ClawHub Companion Skills (blocked by Phase 3)
5. #112 — Phase 5: Composable Nuggets (standalone, separate feature branch)

**Dependency graph:**
```
Phase 1 ✅
  ├─► Phase 3 (#113)  ← START HERE
  │     ├─► Phase 4 (#115)
  │     └─► Phase 6 (#116)
  ├─► Phase 2 (#114)  ← can parallel
  └─► Phase 5 (#112)  ← separate branch
```

**How to work:**
- Each phase gets its own feature branch off `feature/openclaw-bridge`
- Use the writing-plans skill to create a detailed TDD plan for the phase before coding
- Use subagent-driven development to execute the plan
- Each phase's plan doc should reference the OpenClaw docs at https://docs.openclaw.ai/ for accuracy

Start with Phase 3 (#113). Read the design doc and the Phase 3 summary in the plan, then create a detailed TDD implementation plan for it.

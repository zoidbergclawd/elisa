# Sprint 2: Bugs + Safety

## Scope

Fix runtime bugs and safety gaps that affect users during builds.

## Agents

### agent-abort-leaks (#75, #76)
- Propagate abort signal from orchestrator to Agent SDK
- Set session state to `done` on orchestrator error
- Don't call cleanup() from cancel() -- let scheduleCleanup handle it
- Close SessionLogger in orchestrator finally block
- Fix file descriptor leak in contextManager.ts buildFileManifest
- Remove abort event listeners in finally/cleanup path
- Clean up question resolvers on task timeout/abort
- Add ConnectionManager.cleanup(sessionId) for WebSocket cleanup

Files: orchestrator.ts, executePhase.ts, agentRunner.ts, sessionLogger.ts, contextManager.ts, server.ts

### agent-content-filter (#71)
- Add age-appropriate content filter to all 4 agent prompts
- Add content filter to metaPlanner prompt
- Sanitize placeholders (strip ##, <, >, triple backticks) before interpolation
- Change "mandatory constraints" to "creative guidelines"
- Wrap NuggetSpec in boundary tags in meta-planner

Files: prompts/builderAgent.ts, prompts/testerAgent.ts, prompts/reviewerAgent.ts, prompts/metaPlanner.ts, executePhase.ts (placeholder sanitization only)

### agent-hardware (#86)
- Add mutex to HardwareService for concurrent flash protection
- Promisify and await sp.close() in probeForRepl
- Use crypto.randomUUID() for temp file names instead of Date.now()

Files: hardwareService.ts, routes/hardware.ts

### agent-magic-numbers (#82 subset)
- Extract sendDeployChecklist(ctx) to DRY the 3x before_deploy pattern
- Define DEFAULT_MODEL constant, replace hardcoded 'claude-opus-4-6'
- Extract named constants for magic numbers (timeouts, limits, intervals)

Files: deployPhase.ts, metaPlanner.ts, executePhase.ts, various

## Post-Sprint
- All changes must include tests
- Update CLAUDE.md docs and ARCHITECTURE.md if topology changes
- All backend + frontend tests must pass

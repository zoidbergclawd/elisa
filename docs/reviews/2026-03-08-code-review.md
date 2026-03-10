# Code Review Report

Date: 2026-03-08

## Code Review Summary

Files reviewed: 40+ targeted source/test files across backend runtime, deploy, session lifecycle, and frontend session handling.

Scope note: the tracked diff is only two SVG assets, so this review expanded to the core code paths that matter. Generated coverage reports, binaries in `support/`, and the untracked license PDFs were not reviewed.

Overall assessment: REQUEST_CHANGES

Validation performed:
- Ran targeted backend tests for `server.behavior`
- Ran targeted backend tests for `runtime/routes`
- Ran targeted backend tests for `runtime/conversationManager`
- Ran targeted backend tests for `runtime/audioPipeline`
- Ran targeted backend tests for `runtime/consentIntegration`

Those tests passed, which is useful context, but several risky behaviors are either untested or currently encoded as expected behavior.

---

## Findings

### P0 - Critical

- `backend/src/services/agentRunner.ts:127`, `backend/src/services/phases/taskExecutor.ts:245`, `backend/src/services/permissionPolicy.ts:80`, `backend/src/services/agentRunner.test.ts:50`
  Agent sandbox is effectively disabled.
  `AgentRunner` hard-codes `permissionMode: 'bypassPermissions'`, while `TaskExecutor` still grants `Bash`, file-write, and edit tools. The only enforcement path is `makeQuestionHandler`, but `onQuestion` is accepted by `AgentRunner` and never wired into the SDK call. In production, that means the permission policy is dead code, and even if wired later, its workspace check is a naive `startsWith`, which is not a safe path-boundary check.
  Suggested fix: switch to an enforced permission mode, wire SDK permission callbacks to `PermissionPolicy`, remove `Bash` from the default toolset, and add integration tests that prove out-of-workspace writes and shell/network attempts are denied.

- `backend/src/utils/specValidator.ts:88`, `backend/src/services/phases/deployPhase.ts:242`, `backend/src/services/cloudDeployService.ts:39`, `backend/src/services/cloudDeployService.ts:142`
  Cloud deploy path is shell-injectable from device fields.
  Device `fields` are accepted as untyped `unknown`, `deployPhase` reads `GCP_PROJECT` and `GCP_REGION` straight from those fields, and `CloudDeployService` builds shell command strings and runs them with `execAsync`. A crafted project or region value can execute arbitrary host commands when a cloud deploy runs.
  Suggested fix: validate project and region against strict GCP regexes and replace string-based `exec` with argument-based `execFile` or `spawn` using explicit binaries.

### P1 - High

- `backend/src/server.ts:105`, `electron/main.ts:153`, `backend/src/server.ts:547`, `backend/src/utils/lanUrl.ts:40`
  Provisioned `runtime_url` is wrong or non-routable in common real deployments.
  The runtime URL is computed once at module load from `process.env.PORT ?? 8000`, before `startServer()` knows the actual listen port. Electron can then pick a different free port, and the server still binds to `127.0.0.1` by default. Devices can receive a LAN URL with the wrong port, or a LAN URL for a server that is only listening on loopback.
  Suggested fix: construct the runtime URL from the actual bound host and port inside `startServer`, and make the external runtime binding strategy explicit.

- `backend/src/services/runtime/conversationManager.ts:144`, `backend/src/services/runtime/consentManager.ts:77`, `backend/src/models/runtime.ts:41`, `backend/src/server.ts:108`
  COPPA and session-retention controls are not actually enforcing the stated policy.
  `ConversationManager` looks up consent by `session.agent_id`, but consent records are keyed by `kid_id`, and runtime sessions do not carry a kid identifier at all. For `session_summaries`, the code still stores the full raw turn and only tags it with `summary_only`; nothing in the codebase consumes that flag. The TTL sweeper is never started in `server.ts`, so retained transcripts live until process exit unless the agent or session is explicitly deleted.
  Suggested fix: put a real child or account identifier on sessions, enforce summary or no-history at write time, and start the stale-session sweeper during server boot.

- `backend/src/utils/safeEnv.ts:2`, `backend/src/services/testRunner.ts:106`, `backend/src/services/phases/deployPhase.ts:437`, `backend/src/services/portalService.ts:196`
  Untrusted generated code still inherits host secrets.
  `safeEnv()` only removes `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`. Generated JS or Python tests, `npm run build`, and portal commands still receive the rest of the host environment, including any cloud, SCM, or CI credentials present on the developer machine.
  Suggested fix: invert this to an allowlist environment, or at minimum strip common secret-bearing variables and prefixes and only pass the env each subprocess actually needs.

### P2 - Medium

- `backend/src/routes/runtime.ts:183`, `backend/src/routes/runtime.ts:191`, `backend/src/routes/runtime.ts:215`, `backend/src/services/runtime/audioPipeline.ts:59`
  The audio runtime route advertises multipart support but never parses multipart.
  `/v1/agents/:id/turn/audio` says it accepts `multipart/form-data`, but it just reads raw request bytes and hands them to `AudioPipeline`. For a real multipart upload, that buffer includes MIME boundaries and part headers, not just audio. Standard clients following the advertised contract will fail or degrade badly.
  Suggested fix: either drop multipart from the contract or parse it properly with a streaming multipart parser and add route tests for both multipart and octet-stream inputs.

- `backend/src/services/sessionStore.ts:106`, `backend/src/services/sessionStore.ts:117`, `backend/src/services/orchestrator.ts:481`, `backend/src/services/orchestrator.ts:492`, `frontend/src/App.tsx:505`
  Session shutdown and cleanup leaks resources for user workspaces.
  `SessionStore.scheduleCleanup()` skips `orchestrator.cleanup()` for `userWorkspace` sessions, even though `Orchestrator.cleanup()` already knows how to avoid deleting user files while still stopping preview servers and clearing meeting state. The frontend also uses `navigator.sendBeacon()` against an auth-protected stop route, so the "Build something new" path cannot send the bearer token needed to stop the session reliably.
  Suggested fix: always call `orchestrator.cleanup()` and rely on its internal `userWorkspace` guard; replace `sendBeacon` with an authenticated fetch or Electron IPC path.

### P3 - Low

- `backend/src/routes/runtime.ts:301`, `backend/src/routes/runtime.ts:483`
  Duplicate `/v1/agents/:id/gaps` route.
  The second handler is unreachable because the first one already responds. It is harmless today, but it is dead code and makes the runtime surface harder to reason about.

---

## Removal and Iteration Plan

### Safe to remove now

- Add `coverage/` and local tool-artifact ignores to `.gitignore`.
  The current working tree shows `backend/coverage/`, `frontend/coverage/`, and `.claude/settings.local.json` as untracked noise.

### Short follow-up

- Add regression coverage for permission enforcement.
- Add regression coverage for runtime URL generation from the bound host and port.
- Add regression coverage for multipart audio uploads.
- Add regression coverage for authenticated session shutdown and cleanup.

### Test cleanup

- Update `backend/src/services/agentRunner.test.ts` once the permission model is fixed.
- Update `backend/src/tests/runtime/consentIntegration.test.ts` once retention is enforced instead of only tagging turns with `summary_only`.

---

## Additional Notes

- No source coverage was found for `/v1/agents/:id/turn/audio`; the runtime route tests do not exercise that endpoint.
- The consent tests currently assert `summary_only` tagging rather than true summary-only retention, so they will not catch a real privacy fix.
- The agent-runner tests explicitly assert `bypassPermissions`, so CI will currently reject a safer permission model until those tests change.

---

## Test Commands Run

```powershell
npm run test --prefix backend -- src/tests/behavioral/server.behavior.test.ts src/services/runtime/conversationManager.test.ts src/services/runtime/audioPipeline.test.ts
npm run test --prefix backend -- src/tests/runtime/routes.test.ts src/tests/runtime/consentIntegration.test.ts
```

Result:
- All targeted tests passed.
- The findings above are therefore primarily design, security, and coverage gaps rather than currently failing assertions.

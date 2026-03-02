# Codebase Audit -- 2026-03-01

Full-spectrum audit covering architecture, code quality, testing, security, prompt engineering, performance, error handling, and documentation. Three parallel audit passes examined backend services, frontend/testing, and prompts/agents/performance. Findings cross-validated; false positives removed.

## Summary

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 3 | Security and silent failures |
| P1 | 7 | Reliability and testing gaps |
| P2 | 9 | Code quality and UX |
| P3 | 3 | Low priority / backlog |

No showstoppers. The codebase demonstrates professional engineering: strong input validation (Zod), command injection prevention (allowlists + execFile), path traversal defense (multi-layer), graceful degradation, proper async coordination (mutexes, abort signals). Findings are improvements, not architectural defects.

---

## P0 -- Security & Silent Failures

### 1. Auth token logged to console in production

- **Files**: `backend/src/server.ts:465,484`
- **Issue**: `console.log(Auth token: ${token})` exposes bearer token in logs
- **Fix**: gate behind `NODE_ENV !== 'production'` or remove entirely

### 2. Task descriptions from metaPlanner not sanitized before agent prompts

- **Files**: `backend/src/prompts/builderAgent.ts:90-91`
- **Issue**: `task.name` and `task.description` interpolated directly into agent prompts. `sanitizePlaceholder()` exists (strips markdown headers, code fences, HTML tags) but is only applied to nugget goal/type/description, not task fields from LLM output.
- **Risk**: metaPlanner output could contain markdown headers or code fences that restructure the agent prompt
- **Fix**: apply `sanitizePlaceholder()` to task.name and task.description in `formatTaskPrompt()`

### 3. Frontend silently drops agent_output, agent_status, agent_message events

- **Files**: `frontend/src/hooks/useBuildSession.ts` (reducer), `backend/src/services/phases/types.ts:24-26`
- **Issue**: reducer has no `case` for these three WSEvent types. Live agent streaming output during task execution is never displayed.
- **Fix**: add case handlers; at minimum `agent_output` should append to a per-task output log

---

## P1 -- Reliability & Testing Gaps

### 4. WebSocket reconnect loses all context

- **Files**: `frontend/src/hooks/useWebSocket.ts`
- **Issue**: on reconnect, sends synthetic `session_started` but never fetches current session state via REST. Events during disconnect are permanently lost.
- **Fix**: on `ws.onopen` reconnect, fetch `GET /api/sessions/:id` and dispatch state sync

### 5. WebSocket max retries fails silently

- **Files**: `frontend/src/hooks/useWebSocket.ts`
- **Issue**: after MAX_RETRIES, logs to console but never dispatches an error event. User sees frozen UI.
- **Fix**: dispatch `{ type: 'error', message: '...', recoverable: false }` after max retries

### 6. Token budget skip cascades to downstream DAG tasks

- **Files**: `backend/src/services/phases/executePhase.ts:216-219`
- **Issue**: tasks skipped for budget are marked as `failed`, causing all dependent tasks to also skip. An entire DAG branch can silently fail because of one budget-exceeded task.
- **Fix**: distinguish `status: 'skipped'` from `status: 'failed'`; allow downstream tasks to proceed if skipped (not failed) dependencies exist

### 7. Retry logic provides no failure-specific context to the agent

- **Files**: `backend/src/services/phases/taskExecutor.ts`
- **Issue**: retry prompt says "previous attempt did not complete" but doesn't include what failed, which files were modified, or test output. Agent wastes tokens re-discovering the same failure.
- **Fix**: include failure summary, workspace diff, and test output in retry prompt

### 8. NuggetSpec validation truncations are silent and lossy

- **Files**: `backend/src/utils/specValidator.ts`
- **Issue**: Zod caps truncate long strings/arrays without warning. User's detailed requirement gets silently cut.
- **Fix**: emit `spec_validation_warning` event listing truncated fields; surface in frontend

### 9. Backend Zod validation errors not clearly surfaced to frontend

- **Files**: `backend/src/routes/sessions.ts`, `frontend/src/hooks/useBuildSession.ts:791`
- **Issue**: backend returns `{ detail, errors }` on 400 but frontend shows generic "couldn't get ready" message without parsing the errors array.
- **Fix**: parse and format `body.errors` into user-readable messages in `startBuild()`

### 10. Critical backend services lack any test coverage

| Service | Risk |
|---------|------|
| `orchestrator.ts` | Entire build pipeline coordinator -- no tests |
| `metaPlanner.ts` | Task DAG generation -- no unit tests |
| `portalService.ts` | Command execution, security-critical -- no tests |
| `skillRunner.ts` | User skill execution -- no tests |
| `permissionPolicy.ts` | Agent permission resolution -- no tests |

- **Fix**: prioritize orchestrator integration test and portalService security tests

---

## P2 -- Code Quality & UX

### 11. Safety guardrails are prompt-text-only, not enforced post-response

- **Files**: `backend/src/services/runtime/safetyGuardrails.ts`, `runtime/contentFilter.ts`
- **Issue**: safety rules injected into system prompt but no mandatory post-processing filter. `contentFilter.ts` exists (regex PII detection) but is optional.
- **Fix**: make contentFilter mandatory in `turnPipeline.ts` before returning responses

### 12. Runtime memory leak: ConversationManager and AgentStore lack cleanup

- **Files**: `backend/src/services/runtime/conversationManager.ts`, `runtime/agentStore.ts`
- **Issue**: sessions Map and agent identities grow indefinitely with no TTL or cleanup on deprovision.
- **Fix**: implement TTL-based cleanup; clear conversation sessions on agent DELETE

### 13. Modal z-index hierarchy is inconsistent

- **Files**: `MeetingInviteToast` (`z-[60]`), `MeetingModal` (`z-50`), `ModalHost` (`z-50`)
- **Issue**: toast appears above modals, potentially blocking gate/question responses. No documented z-index contract.
- **Fix**: establish hierarchy: error `z-[100]` > modals `z-50` > toasts `z-40`

### 14. Fire-and-forget patterns swallow errors without logging

- **Files**: `backend/src/routes/meetings.ts`, `sessions.ts`
- **Issue**: `.catch(() => {})` hides failures, making debugging impossible.
- **Fix**: change to `.catch((err) => { console.error('[context]', err.message); })`

### 15. Timeout detection relies on fragile string matching

- **Files**: `backend/src/services/agentRunner.ts`
- **Issue**: `if (message === 'Timed out')` to detect timeout. If `withTimeout()` error format changes, detection breaks silently.
- **Fix**: create custom `TimeoutError` class; use `instanceof` check

### 16. Frontend-backend WSEvent type mismatches

- **Files**: `backend/src/services/phases/types.ts`, `frontend/src/types/index.ts`
- **Issue**: `deploy_progress` backend sends optional `device_role` not in frontend type. Types may drift.
- **Fix**: add missing fields; consider generating frontend types from backend source

### 17. Accessibility gaps

- ModalHost has no focus trap (users can tab to hidden elements)
- NarratorFeed lacks `aria-live="polite"` for streaming messages
- FlashWizardModal progress bar missing `aria-valuenow`
- TaskDAG nodes lack `aria-label`
- **Fix**: add `focus-trap-react`; add ARIA attributes to live regions and interactive elements

### 18. Frontend component tests are shallow

- 84 test files mostly verify "component renders" with fully mocked hooks
- No integration tests for WSEvent -> state -> UI flow
- No error path tests; `useBuildSession` reducer (715 lines) has no direct unit tests
- **Fix**: add reducer unit tests, integration tests for event flow, error path tests

### 19. Meeting agent timeout (30s) with no frontend indicator

- **Files**: `backend/src/utils/constants.ts:49` (`MEETING_AGENT_TIMEOUT_MS = 30_000`)
- **Issue**: user stares at blank canvas for up to 30s with no feedback.
- **Fix**: reduce to 15s; add typing/thinking indicator in MeetingModal

---

## P3 -- Backlog

### 20. ARCHITECTURE.md diverged from actual code flow

- Missing: `autoMatchTests()` step before planning, `plan_ready` meeting trigger, portal initialization
- **Fix**: update data flow diagram

### 21. task_failed event hardcodes retry_count to 0

- **Files**: `backend/src/services/phases/executePhase.ts:135`
- **Issue**: `retry_count: 0` always; frontend can't distinguish first failure from retries
- **Fix**: pass actual attempt number from taskExecutor

### 22. Prop drilling in App.tsx

- App.tsx destructures 30+ state variables; passes 8+ layers of props
- **Fix**: create BuildSessionContext for sessionId, dispatch, common state; memoize sub-components

---

## Positive Findings

Areas where the codebase is strong:

- **Input validation**: Zod schema with string caps, array limits, shell metacharacter rejection
- **Command injection prevention**: `ALLOWED_COMMANDS` allowlist, strict metacharacter regex, `execFile` (no shell)
- **Path traversal defense**: 7-layer validation in `pathValidator.ts` (null bytes, UNC paths, realpath, segment check, root allowlist, system blocklist, user dir blocklist)
- **Concurrent execution**: Promise.race pool with proper slot management, git mutex, flash mutex
- **Graceful degradation**: missing git/pytest/mpremote produce warnings not crashes
- **Session lifecycle**: 5-minute grace period cleanup, stale session pruning, WebSocket teardown
- **Type safety**: minimal `any` usage (0.2% density, mostly tests), discriminated unions throughout
- **API key handling**: `safeEnv()` strips key from child process environments

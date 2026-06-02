# Plan: Upgrade `@anthropic-ai/claude-agent-sdk` (0.2.112 → 0.3.x) + `@anthropic-ai/sdk` (0.74 → 0.100)

**Status:** Planning · **Branch:** `feature/upgrade-agent-sdk`

## Goal

Move off the pinned, end-of-line `@anthropic-ai/claude-agent-sdk@0.2.112` (last version that ships a JS `cli.js`) onto the current `0.3.x` line, and bump `@anthropic-ai/sdk` from `^0.74` to `^0.100`. This unblocks future Claude Code features and lets the bundled CLI natively understand newer models. **Note:** using a newer *model* (e.g. Opus 4.8) does **not** require this upgrade — the model string is forwarded to the API by the current CLI. This work is about staying current with the SDK, not about model access.

## Why this is "a major body of work" (the blocker)

`0.2.113` changed how the Claude Code CLI is distributed:

| | 0.2.112 (current) | 0.3.x (target) |
|---|---|---|
| CLI form | single bundled `cli.js` (plain JS) | native per-platform binary (~200 MB each) |
| How it ships | inside the SDK package | **per-platform optional dependencies** (npm installs only the host's) |
| How we run it | `pathToClaudeCodeExecutable` → `cli.js`, spawned via Node | spawn the native `claude` binary directly |
| Arch sensitivity | arch-agnostic (one JS file works everywhere) | **arch-specific** (darwin-arm64, darwin-x64, win32-x64, win32-arm64, linux-{x64,arm64}{,-musl}) |

Our entire packaging + resolution story was built around `cli.js` (commits `800c472`, `ca442b9`, `feccf79`) so the app runs **without** Claude Code installed on the user's machine. That story has to be rebuilt around the native binary.

### Optional-dependency packages (0.3.x)
```
@anthropic-ai/claude-agent-sdk-darwin-arm64    @anthropic-ai/claude-agent-sdk-win32-x64
@anthropic-ai/claude-agent-sdk-darwin-x64      @anthropic-ai/claude-agent-sdk-win32-arm64
@anthropic-ai/claude-agent-sdk-linux-x64       @anthropic-ai/claude-agent-sdk-linux-arm64
@anthropic-ai/claude-agent-sdk-linux-x64-musl  @anthropic-ai/claude-agent-sdk-linux-arm64-musl
```
Each extracted binary is ~200 MB (per the SDK's `manifest.json`).

## Current mechanism (what we're changing)

- **Backend runs in-process inside Electron** in production (`electron/main.ts:258` imports `backend-dist/server-entry.js` and calls `startServer()`). The agent SDK's `query()` runs inside the Electron main process and spawns the CLI as a subprocess.
- **CLI resolution:** `backend/src/services/agentRunner.ts:39 resolveClaudeCodePath()` → `<ELISA_RESOURCES_PATH>/backend-dist/node_modules/@anthropic-ai/claude-agent-sdk/cli.js` (prod) or `import.meta.resolve` (dev); passed as `pathToClaudeCodeExecutable` (`agentRunner.ts:218`).
- **Bundling:** `scripts/build-backend.mjs` keeps the SDK `external`; `scripts/bundle-backend-deps.mjs` installs externals into `backend/dist/vendor/` (pinned `@anthropic-ai/claude-agent-sdk: ^0.2.39`); `electron-builder.js` ships `backend/dist` as `extraResources` and `afterPack` renames `vendor/ → node_modules/` and **verifies `cli.js` exists**.
- **Health check:** `backend/src/server.ts:171` calls `getClaudeCodePath()` and warns if `cli.js` is missing.

## Impact map (files to change)

| File | Change |
|---|---|
| `backend/package.json` | bump `@anthropic-ai/claude-agent-sdk` → `^0.3.x`, `@anthropic-ai/sdk` → `^0.100` |
| `backend/src/services/agentRunner.ts` | rewrite `resolveClaudeCodePath()` to locate the **native binary** (from the per-platform optional-dep package) instead of `cli.js`; update diag log text; verify `pathToClaudeCodeExecutable` semantics for a binary path |
| `backend/src/server.ts` | health check: resolve/verify the native binary instead of `cli.js`; update warning copy |
| `scripts/bundle-backend-deps.mjs` | bump SDK pin to `^0.3.x`; ensure the **host-platform optional-dep native package** is installed and copied into `vendor/` (and not stripped) |
| `scripts/build-backend.mjs` | keep SDK external; confirm the native optional package is treated as external/runtime |
| `electron-builder.js` | `afterPack`: replace `cli.js` verification with **native-binary** verification; ensure the binary keeps its **executable bit**; address macOS signing of the embedded binary (see Risks) |
| `electron/main.ts` | verify binary is runnable (perms/quarantine); revisit the "Node.js not installed" prompt (the native binary may remove the system-Node dependency for agent runs) |
| `backend/CLAUDE.md`, `backend/src/services/CLAUDE.md`, `ARCHITECTURE.md`, `docs/INDEX.md` | update the cli.js/native-binary description per the staleness rules |
| `@anthropic-ai/sdk` consumers | audit for breaking API changes: `anthropicClient.ts`, `narratorService.ts`, `meetingAgentService.ts`, `metaPlanner.ts`, `teachingEngine.ts`, `runtime/turnPipeline.ts`, `server.ts` |

## Phased work breakdown

### Phase 0 — Spike (de-risk before committing)
- [ ] In a scratch app, install `@anthropic-ai/claude-agent-sdk@0.3.x` and run a trivial `query()` to confirm the new resolution/spawn works and what `pathToClaudeCodeExecutable` should point at (binary path? still needed?).
- [ ] Confirm whether the SDK auto-resolves its native binary from the optional dep without us setting `pathToClaudeCodeExecutable` at all.

### Phase 1 — Dev-mode upgrade
- [ ] Bump both SDKs in `backend/package.json`; `npm install`.
- [ ] Fix `resolveClaudeCodePath()` + `getClaudeCodePath()` for the native binary (or remove if auto-resolution suffices in dev).
- [ ] Resolve `@anthropic-ai/sdk` 0.74→0.100 breaking changes across the 7 consumer files; get `tsc`, `lint`, and the full test suite green (Node 20).
- [ ] `npm run dev:electron` + a live agent build smoke test.

### Phase 2 — Production packaging (the hard part)
- [ ] `bundle-backend-deps.mjs`: include the host-platform native optional package in `vendor/`.
- [ ] `electron-builder.js` `afterPack`: verify the native binary, preserve exec bit.
- [ ] macOS: sign the embedded native binary under hardened runtime (+ entitlements); re-enable notarization.
- [ ] Build the DMG locally; install; run a live agent build end-to-end.

### Phase 3 — Cross-platform / cross-arch
- [ ] Decide + implement arch coverage (see Open Decisions).
- [ ] Validate the Windows `.exe` via the release workflow.
- [ ] Confirm installer size impact and update release notes/expectations.

### Phase 4 — Docs + cleanup
- [ ] Update all architecture docs per the staleness table.
- [ ] Remove dead `cli.js` references.

## Risks

1. **macOS code-signing / notarization of the embedded native binary (highest).** `electron-builder.js` sets `hardenedRuntime: true`; an embedded, unsigned ~200 MB executable will be blocked by Gatekeeper. The binary must be signed as part of the app with correct entitlements, and notarization (currently disabled, `release.yml:54-57`) likely must be re-enabled for distribution.
2. **Arch coverage regression.** Today's `cli.js` is arch-agnostic, so one Mac build serves Intel + Apple Silicon. The native binary is arch-specific and `macos-latest` is arm64 → Intel Macs would ship **without a binary**. Same gap for Windows arm64.
3. **App/installer size.** ~200 MB binary per platform vs a single JS file — materially larger downloads.
4. **`options.env` breaking change (0.2.113):** `options.env` now *replaces* `process.env` instead of overlaying. **Low impact** — `agentRunner.ts` does not pass `env` to `query()` today — but must stay that way (or spread `{ ...process.env }` if we ever add it).
5. **`@anthropic-ai/sdk` 0.74→0.100** is ~26 minor versions; expect message-shape / option / beta-header changes across the 7 consumers.
6. **`extraResources` filtering.** The `vendor/`→`node_modules/` rename trick exists because electron-builder strips `node_modules`; the native optional-dep package must survive the same path.

## Open decisions (need product/owner input)

- **D1 — macOS arch:** ship **arm64-only** (matches `macos-latest`, simplest) or **Intel + Apple Silicon** (separate runners or universal build, more work)? Today both work; the upgrade forces a choice.
- **D2 — Scope:** do the `@anthropic-ai/sdk` 0.74→0.100 bump **in this branch** or split it into its own PR (it's independent of the native-binary change)?
- **D3 — Notarization:** re-enable Apple notarization now (needed for clean Gatekeeper on the signed binary) or defer and accept the right-click-open friction?

## Verification plan

- `tsc --noEmit` clean, `eslint` clean, full backend + frontend test suites green under **Node 20** (CI parity).
- Dev: `npm run dev:electron` + a real agent build to completion.
- Prod: packaged DMG (and `.exe` via release workflow) installed on a clean machine, agent build run end-to-end **without** Claude Code or (ideally) Node installed.
- Installer-size delta recorded.

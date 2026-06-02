# Plan: Upgrade `@anthropic-ai/claude-agent-sdk` (0.2.112 → 0.3.x) + `@anthropic-ai/sdk` (0.74 → 0.100)

**Status:** Part 1 (code + dev-mode + resolution) DONE · Part 2 (production packaging / per-arch / signing / docs) IN PROGRESS · **Branch:** `feature/upgrade-agent-sdk`

## Status Summary

- **Part 1 — DONE.** SDKs bumped (`@anthropic-ai/claude-agent-sdk ^0.3.x`, `@anthropic-ai/sdk ^0.100.x`); `agentRunner.ts` rewritten to resolve the **native binary** (prod `ELISA_RESOURCES_PATH` path → dev `createRequire(...).resolve` → SDK auto-resolve fallback); subprocess env handling fixed for the 0.3.x `options.env`-**replaces**-`process.env` change (spread `{ ...process.env }`); **forced `ANTHROPIC_API_KEY`** + isolated `CLAUDE_CONFIG_DIR` (`~/.elisa/claude-cli-config`) so no host `~/.claude` fallback; `bundle-backend-deps.mjs` bumped pins and now **installs + verifies** the host-arch native CLI package (exists, regular file, exec bit). Module CLAUDE.md docs updated.
- **Part 2 — IN PROGRESS.** Production packaging (electron-builder `afterPack` native-binary verify + macOS re-sign/entitlements/notarize), per-arch CI matrix, and these docs (`packaging.md`, `ARCHITECTURE.md`, this plan). **All open decisions below are RESOLVED** (see "Resolved decisions").

## Resolved decisions (Part 2)

- **D1 — Arch coverage: FULL per-arch coverage via per-arch runners.** macOS builds on **both** `macos-13` (Intel/x64) **and** `macos-latest` (Apple Silicon/arm64). Windows keeps `windows-latest` (x64). win32-arm64 GitHub-hosted runners are preview/limited, so **no win-arm runner** is added; win32-arm64 is documented as a **known gap** (runs x64 under emulation). Each runner natively installs only its own optional native dep — no force-install/cross-arch hacks.
- **D2 — Scope:** the `@anthropic-ai/sdk` 0.74→0.100 bump rides with the native-binary change (landed together in Part 1).
- **D3 — Notarization: ON.** The nested Bun-based CLI binary (Anthropic-signed under TeamID `Q6L2SF6YDW`) is **re-signed under Elisa's identity** and the app is **notarized** on macOS. Required because Gatekeeper blocks the ~200 MB nested executable otherwise.
- **AUTH — Force configured API key (RESOLVED, landed in Part 1).** The CLI subprocess must use `ANTHROPIC_API_KEY` and must NOT silently fall back to a host `~/.claude` login.

Hardened-runtime entitlements required for the Bun native binary: `com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory`, `com.apple.security.cs.disable-library-validation`, `com.apple.security.cs.allow-dyld-environment-variables` (+ `com.apple.security.inherit` in the inherit plist).

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

> _Historical baseline (the pre-upgrade `cli.js` world). Line numbers and pins reflect the starting point; see the Status Summary above for what has since landed._

- **Backend runs in-process inside Electron** in production (`electron/main.ts:258` imports `backend-dist/server-entry.js` and calls `startServer()`). The agent SDK's `query()` runs inside the Electron main process and spawns the CLI as a subprocess.
- **CLI resolution:** `backend/src/services/agentRunner.ts:39 resolveClaudeCodePath()` → `<ELISA_RESOURCES_PATH>/backend-dist/node_modules/@anthropic-ai/claude-agent-sdk/cli.js` (prod) or `import.meta.resolve` (dev); passed as `pathToClaudeCodeExecutable` (`agentRunner.ts:218`).
- **Bundling:** `scripts/build-backend.mjs` keeps the SDK `external`; `scripts/bundle-backend-deps.mjs` installs externals into `backend/dist/vendor/` (pinned `@anthropic-ai/claude-agent-sdk: ^0.2.39`); `electron-builder.js` ships `backend/dist` as `extraResources` and `afterPack` renames `vendor/ → node_modules/` and **verifies `cli.js` exists**.
- **Health check:** `backend/src/server.ts:171` calls `getClaudeCodePath()` and warns if `cli.js` is missing.

## Impact map (files to change)

| File | Change | Status |
|---|---|---|
| `backend/package.json` | bump `@anthropic-ai/claude-agent-sdk` → `^0.3.x`, `@anthropic-ai/sdk` → `^0.100` | DONE (Part 1) |
| `backend/src/services/agentRunner.ts` | rewrite `resolveClaudeCodePath()` to locate the **native binary** (from the per-platform optional-dep package) instead of `cli.js`; force `ANTHROPIC_API_KEY` + isolate `CLAUDE_CONFIG_DIR`; spread `{ ...process.env }` into `options.env`; update diag log text | DONE (Part 1) |
| `backend/src/server.ts` | health check: resolve/verify the native binary instead of `cli.js`; update warning copy | DONE (Part 1) |
| `scripts/bundle-backend-deps.mjs` | bump SDK pin to `^0.3.x`; install + **verify** the host-platform optional-dep native package in `vendor/` (exists, regular file, exec bit) | DONE (Part 1) |
| `scripts/build-backend.mjs` | keep SDK external; confirm the native optional package is treated as external/runtime | DONE (Part 1) |
| `electron-builder.js` | `afterPack`: replace `cli.js` verification with **native-binary** verification; ensure the binary keeps its **executable bit**; macOS re-sign of the nested binary + entitlements + notarization | TODO (Part 2) |
| `electron/main.ts` | verify binary is runnable (perms/quarantine); revisit the "Node.js not installed" prompt (native binary removes the system-Node dependency for agent runs) | TODO (Part 2) |
| `.github/workflows/release.yml` | per-arch matrix (`macos-13` + `macos-latest` + `windows-latest`); macOS signing + notarization secrets | TODO (Part 2) |
| `build/*.plist` (entitlements) | hardened-runtime entitlements for the Bun native binary (JIT, unsigned-exec-memory, disable-library-validation, dyld-env) + inherit plist | TODO (Part 2) |
| `backend/CLAUDE.md`, `backend/src/services/CLAUDE.md`, `ARCHITECTURE.md`, `docs/packaging.md`, `docs/INDEX.md` | update the cli.js/native-binary description per the staleness rules | DONE (CLAUDE.md, ARCHITECTURE.md, packaging.md); `docs/INDEX.md` TODO |
| `@anthropic-ai/sdk` consumers | audit for breaking API changes: `anthropicClient.ts`, `narratorService.ts`, `meetingAgentService.ts`, `metaPlanner.ts`, `teachingEngine.ts`, `runtime/turnPipeline.ts`, `server.ts` | DONE (Part 1) |

## Phased work breakdown

### Phase 0 — Spike (de-risk before committing) — DONE
- [x] In a scratch app, install `@anthropic-ai/claude-agent-sdk@0.3.x` and run a trivial `query()` to confirm the new resolution/spawn works and what `pathToClaudeCodeExecutable` should point at (binary path? still needed?).
- [x] Confirm whether the SDK auto-resolves its native binary from the optional dep without us setting `pathToClaudeCodeExecutable` at all. (It can — used as the fallback when the explicit path is absent.)

### Phase 1 — Dev-mode upgrade — DONE
- [x] Bump both SDKs in `backend/package.json`; `npm install`.
- [x] Fix `resolveClaudeCodePath()` + `getClaudeCodePath()` for the native binary (prod path → dev `createRequire` resolve → SDK auto-resolve fallback).
- [x] Force `ANTHROPIC_API_KEY` + isolate `CLAUDE_CONFIG_DIR`; spread `{ ...process.env }` for the 0.3.x `options.env`-replaces-`process.env` change.
- [x] Resolve `@anthropic-ai/sdk` 0.74→0.100 breaking changes across the consumer files; `tsc`, `lint`, and tests green (Node 20).
- [x] `bundle-backend-deps.mjs`: vendor + verify the host-arch native optional package (exists, regular file, exec bit).

### Phase 2 — Production packaging (the hard part) — IN PROGRESS
- [x] `bundle-backend-deps.mjs`: include + verify the host-platform native optional package in `vendor/`.
- [ ] `electron-builder.js` `afterPack`: verify the **native binary** (replace the legacy `cli.js` check), preserve exec bit.
- [ ] macOS: re-sign the embedded native binary under Elisa's identity (hardened runtime + Bun entitlements); enable notarization (D3 = ON).
- [ ] Build the DMG locally; install; run a live agent build end-to-end.

### Phase 3 — Cross-platform / cross-arch — IN PROGRESS
- [x] Decide arch coverage (D1 = FULL per-arch coverage; see Resolved decisions).
- [ ] Implement the per-arch CI matrix (`macos-13` + `macos-latest` + `windows-latest`); wire the macOS signing + notarization secrets.
- [ ] Validate the Windows `.exe` via the release workflow.
- [ ] Confirm installer size impact (~200 MB native CLI per arch) and update release notes/expectations.

### Phase 4 — Docs + cleanup
- [x] Update architecture docs per the staleness table (`packaging.md`, `ARCHITECTURE.md`, backend CLAUDE.md, services CLAUDE.md, this plan).
- [ ] Remove the last dead `cli.js` reference in `electron-builder.js` `afterPack` (tracked in Phase 2).

## Risks

1. **macOS code-signing / notarization of the embedded native binary (highest).** `electron-builder.js` sets `hardenedRuntime: true`; an embedded, unsigned ~200 MB executable is blocked by Gatekeeper. **Mitigation (D3 = ON):** re-sign the nested binary under Elisa's identity with the Bun entitlements and **notarize** the app. Anthropic ships the binary already hardened-runtime signed under TeamID `Q6L2SF6YDW`; we re-sign so the whole bundle is consistent. _Still TODO in code (Part 2)._
2. **Arch coverage regression.** The old `cli.js` was arch-agnostic; the native binary is arch-specific. **Mitigation (D1 = FULL coverage):** build macOS on both `macos-13` (x64) and `macos-latest` (arm64), Windows on `windows-latest` (x64). **win32-arm64 remains a documented gap** (preview/limited runner) — runs x64 under emulation. _CI matrix still TODO in code (Part 2)._
3. **App/installer size.** ~200 MB native CLI per arch vs a single JS file — materially larger downloads, one payload per arch. Record the delta in release notes.
4. **`options.env` breaking change (0.2.113):** `options.env` now *replaces* `process.env` instead of overlaying. **RESOLVED (Part 1):** `agentRunner.ts` now passes `options.env` and spreads `{ ...process.env }`, then force-sets `ANTHROPIC_API_KEY` and isolates `CLAUDE_CONFIG_DIR`.
5. **`@anthropic-ai/sdk` 0.74→0.100** is ~26 minor versions; message-shape / option / beta-header changes across the consumers. **RESOLVED (Part 1).**
6. **`extraResources` filtering.** The `vendor/`→`node_modules/` rename trick exists because electron-builder strips `node_modules`; the native optional-dep package survives the same path (`cpSync` preserves the 0755 exec bit; `removeBinDirs` only deletes `.bin`). Verified in `bundle-backend-deps.mjs`.

## Open decisions — RESOLVED

All previously-open decisions are now locked (see "Resolved decisions (Part 2)" above):

- **D1 — macOS arch:** RESOLVED → **FULL per-arch coverage** (Intel via `macos-13` + Apple Silicon via `macos-latest`). Windows stays x64 only; **win32-arm64 is a documented gap** (no preview/limited arm Windows runner).
- **D2 — Scope:** RESOLVED → bundled with the native-binary change (landed in Part 1).
- **D3 — Notarization:** RESOLVED → **ON** (re-sign nested binary under Elisa's identity + notarize).
- **AUTH:** RESOLVED → **force configured `ANTHROPIC_API_KEY`**, no host `~/.claude` fallback (landed in Part 1).

## Verification plan

- `tsc --noEmit` clean, `eslint` clean, full backend + frontend test suites green under **Node 20** (CI parity).
- Dev: `npm run dev:electron` + a real agent build to completion.
- Prod: packaged DMG (and `.exe` via release workflow) installed on a clean machine, agent build run end-to-end **without** Claude Code or (ideally) Node installed.
- Installer-size delta recorded.

# Packaging Elisa for Distribution

## Prerequisites

- Node.js 20+ (CI uses Node 20; local default may be newer)
- `npm install` at repo root (installs all deps)

## Build Commands

| Command | Output | Use |
|---------|--------|-----|
| `npm run build` | Compiles frontend, backend bundle, vendor deps, electron TS | Required before any packaging |
| `npm run pack` | `release/win-unpacked/` or `release/mac-{arm64,x64}/` | Quick test (no installer) |
| `npm run dist:win` | `release/Elisa Setup X.Y.Z.exe` | Windows NSIS installer (x64) |
| `npm run dist:mac` | `release/Elisa-X.Y.Z*.dmg` + `.zip` | Mac DMG + ZIP (must run on macOS; arch = the runner's arch) |

## The Native Claude Code CLI (and why packaging is arch-specific)

As of `@anthropic-ai/claude-agent-sdk` **0.3.x**, the Claude Code CLI is no longer a
single arch-agnostic `cli.js`. It now ships as a **per-platform native binary**
(file name `claude`, or `claude.exe` on Windows; mode `0755`, **~200 MB each**)
delivered through **host-platform optional dependencies**:

```
@anthropic-ai/claude-agent-sdk-darwin-arm64    @anthropic-ai/claude-agent-sdk-win32-x64
@anthropic-ai/claude-agent-sdk-darwin-x64      @anthropic-ai/claude-agent-sdk-win32-arm64
@anthropic-ai/claude-agent-sdk-linux-x64       @anthropic-ai/claude-agent-sdk-linux-arm64
@anthropic-ai/claude-agent-sdk-linux-x64-musl  @anthropic-ai/claude-agent-sdk-linux-arm64-musl
```

`npm install` only installs the **host's** optional package, so a build on
Apple Silicon vendors `darwin-arm64`, an Intel build vendors `darwin-x64`, and a
Windows x64 build vendors `win32-x64`. There is no "build once, run everywhere"
JS file anymore — **every target arch must be built on a runner of that arch**.

The vendored binary lands at:

```
backend-dist/node_modules/@anthropic-ai/claude-agent-sdk-<plat>-<arch>/<claude|claude.exe>
```

`backend/src/services/agentRunner.ts → resolveClaudeCodePath()` resolves it there
(prod: `ELISA_RESOURCES_PATH`; dev: `createRequire(import.meta.url).resolve(...)`),
falling back to SDK auto-resolution if absent. The SDK spawns that binary directly —
**no system `node` is required to launch the CLI** (Node is still used to run
generated project tests/tools).

### Forced API key (no host login fallback)

Elisa is a kids' app, so the CLI subprocess must run on the **configured
`ANTHROPIC_API_KEY`** and must never silently fall back to a host `~/.claude` login.
In 0.3.x, `options.env` **replaces** `process.env` for the subprocess (it is not
merged), so `agentRunner.ts` spreads `{ ...process.env }`, then force-sets
`ANTHROPIC_API_KEY` and points `CLAUDE_CONFIG_DIR` at an Elisa-owned directory
(`~/.elisa/claude-cli-config`) so the CLI cannot read or write the operator's
personal credentials. Packaging does not need to do anything for this — it's
runtime behavior — but it is the reason the binary must remain runnable under the
hardened-runtime entitlements below.

## How It Works

### Build Pipeline (`npm run build`)

1. **`build:frontend`** -- Vite production build -> `frontend/dist/`
2. **`build:backend`** -- esbuild bundles backend into single ESM file -> `backend/dist/server-entry.js`. Native modules and large SDKs are marked `external`.
3. **`build:backend:deps`** (`scripts/bundle-backend-deps.mjs`) -- Installs external deps (`@anthropic-ai/claude-agent-sdk ^0.3.x`, `@anthropic-ai/sdk ^0.100.x`, `simple-git`, `serialport`, `@serialport/bindings-cpp`) into `backend/dist/vendor/` via `npm install --omit=dev` (which **keeps optionals**, so the host-arch native CLI package is included). It strips `.bin` dirs, then **verifies the native CLI binary exists, is a regular file, and (non-Windows) has the user-exec bit** — failing the build loudly if the ~200 MB binary is missing.
4. **`build:mingit`** (Windows only) -- downloads MinGit (git + bash, ~39 MB); the native CLI still needs git-bash on Windows.
5. **`build:electron`** -- TypeScript compiles `electron/` -> `electron/dist/`

### Packaging (`electron-builder`)

Config lives in `electron-builder.js` (JS, not JSON, for conditional logic).

**extraResources** copied into the app's `resources/` directory:
- `frontend/dist` -> `frontend-dist` (static files served by backend)
- `backend/dist` -> `backend-dist` (bundled server + vendor deps, **incl. the ~200 MB native CLI**)
- `devices/_shared` -> `devices/_shared` (MicroPython libs)
- `build/frameworks` -> `frameworks` (Phaser/p5/Three.js, when present)
- `build/mingit` -> `mingit` (Windows only)

**afterPack hook**: Renames `backend-dist/vendor/` back to `backend-dist/node_modules/`
so ESM `import` resolution works at runtime (the rename dodge exists because
electron-builder strips `node_modules` from `extraResources`). It then **verifies
the native CLI binary** is present at
`node_modules/@anthropic-ai/claude-agent-sdk-<plat>-<arch>/<bin>` and that its
executable bit survived; agent builds fail in production if it is missing.

### Code Signing & Notarization

**Windows** (x64): signed when `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` are set;
skipped otherwise (`signAndEditExecutable: false`) for local dev. Unsigned builds
trip SmartScreen.

**macOS** (each arch, hardened runtime): signing is gated on `CSC_LINK` /
`CSC_KEY_PASSWORD`. Because the vendored CLI is a **Bun-based native binary running
under hardened runtime**, the app needs these entitlements (in the app
entitlements plist, with the inherit subset in the inherit plist):

| Entitlement | Why |
|-------------|-----|
| `com.apple.security.cs.allow-jit` | Bun JIT |
| `com.apple.security.cs.allow-unsigned-executable-memory` | Bun runtime |
| `com.apple.security.cs.disable-library-validation` | load the nested binary's libs under Elisa's identity |
| `com.apple.security.cs.allow-dyld-environment-variables` | the CLI relies on dyld env passthrough |
| `com.apple.security.inherit` | (inherit plist) child inherits the parent's sandbox/entitlements |

Anthropic already ships the binary hardened-runtime code-signed under **TeamID
`Q6L2SF6YDW`**. We **re-sign the nested binary under Elisa's signing identity**
(so the whole bundle is consistently signed) and then **notarize** the app with
Apple. Notarization is **ON** for distribution — without it Gatekeeper blocks the
~200 MB nested executable even when signed. Set `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` to notarize.

## Per-Arch CI Matrix

`.github/workflows/release.yml` triggers on `v*` tags and runs a per-arch matrix
so each target gets a runner of its own architecture (the native CLI cannot be
cross-built):

| Runner | Target | Arch | Vendored CLI package |
|--------|--------|------|----------------------|
| `macos-13` | `dist:mac` | macOS Intel (x64) | `claude-agent-sdk-darwin-x64` |
| `macos-latest` | `dist:mac` | macOS Apple Silicon (arm64) | `claude-agent-sdk-darwin-arm64` |
| `windows-latest` | `dist:win` | Windows x64 | `claude-agent-sdk-win32-x64` |

Each runner natively `npm install`s **only its own** optional native package — no
force-install or cross-arch hacks. Both macOS jobs sign + notarize; the release
job collects all artifacts (two macOS DMG/ZIP sets + one Windows EXE) into a single
GitHub Release.

### Required GitHub secrets

| Secret | Used by | Purpose |
|--------|---------|---------|
| `MAC_CSC_LINK` | both macOS jobs | base64 Developer ID Application `.p12` |
| `MAC_CSC_KEY_PASSWORD` | both macOS jobs | password for the `.p12` |
| `APPLE_ID` | both macOS jobs | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | both macOS jobs | app-specific password for notarization |
| `APPLE_TEAM_ID` | both macOS jobs | Apple Developer Team ID |
| `WIN_CSC_LINK` | windows job | base64 Windows code-signing cert |
| `WIN_CSC_KEY_PASSWORD` | windows job | password for the Windows cert |
| `GITHUB_TOKEN` | release job | publish the GitHub Release (auto-provided) |

```bash
git tag v0.5.0
git push origin v0.5.0   # fans out to macos-13 + macos-latest + windows-latest
```

### Known gap: win32-arm64

GitHub-hosted Windows arm64 runners are preview/limited, so we **do not** ship a
native arm64 Windows build. Windows-on-ARM users run the x64 build under emulation
(the x64 native CLI runs via the OS's x64 emulation layer). This is a documented
gap, not a bug; revisit when GA Windows arm64 runners are available. macOS has no
such gap — both Intel and Apple Silicon get native builds. Linux is not currently
a release target.

## Installer Size

The vendored ~200 MB native CLI dominates the bundle. Each installer is now
**materially larger** than the old `cli.js` era (which added only a single JS file):
expect roughly an extra ~200 MB per installer on top of the prior Electron baseline.
There is one such payload per arch (Intel mac, Apple Silicon mac, Windows x64), so
total release-artifact size grows accordingly. Record the actual delta in release
notes when cutting a tag so download-size expectations are clear.

## Testing the Packaged App

### Quick Smoke Test (unpacked)

```bash
npm run pack
# Windows:
release/win-unpacked/Elisa.exe
# Mac (arch-suffixed dir):
open release/mac-arm64/Elisa.app   # or release/mac-x64/Elisa.app
```

### Full Installer Test

```bash
npm run dist:win   # or dist:mac
# Run the generated installer, complete the wizard
```

### What to Verify

1. **First launch**: Settings dialog appears asking for API key
2. **API key save**: Enter key, click "Save & Start", main window opens
3. **Backend health**: `curl http://localhost:8000/api/health` returns `{"status":"ready","apiKey":"valid","agentSdk":"available"}`
4. **Native CLI present**: confirm `backend-dist/node_modules/@anthropic-ai/claude-agent-sdk-<plat>-<arch>/<claude|claude.exe>` exists inside the packaged resources and is executable
5. **Build a nugget**: Full end-to-end agent build works (proves the signed/notarized native binary actually launches under hardened runtime)
6. **Forced key**: agent runs against the configured key only — no `~/.claude` login is read (config isolated to `~/.elisa/claude-cli-config`)

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Claude binary not found at production path` (agent runner warn) | native CLI not vendored / wrong arch / rename failed | Confirm `bundle-backend-deps.mjs` verification passed and `afterPack` renamed `vendor/`->`node_modules/` |
| FATAL "native CLI binary is MISSING" at build | `npm install` ran with `--omit=optional`, or foreign-arch build | Build on a runner matching the target arch; do not strip optionals |
| macOS "app is damaged / can't be opened" | unsigned or un-notarized nested binary blocked by Gatekeeper | Sign (re-sign nested binary) + notarize with the secrets above |
| macOS crash on first agent run (`EXC_BAD_ACCESS`/codesign) | missing hardened-runtime entitlements for the Bun binary | Ensure JIT / unsigned-exec-memory / disable-library-validation / dyld-env entitlements are applied |
| `winCodeSign` symlink extraction error | Windows Developer Mode disabled, no admin | `signAndEditExecutable: false` (already conditional without `WIN_CSC_LINK`) |
| App launches but no window | API key missing, showing Settings dialog | Check taskbar for "Elisa - Settings" window |
| Agent runs use a host login instead of configured key | env not forced | Should not happen: `agentRunner.ts` force-sets `ANTHROPIC_API_KEY` + isolates `CLAUDE_CONFIG_DIR` |

## CI/CD

`.github/workflows/release.yml` triggers on `v*` tags. The per-arch matrix builds
macOS Intel, macOS Apple Silicon, and Windows x64 in parallel, signs + notarizes
(macOS), then a release job uploads all installers to a single GitHub Release.

## Version Bumping

Update `version` in `package.json` before tagging. The auto-updater
(`electron-updater`) compares this version against GitHub Releases to detect updates.

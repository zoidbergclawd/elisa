# Packaging Elisa for Distribution

## Prerequisites

- Node.js 20+
- `npm install` at repo root (installs all deps)

## Build Commands

| Command | Output | Use |
|---------|--------|-----|
| `npm run build` | Compiles frontend, backend bundle, vendor deps, electron TS | Required before any packaging |
| `npm run pack` | `release/win-unpacked/` or `release/mac-unpacked/` | Quick test (no installer) |
| `npm run dist:win` | `release/Elisa Setup X.Y.Z.exe` | Windows NSIS installer |
| `npm run dist:mac` | `release/Elisa-X.Y.Z.dmg` + `.zip` | Mac DMG + ZIP (must run on macOS) |

## How It Works

### Build Pipeline (`npm run build`)

1. **`build:frontend`** -- Vite production build -> `frontend/dist/`
2. **`build:backend`** -- esbuild bundles backend into single ESM file -> `backend/dist/server-entry.js`. Native modules and large SDKs are marked `external`.
3. **`build:backend:deps`** -- Installs external deps into `backend/dist/vendor/` (not `node_modules/` because electron-builder filters that out of `extraResources`).
4. **`build:electron`** -- TypeScript compiles `electron/` -> `electron/dist/`

### Packaging (`electron-builder`)

Config lives in `electron-builder.js` (JS, not JSON, for conditional logic).

**extraResources** copied into the app's `resources/` directory:
- `frontend/dist` -> `frontend-dist` (static files served by backend)
- `backend/dist` -> `backend-dist` (bundled server + vendor deps)
- `devices/_shared` -> `devices/_shared` (MicroPython libs)

**afterPack hook**: Renames `backend-dist/vendor/` back to `backend-dist/node_modules/` so ESM `import` resolution works at runtime. The rename dodge is only needed during electron-builder's copy phase.

### Code Signing

**Windows**: Skipped when `WIN_CSC_LINK` env var is not set (`signAndEditExecutable: false`). In CI, set `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` secrets.

**Mac**: Skipped when `CSC_LINK` is not set. For notarization, also set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

Without signing, Windows shows SmartScreen warning; macOS shows Gatekeeper "unidentified developer" dialog (right-click > Open to bypass).

## Testing the Packaged App

### Quick Smoke Test (unpacked)

```bash
npm run pack
# Windows:
release/win-unpacked/Elisa.exe
# Mac:
open release/mac-unpacked/Elisa.app
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
4. **Build a nugget**: Full end-to-end agent build works

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find package '@anthropic-ai/sdk'` | `vendor/` not renamed to `node_modules/` | Check `afterPack` hook in `electron-builder.js` |
| `winCodeSign` symlink extraction error | Windows Developer Mode disabled, no admin | Set `signAndEditExecutable: false` in win config (already conditional) |
| App launches but no window | API key missing, showing Settings dialog | Check taskbar for "Elisa - Settings" window |
| `signing with signtool.exe` then fails | No signing certificate | Normal without `WIN_CSC_LINK`; the conditional config skips signing |

## CI/CD

`.github/workflows/release.yml` triggers on `v*` tags. Builds Windows + Mac in parallel, uploads installers to GitHub Releases.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Version Bumping

Update `version` in `package.json` before tagging. The auto-updater (`electron-updater`) compares this version against GitHub Releases to detect updates.

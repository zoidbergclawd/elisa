/**
 * Electron main process.
 * Loads API key from encrypted store, starts Express server in-process,
 * and opens a BrowserWindow pointed at the local server.
 */

import { app, BrowserWindow, ipcMain, safeStorage, Menu, dialog, shell } from 'electron';
import * as path from 'path';
import * as net from 'net';
// electron-store v10 is ESM-only; use dynamic import() from CommonJS.
let store: { get(key: string): any; set(key: string, value: any): void };

async function initStore(): Promise<void> {
  const { default: Store } = await import('electron-store');
  store = new Store({ name: 'elisa-config' }) as any;
}

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let serverPort: number = 8000;
let serverInstance: { close: () => void } | null = null;
let authToken: string | null = null;

// -- Auto-Updater (production only) --

async function initAutoUpdater(): Promise<void> {
  if (!app.isPackaged) return;

  try {
    const { autoUpdater } = await import('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      console.log(`Update available: ${info.version}`);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`Update downloaded: ${info.version} -- will install on quit`);
      if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', info.version);
      }
    });

    autoUpdater.on('error', (err) => {
      console.warn('Auto-updater error:', err.message);
    });

    autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    console.warn('Auto-updater not available:', (err as Error).message);
  }
}

// -- API Key Management --

function getApiKey(): string | null {
  const encrypted = store.get('apiKeyEncrypted');
  if (!encrypted) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch {
    return null;
  }
}

function setApiKey(key: string): void {
  const encrypted = safeStorage.encryptString(key).toString('base64');
  store.set('apiKeyEncrypted', encrypted);
}

function hasApiKey(): boolean {
  return !!store.get('apiKeyEncrypted');
}

// -- Free Port Detection --
// Canonical implementation: backend/src/utils/findFreePort.ts

function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const tryNext = (): void => {
      if (port > 65535) {
        reject(new Error('No free port found'));
        return;
      }
      const server = net.createServer();
      server.listen(port, () => {
        const addr = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(addr));
      });
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          port++;
          tryNext();
        } else {
          reject(err);
        }
      });
    };
    tryNext();
  });
}

// -- Settings Window --

function openSettingsWindow(onSaved?: () => void): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 320,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Elisa - Settings',
    parent: mainWindow ?? undefined,
    modal: !!mainWindow,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, '..', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    if (onSaved && hasApiKey()) {
      onSaved();
    }
  });
}

// -- API Key Propagation (dev mode) --

async function propagateApiKeyToBackend(): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey || !authToken) return;

  // Retry a few times in case the backend hasn't started yet
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`http://localhost:${serverPort}/api/internal/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ apiKey }),
      });
      if (res.ok) return;
    } catch {
      // Backend not ready yet
    }
    await new Promise<void>(r => setTimeout(r, 2000));
  }
}

// -- Server Start --

async function startBackend(): Promise<void> {
  // Fix PATH on macOS/Linux: GUI apps launched from Finder/Dock don't inherit
  // the user's shell PATH, so node/git/npm from Homebrew/nvm won't be found.
  if (process.platform !== 'win32') {
    try {
      const { default: fixPath } = await import('fix-path');
      fixPath();
    } catch { /* best-effort -- PATH may already be correct */ }
  }

  const apiKey = getApiKey();
  if (apiKey) {
    process.env.ANTHROPIC_API_KEY = apiKey;
  }

  const isDev = !app.isPackaged;

  if (isDev) {
    // Dev mode: backend runs separately via concurrently (npm run dev).
    // Just use the existing backend on port 8000.
    serverPort = 8000;
    authToken = 'dev-token';
    return;
  }

  // Production: tell the backend where packaged resources live
  process.env.ELISA_RESOURCES_PATH = process.resourcesPath;

  // Detect and set up required tools (cross-platform).
  {
    const fs = require('fs') as typeof import('fs');
    const { execSync } = require('child_process') as typeof import('child_process');
    const isWin = process.platform === 'win32';
    const whichCmd = isWin ? 'where' : 'which';

    const hasCommand = (cmd: string): boolean => {
      try { execSync(`${whichCmd} ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
    };

    // Git + bash: on Windows, fall back to bundled MinGit if no system Git.
    // On macOS, Git comes with Xcode CLT (prompt to install if missing).
    if (!hasCommand('git')) {
      if (isWin) {
        const mingitDir = path.join(process.resourcesPath, 'mingit');
        const bashExe = path.join(mingitDir, 'usr', 'bin', 'bash.exe');
        if (fs.existsSync(bashExe)) {
          const gitCmd = path.join(mingitDir, 'cmd');
          const gitUsrBin = path.join(mingitDir, 'usr', 'bin');
          process.env.PATH = `${process.env.PATH};${gitCmd};${gitUsrBin}`;
          process.env.CLAUDE_CODE_GIT_BASH_PATH = bashExe;
          console.log('[main] Using bundled MinGit (no system git found)');
        }
      } else {
        console.warn('[main] Git not found. Install Xcode Command Line Tools: xcode-select --install');
        app.once('browser-window-created', () => {
          dialog.showMessageBox({
            type: 'warning',
            title: 'Git not installed',
            message: 'Elisa needs Git to track your project history.',
            detail: 'Open Terminal and run:\n\nxcode-select --install\n\nThen restart Elisa.',
            buttons: ['OK'],
          });
        });
      }
    }

    // Node.js: required for running tests and agent tools.
    if (!hasCommand('node')) {
      console.warn('[main] Node.js not found in PATH. Tests and some tools will not work.');
      app.once('browser-window-created', () => {
        dialog.showMessageBox({
          type: 'warning',
          title: 'Node.js not installed',
          message: 'Elisa works best with Node.js installed.',
          detail: 'Without it, your projects will build but tests and preview won\'t run.\n\nInstall Node.js (LTS) from nodejs.org to unlock the full experience.',
          buttons: ['Download Node.js', 'Continue without it'],
          defaultId: 0,
          cancelId: 1,
        }).then((result) => {
          if (result.response === 0) {
            shell.openExternal('https://nodejs.org/en/download');
          }
        });
      });
    }
  }

  const backendDist = path.join(process.resourcesPath, 'backend-dist');

  // Production: start the bundled backend in-process
  serverPort = await findFreePort(8000);
  const prodPath = path.join(backendDist, 'server-entry.js');
  const serverModule: { startServer: (port: number, staticDir?: string) => Promise<{ server: any; authToken: string }> } =
    await import(prodPath);
  const frontendDist = path.join(process.resourcesPath, 'frontend-dist');
  const result = await serverModule.startServer(serverPort, frontendDist);
  serverInstance = result.server;
  authToken = result.authToken;
}

// -- Main Window --

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Elisa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  const url = isDev
    ? 'http://localhost:5173'
    : `http://127.0.0.1:${serverPort}`;

  // Retry on load failure — Chromium's network service can crash on startup,
  // causing the initial page load to fail silently (blank window).
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.warn(`[main] Page load failed (${errorCode}: ${errorDescription}), retrying in 1s...`);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(url);
      }
    }, 1000);
  });

  // Chromium's network service can crash and restart during early startup,
  // leaving the page blank even though did-fail-load doesn't fire.
  // Check after load and reload once if the page has no content.
  let hasRetried = false;
  mainWindow.webContents.on('did-finish-load', () => {
    if (hasRetried) return;
    setTimeout(async () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      try {
        const title = await mainWindow.webContents.executeJavaScript('document.title');
        const bodyLen = await mainWindow.webContents.executeJavaScript('document.body?.innerHTML?.length ?? 0');
        console.log(`[main] Page loaded: title="${title}" bodyLen=${bodyLen}`);
        if (bodyLen < 50) {
          hasRetried = true;
          console.warn('[main] Page appears blank, reloading...');
          mainWindow.loadURL(url);
        }
      } catch {
        // ignore
      }
    }, 1500);
  });

  mainWindow.loadURL(url);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// -- Application Menu --

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => openSettingsWindow(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// -- IPC Handlers --

ipcMain.handle('get-api-key-status', () => {
  return hasApiKey() ? 'set' : 'missing';
});

ipcMain.handle('set-api-key', async (_event, key: string) => {
  setApiKey(key);
  // Update the running process env so backend picks it up (production: in-process)
  process.env.ANTHROPIC_API_KEY = key;
  // Dev mode: propagate to separately-running backend process
  if (!app.isPackaged) {
    propagateApiKeyToBackend().catch(() => {});
  }
  return true;
});

ipcMain.handle('open-settings', () => {
  openSettingsWindow();
  return true;
});

ipcMain.handle('get-auth-token', () => {
  return authToken;
});

ipcMain.handle('pick-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose Project Folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('capture-screenshot', async (_event, url: string) => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: { offscreen: true },
  });
  try {
    await win.loadURL(url);
    await new Promise<void>(r => setTimeout(r, 2000));
    const image = await win.webContents.capturePage();
    return { success: true, base64: image.toPNG().toString('base64') };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  } finally {
    win.destroy();
  }
});

// -- App Lifecycle --

app.whenReady().then(async () => {
  await initStore();
  buildMenu();

  const isDev = !app.isPackaged;

  if (!isDev && !hasApiKey()) {
    // First launch (production): show settings before starting server
    openSettingsWindow(async () => {
      await startBackend();
      createMainWindow();
      initAutoUpdater();
    });
  } else {
    await startBackend();
    if (!isDev) {
      createMainWindow();
      initAutoUpdater();
    } else {
      // Dev mode: propagate stored API key to separately-running backend
      propagateApiKeyToBackend().catch(() => {});
      createMainWindow();
    }
  }
});

app.on('before-quit', () => {
  // Cancel any running orchestrators to release resources before exit
  // In dev mode this is a no-op since the backend runs separately
  if (!app.isPackaged) return;
  console.log('Elisa shutting down: cleaning up resources...');
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

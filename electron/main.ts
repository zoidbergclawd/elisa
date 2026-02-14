/**
 * Electron main process.
 * Loads API key from encrypted store, starts Express server in-process,
 * and opens a BrowserWindow pointed at the local server.
 */

import { app, BrowserWindow, ipcMain, safeStorage, Menu, dialog } from 'electron';
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

// -- Server Start --

async function startBackend(): Promise<void> {
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

  // Production: start the bundled backend in-process
  serverPort = await findFreePort(8000);
  const prodPath = path.join(process.resourcesPath, 'backend-dist', 'server-entry.js');
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
    : `http://localhost:${serverPort}`;

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

ipcMain.handle('set-api-key', (_event, key: string) => {
  setApiKey(key);
  // Update the running process env so backend picks it up
  process.env.ANTHROPIC_API_KEY = key;
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
    });
  } else {
    await startBackend();
    createMainWindow();
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

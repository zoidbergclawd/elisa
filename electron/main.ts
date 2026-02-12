/**
 * Electron main process.
 * Loads API key from encrypted store, starts Express server in-process,
 * and opens a BrowserWindow pointed at the local server.
 */

import { app, BrowserWindow, ipcMain, safeStorage, Menu } from 'electron';
import * as path from 'path';
import * as net from 'net';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Store = require('electron-store');

const store = new Store({ name: 'elisa-config' }) as {
  get(key: string): any;
  set(key: string, value: any): void;
};

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let serverPort: number = 8000;

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

function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      if (startPort < 65535) {
        resolve(findFreePort(startPort + 1));
      } else {
        reject(new Error('No free port found'));
      }
    });
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
  settingsWindow.loadFile(path.join(__dirname, '..', 'electron', 'settings.html'));

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

  serverPort = await findFreePort(8000);

  const isDev = !app.isPackaged;

  // Use a variable so TypeScript doesn't resolve the import at compile time
  let serverModule: { startServer: (port: number, staticDir?: string) => Promise<any> };

  if (isDev) {
    // Dev mode: import from source (requires tsx/ts-node registered by electron)
    const devPath = path.join(__dirname, '..', 'backend', 'src', 'server.js');
    serverModule = await import(devPath);
    await serverModule.startServer(serverPort);
  } else {
    // Production: use bundled backend
    const prodPath = path.join(process.resourcesPath, 'backend-dist', 'server-entry.js');
    serverModule = await import(prodPath);
    const frontendDist = path.join(process.resourcesPath, 'frontend-dist');
    await serverModule.startServer(serverPort, frontendDist);
  }
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

// -- App Lifecycle --

app.whenReady().then(async () => {
  buildMenu();

  if (!hasApiKey()) {
    // First launch: show settings before starting server
    openSettingsWindow(async () => {
      await startBackend();
      createMainWindow();
    });
  } else {
    await startBackend();
    createMainWindow();
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

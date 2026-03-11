/**
 * Preload script: exposes a safe API to the renderer via contextBridge.
 */

import { contextBridge, ipcRenderer, shell } from 'electron';

contextBridge.exposeInMainWorld('elisaAPI', {
  getApiKeyStatus: (): Promise<'set' | 'missing'> =>
    ipcRenderer.invoke('get-api-key-status'),

  setApiKey: (key: string): Promise<boolean> =>
    ipcRenderer.invoke('set-api-key', key),

  openSettings: (): Promise<boolean> =>
    ipcRenderer.invoke('open-settings'),

  pickDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('pick-directory'),

  getAuthToken: (): Promise<string | null> =>
    ipcRenderer.invoke('get-auth-token'),

  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('get-app-version'),

  onUpdateDownloaded: (callback: (version: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, version: string) => callback(version);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },

  openExternal: (url: string): void => {
    shell.openExternal(url);
  },
});

/**
 * Preload script: exposes a safe API to the renderer via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('elisaAPI', {
  getApiKeyStatus: (): Promise<'set' | 'missing'> =>
    ipcRenderer.invoke('get-api-key-status'),

  setApiKey: (key: string): Promise<boolean> =>
    ipcRenderer.invoke('set-api-key', key),

  openSettings: (): Promise<boolean> =>
    ipcRenderer.invoke('open-settings'),

  pickDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('pick-directory'),
});

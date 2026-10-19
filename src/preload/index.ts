import { contextBridge, ipcRenderer } from 'electron';
import type { DockBridge, Snapshot } from '../shared/model';

const bridge: DockBridge = {
  command: (command) => ipcRenderer.invoke('dock:command', command),
  subscribe: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Snapshot): void => callback(state);
    ipcRenderer.on('dock:state', listener);
    return () => ipcRenderer.removeListener('dock:state', listener);
  },
};
contextBridge.exposeInMainWorld('dock', bridge);

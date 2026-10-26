import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from './shared/types';

// 렌더러(직접 그리는 UI)가 메인 프로세스에 요청할 수 있는 기능을 꼭 필요한 것만 노출합니다.
const bridge: Bridge = {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  quit: () => ipcRenderer.send('app:quit'),
  minimize: () => ipcRenderer.send('app:minimize'),
  toggleFullscreen: () => ipcRenderer.send('app:toggle-fullscreen'),
  setTheme: (mode) => ipcRenderer.send('app:set-theme', mode),
  setGuestCursor: (enabled) =>
    ipcRenderer.send('app:set-guest-cursor', enabled),
  showDownload: (id) => ipcRenderer.send('download:show', id),
  copyText: (text) => ipcRenderer.send('clipboard:write', text),
  onGuestOpen: (cb) => ipcRenderer.on('guest:open', (_e, req) => cb(req)),
  onShortcut: (cb) => ipcRenderer.on('shortcut', (_e, name) => cb(name)),
  onDownload: (cb) => ipcRenderer.on('download', (_e, info) => cb(info)),
};

contextBridge.exposeInMainWorld('bridge', bridge);

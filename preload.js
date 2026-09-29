// Narrow, explicit bridge between the widget page and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  load: () => ipcRenderer.invoke('pet:load'),
  save: (state) => ipcRenderer.invoke('pet:save', state),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  openMenu: () => ipcRenderer.send('menu:open'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('mouse:ignore', ignore),
  dragStart: (x, y) => ipcRenderer.send('drag:start', x, y),
  dragMove: (x, y) => ipcRenderer.send('drag:move', x, y),
  dragEnd: () => ipcRenderer.send('drag:end'),
  walkStep: (dx) => ipcRenderer.invoke('walk:step', dx),
  walkDone: () => ipcRenderer.send('walk:done'),
  notify: (key, title, body) => ipcRenderer.send('notify', key, title, body),
  quit: () => ipcRenderer.send('app:quit'),
  onAction: (fn) => ipcRenderer.on('action', (_e, a) => fn(a)),
  onSettings: (fn) => ipcRenderer.on('settings', (_e, s) => fn(s)),
  onSay: (fn) => ipcRenderer.on('say', (_e, text) => fn(text)),
  checkForUpdates: () => ipcRenderer.send('update:check'),
});

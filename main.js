// Electron main process: transparent always-on-top widget window, tray,
// right-click menu, save file, and walking the window along the taskbar.
const {
  app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, Notification,
} = require('electron');
const fs = require('fs');
const { createUpdater } = require('./updater');
const path = require('path');

const WIN_W = 300;
const WIN_H = 240;

// Tests point this at a temp dir so they never touch a real save.
if (process.env.PET_USER_DATA) app.setPath('userData', process.env.PET_USER_DATA);

const savePath = () => path.join(app.getPath('userData'), 'pet.json');
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

let win = null;
let tray = null;
let settings = { alwaysOnTop: true, roam: true, notifications: true, sound: true, x: null, y: null };

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Write to a temp file then rename, so a crash mid-write never corrupts the save.
function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function saveSettings() {
  writeJsonAtomic(settingsPath(), settings);
}

function defaultPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - WIN_W - 40,
    y: workArea.y + workArea.height - WIN_H,
  };
}

// Keep the window on a visible display (monitors get unplugged).
function onScreen(x, y) {
  return screen.getAllDisplays().some(({ workArea: a }) =>
    x + WIN_W > a.x + 20 && x < a.x + a.width - 20 && y + WIN_H > a.y + 20 && y < a.y + a.height - 20);
}

function createWindow() {
  let { x, y } = settings;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !onScreen(x, y)) ({ x, y } = defaultPosition());

  win = new BrowserWindow({
    x, y, width: WIN_W, height: WIN_H,
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: settings.alwaysOnTop,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 'screen-saver' level keeps it above the taskbar on Windows.
  if (settings.alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Pin the size. On Windows with display scaling (125%, 150%...) each
  // setPosition() rounds the DIP->pixel conversion and the window creeps
  // bigger; moving via setBounds with an explicit size (moveTo) prevents it,
  // and this catches anything else (e.g. dragging across monitors).
  win.setMinimumSize(WIN_W, WIN_H);
  win.setMaximumSize(WIN_W, WIN_H);
  win.on('resize', enforceSize);
  screen.on('display-metrics-changed', enforceSize);
  win.once('ready-to-show', () => { enforceSize(); win.showInactive(); });
  win.on('moved', rememberPosition);
  win.on('closed', () => { win = null; });
}

// Keep the whole window (and so the controls at its top) inside the work
// area — the screen minus the taskbar — of whichever monitor it is on.
function clampToScreen(x, y) {
  const centre = { x: Math.round(x + WIN_W / 2), y: Math.round(y + WIN_H / 2) };
  const a = screen.getDisplayNearestPoint(centre).workArea;
  return {
    x: Math.min(Math.max(Math.round(x), a.x), a.x + a.width - WIN_W),
    y: Math.min(Math.max(Math.round(y), a.y), a.y + a.height - WIN_H),
  };
}

// Every move goes through here so the size is re-asserted each time.
function moveTo(x, y) {
  if (!win || win.isDestroyed()) return;
  const p = clampToScreen(x, y);
  win.setBounds({ x: p.x, y: p.y, width: WIN_W, height: WIN_H });
}

function enforceSize() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  if (b.width !== WIN_W || b.height !== WIN_H) moveTo(b.x, b.y);
}

function rememberPosition() {
  if (!win) return;
  const [x, y] = win.getPosition();
  settings.x = x;
  settings.y = y;
  saveSettings();
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function buildMenu() {
  const openAtLogin = app.getLoginItemSettings().openAtLogin;
  return Menu.buildFromTemplate([
    { label: 'Feed', click: () => send('action', 'feed') },
    { label: 'Give a treat', click: () => send('action', 'treat') },
    { label: 'Play fetch', click: () => send('action', 'play') },
    { label: 'Belly rub', click: () => send('action', 'pet') },
    { label: 'Go for a walk', click: () => send('action', 'walk') },
    { label: 'Bath time', click: () => send('action', 'bath') },
    { label: 'Clean up', click: () => send('action', 'clean') },
    { label: 'Vet (medicine)', click: () => send('action', 'medicine') },
    { label: 'Sleep / Wake', click: () => send('action', 'toggle-sleep') },
    { type: 'separator' },
    { label: 'Show controls', click: () => send('action', 'stats') },
    { label: 'Rename…', click: () => send('action', 'rename') },
    { type: 'separator' },
    {
      label: 'Wander along the taskbar', type: 'checkbox', checked: settings.roam,
      click: (i) => { settings.roam = i.checked; saveSettings(); send('settings', settings); },
    },
    {
      label: 'Always on top', type: 'checkbox', checked: settings.alwaysOnTop,
      click: (i) => {
        settings.alwaysOnTop = i.checked;
        win && win.setAlwaysOnTop(i.checked, 'screen-saver');
        saveSettings();
      },
    },
    {
      label: 'Sound', type: 'checkbox', checked: settings.sound,
      click: (i) => { settings.sound = i.checked; saveSettings(); send('settings', settings); },
    },
    {
      label: 'Notifications', type: 'checkbox', checked: settings.notifications,
      click: (i) => { settings.notifications = i.checked; saveSettings(); },
    },
    {
      label: 'Start with Windows', type: 'checkbox', checked: openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }),
    },
    { label: 'Move back to corner', click: () => { if (win) { const p = defaultPosition(); moveTo(p.x, p.y); rememberPosition(); } } },
    { type: 'separator' },
    { label: 'Start over (new puppy)…', click: () => send('action', 'reset') },
    { type: 'separator' },
    updater.menuItem(),
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Desktop Dachshund');
  tray.on('click', () => { if (win) { win.showInactive(); win.moveTop(); } });
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
  tray.setContextMenu(null);
}

// ------------------------------------------------------------------- IPC

ipcMain.handle('pet:load', () => readJson(savePath(), null));
ipcMain.handle('pet:save', (_e, state) => {
  if (!state || typeof state !== 'object') return false;
  writeJsonAtomic(savePath(), state);
  return true;
});
ipcMain.handle('settings:get', () => settings);
ipcMain.on('menu:open', () => { if (win) buildMenu().popup({ window: win }); });

// Click-through on transparent areas: the renderer tells us when the mouse
// is over the dog/UI. `forward` keeps mousemove events flowing so it can.
ipcMain.on('mouse:ignore', (_e, ignore) => {
  if (win) win.setIgnoreMouseEvents(!!ignore, { forward: true });
});

let drag = null;
ipcMain.on('drag:start', (_e, sx, sy) => {
  if (!win) return;
  const [wx, wy] = win.getPosition();
  drag = { dx: sx - wx, dy: sy - wy };
});
ipcMain.on('drag:move', (_e, sx, sy) => {
  if (win && drag) moveTo(sx - drag.dx, sy - drag.dy);
});
ipcMain.on('drag:end', () => { drag = null; rememberPosition(); });

// Walk the window horizontally, staying inside the current display.
// Returns which edge (if any) was hit so the dog can turn around.
ipcMain.handle('walk:step', (_e, dx) => {
  if (!win) return { edge: null };
  const [x, y] = win.getPosition();
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  const minX = area.x;
  const maxX = area.x + area.width - WIN_W;
  let nx = x + Math.round(dx);
  let edge = null;
  if (nx <= minX) { nx = minX; edge = 'left'; }
  if (nx >= maxX) { nx = maxX; edge = 'right'; }
  moveTo(nx, y);
  return { edge };
});
ipcMain.on('walk:done', rememberPosition);

let lastNotify = {};
function showNotification(key, title, body) {
  if (!settings.notifications || !Notification.isSupported()) return;
  const now = Date.now();
  if (lastNotify[key] && now - lastNotify[key] < 60 * 60 * 1000) return; // once an hour per topic
  lastNotify[key] = now;
  const n = new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png') });
  n.on('click', () => { if (win) win.showInactive(); });
  n.show();
}

const updater = createUpdater({
  onChange: () => {},
  say: (text) => send('say', text),
  notify: showNotification,
});
ipcMain.on('update:check', () => updater.check(true));
ipcMain.on('notify', (_e, key, title, body) => showNotification(key, title, body));

ipcMain.on('app:quit', () => app.quit());

// ------------------------------------------------------------- lifecycle

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.showInactive(); win.moveTop(); } });
  app.setAppUserModelId('com.desktopdachshund.app'); // needed for Windows toasts
  app.whenReady().then(() => {
    settings = { ...settings, ...readJson(settingsPath(), {}) };
    createWindow();
    createTray();
    updater.start();
  });
  // Closing the widget window does not quit; the tray stays. Quit is explicit.
  app.on('window-all-closed', (e) => e && e.preventDefault && e.preventDefault());
}

module.exports = { WIN_W, WIN_H };

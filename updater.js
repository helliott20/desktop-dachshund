// Update checks against the GitHub releases of helliott20/desktop-dachshund.
//
// - Installed copy (NSIS installer): electron-updater downloads the new
//   version in the background and installs it when the app restarts/quits.
// - Portable .exe: electron-updater can't replace a portable exe, so we ask
//   the GitHub API for the latest release and offer to open its page.
//
// Checks only run in a packaged build (never in `npm start` or tests).
const { app, shell } = require('electron');
const { isNewer, parseRelease } = require('./src/version');

const REPO = 'helliott20/desktop-dachshund';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
// Tests point this at a local fake of the GitHub API.
const API_URL = process.env.PET_UPDATE_API || `https://api.github.com/repos/${REPO}/releases/latest`;
const FIRST_CHECK_MS = 15 * 1000;
const EVERY_MS = 6 * 60 * 60 * 1000;

function createUpdater({ onChange, say, notify }) {
  const portable = !!process.env.PORTABLE_EXECUTABLE_FILE;
  const enabled = (app.isPackaged || !!process.env.PET_UPDATE_API) && !process.env.PET_DISABLE_UPDATES;
  // status: idle | checking | current | downloading | available | ready | error
  const status = { state: 'idle', version: null, url: RELEASES_URL, portable, enabled };
  let autoUpdater = null;
  let manual = false; // user clicked "Check for updates": report "up to date" too

  const set = (patch) => {
    Object.assign(status, patch);
    onChange(status);
  };

  if (enabled && !portable) {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
    autoUpdater.on('update-not-available', () => {
      set({ state: 'current' });
      if (manual) say("You're up to date!");
      manual = false;
    });
    autoUpdater.on('update-available', (info) => set({ state: 'downloading', version: info.version }));
    autoUpdater.on('update-downloaded', (info) => {
      set({ state: 'ready', version: info.version });
      say(`New version ${info.version} is ready! Restart me from the menu.`);
      notify('update', 'Desktop Dachshund update ready',
        `Version ${info.version} installs next time the app restarts.`);
      manual = false;
    });
    autoUpdater.on('error', (err) => {
      set({ state: 'error' });
      if (manual) say("Couldn't check for updates.");
      manual = false;
      console.error('update error', err && err.message);
    });
  }

  async function checkPortable() {
    set({ state: 'checking' });
    try {
      const res = await fetch(API_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'desktop-dachshund' },
      });
      // 404 = no releases published yet: nothing to update to.
      const release = res.ok ? parseRelease(await res.json()) : null;
      if (!res.ok && res.status !== 404) throw new Error(`GitHub returned ${res.status}`);
      if (release && isNewer(release.version, app.getVersion())) {
        const first = status.version !== release.version;
        set({ state: 'available', version: release.version, url: release.url });
        if (first || manual) {
          say(`Version ${release.version} is out! Get it from the menu.`);
          notify('update', 'Desktop Dachshund update available',
            `Version ${release.version} is out. Right-click the dog to download it.`);
        }
      } else {
        set({ state: 'current' });
        if (manual) say("You're up to date!");
      }
    } catch (err) {
      set({ state: 'error' });
      if (manual) say("Couldn't check for updates.");
      console.error('update check failed', err && err.message);
    } finally {
      manual = false;
    }
  }

  function check(isManual = false) {
    if (!enabled) {
      if (isManual) say('Updates only work in the installed app.');
      return;
    }
    if (status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') return;
    manual = isManual;
    if (portable) checkPortable();
    else autoUpdater.checkForUpdates().catch(() => {}); // errors arrive via the 'error' event
  }

  function start() {
    if (!enabled) return;
    setTimeout(() => check(false), FIRST_CHECK_MS);
    setInterval(() => check(false), EVERY_MS);
  }

  /** Menu entry reflecting the current state. */
  function menuItem() {
    const v = app.getVersion();
    switch (status.state) {
      case 'checking': return { label: 'Checking for updates…', enabled: false };
      case 'downloading': return { label: `Downloading update ${status.version}…`, enabled: false };
      case 'ready': return { label: `Restart to update to ${status.version}`, click: () => autoUpdater.quitAndInstall() };
      case 'available': return { label: `Download update ${status.version}…`, click: () => shell.openExternal(status.url) };
      case 'error': return { label: `Check for updates (v${v}, last check failed)`, click: () => check(true) };
      default: return { label: `Check for updates (v${v})`, click: () => check(true) };
    }
  }

  return { start, check, menuItem, status };
}

module.exports = { createUpdater, REPO };

// End-to-end tests of the real Electron app (main process + preload + page).
// On Linux run under a virtual display: xvfb-run -a node --test test/electron.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { _electron: electron } = require('playwright-core');
const electronPath = require('electron');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'test-output');
// Linux CI (GitHub's Ubuntu 24.04) blocks the user namespaces Chromium's
// sandbox needs, and root can't use it at all; tests run without it there.
const needsNoSandbox = process.platform === 'linux';
const ARGS = [...(needsNoSandbox ? ['--no-sandbox'] : []), ROOT];

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dachshund-test-'));
fs.mkdirSync(SHOTS, { recursive: true });

async function launch() {
  const app = await electron.launch({
    executablePath: electronPath,
    args: ARGS,
    env: { ...process.env, PET_USER_DATA: userData },
    timeout: 30000, // fail fast instead of hanging if Electron can't start
  });
  const page = await app.firstWindow({ timeout: 30000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForLoadState('domcontentloaded');
  return { app, page, errors };
}

const winInfo = (app) => app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  return {
    count: BrowserWindow.getAllWindows().length,
    bounds: w.getBounds(),
    onTop: w.isAlwaysOnTop(),
    resizable: w.isResizable(),
    visible: w.isVisible(),
    bg: w.getBackgroundColor(),
  };
});

test('first launch: transparent always-on-top widget, name prompt, save file', async () => {
  const { app, page, errors } = await launch();
  const info = await winInfo(app);
  assert.equal(info.count, 1);
  assert.equal(info.bounds.width, 300);
  assert.equal(info.bounds.height, 240);
  assert.equal(info.onTop, true);
  assert.equal(info.resizable, false);
  assert.match(info.bg, /^#00/i, 'transparent background');

  await page.waitForSelector('#dialog:not(.hidden)');
  await page.fill('#dialogInput', 'Biscuit');
  await page.click('#dialogOk');
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  await page.waitForTimeout(300);

  const saved = JSON.parse(fs.readFileSync(path.join(userData, 'pet.json'), 'utf8'));
  assert.equal(saved.name, 'Biscuit');
  assert.equal(await page.evaluate(() => typeof window.desktop.save), 'function', 'preload bridge present');
  assert.equal(await page.evaluate(() => typeof require), 'undefined', 'no Node in the page');
  await page.screenshot({ path: path.join(SHOTS, 'electron-first-run.png') });
  assert.deepEqual(errors, []);
  await app.close();
});

test('menu actions from the main process reach the pet', async () => {
  const { app, page, errors } = await launch();
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  await page.evaluate(() => { const s = window.__pet.state; window.__pet.state = { ...s, stats: { ...s.stats, fullness: 20 } }; });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('action', 'feed'));
  await page.waitForFunction(() => window.__pet.state.stats.fullness > 50);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('action', 'stats')); // "Show controls"
  await page.waitForSelector('#hud:not(.hidden)');
  await page.screenshot({ path: path.join(SHOTS, 'electron-fed.png') });
  // the menu itself builds without throwing
  await page.evaluate(() => window.desktop.openMenu());
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await app.close();
});

test('walking moves the window and stops at the screen edges', async () => {
  const { app, page } = await launch();
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const x0 = (await winInfo(app)).bounds.x;
  const r1 = await page.evaluate(() => window.desktop.walkStep(-10));
  assert.equal(r1.edge, null);
  assert.equal((await winInfo(app)).bounds.x, x0 - 10);

  const left = await page.evaluate(() => window.desktop.walkStep(-100000));
  assert.equal(left.edge, 'left');
  assert.equal((await winInfo(app)).bounds.x, area.x);

  const right = await page.evaluate(() => window.desktop.walkStep(100000));
  assert.equal(right.edge, 'right');
  assert.equal((await winInfo(app)).bounds.x, area.x + area.width - 300);
  await app.close();
});

test('dragging moves the window and the position is remembered', async () => {
  let { app, page } = await launch();
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  await page.evaluate(() => {
    window.desktop.dragStart(500, 500);
  });
  const before = (await winInfo(app)).bounds;
  await page.evaluate(() => { window.desktop.dragMove(420, 380); window.desktop.dragEnd(); });
  await page.waitForTimeout(200);
  const after = (await winInfo(app)).bounds;
  assert.equal(after.x, before.x - 80);
  assert.equal(after.y, before.y - 120);
  const settings = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
  assert.equal(settings.x, after.x);
  assert.equal(settings.y, after.y);
  await app.close();

  ({ app, page } = await launch());
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  const reopened = (await winInfo(app)).bounds;
  assert.deepEqual([reopened.x, reopened.y], [after.x, after.y]);
  assert.equal(await page.isVisible('#dialog'), false, 'no name prompt second time');
  assert.equal(await page.evaluate(() => window.__pet.state.name), 'Biscuit');
  await app.close();
});

test('window never changes size while dragged or walking, even at 125% display scaling', async () => {
  const app = await electron.launch({
    executablePath: electronPath,
    args: [...ARGS.slice(0, -1), '--force-device-scale-factor=1.25', ROOT],
    env: { ...process.env, PET_USER_DATA: userData },
    timeout: 30000,
  });
  const page = await app.firstWindow({ timeout: 30000 });
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  await page.evaluate(async () => {
    window.desktop.dragStart(600, 600);
    for (let i = 0; i < 200; i++) {
      window.desktop.dragMove(600 - i * 1.37, 600 - (i % 50) * 0.73);
      await new Promise((r) => setTimeout(r, 5));
    }
    window.desktop.dragEnd();
    for (let i = 0; i < 100; i++) await window.desktop.walkStep(2);
  });
  await page.waitForTimeout(300);
  const b = (await winInfo(app)).bounds;
  assert.deepEqual([b.width, b.height], [300, 240]);
  await app.close();
});

test('controls follow the Windows light/dark setting live', async () => {
  const { app, page } = await launch();
  try {
    await page.waitForFunction(() => window.__pet && window.__pet.state);
    // Playwright forces prefers-color-scheme: light by default; turn that off
    // so the page sees the real OS/Electron theme.
    await page.emulateMedia({ colorScheme: null });
    const bg = () => page.$eval('#toolbar', (el) => getComputedStyle(el).backgroundColor);
    await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark'; });
    await page.waitForFunction(() => matchMedia('(prefers-color-scheme: dark)').matches);
    assert.equal(await bg(), 'rgb(36, 28, 25)');
    await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'light'; });
    await page.waitForFunction(() => !matchMedia('(prefers-color-scheme: dark)').matches);
    assert.equal(await bg(), 'rgb(255, 248, 236)');
  } finally {
    await app.close();
  }
});

test('update check: portable copy is told about a newer GitHub release', async () => {
  const http = require('http');
  let reply = { status: 200, body: { tag_name: 'v9.9.9', html_url: 'https://example.invalid/r/v9.9.9', draft: false, prerelease: false } };
  const server = http.createServer((req, res) => {
    res.writeHead(reply.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const api = `http://127.0.0.1:${server.address().port}/latest`;
  const app = await electron.launch({
    executablePath: electronPath,
    args: ARGS,
    env: { ...process.env, PET_USER_DATA: userData, PET_UPDATE_API: api, PORTABLE_EXECUTABLE_FILE: 'C:\\fake\\DesktopDachshund.exe' },
    timeout: 30000,
  });
  try {
    const page = await app.firstWindow({ timeout: 30000 });
    await page.waitForFunction(() => window.__pet && window.__pet.state);
    // Wait for the dog to say something matching `re` (ignoring its greeting).
    const saysSoon = (re) => page.waitForFunction((src) => {
      const b = document.getElementById('bubble');
      return !b.classList.contains('hidden') && new RegExp(src).test(b.textContent);
    }, re.source, { timeout: 10000 });
    const check = async () => {
      await page.evaluate(() => { document.getElementById('bubble').textContent = ''; window.desktop.checkForUpdates(); });
    };

    await check();
    await saysSoon(/Version 9\.9\.9 is out/);

    reply = { status: 200, body: { tag_name: 'v0.0.1', html_url: 'x', draft: false, prerelease: false } };
    await check();
    await saysSoon(/up to date/);

    reply = { status: 404, body: { message: 'Not Found' } }; // no releases yet
    await check();
    await saysSoon(/up to date/);
  } finally {
    await app.close();
    server.close();
  }
});

test('dragging into a corner keeps the whole widget (and its controls) on screen', async () => {
  const { app, page } = await launch();
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const corners = [[-5000, -5000], [99999, -5000], [-5000, 99999], [99999, 99999]];
  for (const [dx, dy] of corners) {
    await page.evaluate(([x, y]) => { window.desktop.dragStart(500, 500); window.desktop.dragMove(500 + x, 500 + y); window.desktop.dragEnd(); }, [dx, dy]);
    await page.waitForTimeout(100);
    const b = (await winInfo(app)).bounds;
    assert.ok(b.x >= area.x && b.x + b.width <= area.x + area.width, `x=${b.x} for ${dx},${dy}`);
    assert.ok(b.y >= area.y && b.y + b.height <= area.y + area.height, `y=${b.y} for ${dx},${dy}`);
  }
  await app.close();
});

test('an off-screen saved position is reset to the corner', async () => {
  const file = path.join(userData, 'settings.json');
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...s, x: 99999, y: 99999 }));
  const { app, page } = await launch();
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const b = (await winInfo(app)).bounds;
  assert.ok(b.x >= area.x && b.x + b.width <= area.x + area.width, `x=${b.x}`);
  assert.ok(b.y >= area.y && b.y + b.height <= area.y + area.height, `y=${b.y}`);
  await app.close();
});

test('time away is caught up on launch (offline decay with a floor)', async () => {
  const file = path.join(userData, 'pet.json');
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  s.lastTick = Date.now() - 3 * 24 * 60 * 60 * 1000; // away for 3 days
  s.stats = { fullness: 90, happiness: 90, energy: 90, hygiene: 90, health: 100 };
  s.asleep = false;
  fs.writeFileSync(file, JSON.stringify(s));
  const { app, page } = await launch();
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  const st = await page.evaluate(() => window.__pet.state.stats);
  assert.ok(st.fullness < 90, 'got hungrier');
  assert.ok(st.fullness >= 15, 'but not starving after a long weekend');
  await app.close();
});

test('a second copy does not open a second dog', async () => {
  const { app } = await launch();
  const second = spawn(electronPath, ARGS, { env: { ...process.env, PET_USER_DATA: userData }, stdio: 'ignore' });
  const code = await new Promise((resolve) => {
    const t = setTimeout(() => { second.kill(); resolve('still running'); }, 15000);
    second.on('exit', (c) => { clearTimeout(t); resolve(c); });
  });
  assert.equal(code, 0, 'second instance quits straight away');
  assert.equal((await winInfo(app)).count, 1);
  await app.close();
});

test('notifications and quit via the bridge do not crash', async () => {
  const { app, page, errors } = await launch();
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  await page.evaluate(() => window.desktop.notify('hungry', 'Biscuit is hungry!', 'test'));
  await page.evaluate(() => window.desktop.setIgnoreMouse(true));
  await page.evaluate(() => window.desktop.setIgnoreMouse(false));
  const closed = new Promise((r) => app.on('close', r));
  await page.evaluate(() => window.desktop.quit());
  await closed;
  assert.deepEqual(errors, []);
});

test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

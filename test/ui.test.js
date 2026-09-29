// Drives the widget page in headless Chromium (browser bridge, localStorage save).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'renderer', 'index.html');
const SHOTS = path.resolve(__dirname, '..', 'test-output');

let browser;
test.before(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
});
test.after(async () => { await browser.close(); });

async function open(ctx) {
  const page = await (ctx || (await browser.newContext({ viewport: { width: 300, height: 240 } }))).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PAGE);
  return { page, errors };
}

const stats = (page) => page.evaluate(() => ({ ...window.__pet.state.stats }));
// A pixel in the middle of the dog's body.
const DOG = { x: 150, y: 200 };
async function openControls(page) {
  await page.mouse.move(5, 150);
  await page.mouse.move(DOG.x, DOG.y, { steps: 3 });
  await page.waitForSelector('#hud:not(.hidden)');
}
async function setState(page, patch) {
  await page.evaluate((p) => {
    const s = window.__pet.state;
    window.__pet.state = { ...s, ...p, stats: { ...s.stats, ...(p.stats || {}) } };
  }, patch);
}

async function named(name = 'Biscuit') {
  const ctx = await browser.newContext({ viewport: { width: 300, height: 240 } });
  const { page, errors } = await open(ctx);
  await page.fill('#dialogInput', name);
  await page.click('#dialogOk');
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  return { ctx, page, errors };
}

test('first run asks for a name and greets', async () => {
  const { page, errors, ctx } = await named('Biscuit');
  assert.equal(await page.textContent('#bubble'), "Hi! I'm Biscuit!");
  assert.equal(await page.isVisible('#dialog'), false);
  await page.screenshot({ path: path.join(SHOTS, 'ui-first-run.png') });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('empty name falls back to Pup', async () => {
  const { page, ctx } = await named('   ');
  assert.equal(await page.evaluate(() => window.__pet.state.name), 'Pup');
  await ctx.close();
});

test('hovering the dog shows the controls; they hide once the mouse leaves', async () => {
  const { page, ctx } = await named();
  await page.mouse.move(5, 150); // transparent corner
  await page.waitForTimeout(300);
  assert.equal(await page.isVisible('#hud'), false, 'nothing shown over empty space');
  await openControls(page);
  assert.equal(await page.textContent('#petName'), 'Biscuit');
  const widths = await page.$$eval('.bar s', (els) => els.map((e) => parseFloat(e.style.width)));
  assert.equal(widths.length, 5);
  assert.ok(widths.every((w) => w > 50));
  const icons = await page.$$eval('img[data-icon]', (els) => els.map((e) => [e.dataset.icon, e.naturalWidth]));
  assert.equal(icons.length, 14);
  for (const [name, w] of icons) assert.ok(w > 0, `icon ${name} rendered`);
  await page.screenshot({ path: path.join(SHOTS, 'ui-hud.png') });

  // move off the dog onto transparent space
  await page.mouse.move(5, 150, { steps: 3 });
  await page.waitForSelector('#hud', { state: 'hidden', timeout: 2500 });
  await ctx.close();
});

test('controls hide even when no mouseleave arrives (Windows click-through)', async () => {
  const { page, ctx } = await named();
  await openControls(page);
  // No further mouse events at all, like the cursor jumping off a click-through window.
  await page.waitForSelector('#hud', { state: 'hidden', timeout: 2500 });
  await ctx.close();
});

test('controls stay open while the mouse is on them', async () => {
  const { page, ctx } = await named();
  await openControls(page);
  for (let i = 0; i < 8; i++) { // ~2s of moving along the toolbar
    await page.mouse.move(30 + i * 25, 18);
    await page.waitForTimeout(250);
  }
  assert.equal(await page.isVisible('#hud'), true);
  await ctx.close();
});

test('every toolbar button performs its action', async () => {
  const { page, errors, ctx } = await named();
  await openControls(page);
  const low = { fullness: 30, happiness: 30, energy: 60, hygiene: 30, health: 20 };
  const cases = [
    ['feed', (a, b) => b.fullness > a.fullness],
    ['treat', (a, b) => b.happiness > a.happiness],
    ['play', (a, b) => b.happiness > a.happiness && b.energy < a.energy],
    ['pet', (a, b) => b.happiness > a.happiness],
    ['walk', (a, b) => b.happiness > a.happiness && b.energy < a.energy],
    ['bath', (a, b) => b.hygiene === 100],
    ['medicine', (a, b) => b.health > a.health],
  ];
  for (const [action, check] of cases) {
    await setState(page, { stats: low, lastPetAt: 0 });
    const before = await stats(page);
    await page.click(`#toolbar button[data-action=${action}]`);
    await page.waitForTimeout(150);
    const after = await stats(page);
    assert.ok(check(before, after), `${action}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    assert.equal(await page.isVisible('#bubble'), true, `${action} says something`);
    await page.screenshot({ path: path.join(SHOTS, `ui-action-${action}.png`) });
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('sleep disables most buttons, wake restores them', async () => {
  const { page, ctx } = await named();
  await openControls(page);
  await setState(page, { stats: { energy: 40 } });
  await page.click('#sleepBtn');
  assert.equal(await page.evaluate(() => window.__pet.state.asleep), true);
  assert.equal(await page.isDisabled('button[data-action=feed]'), true);
  assert.equal(await page.isDisabled('button[data-action=clean]'), false);
  assert.equal(await page.getAttribute('#sleepBtn img', 'data-icon'), 'sun');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, 'ui-sleeping.png') });
  await page.click('#sleepBtn');
  assert.equal(await page.evaluate(() => window.__pet.state.asleep), false);
  assert.equal(await page.isDisabled('button[data-action=feed]'), false);
  await ctx.close();
});

test('clicking the dog gives a belly rub; clicking a poop cleans it', async () => {
  const { page, ctx } = await named();
  await setState(page, { stats: { happiness: 40 }, lastPetAt: 0 });
  await page.mouse.move(DOG.x, DOG.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert.equal((await stats(page)).happiness, 48);
  assert.equal(await page.evaluate(() => window.__pet.view.anim), 'belly');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'ui-belly-rub.png') });

  await setState(page, { poops: 1 });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(SHOTS, 'ui-poop.png') });
  // first poop sits at logical x=1..7 on the floor (scale 4)
  await page.mouse.move(14, 232);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__pet.state.poops), 0);
  await ctx.close();
});

test('the pet is saved and restored across reloads', async () => {
  const { page, ctx } = await named('Waffle');
  await openControls(page);
  await setState(page, { stats: { fullness: 30 } });
  await page.click('button[data-action=feed]');
  await page.waitForTimeout(200);
  const meals = await page.evaluate(() => window.__pet.state.counters.meals);
  assert.equal(meals, 1);
  await page.reload();
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  assert.equal(await page.isVisible('#dialog'), false, 'no name prompt on reload');
  assert.equal(await page.evaluate(() => window.__pet.state.name), 'Waffle');
  assert.equal(await page.evaluate(() => window.__pet.state.counters.meals), 1);
  await ctx.close();
});

test('a corrupt save does not break the widget', async () => {
  const ctx = await browser.newContext({ viewport: { width: 300, height: 240 } });
  await ctx.addInitScript(() => localStorage.setItem('desktop-dachshund', '{"name":"Crumb","stats":{"fullness":"??"},"poops":-4}'));
  const { page, errors } = await open(ctx);
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  const s = await page.evaluate(() => window.__pet.state);
  assert.equal(s.name, 'Crumb');
  assert.equal(typeof s.stats.fullness, 'number');
  assert.equal(s.poops, 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rename and start over', async () => {
  const { page, ctx } = await named('Biscuit');
  page.evaluate(() => window.__pet.doAction('rename'));
  await page.waitForSelector('#dialog:not(.hidden)');
  assert.equal(await page.inputValue('#dialogInput'), 'Biscuit');
  await page.fill('#dialogInput', 'Sir Biscuit');
  await page.click('#dialogOk');
  await page.waitForFunction(() => window.__pet.state.name === 'Sir Biscuit');

  page.evaluate(() => window.__pet.doAction('reset'));
  await page.waitForSelector('#dialog:not(.hidden)');
  await page.click('#dialogCancel'); // "no, keep my dog"
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__pet.state.name), 'Sir Biscuit');

  page.evaluate(() => window.__pet.doAction('reset'));
  await page.waitForSelector('#dialog:not(.hidden)');
  await page.click('#dialogOk');
  await page.waitForSelector('#dialogInput:not(.hidden)');
  await page.fill('#dialogInput', 'Noodle');
  await page.click('#dialogOk');
  await page.waitForFunction(() => window.__pet.state.name === 'Noodle');
  assert.equal(await page.evaluate(() => window.__pet.state.counters.meals), 0);
  await ctx.close();
});

test('mood drives the idle animation', async () => {
  const { page, ctx } = await named();
  const animFor = async (patch) => {
    await setState(page, patch);
    await page.evaluate(() => { window.__pet.view.animUntil = 0; window.__pet.view.walkUntil = 0; });
    await page.waitForTimeout(80);
    return page.evaluate(() => {
      const s = window.__pet.state;
      return window.Pet.MOOD_ANIM[window.Pet.mood(s)];
    });
  };
  assert.equal(await animFor({ stats: { fullness: 5 } }), 'sad');
  await page.screenshot({ path: path.join(SHOTS, 'ui-hungry.png') });
  assert.equal(await animFor({ stats: { fullness: 80, health: 10 } }), 'sick');
  await page.screenshot({ path: path.join(SHOTS, 'ui-sick.png') });
  assert.equal(await animFor({ stats: { health: 100, happiness: 95, fullness: 95 } }), 'wag');
  await ctx.close();
});

test('controls follow the system dark theme', async () => {
  const bgOf = (page) => page.$eval('#toolbar', (el) => getComputedStyle(el).backgroundColor);
  const iconsOf = (page) => page.$$eval('#toolbar img', (els) => els.map((e) => e.src));

  const light = await named();
  await openControls(light.page);
  const lightBg = await bgOf(light.page);
  const lightIcons = await iconsOf(light.page);
  await light.ctx.close();

  const ctx = await browser.newContext({ viewport: { width: 300, height: 240 }, colorScheme: 'dark' });
  const { page, errors } = await open(ctx);
  await page.fill('#dialogInput', 'Biscuit');
  await page.click('#dialogOk');
  await page.waitForFunction(() => window.__pet && window.__pet.state);
  await openControls(page);
  assert.equal(lightBg, 'rgb(255, 248, 236)');
  assert.equal(await bgOf(page), 'rgb(36, 28, 25)', 'dark panel');
  assert.equal(await page.$eval('#petName', (el) => getComputedStyle(el).color), 'rgb(243, 230, 214)', 'light text');
  // Icons with black outlines are redrawn light; outline-free ones (bubble) don't need to change.
  const darkIcons = await iconsOf(page);
  const names = await page.$$eval('#toolbar img', (els) => els.map((e) => e.dataset.icon));
  for (const name of ['bowl', 'paw', 'broom', 'pill', 'zzz']) {
    const i = names.indexOf(name);
    assert.notEqual(darkIcons[i], lightIcons[i], `${name} icon redrawn for dark mode`);
  }
  await page.screenshot({ path: path.join(SHOTS, 'ui-dark.png') });

  // switching the theme while running repaints without a restart
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(100);
  assert.equal(await bgOf(page), lightBg);
  assert.deepEqual(await iconsOf(page), lightIcons);
  assert.deepEqual(errors, []);
  await ctx.close();
});

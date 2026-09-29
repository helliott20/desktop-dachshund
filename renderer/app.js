/* Widget page: game loop, drawing, input, and UI. */
(async function () {
  'use strict';

  const { Sprites, Pet } = window;

  // Inside Electron the preload provides `desktop`. Opened in a plain browser
  // (development / tests) we fall back to localStorage and no window moves.
  const bridge = window.desktop || browserBridge();

  const SCALE = 4;
  const SW = 75; // scene size in logical pixels
  const SH = 34;
  const DOG_X = 9;
  const DOG_Y = SH - Sprites.H;
  const SAVE_EVERY_MS = 30 * 1000;

  const ANIM_MS = { eat: 2600, wag: 3000, happy: 2200, sad: 2500, belly: 2600, walk: 8000, idle: 1500, sleep: 1500, sick: 2000 };
  const FRAME_MS = { walk: 130, wag: 140, happy: 220, belly: 260, eat: 260, sleep: 900, idle: 450, sad: 700, sick: 500 };

  const $ = (id) => document.getElementById(id);
  const canvas = $('scene');
  canvas.width = SW * SCALE;
  canvas.height = SH * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let settings = { roam: true, sound: true, ...(await bridge.getSettings()) };
  bridge.onSettings((s) => { settings = { ...settings, ...s }; });

  const view = {
    anim: 'idle',
    animUntil: 0,
    effect: null,
    effectStart: 0,
    effectUntil: 0,
    frame: 0,
    frameAt: 0,
    facing: 1, // 1 = right, -1 = left
    walkUntil: 0,
    nextWalkAt: Date.now() + 20000,
    walkBusy: false,
    hover: false,
    hudUntil: 0, // controls hide after this time
    bubbleUntil: 0,
    lastChatterAt: Date.now(),
  };

  // ------------------------------------------------------------ state
  let state = null;
  function greeting(s) {
    const m = Pet.mood(s);
    if (m === 'sleeping') return null;
    if (m === 'hungry') return 'You\'re back! Food?';
    if (m === 'sick') return '*whimper* You\'re back...';
    return pick(['You\'re back!!', 'Woof woof!', '*excited wiggle*']);
  }

  async function save() {
    try { await bridge.save(state); } catch (e) { console.error('save failed', e); }
  }

  // ---------------------------------------------------------- actions
  async function doAction(action) {
    const now = Date.now();
    if (action === 'stats') { openHud(8000); return; }
    if (action === 'rename') {
      const name = await askName('New name?', state.name);
      if (name) { state.name = name.trim().slice(0, 20) || state.name; say(`I'm ${state.name}!`); await save(); }
      return;
    }
    if (action === 'reset') {
      const yes = await confirmDialog(`Say goodbye to ${state.name} and start over?`);
      if (!yes) return;
      const name = await askName('Your new dachshund! What\'s their name?');
      state = Pet.createPet(name, Date.now());
      say(`Hi! I'm ${state.name}!`);
      playAnim('happy');
      await save();
      return;
    }
    if (action === 'toggle-sleep') action = state.asleep ? 'wake' : 'sleep';

    const res = Pet.act(state, action, now);
    state = res.state;
    if (res.say) say(res.say);
    if (res.effect) setEffect(res.effect, ANIM_MS[res.anim] || 2500);
    if (action === 'walk' && res.ok) startWalk(8000, true);
    else if (res.anim && res.anim !== 'sleep' && res.anim !== 'idle') playAnim(res.anim);
    if (action === 'sleep' || action === 'wake') view.animUntil = 0;
    beep(res.ok ? 'ok' : 'no');
    render();
    updateHud();
    await save();
  }
  bridge.onAction(doAction);
  bridge.onSay((text) => say(text, 6000)); // e.g. update news from the main process

  function playAnim(anim) {
    view.anim = anim;
    view.animUntil = Date.now() + (ANIM_MS[anim] || 2000);
    view.frame = 0;
    view.walkUntil = 0;
  }

  function setEffect(effect, ms) {
    view.effect = effect;
    view.effectStart = Date.now();
    view.effectUntil = Date.now() + ms;
  }

  // ---------------------------------------------------------- walking
  function startWalk(ms, forced = false) {
    const now = Date.now();
    view.walkUntil = now + ms;
    view.animUntil = 0;
    if (!forced || Math.random() < 0.5) view.facing = Math.random() < 0.5 ? -1 : 1;
  }

  function canWander() {
    const m = Pet.mood(state);
    return settings.roam && !state.asleep && (m === 'happy' || m === 'content') && !view.hover && dialogOpen === null;
  }

  async function walkTick(now) {
    if (now >= view.walkUntil || view.walkBusy) return;
    if (!settings.roam || view.hover) return; // walk in place
    view.walkBusy = true;
    try {
      const { edge } = await bridge.walkStep(view.facing * 2);
      if (edge === 'left') view.facing = 1;
      if (edge === 'right') view.facing = -1;
    } finally {
      view.walkBusy = false;
    }
  }

  // -------------------------------------------------------- rendering
  function currentAnim(now) {
    if (state.asleep) return 'sleep';
    if (now < view.walkUntil) return 'walk';
    if (now < view.animUntil) return view.anim;
    return Pet.MOOD_ANIM[Pet.mood(state)] || 'idle';
  }

  function render() {
    if (!state) return;
    const now = Date.now();
    const anim = currentAnim(now);
    const frames = Sprites.ANIMATIONS[anim];
    if (now - view.frameAt >= (FRAME_MS[anim] || 300)) {
      view.frame++;
      view.frameAt = now;
    }
    const grid = frames[view.frame % frames.length];
    const flip = view.facing < 0 && anim !== 'belly';

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // soft ground shadow
    ctx.fillStyle = 'rgba(35,18,11,0.18)';
    ctx.fillRect((DOG_X + 6) * SCALE, (SH - 1) * SCALE, 44 * SCALE, SCALE);
    ctx.fillRect((DOG_X + 10) * SCALE, (SH - 2) * SCALE, 36 * SCALE, SCALE);

    drawPoops();
    Sprites.drawAt(ctx, grid, DOG_X, DOG_Y, SCALE, flip);
    drawEffect(now, flip);
    if (anim === 'sleep') drawZs(now, flip);
  }

  const POOP_SPOTS = [[1, SH - 5], [67, SH - 5], [60, SH - 5]];
  function drawPoops() {
    for (let i = 0; i < state.poops; i++) {
      const [x, y] = POOP_SPOTS[i];
      Sprites.drawProp(ctx, 'poop', x, y, SCALE);
      if (Math.floor(Date.now() / 400) % 2 === i % 2) Sprites.drawProp(ctx, 'stink', x + 1, y - 4, SCALE);
    }
  }

  function drawEffect(now, flip) {
    if (!view.effect || now > view.effectUntil) { view.effect = null; return; }
    const t = (now - view.effectStart) / 1000;
    const faceX = flip ? DOG_X + 2 : DOG_X + 47; // just in front of the nose
    switch (view.effect) {
      case 'bowl': Sprites.drawProp(ctx, t > 2 ? 'bowlEmpty' : 'bowl', flip ? faceX - 4 : faceX, SH - 5, SCALE); break;
      case 'bone': Sprites.drawProp(ctx, 'bone', flip ? faceX - 2 : faceX + 1, DOG_Y + 12, SCALE); break;
      case 'ball': {
        const bounce = Math.abs(Math.sin(t * 5)) * 8;
        Sprites.drawProp(ctx, 'ball', flip ? faceX - 5 : faceX + 3, Math.round(SH - 6 - bounce), SCALE);
        break;
      }
      case 'heart': {
        for (let i = 0; i < 3; i++) {
          const p = (t * 0.8 + i / 3) % 1;
          const hx = DOG_X + 22 + i * 7 + Math.round(Math.sin((t + i) * 4));
          Sprites.drawProp(ctx, 'heart', hx, Math.round(DOG_Y + 8 - p * 12), SCALE);
        }
        break;
      }
      case 'bubbles': {
        for (let i = 0; i < 6; i++) {
          const p = (t * 0.7 + i / 6) % 1;
          Sprites.drawProp(ctx, 'bubble', DOG_X + 8 + i * 7, Math.round(SH - 8 - p * 22), SCALE);
        }
        break;
      }
      case 'pill': Sprites.drawProp(ctx, 'pill', flip ? faceX - 3 : faceX + 2, SH - 5, SCALE); break;
      case 'leash': break;
      default: break;
    }
  }

  function drawZs(now, flip) {
    const t = now / 1000;
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.35 + i / 3) % 1;
      const x = (flip ? DOG_X + 40 : DOG_X + 12) + Math.round(p * 6);
      Sprites.drawProp(ctx, 'z', x, Math.round(DOG_Y + 12 - p * 14), SCALE);
    }
  }

  // --------------------------------------------------------------- HUD
  function updateHud() {
    if (!state) return;
    $('petName').textContent = state.name;
    const days = Pet.ageDays(state, Date.now());
    $('petMeta').textContent = `${days}d · ${Pet.mood(state)}`;
    for (const el of document.querySelectorAll('.bar')) {
      const v = state.stats[el.dataset.stat];
      el.querySelector('s').style.width = `${Math.max(2, v)}%`;
      el.classList.toggle('low', v < 25);
      el.classList.toggle('mid', v >= 25 && v < 55);
      el.title = `${el.dataset.stat}: ${Math.round(v)}%`;
    }
    for (const b of document.querySelectorAll('#toolbar button')) {
      const a = b.dataset.action;
      b.disabled = state.asleep && !['toggle-sleep', 'clean'].includes(a);
    }
    const icon = state.asleep ? 'sun' : 'zzz';
    const img = $('sleepBtn').querySelector('img');
    if (img.dataset.icon !== icon) { img.dataset.icon = icon; img.src = iconUrl(icon); }
    $('sleepBtn').title = state.asleep ? 'Wake up' : 'Sleep';
  }

  // Controls show while the mouse is over the dog or the controls, and close
  // shortly after it leaves. This is timer-based on purpose: with a
  // click-through window, Windows often never sends a mouseleave, which left
  // the controls stuck open.
  const HUD_LINGER_MS = 1000;
  const hudOpen = () => !$('hud').classList.contains('hidden');
  function openHud(ms = HUD_LINGER_MS) {
    if (!state) return;
    if (!hudOpen()) { $('hud').classList.remove('hidden'); updateHud(); }
    view.hudUntil = Math.max(view.hudUntil, Date.now() + ms);
  }
  function closeHud() {
    $('hud').classList.add('hidden');
    view.hudUntil = 0;
  }

  function say(text, ms = 3500) {
    if (!text) return;
    const b = $('bubble');
    b.textContent = text;
    b.classList.remove('hidden');
    b.classList.toggle('left', view.facing < 0 && !state?.asleep);
    view.bubbleUntil = Date.now() + ms;
    view.lastChatterAt = Date.now();
  }

  // Pixel-art icons rendered from the sprite data (no emoji font needed).
  // In dark mode the black outlines become light so icons stay visible.
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const DARK_ICON_COLORS = { K: '#f3e6d6', b: '#c9b3a2' };
  const iconCache = {};
  function iconUrl(name) {
    const dark = darkQuery.matches;
    const key = `${dark ? 'd' : 'l'}:${name}`;
    if (iconCache[key]) return iconCache[key];
    const rows = Sprites.PROPS[name];
    const w = Math.max(...rows.map((r) => r.length));
    const c = document.createElement('canvas');
    const px = 2;
    c.width = w * px;
    c.height = rows.length * px;
    Sprites.drawProp(c.getContext('2d'), name, 0, 0, px, dark ? DARK_ICON_COLORS : null);
    return (iconCache[key] = c.toDataURL());
  }
  function paintIcons() {
    document.querySelectorAll('img[data-icon]').forEach((img) => { img.src = iconUrl(img.dataset.icon); });
  }
  paintIcons();
  darkQuery.addEventListener('change', paintIcons); // Windows theme switched while running

  document.querySelectorAll('#toolbar button').forEach((b) =>
    b.addEventListener('click', () => doAction(b.dataset.action)));

  // ---------------------------------------------------------- dialogs
  let dialogOpen = null;
  function openDialog({ label, input, value = '', ok = 'OK', cancel = true }) {
    return new Promise((resolve) => {
      const form = $('dialog');
      const inp = $('dialogInput');
      $('dialogLabel').textContent = label;
      inp.classList.toggle('hidden', !input);
      inp.value = value;
      $('dialogOk').textContent = ok;
      $('dialogCancel').classList.toggle('hidden', !cancel);
      form.classList.remove('hidden');
      bridge.setIgnoreMouse(false);
      if (input) setTimeout(() => inp.focus(), 50);
      const done = (v) => {
        form.classList.add('hidden');
        form.onsubmit = null;
        $('dialogCancel').onclick = null;
        dialogOpen = null;
        resolve(v);
      };
      form.onsubmit = (e) => { e.preventDefault(); done(input ? inp.value : true); };
      $('dialogCancel').onclick = () => done(input ? null : false);
      dialogOpen = done;
    });
  }
  async function askName(label, current = '') {
    const v = await openDialog({ label, input: true, value: current, cancel: !!current });
    return v && v.trim() ? v.trim().slice(0, 20) : current || 'Pup';
  }
  const confirmDialog = (label) => openDialog({ label, input: false, ok: 'Yes', cancel: true });

  // ------------------------------------------------------------- input
  // Transparent pixels are click-through; the dog and the panels are not.
  let ignoring = null;
  function setIgnore(v) {
    if (v !== ignoring) { ignoring = v; bridge.setIgnoreMouse(v); }
  }
  function opaqueAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * canvas.width);
    const y = Math.floor(((clientY - r.top) / r.height) * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
    return ctx.getImageData(x, y, 1, 1).data[3] > 60;
  }
  function overUi(target) {
    return !!(target && target.closest && target.closest('#hud:not(.hidden), #bubble:not(.hidden), #dialog:not(.hidden)'));
  }

  document.addEventListener('mousemove', (e) => {
    const onDog = opaqueAt(e.clientX, e.clientY);
    const over = onDog || overUi(e.target) || drag.active;
    setIgnore(!over && dialogOpen === null);
    view.hover = over; // pauses wandering so the dog doesn't walk off mid-click
    if (over && !drag.active && dialogOpen === null) openHud();
  });
  document.addEventListener('mouseleave', () => {
    if (drag.active) return;
    view.hover = false;
    setIgnore(true);
  });

  const drag = { down: false, active: false, sx: 0, sy: 0 };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !opaqueAt(e.clientX, e.clientY)) return;
    canvas.setPointerCapture(e.pointerId);
    drag.down = true;
    drag.active = false;
    drag.sx = e.screenX;
    drag.sy = e.screenY;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag.down) return;
    if (!drag.active && Math.hypot(e.screenX - drag.sx, e.screenY - drag.sy) > 4) {
      drag.active = true;
      closeHud();
      canvas.classList.add('dragging');
      bridge.dragStart(drag.sx, drag.sy);
    }
    if (drag.active) bridge.dragMove(e.screenX, e.screenY);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag.down) return;
    drag.down = false;
    canvas.releasePointerCapture(e.pointerId);
    if (drag.active) {
      drag.active = false;
      canvas.classList.remove('dragging');
      bridge.dragEnd();
      return;
    }
    onDogClick(e);
  });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); bridge.openMenu(); });

  function onDogClick(e) {
    if (!state) return;
    // Clicking a poop cleans it up; clicking the dog gives a belly rub.
    const r = canvas.getBoundingClientRect();
    const lx = ((e.clientX - r.left) / r.width) * SW;
    const onPoop = POOP_SPOTS.slice(0, state.poops).some(([x]) => lx >= x - 1 && lx <= x + 8) &&
      ((e.clientY - r.top) / r.height) * SH >= SH - 7;
    if (onPoop) return doAction('clean');
    if (state.asleep) { say('Zzz... *snore*', 1500); return; }
    doAction('pet');
  }

  // -------------------------------------------------------------- sound
  let audio = null;
  function beep(kind) {
    if (!settings.sound) return;
    try {
      audio = audio || new AudioContext();
      const notes = kind === 'ok' ? [660, 880] : [220, 180];
      notes.forEach((f, i) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'square';
        o.frequency.value = f;
        const t0 = audio.currentTime + i * 0.09;
        g.gain.setValueAtTime(0.04, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
        o.connect(g).connect(audio.destination);
        o.start(t0);
        o.stop(t0 + 0.09);
      });
    } catch { /* audio unavailable: stay quiet */ }
  }

  // -------------------------------------------------------------- loops
  const NOTIFY_TEXT = {
    hungry: (n) => [`${n} is hungry!`, 'The food bowl is empty. 🍖'],
    sick: (n) => [`${n} isn't feeling well`, 'A trip to the vet might help. 💊'],
    dirty: (n) => [`${n} needs a clean-up`, 'Something smells... 🧹'],
    sad: (n) => [`${n} is lonely`, 'Come play! 🎾'],
  };

  let lastSave = Date.now();
  let lastSim = 0;
  function loop() {
    const now = Date.now();

    if (now - lastSim >= 1000) {
      // A long gap means the PC slept; treat it like time away.
      const offline = now - state.lastTick > 5 * Pet.MINUTE;
      state = Pet.tick(state, now, { offline });
      lastSim = now;
      if (hudOpen()) updateHud();

      if (now - lastSave > SAVE_EVERY_MS) { lastSave = now; save(); }

      const need = Pet.urgentNeed(state);
      if (need) {
        const [title, body] = NOTIFY_TEXT[need](state.name);
        bridge.notify(need, title, body);
      }

      if (now > view.bubbleUntil) $('bubble').classList.add('hidden');
      if (now - view.lastChatterAt > 45000 && Math.random() < 0.08 && !state.asleep) say(Pet.chatter(state));

      if (now >= view.nextWalkAt && now > view.walkUntil) {
        if (canWander()) startWalk(3000 + Math.random() * 5000);
        view.nextWalkAt = now + 15000 + Math.random() * 35000;
      }
      if (view.walkUntil && now >= view.walkUntil) { view.walkUntil = 0; bridge.walkDone(); }
    }

    if (hudOpen() && now > view.hudUntil && !drag.active) closeHud();
    walkTick(now);
    render();
  }
  // ------------------------------------------------------------ start
  bridge.setIgnoreMouse(false);
  const saved = await bridge.load();
  if (saved) {
    state = Pet.tick(Pet.normalize(saved, Date.now()), Date.now(), { offline: true });
    say(greeting(state));
  } else {
    const name = await askName('Your new dachshund! What\'s their name?');
    state = Pet.createPet(name, Date.now());
    say(`Hi! I'm ${state.name}!`);
    playAnim('happy');
  }
  await save();

  window.addEventListener('beforeunload', () => { bridge.save(state); });
  render();
  updateHud();
  setInterval(loop, 33);
  setIgnore(true);

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function browserBridge() {
    const KEY = 'desktop-dachshund';
    const listeners = { action: [], settings: [] };
    return {
      load: async () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
      save: async (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } return true; },
      getSettings: async () => ({ roam: false, sound: false }),
      openMenu: () => {},
      setIgnoreMouse: () => {},
      dragStart: () => {}, dragMove: () => {}, dragEnd: () => {},
      walkStep: async () => ({ edge: null }),
      walkDone: () => {},
      notify: () => {},
      quit: () => {},
      onAction: (fn) => listeners.action.push(fn),
      onSettings: (fn) => listeners.settings.push(fn),
      onSay: () => {},
      checkForUpdates: () => {},
    };
  }

  // Test hook (read-only view plus the action entry point).
  window.__pet = {
    get state() { return state; },
    set state(s) { state = s; updateHud(); },
    view,
    doAction,
    render,
    get settings() { return settings; },
  };
})();

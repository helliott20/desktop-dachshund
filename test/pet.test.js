const test = require('node:test');
const assert = require('node:assert/strict');
const Pet = require('../src/pet');

const T0 = new Date('2026-03-01T09:00:00').getTime();
const H = Pet.HOUR;
const M = Pet.MINUTE;
const rng0 = () => 0;

function pet(overrides = {}) {
  const p = Pet.createPet('Biscuit', T0);
  return { ...p, ...overrides, stats: { ...p.stats, ...(overrides.stats || {}) } };
}

test('createPet: sensible defaults and name handling', () => {
  const p = Pet.createPet('  Biscuit  ', T0);
  assert.equal(p.name, 'Biscuit');
  assert.equal(p.born, T0);
  assert.equal(p.asleep, false);
  for (const k of Pet.STATS) assert.ok(p.stats[k] >= 80 && p.stats[k] <= 100, k);
  assert.equal(Pet.createPet('', T0).name, 'Pup');
  assert.equal(Pet.createPet(null, T0).name, 'Pup');
  assert.equal(Pet.createPet('x'.repeat(50), T0).name.length, 20);
});

test('tick: awake decay matches the hourly rates', () => {
  const p = pet({ stats: { fullness: 80, happiness: 80, energy: 80, hygiene: 80 } });
  const s = Pet.tick(p, T0 + 2 * H);
  assert.equal(s.stats.fullness, 80 + 2 * Pet.RATES.awake.fullness);
  assert.equal(s.stats.happiness, 80 + 2 * Pet.RATES.awake.happiness);
  assert.equal(s.stats.energy, 80 + 2 * Pet.RATES.awake.energy);
  assert.equal(s.stats.hygiene, 80 + 2 * Pet.RATES.awake.hygiene);
  assert.equal(s.lastTick, T0 + 2 * H);
});

test('tick: does not mutate the input and ignores time going backwards', () => {
  const p = pet();
  const copy = JSON.stringify(p);
  Pet.tick(p, T0 + H);
  assert.equal(JSON.stringify(p), copy);
  const back = Pet.tick(p, T0 - H);
  assert.deepEqual(back.stats, p.stats);
});

test('tick: stats are clamped to 0..100', () => {
  const p = pet({ stats: { fullness: 5 }, asleep: true });
  const s = Pet.tick(p, T0 + 50 * H);
  for (const k of Pet.STATS) {
    assert.ok(s.stats[k] >= 0 && s.stats[k] <= 100, `${k}=${s.stats[k]}`);
  }
});

test('tick: sleeping restores energy and wakes up when full', () => {
  const p = pet({ asleep: true, stats: { energy: 50 } });
  const s1 = Pet.tick(p, T0 + H);
  assert.equal(s1.stats.energy, 75);
  assert.equal(s1.asleep, true);
  const s2 = Pet.tick(s1, T0 + 3 * H);
  assert.equal(s2.stats.energy, 100);
  assert.equal(s2.asleep, false, 'wakes up by itself once rested');
});

test('tick: falls asleep by itself when exhausted', () => {
  const p = pet({ stats: { energy: 6 } });
  const s = Pet.tick(p, T0 + 30 * M);
  assert.equal(s.asleep, true);
});

test('tick offline: capped at 12h and never drops a stat below the floor', () => {
  const p = pet({ stats: { fullness: 90, happiness: 90, hygiene: 90, energy: 90 } });
  const week = Pet.tick(p, T0 + 7 * 24 * H, { offline: true });
  const twelve = Pet.tick(p, T0 + 12 * H, { offline: true });
  assert.deepEqual(week.stats, twelve.stats, 'a week away counts as 12h');
  for (const k of ['fullness', 'happiness', 'hygiene']) {
    assert.ok(week.stats[k] >= Pet.LIMITS.offlineFloor, `${k}=${week.stats[k]}`);
  }
});

test('tick offline: the floor never raises a stat that was already low', () => {
  const p = pet({ stats: { fullness: 5 } });
  const s = Pet.tick(p, T0 + 10 * H, { offline: true });
  assert.equal(s.stats.fullness, 5);
});

test('tick online: long neglect makes the dog sick, never dead', () => {
  let s = pet();
  for (let h = 1; h <= 40; h++) s = Pet.tick(s, T0 + h * H);
  assert.ok(s.stats.health < 30, `health=${s.stats.health}`);
  // Keep it awake to see the sick mood (sleep takes priority otherwise).
  assert.equal(Pet.mood({ ...s, asleep: false }), 'sick');
  assert.ok(!('dead' in s));
});

test('health recovers slowly when every need is met', () => {
  const p = pet({ stats: { health: 50, fullness: 100, happiness: 100, energy: 100, hygiene: 100 } });
  const s = Pet.tick(p, T0 + H);
  assert.equal(s.stats.health, 52);
});

test('feed: fills up, schedules a poop, poop lowers hygiene faster', () => {
  const p = pet({ stats: { fullness: 40 } });
  const r = Pet.act(p, 'feed', T0, rng0);
  assert.equal(r.ok, true);
  assert.equal(r.anim, 'eat');
  assert.equal(r.effect, 'bowl');
  assert.equal(r.state.stats.fullness, 75);
  assert.equal(r.state.poopDueAt, T0 + Pet.LIMITS.poopDelayMs);
  assert.equal(r.state.counters.meals, 1);

  const before = Pet.tick(r.state, T0 + Pet.LIMITS.poopDelayMs - 1);
  assert.equal(before.poops, 0);
  const after = Pet.tick(before, T0 + Pet.LIMITS.poopDelayMs);
  assert.equal(after.poops, 1);
  assert.equal(after.poopDueAt, null);

  const clean = Pet.tick({ ...after, poops: 0 }, T0 + Pet.LIMITS.poopDelayMs + H);
  const dirty = Pet.tick(after, T0 + Pet.LIMITS.poopDelayMs + H);
  assert.equal(clean.stats.hygiene - dirty.stats.hygiene, Pet.LIMITS.poopHygienePerHour);
});

test('feed: refused when already stuffed', () => {
  const r = Pet.act(pet({ stats: { fullness: 97 } }), 'feed', T0, rng0);
  assert.equal(r.ok, false);
  assert.match(r.say, /stuffed/);
});

test('poops are capped', () => {
  let s = pet();
  for (let i = 0; i < 10; i++) s = Pet.tick({ ...s, poopDueAt: s.lastTick + 1 }, s.lastTick + 1);
  assert.equal(s.poops, Pet.LIMITS.maxPoops);
});

test('treat: limited per day, resets the next day', () => {
  let s = pet();
  for (let i = 0; i < 5; i++) {
    const r = Pet.act(s, 'treat', T0 + i * M, rng0);
    assert.equal(r.ok, true, `treat ${i}`);
    s = r.state;
  }
  const sixth = Pet.act(s, 'treat', T0 + 10 * M, rng0);
  assert.equal(sixth.ok, false);
  assert.ok(sixth.state.stats.health < s.stats.health, 'overfeeding treats hurts a bit');
  // Jump to tomorrow without a day of decay (which would put the dog to sleep).
  const tomorrow = Pet.act({ ...sixth.state, lastTick: T0 + 24 * H }, 'treat', T0 + 24 * H, rng0);
  assert.equal(tomorrow.ok, true);
});

test('play and walk: cost energy, refused when too tired', () => {
  const p = pet({ stats: { energy: 60, happiness: 50 } });
  const play = Pet.act(p, 'play', T0, rng0);
  assert.equal(play.ok, true);
  assert.equal(play.state.stats.energy, 45);
  assert.equal(play.state.stats.happiness, 72);
  assert.equal(play.effect, 'ball');
  assert.equal(Pet.act(pet({ stats: { energy: 10 } }), 'play', T0, rng0).ok, false);

  const walk = Pet.act({ ...p, poopDueAt: T0 + M }, 'walk', T0, rng0);
  assert.equal(walk.ok, true);
  assert.equal(walk.anim, 'walk');
  assert.equal(walk.state.poopDueAt, null, 'did their business on the walk');
  assert.equal(Pet.act(pet({ stats: { energy: 15 } }), 'walk', T0, rng0).ok, false);
});

test('pet: belly rub raises happiness with a cooldown against click spam', () => {
  const p = pet({ stats: { happiness: 50 } });
  const a = Pet.act(p, 'pet', T0, rng0);
  assert.equal(a.state.stats.happiness, 58);
  assert.equal(a.anim, 'belly');
  const spam = Pet.act(a.state, 'pet', T0 + 100, rng0);
  assert.equal(spam.state.stats.happiness, 58, 'no gain inside the cooldown');
  const later = Pet.act(a.state, 'pet', T0 + Pet.LIMITS.petCooldownMs, rng0);
  assert.equal(later.state.stats.happiness, 66);
});

test('bath: full hygiene, dachshunds hate baths', () => {
  const r = Pet.act(pet({ stats: { hygiene: 10, happiness: 50 } }), 'bath', T0, rng0);
  assert.equal(r.state.stats.hygiene, 100);
  assert.equal(r.state.stats.happiness, 40);
  assert.equal(r.effect, 'bubbles');
});

test('clean: removes poops (even while asleep), no-op without poops', () => {
  const r = Pet.act(pet({ poops: 2, asleep: true, stats: { hygiene: 50 } }), 'clean', T0, rng0);
  assert.equal(r.ok, true);
  assert.equal(r.state.poops, 0);
  assert.equal(r.state.stats.hygiene, 60);
  assert.equal(Pet.act(pet(), 'clean', T0, rng0).ok, false);
});

test('medicine: cures when sick, a grumpy trip when healthy', () => {
  const sick = Pet.act(pet({ stats: { health: 20 } }), 'medicine', T0, rng0);
  assert.equal(sick.ok, true);
  assert.equal(sick.state.stats.health, 65);
  const healthy = Pet.act(pet({ stats: { happiness: 50 } }), 'medicine', T0, rng0);
  assert.equal(healthy.ok, false);
  assert.equal(healthy.state.stats.happiness, 40);
});

test('sleep/wake: needs to be tired, grumpy if woken early, blocks other actions', () => {
  assert.equal(Pet.act(pet({ stats: { energy: 95 } }), 'sleep', T0, rng0).ok, false);
  const asleep = Pet.act(pet({ stats: { energy: 40 } }), 'sleep', T0, rng0).state;
  assert.equal(asleep.asleep, true);
  for (const a of ['feed', 'play', 'walk', 'pet', 'bath', 'treat', 'medicine']) {
    const r = Pet.act(asleep, a, T0, rng0);
    assert.equal(r.ok, false, a);
    assert.deepEqual(r.state.stats, asleep.stats, `${a} must not change stats`);
  }
  const woken = Pet.act(asleep, 'wake', T0, rng0);
  assert.equal(woken.state.asleep, false);
  assert.equal(woken.anim, 'sad');
  assert.ok(woken.state.stats.happiness < asleep.stats.happiness);
});

test('unknown action is a harmless no-op', () => {
  const p = pet();
  const r = Pet.act(p, 'fly', T0, rng0);
  assert.equal(r.ok, false);
  assert.deepEqual(r.state.stats, p.stats);
});

test('mood: priority order', () => {
  const m = (o) => Pet.mood(pet(o));
  assert.equal(m({ asleep: true, stats: { health: 5 } }), 'sleeping');
  assert.equal(m({ stats: { health: 10, fullness: 5 } }), 'sick');
  assert.equal(m({ stats: { fullness: 5, energy: 5 } }), 'hungry');
  assert.equal(m({ stats: { energy: 10 } }), 'tired');
  assert.equal(m({ poops: 2 }), 'dirty');
  assert.equal(m({ stats: { happiness: 10 } }), 'sad');
  assert.equal(m({ stats: { happiness: 90, fullness: 90 } }), 'happy');
  assert.equal(m({ stats: { happiness: 60, fullness: 60 } }), 'content');
  for (const mood of ['sleeping', 'sick', 'hungry', 'tired', 'dirty', 'sad', 'happy', 'content']) {
    assert.ok(Pet.MOOD_ANIM[mood], `animation for ${mood}`);
  }
});

test('urgentNeed and chatter', () => {
  assert.equal(Pet.urgentNeed(pet({ stats: { fullness: 5 } })), 'hungry');
  assert.equal(Pet.urgentNeed(pet()), null);
  assert.equal(Pet.urgentNeed(pet({ stats: { energy: 5 } })), null, 'tired is not worth a toast');
  assert.equal(Pet.chatter(pet({ asleep: true })), null);
  assert.equal(typeof Pet.chatter(pet(), rng0), 'string');
});

test('normalize: repairs corrupt or partial saves', () => {
  const now = T0;
  assert.equal(Pet.normalize(null, now).name, 'Pup');
  assert.equal(Pet.normalize('garbage', now).name, 'Pup');
  const r = Pet.normalize({
    name: 'Biscuit',
    stats: { fullness: 'abc', happiness: 400, energy: -20 },
    poops: 99,
    lastTick: now + 10 * H, // clock went backwards since the save
    born: 'yesterday',
  }, now);
  assert.equal(r.name, 'Biscuit');
  assert.equal(r.stats.fullness, 80);
  assert.equal(r.stats.happiness, 100);
  assert.equal(r.stats.energy, 0);
  assert.equal(r.stats.health, 100);
  assert.equal(r.poops, Pet.LIMITS.maxPoops);
  assert.equal(r.lastTick, now);
  assert.equal(r.born, now);
  assert.ok(r.counters && r.counters.meals === 0);
});

test('save round-trip through JSON keeps behaviour identical', () => {
  let s = pet();
  s = Pet.act(s, 'feed', T0 + M, rng0).state;
  const reloaded = Pet.normalize(JSON.parse(JSON.stringify(s)), T0 + 2 * M);
  assert.deepEqual(Pet.tick(reloaded, T0 + 3 * H), Pet.tick(s, T0 + 3 * H));
});

test('ageDays', () => {
  assert.equal(Pet.ageDays(pet(), T0), 0);
  assert.equal(Pet.ageDays(pet(), T0 + 49 * H), 2);
});

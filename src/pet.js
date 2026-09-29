/*
 * Pet simulation: stats, decay over time, actions and mood.
 *
 * Pure functions over a plain JSON state object, so the same code runs in
 * the widget and in the Node test suite. Time and randomness are always
 * passed in, never read from globals, which keeps the tests deterministic.
 *
 * Design choice: the dog never dies. Neglect makes it sick and sad, and a
 * vet visit (medicine) brings it back. A desktop companion that can die
 * over a long weekend away from the PC is punishing rather than fun.
 */
(function (root) {
  'use strict';

  const HOUR = 60 * 60 * 1000;
  const MINUTE = 60 * 1000;

  const STATS = ['fullness', 'happiness', 'energy', 'hygiene', 'health'];

  // Change per hour. Awake vs asleep.
  const RATES = {
    awake: { fullness: -8, happiness: -6, energy: -5, hygiene: -3 },
    asleep: { fullness: -3, happiness: -1, energy: +25, hygiene: -1 },
  };

  const LIMITS = {
    maxOfflineMs: 12 * HOUR, // time away that still counts
    offlineFloor: 15, // being away never drops a stat below this
    poopDelayMs: 40 * MINUTE, // after a meal
    maxPoops: 3,
    poopHygienePerHour: 6, // extra hygiene loss per poop on the floor
    petCooldownMs: 1500,
    lowStat: 20,
  };

  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n * 100) / 100));

  function createPet(name, now) {
    return {
      version: 1,
      name: (name || 'Pup').trim().slice(0, 20) || 'Pup',
      born: now,
      lastTick: now,
      asleep: false,
      stats: { fullness: 80, happiness: 80, energy: 90, hygiene: 90, health: 100 },
      poops: 0,
      poopDueAt: null,
      lastPetAt: 0,
      treatsToday: 0,
      treatDay: dayKey(now),
      counters: { meals: 0, treats: 0, plays: 0, pets: 0, walks: 0, baths: 0, cleans: 0, vets: 0 },
    };
  }

  function dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  /** Repair a loaded state (older version, hand edits, corruption). */
  function normalize(raw, now) {
    const base = createPet(raw && raw.name, now);
    if (!raw || typeof raw !== 'object') return base;
    const out = { ...base, ...raw };
    out.stats = { ...base.stats };
    for (const k of STATS) {
      const v = raw.stats && Number(raw.stats[k]);
      out.stats[k] = Number.isFinite(v) ? clamp(v) : base.stats[k];
    }
    out.counters = { ...base.counters, ...(raw.counters || {}) };
    out.poops = Math.max(0, Math.min(LIMITS.maxPoops, Number(raw.poops) || 0));
    if (!Number.isFinite(out.lastTick) || out.lastTick > now) out.lastTick = now;
    if (!Number.isFinite(out.born) || out.born > now) out.born = now;
    out.asleep = !!out.asleep;
    return out;
  }

  /**
   * Advance the simulation to `now`.
   * @param {object} opts.offline  true when catching up after the app was closed
   */
  function tick(state, now, { offline = false } = {}) {
    const s = structuredCloneSafe(state);
    const today = dayKey(now);
    if (s.treatDay !== today) {
      s.treatDay = today;
      s.treatsToday = 0;
    }

    let elapsed = now - s.lastTick;
    if (!(elapsed > 0)) return s;
    if (offline) elapsed = Math.min(elapsed, LIMITS.maxOfflineMs);

    // A poop happens at most once per tick call, when it is due.
    if (s.poopDueAt && now >= s.poopDueAt) {
      s.poops = Math.min(LIMITS.maxPoops, s.poops + 1);
      s.poopDueAt = null;
    }

    const hours = elapsed / HOUR;
    const rates = s.asleep ? RATES.asleep : RATES.awake;
    const floor = offline ? LIMITS.offlineFloor : 0;

    for (const k of Object.keys(rates)) {
      const before = s.stats[k];
      let next = before + rates[k] * hours;
      if (k === 'hygiene') next -= s.poops * LIMITS.poopHygienePerHour * hours;
      // The offline floor only limits decay; it never raises a stat.
      if (rates[k] < 0) next = Math.max(next, Math.min(before, floor));
      s.stats[k] = clamp(next);
    }

    // Health follows how well the other needs are met.
    const low = ['fullness', 'happiness', 'hygiene', 'energy'].filter(
      (k) => s.stats[k] < LIMITS.lowStat,
    ).length;
    const healthRate = low > 0 ? -4 * low : allAbove(s, 50) ? +2 : 0;
    const healthBefore = s.stats.health;
    s.stats.health = clamp(
      Math.max(healthBefore + healthRate * hours, healthRate < 0 ? Math.min(healthBefore, floor) : 0),
    );

    // Wakes up by itself when rested; nods off by itself when exhausted.
    if (s.asleep && s.stats.energy >= 100) s.asleep = false;
    else if (!s.asleep && s.stats.energy <= 5) s.asleep = true;

    s.lastTick = now;
    return s;
  }

  function allAbove(s, n) {
    return ['fullness', 'happiness', 'hygiene', 'energy'].every((k) => s.stats[k] > n);
  }

  function structuredCloneSafe(o) {
    return JSON.parse(JSON.stringify(o));
  }

  /**
   * Apply an action. Returns { state, ok, anim, say, effect }.
   *   anim   – animation the widget should play
   *   say    – speech bubble text
   *   effect – prop to show (bowl, ball, heart, bubbles, pill, leash)
   */
  function act(state, action, now, rng = Math.random) {
    let s = tick(state, now);
    const st = s.stats;
    const n = s.name;
    const res = (ok, anim, say, effect = null) => ({ state: s, ok, anim, say, effect });

    if (s.asleep && action !== 'wake' && action !== 'sleep' && action !== 'clean') {
      return res(false, 'sleep', `${n} is asleep. Shh!`);
    }

    switch (action) {
      case 'feed': {
        if (st.fullness >= 95) return res(false, 'sad', `${n} is stuffed!`);
        st.fullness = clamp(st.fullness + 35);
        st.happiness = clamp(st.happiness + 5);
        s.counters.meals++;
        if (!s.poopDueAt) s.poopDueAt = now + LIMITS.poopDelayMs;
        return res(true, 'eat', pick(rng, ['Nom nom nom!', '*crunch crunch*', 'Yum!']), 'bowl');
      }
      case 'treat': {
        if (s.treatsToday >= 5) {
          st.health = clamp(st.health - 5);
          return res(false, 'sad', 'Too many treats today!');
        }
        s.treatsToday++;
        s.counters.treats++;
        st.fullness = clamp(st.fullness + 8);
        st.happiness = clamp(st.happiness + 15);
        return res(true, 'happy', pick(rng, ['Treat!!', '*sits nicely*', 'More?']), 'bone');
      }
      case 'play': {
        if (st.energy < 15) return res(false, 'sad', `${n} is too tired to play.`);
        st.happiness = clamp(st.happiness + 22);
        st.energy = clamp(st.energy - 15);
        st.fullness = clamp(st.fullness - 5);
        s.counters.plays++;
        return res(true, 'wag', pick(rng, ['Ball! Ball! Ball!', 'Again! Again!', 'Zoomies!']), 'ball');
      }
      case 'pet': {
        if (now - s.lastPetAt < LIMITS.petCooldownMs) return res(true, 'belly', null, 'heart');
        s.lastPetAt = now;
        st.happiness = clamp(st.happiness + 8);
        s.counters.pets++;
        return res(true, 'belly', pick(rng, ['Belly rubs!', '*happy wiggle*', '♥', 'Hehehe!']), 'heart');
      }
      case 'walk': {
        if (st.energy < 20) return res(false, 'sad', `${n} is too sleepy for a walk.`);
        st.happiness = clamp(st.happiness + 18);
        st.energy = clamp(st.energy - 20);
        st.fullness = clamp(st.fullness - 8);
        st.hygiene = clamp(st.hygiene - 10);
        s.poopDueAt = null; // did their business outside
        s.counters.walks++;
        return res(true, 'walk', pick(rng, ['Walkies!!', '*sniff sniff*', 'Squirrel!']), 'leash');
      }
      case 'bath': {
        st.hygiene = 100;
        st.happiness = clamp(st.happiness - 10);
        s.counters.baths++;
        return res(true, 'sad', pick(rng, ['Not the bath...', '*shakes everywhere*']), 'bubbles');
      }
      case 'clean': {
        if (s.poops === 0) return res(false, s.asleep ? 'sleep' : 'idle', 'Nothing to clean!');
        s.poops = 0;
        st.hygiene = clamp(st.hygiene + 10);
        s.counters.cleans++;
        return res(true, s.asleep ? 'sleep' : 'wag', s.asleep ? null : 'Much better!');
      }
      case 'medicine': {
        s.counters.vets++;
        if (st.health >= 70) {
          st.happiness = clamp(st.happiness - 10);
          return res(false, 'sad', `${n} isn't poorly! Just a grumpy vet trip.`, 'pill');
        }
        st.health = clamp(st.health + 45);
        return res(true, 'idle', 'Feeling better!', 'pill');
      }
      case 'sleep': {
        if (s.asleep) return res(false, 'sleep', null);
        if (st.energy > 85) return res(false, 'wag', 'Not sleepy!');
        s.asleep = true;
        return res(true, 'sleep', 'Zzz...');
      }
      case 'wake': {
        if (!s.asleep) return res(false, 'idle', null);
        s.asleep = false;
        if (st.energy < 60) {
          st.happiness = clamp(st.happiness - 8);
          return res(true, 'sad', '*grumble* ...five more minutes');
        }
        return res(true, 'wag', 'Good morning!');
      }
      default:
        return res(false, 'idle', null);
    }
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length) % arr.length];
  }

  /** Main mood, in priority order. Drives the idle animation. */
  function mood(s) {
    const st = s.stats;
    if (s.asleep) return 'sleeping';
    if (st.health < 30) return 'sick';
    if (st.fullness < LIMITS.lowStat) return 'hungry';
    if (st.energy < LIMITS.lowStat) return 'tired';
    if (st.hygiene < LIMITS.lowStat || s.poops >= 2) return 'dirty';
    if (st.happiness < LIMITS.lowStat) return 'sad';
    if (st.happiness > 70 && st.fullness > 50) return 'happy';
    return 'content';
  }

  const MOOD_ANIM = {
    sleeping: 'sleep', sick: 'sick', hungry: 'sad', tired: 'sad',
    dirty: 'sad', sad: 'sad', happy: 'wag', content: 'idle',
  };

  const MOOD_LINES = {
    sick: ['*whimper*', "I don't feel good..."],
    hungry: ['Feed me!', '*stares at food bowl*', 'Is it dinner time?'],
    tired: ['*yaaawn*', 'So sleepy...'],
    dirty: ['Ew, stinky!', 'Can someone clean up?'],
    sad: ['Play with me?', '*sad puppy eyes*', 'Hello? Anyone?'],
    happy: ['Woof!', '*wag wag wag*', 'Best day ever!', '*sniff sniff*'],
    content: ['Woof.', '*sniff*', '*looks out the window*'],
  };

  /** What the dog would say on its own right now (or null). */
  function chatter(s, rng = Math.random) {
    const lines = MOOD_LINES[mood(s)];
    return lines ? pick(rng, lines) : null;
  }

  /** The need that deserves a desktop notification, or null. */
  function urgentNeed(s) {
    const m = mood(s);
    return ['sick', 'hungry', 'dirty', 'sad'].includes(m) ? m : null;
  }

  function ageDays(s, now) {
    return Math.floor((now - s.born) / (24 * HOUR));
  }

  const api = {
    HOUR, MINUTE, STATS, RATES, LIMITS, MOOD_ANIM,
    createPet, normalize, tick, act, mood, chatter, urgentNeed, ageDays, dayKey,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Pet = api;
})(typeof window !== 'undefined' ? window : globalThis);

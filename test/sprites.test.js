const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/sprites');

const frameKey = (g) => g.map((r) => r.join('')).join('\n');

test('every animation frame is W x H and uses only palette colours', () => {
  for (const [name, frames] of Object.entries(S.ANIMATIONS)) {
    assert.ok(frames.length >= 2, `${name} has at least 2 frames`);
    frames.forEach((g, i) => {
      assert.equal(g.length, S.H, `${name}[${i}] height`);
      for (const row of g) {
        assert.equal(row.length, S.W, `${name}[${i}] width`);
        for (const ch of row) assert.ok(ch === '.' || S.PALETTE[ch], `${name}[${i}] unknown colour '${ch}'`);
      }
    });
  }
});

test('every animation actually moves (frames are not all identical)', () => {
  for (const [name, frames] of Object.entries(S.ANIMATIONS)) {
    const unique = new Set(frames.map(frameKey));
    assert.ok(unique.size >= 2, `${name} should have at least two distinct frames`);
  }
});

test('the dog stands on the ground and never touches the side edges', () => {
  for (const [name, frames] of Object.entries(S.ANIMATIONS)) {
    frames.forEach((g, i) => {
      assert.match(g[S.H - 1].join(''), /[^.]/, `${name}[${i}] should touch the bottom row`);
      for (const row of g) {
        assert.equal(row[S.W - 1], '.', `${name}[${i}] clipped on the right`);
      }
    });
  }
});

test('each frame has a reasonable amount of dog in it', () => {
  for (const [name, frames] of Object.entries(S.ANIMATIONS)) {
    frames.forEach((g, i) => {
      const filled = g.flat().filter((c) => c !== '.').length;
      assert.ok(filled > 250, `${name}[${i}] only has ${filled} pixels`);
    });
  }
});

test('the standing dog has the dachshund colours: chocolate, dapple and tan', () => {
  const px = S.ANIMATIONS.idle[0].flat();
  for (const c of ['B', 'D', 'T', 't', 'E', 'N']) assert.ok(px.includes(c), `missing colour ${c}`);
});

test('source parts only use known colours and have straight rows where required', () => {
  const check = (name, rows, palette) => {
    for (const r of rows) for (const ch of r) assert.ok(ch === '.' || palette[ch], `${name}: '${ch}'`);
  };
  for (const [k, v] of Object.entries(S.parts.HEAD)) check(`HEAD.${k}`, v, S.PALETTE);
  for (const [k, v] of Object.entries(S.PROPS)) check(`PROPS.${k}`, v, S.PROPS_PALETTE);
  assert.equal(new Set(S.parts.BODY.map((r) => r.length)).size, 1, 'BODY rows are all the same width');
});

test('draw paints pixels with the right colour and respects flipX', () => {
  const calls = [];
  const ctx = {
    fillStyle: null,
    clearRect() {},
    fillRect(x, y, w, h) { calls.push({ x, y, w, h, c: this.fillStyle }); },
  };
  const g = S.ANIMATIONS.idle[0];
  S.draw(ctx, g, 2);
  const filled = g.flat().filter((c) => c !== '.').length;
  assert.equal(calls.length, filled);
  assert.ok(calls.every((c) => c.w === 2 && c.h === 2));

  const flipped = [];
  S.drawAt({ set fillStyle(v) { this.c = v; }, get fillStyle() { return this.c; }, fillRect(x, y) { flipped.push(`${x},${y}`); } }, g, 0, 0, 1, true);
  // pixel (x,y) must appear at (W-1-x, y)
  const firstOpaque = (() => { for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) if (g[y][x] !== '.') return [x, y]; })();
  assert.ok(flipped.includes(`${S.W - 1 - firstOpaque[0]},${firstOpaque[1]}`));
});

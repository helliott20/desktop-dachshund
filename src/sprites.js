/*
 * 8-bit sprite data for a chocolate-dapple miniature dachshund.
 *
 * Every sprite is built from ASCII layers. Each character is one pixel;
 * '.' is transparent. Layers are stamped in order onto a fixed-size frame,
 * so later layers overwrite earlier ones.
 *
 * Works as a browser script (window.Sprites) and as a CommonJS module (tests).
 */
(function (root) {
  'use strict';

  const W = 56; // frame width in pixels
  const H = 28; // frame height in pixels

  const PALETTE = {
    K: '#23120b', // outline
    B: '#5e2f1b', // chocolate
    b: '#3f1e10', // chocolate shadow / far limbs
    H: '#7a4129', // chocolate highlight
    D: '#b09a88', // dapple (silver-cream patches)
    d: '#8c7566', // dapple, shaded
    T: '#b35f28', // tan points
    t: '#d98a45', // light tan
    N: '#4a2a22', // nose (liver)
    E: '#140905', // eye
    W: '#ffffff', // eye glint
    P: '#e77b8c', // tongue
    p: '#6b1f24', // mouth
    C: '#161616', // claws
    Z: '#f4efe8', // teeth
  };

  // ---------------------------------------------------------------- parts
  // Parts face RIGHT. Offsets are [x, y] inside the W x H frame.

  const BODY = [
    '....KKKKKKKKKKKKKKKKKKKKK.....',
    '..KKBBBBDDBBBBBBBBBBBDDBBKK...',
    '.KBBBBDDDBBBBBBBBHHBBBBBBBBK..',
    'KBBBBBBDBBBBBBDDBBBBBBBBBBBBK.',
    'KBBBBBBBBBBBBBDDDBBBBBBBBBTTTK',
    'KBBDDBBBBBBBBBBBBBBBBBBBBTtttK',
    'KBBDBBBBBBBBBBBBBBBBBBBBTTtttK',
    '.KBBBBBBBBBBBBBBBBBBBBBBTTtttK',
    '..KKBBBBBBKKKKKKKKKKKBBBTTTTK.',
    '....KKKKKK..........KKKKKKK...',
  ];

  // Head, ear-less. Snout to the right.
  const HEAD = {
    normal: [
      '...KKKKKK.........',
      '..KBBBBBBKK.......',
      '.KBBBDDBBBBK......',
      'KBBBBBBBBtBBK.....',
      'KBBBBBBBEWBBBKKK..',
      'KBBBBBBBEEBBBBBBKK',
      'KBBBBBBBBBTTtttBBNK',
      '.KBBBBBBTTtttttttNK',
      '.KBBBBBTTTtttttttKK',
      '..KTTTTTTTTTTTKKK..',
      '...KKKTTTTTKKK.....',
      '......KKKKK........',
    ],
    blink: [
      '...KKKKKK.........',
      '..KBBBBBBKK.......',
      '.KBBBDDBBBBK......',
      'KBBBBBBBBtBBK.....',
      'KBBBBBBBBBBBBKKK..',
      'KBBBBBBBEEBBBBBBKK',
      'KBBBBBBBBBTTtttBBNK',
      '.KBBBBBBTTtttttttNK',
      '.KBBBBBTTTtttttttKK',
      '..KTTTTTTTTTTTKKK..',
      '...KKKTTTTTKKK.....',
      '......KKKKK........',
    ],
    happy: [ // eyes squeezed shut, mouth open, tongue out (photo #2)
      '...KKKKKK.........',
      '..KBBBBBBKK.......',
      '.KBBBDDBBBBK......',
      'KBBBBBBBBtBBK.....',
      'KBBBBBBBKKBBBKKK..',
      'KBBBBBBBBBBBBBBBKK',
      'KBBBBBBBBBTTtttBBNK',
      '.KBBBBBBTTtttttttNK',
      '.KBBBBBTTTKZKZKZKKK',
      '..KTTTTTKpppppppK..',
      '...KKKTTKpPPPPpK...',
      '......KKKKPPPKK....',
      '.........KKK.......',
    ],
    eat: [ // mouth open, head tipped down a pixel
      '..................',
      '...KKKKKK.........',
      '..KBBBBBBKK.......',
      '.KBBBDDBBBBK......',
      'KBBBBBBBBtBBK.....',
      'KBBBBBBBKKBBBKKK..',
      'KBBBBBBBBBBBBBBBKK',
      'KBBBBBBBBBTTtttBBNK',
      '.KBBBBBBTTtttttttNK',
      '.KBBBBBTTTKKKKKKKK.',
      '..KTTTTTKpppppK....',
      '...KKKTTTKKKKK.....',
      '......KKKKK........',
    ],
    sad: [ // droopy brow, looking down
      '..................',
      '...KKKKKK.........',
      '..KBBBBBBKK.......',
      '.KBBBDDBBBBK......',
      'KBBBBBBBtBBBK.....',
      'KBBBBBBBBtBBBKKK..',
      'KBBBBBBBEWBBBBBBKK',
      'KBBBBBBBEEBTTtttBBNK',
      '.KBBBBBBTTtttttttNK',
      '.KBBBBBTTTtttttttKK',
      '..KTTTTTTTTTTTKKK..',
      '...KKKKKKKKKKK.....',
    ],
    sleep: [ // eyes closed, relaxed
      '...KKKKKK.........',
      '..KBBBBBBKK.......',
      '.KBBBDDBBBBK......',
      'KBBBBBBBBtBBK.....',
      'KBBBBBBBBBBBBKKK..',
      'KBBBBBBKKKBBBBBBKK',
      'KBBBBBBBBBTTtttBBNK',
      '.KBBBBBBTTtttttttNK',
      '.KBBBBBTTTtttttttKK',
      '..KTTTTTTTTTTTKKK..',
      '...KKKTTTTTKKK.....',
      '......KKKKK........',
    ],
    sick: [ // eyes as little crosses
      '...KKKKKK.........',
      '..KBBBBBBKK.......',
      '.KBBBDDBBBBK......',
      'KBBBBBBBBtBBK.....',
      'KBBBBBBBEBEBBKKK..',
      'KBBBBBBBBEBBBBBBKK',
      'KBBBBBBBEBEtttBBNK',
      '.KBBBBBBTTtttttttNK',
      '.KBBBBBTTTtttttttKK',
      '..KTTTTTTTTTTTKKK..',
      '...KKKTTTTTKKK.....',
      '......KKKKK........',
    ],
  };

  const EAR = {
    down: [ // long, hanging behind the eye
      '.KKKK.',
      'KbbbbK',
      'KbBBbK',
      'KbBBBK',
      'KbBDBK',
      'KbBBBK',
      'KbBBBK',
      'KbBBbK',
      '.KbbK.',
      '.KbbK.',
      '..KK..',
    ],
    up: [ // flapping out behind the head mid-bounce
      '..KKKK',
      '.KbbbK',
      'KbBbK.',
      'KbbK..',
      'KbK...',
      '.K....',
    ],
  };

  const TAIL = {
    down: [
      '.....KK',
      '....KbK',
      '...KbK.',
      '..KbK..',
      '.KbK...',
      'KbK....',
      'KK.....',
    ],
    up: [
      'KK.....',
      'KbK....',
      '.KbK...',
      '..KbK..',
      '...KbKK',
      '....KbK',
      '.....KK',
    ],
    mid: [
      '.......',
      '.......',
      'KKKK...',
      'KbbbKKK',
      '.KKKbbK',
      '....KKK',
      '.......',
    ],
  };

  // Legs: near leg in tan, far leg in shadow.
  const LEG = {
    stand: [
      'KBTK.',
      'KTTK.',
      'KTTK.',
      'KTTTK',
      'KCKCK',
    ],
    fwd: [
      '.KBTK',
      '.KTTK',
      'KTTK.',
      'KTTTK',
      'KCKCK',
    ],
    back: [
      'KBTK.',
      'KTTK.',
      '.KTTK',
      '.KTTTK',
      '.KCKCK',
    ],
  };
  const FAR_LEG = mapChars(LEG, { B: 'b', T: 'b', t: 'b' });

  function mapChars(set, map) {
    const out = {};
    for (const k of Object.keys(set)) {
      out[k] = set[k].map((row) => row.replace(/./g, (c) => map[c] || c));
    }
    return out;
  }

  // ------------------------------------------------------ full-frame poses

  // Curled-up body for sleeping (photo #4). The head is stamped separately.
  const SLEEP = [
    '.......KKKKKKKKKKKK.......',
    '....KKKBBBBDDBBBBBBKKK....',
    '...KBBBBBBBBBBBBBDDBBBKK..',
    '..KBBBDDBBBBBBBBBBBBBBBBK.',
    '.KBBBBBBBBBBBBBBBBBBBDBBBK',
    '.KBBBBBBBBBBBBBBBBBBBBBBBK',
    'KBBBBBBBBBBDBBBBBBBBBBBBBK',
    'KBBBBBBBBBBBBBBBBBBBBTTBBK',
    'KBBBBBBBBBBBBBBBBBBBTttTBK',
    'KKKKKKKKKKKKKKKKKKKKKKKKKK',
  ];

  // Belly-up for rubs (photos #1/#2): paws curled in the air.
  const BELLY = [
    '.........KCKCK..........KCKCK..',
    '..........KTTTK..........KTTTK.',
    '...........KTTK...........KTTK.',
    '..........KTTK...........KTTK..',
    '....KKKKKKKTTKKKKKKKKKKKKKTTKKK',
    '..KKDDDDttttttttttttttttttttttK',
    '.KBDDDDtttttttttttttttttttttttK',
    'KBBBDDtttttttttttttttttttttttTK',
    'KBBBBBBBTTTTTTTTTTTTTTTTTTTTTBK',
    '.KBBBBBBBBBBBBBDDBBBBBBBBBBBBBK',
    '..KKBBBBBBBBBBBBBBBBBBBBDDBBKK.',
    '....KKKKKKKKKKKKKKKKKKKKKKKK...',
  ];

  // Head upside-down (for belly-up) is the happy head flipped vertically.

  // --------------------------------------------------------- composition

  function blank() {
    return Array.from({ length: H }, () => new Array(W).fill('.'));
  }

  function stamp(grid, part, x, y, opts = {}) {
    const rows = opts.flipY ? part.slice().reverse() : part;
    const width = Math.max(...rows.map((r) => r.length));
    for (let r = 0; r < rows.length; r++) {
      let row = rows[r];
      if (opts.flipX) row = row.padEnd(width, '.').split('').reverse().join('');
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        const gx = x + c;
        const gy = y + r;
        if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
        grid[gy][gx] = ch;
      }
    }
    return grid;
  }

  const GROUND = H - 1; // bottom row where feet touch

  /**
   * Standing / walking dog.
   * @param {object} o
   * @param {string} o.head  key of HEAD
   * @param {string} o.ear   key of EAR
   * @param {string} o.tail  key of TAIL
   * @param {number} o.step  0 = stand, 1/2 = walk cycle
   * @param {number} o.bob   vertical body offset (0 or -1)
   */
  function standing({ head = 'normal', ear = 'down', tail = 'down', step = 0, bob = 0 } = {}) {
    const g = blank();
    const bodyX = 8;
    const bodyY = GROUND - 4 - BODY.length + 1 + bob;
    const legY = GROUND - 4;
    const legA = step === 1 ? 'fwd' : step === 2 ? 'back' : 'stand';
    const legB = step === 1 ? 'back' : step === 2 ? 'fwd' : 'stand';

    stamp(g, TAIL[tail], bodyX - 6, bodyY - 3);
    // far legs (behind body)
    stamp(g, FAR_LEG[legB], bodyX + 5, legY);
    stamp(g, FAR_LEG[legA], bodyX + 23, legY);
    stamp(g, BODY, bodyX, bodyY);
    // near legs
    stamp(g, LEG[legA], bodyX + 2, legY);
    stamp(g, LEG[legB], bodyX + 20, legY);
    // head sits on the front of the body
    const hx = bodyX + 22;
    const hy = bodyY - 8;
    stamp(g, HEAD[head], hx, hy);
    if (ear === 'up') stamp(g, EAR.up, hx - 3, hy + 1);
    else stamp(g, EAR.down, hx, hy + 2);
    return g;
  }

  function sleeping({ breathe = 0 } = {}) {
    const g = blank();
    const x = 22;
    const y = GROUND - SLEEP.length + 1;
    // breathing: the back rises one pixel, the floor line stays put
    stamp(g, SLEEP.slice(0, 1), x, y - breathe);
    stamp(g, SLEEP, x, y - breathe);
    stamp(g, SLEEP.slice(-1), x, GROUND);
    // head resting on the floor, facing left, ear draped over the curl
    const head = HEAD.sleep;
    const hx = 6;
    const hy = GROUND - head.length + 1;
    stamp(g, ['KTTTK', 'KtTtK', 'KCKCK'], hx + 1, GROUND - 2); // front paws
    stamp(g, head, hx, hy, { flipX: true });
    stamp(g, EAR.down, hx + 13, hy + 2);
    return g;
  }

  function bellyUp({ kick = 0, head = 'happy' } = {}) {
    const g = blank();
    const x = 6;
    const y = GROUND - BELLY.length + 1;
    let body = BELLY;
    if (kick) {
      body = BELLY.slice();
      body[0] = '..........KCKCK..........KCKCK.';
      body[1] = '..........KTTK...........KTTTK.';
    }
    stamp(g, TAIL.mid, x - 6, y + 4);
    stamp(g, body, x, y);
    // head thrown back (upside-down) at the chest end
    stamp(g, HEAD[head], x + 30, y - 1, { flipY: true });
    return g;
  }

  // Frame recipes by animation name. Each is a list of frames; the widget
  // cycles through them.
  const ANIMATIONS = {
    idle: [
      standing({ tail: 'down' }),
      standing({ tail: 'mid' }),
      standing({ tail: 'down' }),
      standing({ tail: 'mid', head: 'blink' }),
    ],
    wag: [
      standing({ tail: 'up', bob: 0 }),
      standing({ tail: 'mid', bob: -1 }),
      standing({ tail: 'down', bob: 0 }),
      standing({ tail: 'mid', bob: -1 }),
    ],
    walk: [
      standing({ step: 1, tail: 'up', ear: 'down' }),
      standing({ step: 0, tail: 'mid', ear: 'up', bob: -1 }),
      standing({ step: 2, tail: 'down', ear: 'down' }),
      standing({ step: 0, tail: 'mid', ear: 'up', bob: -1 }),
    ],
    eat: [
      standing({ head: 'eat', tail: 'up' }),
      standing({ head: 'normal', tail: 'mid' }),
      standing({ head: 'eat', tail: 'down' }),
      standing({ head: 'normal', tail: 'mid' }),
    ],
    happy: [
      standing({ head: 'happy', tail: 'up', ear: 'up', bob: -1 }),
      standing({ head: 'happy', tail: 'down', ear: 'down' }),
    ],
    sad: [
      standing({ head: 'sad', tail: 'down' }),
      standing({ head: 'sad', tail: 'down' }),
      standing({ head: 'sad', tail: 'down' }),
      standing({ head: 'blink', tail: 'down' }),
    ],
    sleep: [ // eyes closed, relaxed
      '...KKKKKK.........',
      '..KBBBBBBKK.......',
      '.KBBBDDBBBBK......',
      'KBBBBBBBBtBBK.....',
      'KBBBBBBBBBBBBKKK..',
      'KBBBBBBKKKBBBBBBKK',
      'KBBBBBBBBBTTtttBBNK',
      '.KBBBBBBTTtttttttNK',
      '.KBBBBBTTTtttttttKK',
      '..KTTTTTTTTTTTKKK..',
      '...KKKTTTTTKKK.....',
      '......KKKKK........',
    ],
    sick: [
      standing({ head: 'sick', tail: 'down' }),
      standing({ head: 'sick', tail: 'down', bob: -1 }),
    ],
    sleep: [sleeping({ breathe: 0 }), sleeping({ breathe: 1 })],
    belly: [bellyUp({ kick: 0 }), bellyUp({ kick: 1 })],
  };

  /** Draw a grid onto a 2D canvas context at the given pixel scale. */
  function draw(ctx, grid, scale, { flipX = false } = {}) {
    ctx.clearRect(0, 0, W * scale, H * scale);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = grid[y][x];
        if (ch === '.') continue;
        const dx = flipX ? W - 1 - x : x;
        ctx.fillStyle = PALETTE[ch];
        ctx.fillRect(dx * scale, y * scale, scale, scale);
      }
    }
  }


  // --------------------------------------------------------------- props
  const PROPS_PALETTE = {
    ...PALETTE,
    R: '#d63b3b', // red
    r: '#8f2323',
    G: '#8fd14f', // tennis-ball green
    g: '#5a9a2a',
    O: '#f2e6c8', // bone
    o: '#c9b58c',
    S: '#9fd8ff', // soap bubble
    s: '#ffffff',
    Y: '#6b4a2b', // poop
    y: '#8a6440',
    M: '#7a7a7a', // bowl metal
    m: '#b5b5b5',
    F: '#a0522d', // kibble
    L: '#2f6fd6', // leash / pill blue
    l: '#ffffff',
    Q: '#e0e0e0', // stink lines
    A: '#f5c518', // sun / lightning
    a: '#d99a0b',
    X: '#e04848', // vet cross
    V: '#c9a36b', // broom straw
  };

  const PROPS = {
    bowl: [
      '..FFtFFtF..',
      '.KFtFFtFFK.',
      'KmmmmmmmmmK',
      '.KMMMMMMMK.',
      '..KKKKKKK..',
    ],
    bowlEmpty: [
      '...........',
      '...........',
      'KmmmmmmmmmK',
      '.KMMMMMMMK.',
      '..KKKKKKK..',
    ],
    bone: [
      'KK.....KK',
      'KOK...KOK',
      '.KOOOOOK.',
      'KOoooooOK',
      'KK.....KK',
    ],
    ball: [
      '.KKKK.',
      'KGGGgK',
      'KsGGGK',
      'KGGsGK',
      'KgGGgK',
      '.KKKK.',
    ],
    heart: [
      '.KK.KK.',
      'KRRKRRK',
      'KRRRRrK',
      '.KRRrK.',
      '..KrK..',
      '...K...',
    ],
    bubble: [
      '.SSS.',
      'SsS.S',
      'S...S',
      '.SSS.',
    ],
    poop: [
      '..KK...',
      '.KyYK..',
      '.KYYYK.',
      'KyYYYYK',
      'KKKKKKK',
    ],
    pill: [
      '.KKKK.',
      'KLLllK',
      'KLLllK',
      '.KKKK.',
    ],
    leash: [
      'LL....',
      '.LL...',
      '..LL..',
      '...LLL',
    ],
    z: [
      'KKKK',
      '..K.',
      '.K..',
      'KKKK',
    ],
    // --- toolbar / stat icons (8x8-ish)
    paw: [
      '.KK..KK.',
      '.KK..KK.',
      'KK.KK.KK',
      'KK.KK.KK',
      '..KKKK..',
      '.KKKKKK.',
      '.KKKKKK.',
      '..KKKK..',
    ],
    sun: [
      '...A....',
      '.A.A.A..',
      '..AAA...',
      'AAAaAAA.',
      '..AAA...',
      '.A.A.A..',
      '...A....',
    ],
    bolt: [
      '...KKK',
      '..KAAK',
      '.KAAK.',
      'KAAAAK',
      '.KAAK.',
      '.KAK..',
      'KAK...',
      'KK....',
    ],
    cross: [
      '..KKK..',
      '..KXK..',
      'KKKXKKK',
      'KXXXXXK',
      'KKKXKKK',
      '..KXK..',
      '..KKK..',
    ],
    broom: [
      '.....KK',
      '....KbK',
      '...KbK.',
      '..KbK..',
      '.KVVK..',
      'KVVVVK.',
      'KVKVK..',
    ],
    zzz: [
      'KKKK....',
      '..K.....',
      '.K......',
      'KKKK.KKK',
      '......K.',
      '.....K..',
      '.....KKK',
    ],
    stink: [
      '.Q..Q',
      'Q..Q.',
      '.Q..Q',
    ],
  };

  /** `colors` optionally overrides palette entries, e.g. { K: '#fff' } for dark mode icons. */
  function drawProp(ctx, name, x, y, scale, colors = null) {
    const rows = PROPS[name];
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const ch = rows[r][c];
        if (ch === '.') continue;
        ctx.fillStyle = (colors && colors[ch]) || PROPS_PALETTE[ch];
        ctx.fillRect((x + c) * scale, (y + r) * scale, scale, scale);
      }
    }
  }

  /** Draw a sprite grid at a logical offset without clearing the canvas. */
  function drawAt(ctx, grid, ox, oy, scale, flipX = false) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = grid[y][x];
        if (ch === '.') continue;
        const dx = flipX ? W - 1 - x : x;
        ctx.fillStyle = PALETTE[ch];
        ctx.fillRect((ox + dx) * scale, (oy + y) * scale, scale, scale);
      }
    }
  }

  const api = {
    W, H, PALETTE, PROPS_PALETTE, ANIMATIONS, PROPS, draw, drawAt, drawProp,
    parts: { BODY, HEAD, EAR, TAIL, LEG, SLEEP, BELLY },
    _internal: { standing, sleeping, bellyUp, stamp, blank },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sprites = api;
})(typeof window !== 'undefined' ? window : globalThis);

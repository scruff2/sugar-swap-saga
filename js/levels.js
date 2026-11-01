'use strict';
// Level definitions.
// Grid tokens: X hole, . candy, j/J single/double jelly, 1-5 frosting layers,
// C chocolate, L licorice lock, K lock on jelly, F/G frosting(1/2) on jelly,
// I starting ingredient.
// Types: score, jelly, ing (ingredients), order, time.
// Order targets: {t:'color', color, n} | {t:'striped'|'wrapped'|'bomb'|'frost'|'choc'|'jelly', n}

const COLOR_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];

const HAND_LEVELS = [
  { type: 'score', moves: 20, colors: 5, grid: [
    'XX.....XX', 'X.......X', '.........', '.........', '.........', '.........', 'X.......X', 'XX.....XX'] },
  { type: 'score', moves: 18, colors: 5, grid: [
    '.........', '.........', '..XX.XX..', '.........', '.........', '..XX.XX..', '.........', '.........'] },
  { type: 'jelly', moves: 22, colors: 5, grid: [
    'XXX...XXX', 'XXX.j.XXX', '...jjj...', '..jjjjj..', '...jjj...', 'XXX.j.XXX', 'XXX...XXX'] },
  { type: 'jelly', moves: 30, colors: 5, grid: [
    'XjjjjjjjX', 'jjjjjjjjj', 'jj.....jj', 'jj.....jj', 'jj.....jj', 'jjjjjjjjj', 'XjjjjjjjX'] },
  { type: 'ing', moves: 30, colors: 5, ing: 1, grid: [
    'X...I...X', '.........', '.........', '.........', '.........', '.........', '.........', 'X.......X'] },
  { type: 'score', moves: 25, colors: 5, grid: [
    '.........', '.........', '.........', '.........', '111111111', '.........', '.........', '.........'] },
  { type: 'jelly', moves: 30, colors: 5, grid: [
    '1.......1', '1..jjj..1', '1.jJJJj.1', '1.jJJJj.1', '1.jJJJj.1', '1..jjj..1', '1.......1'] },
  { type: 'order', moves: 22, colors: 5, orders: [{ t: 'color', color: 0, n: 25 }, { t: 'color', color: 4, n: 25 }], grid: [
    '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'] },
  { type: 'ing', moves: 35, colors: 5, ing: 2, grid: [
    '.........', '.........', '.........', '22.....22', '.........', '.........', '.........', '.........', 'X.......X'] },
  { type: 'jelly', moves: 32, colors: 5, grid: [
    'jj.....jj', 'jKLLLLLKj', '.L.....L.', '.L.....L.', '.L.....L.', 'jKLLLLLKj', 'jj.....jj'] },
  { type: 'time', time: 60, colors: 5, grid: [
    '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'] },
  { type: 'jelly', moves: 30, colors: 5, grid: [
    'CC.....CC', 'C.jjjjj.C', '..jjjjj..', '..jjjjj..', '..jjjjj..', 'C.jjjjj.C', 'CC.....CC'] },
  { type: 'order', moves: 30, colors: 5, orders: [{ t: 'striped', n: 6 }, { t: 'wrapped', n: 3 }], grid: [
    'X.......X', '.........', '.........', '.........', '.........', '.........', '.........', 'X.......X'] },
  { type: 'ing', moves: 35, colors: 5, ing: 2, ingMax: 2, grid: [
    '....X....', '....X....', '....X....', '....X....', '....X....', '....X....', '....X....', '....X....'] },
  { type: 'jelly', moves: 40, colors: 5, grid: [
    'JJJJJJJJJ', 'JJJJJJJJJ', 'JJJJJJJJJ', 'JJJJJJJJJ', 'JJJJJJJJJ', 'JJJJJJJJJ', 'JJJJJJJJJ'] },
  { type: 'order', moves: 30, colors: 5, orders: [{ t: 'choc', n: 20 }], grid: [
    '.........', '.........', 'CCCCCCCCC', 'C.......C', 'C.......C', 'CCCCCCCCC', '.........', '.........'] },
  { type: 'score', moves: 30, colors: 5, bombs: { chance: 0.04, moves: 15, max: 2 }, grid: [
    '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'] },
  { type: 'jelly', moves: 36, colors: 5, grid: [
    'GG.....GG', 'GjjjjjjjG', '.jj232jj.', '.jj3J3jj.', '.jj232jj.', 'Gjjjjjjjj', 'GG.....GG'] },
  { type: 'order', moves: 34, colors: 5, orders: [{ t: 'bomb', n: 2 }, { t: 'color', color: 2, n: 50 }], grid: [
    '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'] },
  { type: 'ing', moves: 40, colors: 5, ing: 3, grid: [
    'C.......C', '.........', '.........', '.........', '.CC...CC.', '.........', '.........', '.........'] },
  { type: 'jelly', moves: 35, colors: 5, grid: [
    'XjjXXXjjX', 'jjjjXjjjj', 'jjjjjjjjj', 'jjjjjjjjj', 'XjjjjjjjX', 'XXjjjjjXX', 'XXXjjjXXX', 'XXXXjXXXX'] },
  { type: 'order', moves: 32, colors: 5, orders: [{ t: 'color', color: 3, n: 30 }, { t: 'color', color: 4, n: 30 }], grid: [
    'L.L.L.L.L', '.........', 'L.L.L.L.L', '.........', 'L.L.L.L.L', '.........', 'L.L.L.L.L', '.........'] },
  { type: 'time', time: 90, colors: 6, grid: [
    'X.......X', '.........', '.........', '.........', '.........', '.........', '.........', '.........', 'X.......X'] },
  { type: 'jelly', moves: 40, colors: 5, grid: [
    '543212345', 'jjjjjjjjj', 'jjjjjjjjj', 'jjjjjjjjj', 'jjjjjjjjj', 'jjjjjjjjj', '.........'] },
  { type: 'ing', moves: 40, colors: 5, ing: 2, bombs: { chance: 0.03, moves: 15, max: 2 }, grid: [
    '.........', '.........', '.L.L.L.L.', '.........', '.........', '.L.L.L.L.', '.........', '.........'] },
];

// Shapes reused by generated levels.
const SHAPES = [
  ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
  ['XX.....XX', 'X.......X', '.........', '.........', '.........', '.........', '.........', 'X.......X', 'XX.....XX'],
  ['....X....', '.........', '.........', '.........', 'X.......X', '.........', '.........', '.........', '....X....'],
  ['X.X.X.X.X', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
  ['XXX...XXX', 'XX.....XX', 'X.......X', '.........', '.........', '.........', 'X.......X', 'XX.....XX', 'XXX...XXX'],
  ['.........', '.........', '..X...X..', '.........', '.........', '..X...X..', '.........', '.........'],
];

function generateLevel(n) {
  const rnd = U.seeded(n * 7919 + 13);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const types = ['jelly', 'score', 'ing', 'jelly', 'order', 'jelly', 'time', 'ing'];
  const type = types[n % types.length];
  const diff = Math.min(1, (n - 25) / 50);
  const shape = SHAPES[n % SHAPES.length].map(r => r.split(''));
  const rows = shape.length, cols = shape[0].length;
  const set = (r, c, ch) => { if (shape[r] && shape[r][c] === '.') shape[r][c] = ch; };
  // Frosting rows / chocolate patches scaled with difficulty.
  if (rnd() < 0.5 + diff * 0.3) {
    const r = 2 + Math.floor(rnd() * (rows - 4));
    const hp = String(1 + Math.floor(rnd() * (1 + diff * 3)));
    for (let c = 0; c < cols; c++) if (rnd() < 0.7) set(r, c, hp);
  }
  if (rnd() < 0.25 + diff * 0.3) {
    for (const c of [0, cols - 1]) { set(0, c, 'C'); set(1, c, 'C'); }
  }
  if (rnd() < 0.3 + diff * 0.3) {
    for (let i = 0; i < 4 + diff * 6; i++) set(Math.floor(rnd() * rows), Math.floor(rnd() * cols), 'L');
  }
  const L = { type, colors: rnd() < 0.3 + diff * 0.5 ? 6 : 5 };
  if (type === 'jelly') {
    const dbl = rnd() < 0.3 + diff * 0.5;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const ch = shape[r][c];
      if (ch === '.') shape[r][c] = dbl && (r + c) % 2 === 0 ? 'J' : 'j';
      else if (ch === 'L') shape[r][c] = 'K';
    }
    L.moves = 37 + Math.floor(rnd() * 8);
  } else if (type === 'ing') {
    L.ing = 2 + Math.floor(rnd() * (1 + diff * 2));
    L.ingMax = 2;
    L.moves = 32 + L.ing * 7;
  } else if (type === 'order') {
    const kinds = [
      () => ({ t: 'color', color: Math.floor(rnd() * 5), n: 40 + Math.floor(diff * 30) }),
      () => ({ t: 'striped', n: 6 + Math.floor(diff * 6) }),
      () => ({ t: 'wrapped', n: 3 + Math.floor(diff * 2) }),
      () => ({ t: 'bomb', n: 1 + Math.floor(diff * 1.5) }),
    ];
    const a = pick(kinds)();
    let b = pick(kinds)();
    if (b.t === a.t) b = kinds[0]();
    if (b.t === 'color' && a.t === 'color' && b.color === a.color) b.color = (a.color + 1) % 5;
    L.orders = [a, b];
    L.moves = 32 + Math.floor(rnd() * 6);
  } else if (type === 'time') {
    L.time = 70 + Math.floor(rnd() * 3) * 10;
  } else {
    L.moves = 25 + Math.floor(rnd() * 8);
    if (rnd() < 0.4) L.bombs = { chance: 0.03, moves: 14, max: 2 };
  }
  L.grid = shape.map(r => r.join(''));
  return L;
}

// Star thresholds derived from the level goal (tuned against a bot player).
function autoStars(L) {
  let tiles = 0, jelly = 0;
  for (const row of L.grid) for (const ch of row) {
    if (ch !== 'X') tiles++;
    if (ch === 'j' || ch === 'K' || ch === 'F' || ch === 'G') jelly += 1;
    if (ch === 'J') jelly += 2;
  }
  const size = tiles / 72;
  let s1;
  if (L.type === 'time') s1 = L.time * 170 * size;
  else if (L.type === 'jelly') s1 = jelly * 1000 + L.moves * 400 * size;
  else if (L.type === 'ing') s1 = L.ing * 10000 + L.moves * 500 * size;
  else if (L.type === 'order') s1 = L.moves * 600 * size;
  else s1 = L.moves * 300 * size;
  s1 = Math.round(s1 / 500) * 500 || 500;
  const mult = [1, 1.5, 2.1];
  return mult.map(m => Math.round((s1 * m) / 500) * 500);
}

const LEVEL_COUNT = 60;
function getLevel(n) {
  const L = n <= HAND_LEVELS.length ? JSON.parse(JSON.stringify(HAND_LEVELS[n - 1])) : generateLevel(n);
  if (!L.stars) L.stars = autoStars(L);
  return L;
}

function describeGoal(L) {
  switch (L.type) {
    case 'jelly': return 'Clear all the jelly!';
    case 'ing': return `Bring down ${L.ing} ingredient${L.ing > 1 ? 's' : ''}!`;
    case 'order': return 'Collect the orders!';
    case 'time': return `Score ${L.stars[0].toLocaleString()} points in ${L.time} seconds!`;
    default: return `Score ${L.stars[0].toLocaleString()} points in ${L.moves} moves!`;
  }
}

if (typeof module !== 'undefined') module.exports = { HAND_LEVELS, getLevel, LEVEL_COUNT, describeGoal, autoStars, COLOR_NAMES };

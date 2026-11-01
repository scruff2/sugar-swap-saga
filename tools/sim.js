// Headless bot: plays every level with a greedy player to check engine
// correctness and star-threshold balance.  Usage: node tools/sim.js [runs] [from] [to]
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ctx = { console, Math, JSON, Promise, Set, Map, Array, Object, String, Number, setTimeout };
vm.createContext(ctx);
for (const f of ['util.js', 'levels.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f), 'utf8').replace(/^'use strict';/, '') + '\n;globalThis.U=typeof U!=="undefined"?U:globalThis.U;', ctx, { filename: f });
}
vm.runInContext('globalThis.Game=Game;globalThis.Tweener=Tweener;globalThis.getLevel=getLevel;globalThis.LEVEL_COUNT=LEVEL_COUNT;', ctx);

// Cells that would match if a and b were swapped.
function lineCells(g, cell) {
  const col = g.matchColor(cell);
  if (col < 0) return [];
  const out = [];
  for (const [dr, dc] of [[0, 1], [1, 0]]) {
    const run = [cell];
    for (let i = 1; g.matchColor(g.get(cell.r + dr * i, cell.c + dc * i)) === col; i++) run.push(g.get(cell.r + dr * i, cell.c + dc * i));
    for (let i = 1; g.matchColor(g.get(cell.r - dr * i, cell.c - dc * i)) === col; i++) run.push(g.get(cell.r - dr * i, cell.c - dc * i));
    if (run.length >= 3) out.push(...run);
  }
  return out;
}
function scoreMove(g, m) {
  const a = m.a.candy, b = m.b.candy;
  let v = Math.random();
  if (g.isCombo(a, b)) v += 30;
  [m.a.candy, m.b.candy] = [b, a];
  const cells = [...new Set([...lineCells(g, m.a), ...lineCells(g, m.b)])];
  [m.a.candy, m.b.candy] = [a, b];
  v += cells.length * 2;
  if (cells.length >= 4) v += 8;
  for (const c of cells) {
    v += c.jelly * 4 + (c.candy && c.candy.special ? 6 : 0);
    if (c.lock) v += 2;
    for (const nb of g.neighbors(c)) if (nb.blocker) v += 3;
    for (const o of g.orders) if (o.left > 0 && o.t === 'color' && c.candy && o.color === c.candy.color) v += 2;
  }
  if (a.kind === 'ing' && m.b.r > m.a.r) v += 6;
  v += (m.a.r + m.b.r) * 0.1;
  return v;
}

async function play(n) {
  const L = ctx.getLevel(n);
  const tw = new ctx.Tweener(); tw.instant = true;
  const g = new ctx.Game(L, { tweener: tw });
  let steps = 0;
  while (g.state !== 'over' && steps++ < 400) {
    if (g.timed) g.timeLeft -= 2.2; // ~2.2s per move for a quick human
    const ms = g.findMoves();
    if (!ms.length) { await g.useShuffle(); continue; }
    ms.sort((x, y) => scoreMove(g, y) - scoreMove(g, x));
    const m = ms[0];
    await g.trySwap(m.a, m.b);
    if (g.timed && g.timeLeft <= 0 && g.state === 'idle') { g.state = 'busy'; await g.finishTimed(); }
  }
  return { won: !!(g.result && g.result.won), score: g.score, stars: g.result ? g.result.stars : 0, L, steps };
}

(async () => {
  const runs = +process.argv[2] || 10, from = +process.argv[3] || 1, to = +process.argv[4] || ctx.LEVEL_COUNT;
  for (let n = from; n <= to; n++) {
    const L0 = ctx.getLevel(n);
    const w = L0.grid[0].length;
    if (L0.grid.some(r => r.length !== w)) console.log('BAD GRID WIDTH level', n);
    let wins = 0, scores = [], stars = [0, 0, 0, 0];
    for (let i = 0; i < runs; i++) {
      const r = await play(n);
      if (r.won) wins++;
      scores.push(r.score); stars[r.stars]++;
    }
    scores.sort((a, b) => a - b);
    console.log(`L${String(n).padStart(2)} ${L0.type.padEnd(5)} win ${String(Math.round(wins / runs * 100)).padStart(3)}%  median ${scores[scores.length >> 1]}  stars ${JSON.stringify(L0.stars)}  dist ${stars.join('/')}`);
  }
})();

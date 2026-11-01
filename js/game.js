'use strict';
// Core match-3 engine. No DOM access: rendering, sound and UI subscribe via
// `emit(type, data)`. Specials: 'h'/'v' striped, 'w' wrapped, 'b' color bomb.

const COLOR_COUNT_MAX = 6;
const NOOP = () => {};

class Game {
  constructor(level, opts = {}) {
    this.L = level;
    this.tw = opts.tweener || new Tweener();
    this.emit = opts.emit || NOOP;
    this.sfx = opts.sfx || NOOP;
    this.colors = Math.min(COLOR_COUNT_MAX, level.colors || 6);
    this.score = 0;
    this.moves = level.moves || 0;
    this.timeLeft = level.time || 0;
    this.timed = level.type === 'time';
    this.state = 'idle'; // idle | busy | over
    this.nextId = 1;
    this.ingCollected = 0;
    this.ingSpawned = 0;
    this.orders = (level.orders || []).map(o => ({ ...o, left: o.n }));
    this.chocHit = false;
    this.idleTime = 0;
    this.hint = null;
    this.moveCascade = 0;
    this.moveCount = 0;
    this.stars = level.stars;
    this.result = null;
    this.build();
  }

  // ---------- setup ----------
  build() {
    const g = this.L.grid;
    this.rows = g.length;
    this.cols = g[0].length;
    this.grid = [];
    const ingStart = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        const ch = g[r][c] || 'X';
        const cell = { r, c, tile: ch !== 'X', jelly: 0, blocker: null, lock: false, candy: null, spawner: false, exit: false };
        if (ch === 'j') cell.jelly = 1;
        else if (ch === 'J') cell.jelly = 2;
        else if (ch >= '1' && ch <= '5') cell.blocker = { type: 'frost', hp: +ch };
        else if (ch === 'C') cell.blocker = { type: 'choc' };
        else if (ch === 'L') cell.lock = true;
        else if (ch === 'K') { cell.lock = true; cell.jelly = 1; }
        else if (ch === 'F') { cell.blocker = { type: 'frost', hp: 1 }; cell.jelly = 1; }
        else if (ch === 'G') { cell.blocker = { type: 'frost', hp: 2 }; cell.jelly = 1; }
        else if (ch === 'I') ingStart.push(cell);
        row.push(cell);
      }
      this.grid.push(row);
    }
    if (this.L.jelly) {
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
        const ch = (this.L.jelly[r] || '')[c];
        if (ch === '1' || ch === '2') this.grid[r][c].jelly = +ch;
      }
    }
    for (let c = 0; c < this.cols; c++) {
      let top = null, bottom = null;
      for (let r = 0; r < this.rows; r++) if (this.grid[r][c].tile) { if (!top) top = this.grid[r][c]; bottom = this.grid[r][c]; }
      if (top) top.spawner = true;
      if (bottom && this.L.type === 'ing' && (!this.L.exits || this.L.exits.includes(c))) bottom.exit = true;
    }
    this.totalJelly = this.countJelly();
    this.fillInitial();
    for (const cell of ingStart) {
      cell.candy = this.makeIngredient();
      cell.candy.x = cell.c; cell.candy.y = cell.r;
      this.ingSpawned++;
    }
    let guard = 0;
    while (!this.findMoves().length && guard++ < 50) this.fillInitial();
  }

  fillInitial() {
    for (const cell of this.cells()) {
      if (!cell.tile || cell.blocker) continue;
      if (cell.candy && cell.candy.kind !== 'candy') continue;
      const bad = new Set();
      const l1 = this.get(cell.r, cell.c - 1), l2 = this.get(cell.r, cell.c - 2);
      const u1 = this.get(cell.r - 1, cell.c), u2 = this.get(cell.r - 2, cell.c);
      const cl1 = this.matchColor(l1), cu1 = this.matchColor(u1);
      if (cl1 >= 0 && cl1 === this.matchColor(l2)) bad.add(cl1);
      if (cu1 >= 0 && cu1 === this.matchColor(u2)) bad.add(cu1);
      let color;
      do { color = U.ri(this.colors); } while (bad.has(color));
      cell.candy = this.makeCandy(color);
      cell.candy.x = cell.c; cell.candy.y = cell.r;
      if (this.L.bombs && Math.random() < (this.L.bombs.start || 0)) cell.candy.timer = this.L.bombs.moves;
    }
  }

  makeCandy(color, special = null) {
    return { id: this.nextId++, kind: 'candy', color, special, x: 0, y: 0, scale: 1, alpha: 1, rot: 0, armed: false, radius: 1, timer: 0, movedAt: 0, dying: false };
  }

  makeIngredient() {
    const c = this.makeCandy(-1);
    c.kind = 'ing';
    c.ingType = this.ingSpawned % 2;
    return c;
  }

  // ---------- helpers ----------
  get(r, c) { return r >= 0 && r < this.rows && c >= 0 && c < this.cols ? this.grid[r][c] : null; }
  *cells() { for (const row of this.grid) yield* row; }
  playable(cell) { return !!(cell && cell.tile && !cell.blocker); }
  emptyPlayable(cell) { return this.playable(cell) && !cell.candy; }
  canSwap(cell) { return this.playable(cell) && cell.candy && !cell.lock && !cell.candy.armed && !cell.candy.dying; }
  movable(cell) { return this.playable(cell) && cell.candy && !cell.lock && !cell.candy.dying; }
  matchColor(cell) {
    if (!cell || !cell.tile || cell.blocker || !cell.candy) return -1;
    const k = cell.candy;
    if (k.kind !== 'candy' || k.special === 'b' || k.armed || k.dying) return -1;
    return k.color;
  }
  countJelly() { let n = 0; for (const cell of this.cells()) n += cell.jelly; return n; }
  jellyLeft() { let n = 0; for (const cell of this.cells()) if (cell.jelly) n++; return n; }
  upTile(r, c) { for (let i = r - 1; i >= 0; i--) if (this.grid[i][c].tile) return this.grid[i][c]; return null; }
  downTile(r, c) { for (let i = r + 1; i < this.rows; i++) if (this.grid[i][c].tile) return this.grid[i][c]; return null; }
  neighbors(cell) {
    return [this.get(cell.r - 1, cell.c), this.get(cell.r + 1, cell.c), this.get(cell.r, cell.c - 1), this.get(cell.r, cell.c + 1)].filter(Boolean);
  }
  addScore(pts, r, c, color) {
    if (!pts) return;
    this.score += pts;
    this.emit('score', { pts, r, c, color });
  }
  collect(t, color) {
    for (const o of this.orders) {
      if (o.left <= 0 || o.t !== t) continue;
      if (t === 'color' && o.color !== color) continue;
      o.left--;
    }
  }

  // ---------- matching ----------
  findGroups() {
    const runs = [];
    for (let r = 0; r < this.rows; r++) {
      let c = 0;
      while (c < this.cols) {
        const col = this.matchColor(this.grid[r][c]);
        let e = c + 1;
        if (col >= 0) while (e < this.cols && this.matchColor(this.grid[r][e]) === col) e++;
        if (col >= 0 && e - c >= 3) runs.push({ dir: 'h', cells: this.grid[r].slice(c, e) });
        c = e;
      }
    }
    for (let c = 0; c < this.cols; c++) {
      let r = 0;
      while (r < this.rows) {
        const col = this.matchColor(this.grid[r][c]);
        let e = r + 1;
        if (col >= 0) while (e < this.rows && this.matchColor(this.grid[e][c]) === col) e++;
        if (col >= 0 && e - r >= 3) {
          const cells = [];
          for (let i = r; i < e; i++) cells.push(this.grid[i][c]);
          runs.push({ dir: 'v', cells });
        }
        r = e;
      }
    }
    // Union runs that share cells into shapes (L, T, +).
    const groups = [];
    for (const run of runs) {
      const hits = groups.filter(g => run.cells.some(cell => g.cells.has(cell)));
      let g;
      if (!hits.length) { g = { runs: [], cells: new Set() }; groups.push(g); }
      else {
        g = hits[0];
        for (const o of hits.slice(1)) {
          o.runs.forEach(x => g.runs.push(x));
          o.cells.forEach(x => g.cells.add(x));
          groups.splice(groups.indexOf(o), 1);
        }
      }
      g.runs.push(run);
      run.cells.forEach(x => g.cells.add(x));
    }
    for (const g of groups) {
      g.maxLen = Math.max(...g.runs.map(r => r.cells.length));
      g.hasH = g.runs.some(r => r.dir === 'h');
      g.hasV = g.runs.some(r => r.dir === 'v');
      g.type = g.maxLen >= 5 ? 'b' : (g.hasH && g.hasV) ? 'w' : g.maxLen === 4 ? 's' : null;
      g.color = this.matchColor([...g.cells][0]);
    }
    return groups;
  }

  hasMatchAt(cell) {
    const col = this.matchColor(cell);
    if (col < 0) return false;
    let n = 1;
    for (let c = cell.c - 1; this.matchColor(this.get(cell.r, c)) === col; c--) n++;
    for (let c = cell.c + 1; this.matchColor(this.get(cell.r, c)) === col; c++) n++;
    if (n >= 3) return true;
    n = 1;
    for (let r = cell.r - 1; this.matchColor(this.get(r, cell.c)) === col; r--) n++;
    for (let r = cell.r + 1; this.matchColor(this.get(r, cell.c)) === col; r++) n++;
    return n >= 3;
  }

  isCombo(x, y) {
    if (!x || !y || x.kind !== 'candy' || y.kind !== 'candy') return false;
    if (x.special === 'b' || y.special === 'b') return true;
    return !!(x.special && y.special);
  }

  // All valid swaps; each entry {a, b, value} where value is a rough quality.
  findMoves() {
    const out = [];
    for (const a of this.cells()) {
      if (!this.canSwap(a)) continue;
      for (const b of [this.get(a.r, a.c + 1), this.get(a.r + 1, a.c)]) {
        if (!this.canSwap(b)) continue;
        if (this.isCombo(a.candy, b.candy)) { out.push({ a, b, value: 10 }); continue; }
        [a.candy, b.candy] = [b.candy, a.candy];
        const ok = this.hasMatchAt(a) || this.hasMatchAt(b);
        [a.candy, b.candy] = [b.candy, a.candy];
        if (ok) out.push({ a, b, value: 1 });
      }
    }
    return out;
  }

  // ---------- player actions ----------
  async trySwap(a, b, free = false) {
    if (this.state !== 'idle' || !a || !b) return false;
    if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return false;
    if (!this.canSwap(a) || !this.canSwap(b)) { this.sfx('bad'); return false; }
    this.state = 'busy';
    this.hint = null;
    this.idleTime = 0;
    const x = a.candy, y = b.candy; // x moves a->b, y moves b->a
    this.sfx('swap');
    a.candy = y; b.candy = x;
    await Promise.all([this.tw.to(x, { x: b.c, y: b.r }, 170, 'inOutQuad'), this.tw.to(y, { x: a.c, y: a.r }, 170, 'inOutQuad')]);
    const combo = this.isCombo(x, y);
    if (!combo && !free && !this.hasMatchAt(a) && !this.hasMatchAt(b)) {
      this.sfx('bad');
      a.candy = x; b.candy = y;
      await Promise.all([this.tw.to(x, { x: a.c, y: a.r }, 170, 'inOutQuad'), this.tw.to(y, { x: b.c, y: b.r }, 170, 'inOutQuad')]);
      this.state = 'idle';
      return false;
    }
    if (!free) this.moves--;
    this.beginMove();
    x.movedAt = y.movedAt = ++this.moveCount * 1000;
    if (combo) await this.runCombo(b, a);
    const dir = a.r === b.r ? 'h' : 'v';
    await this.resolve({ cells: [b, a], dir });
    await this.endMove(free);
    return true;
  }

  async useHammer(cell) {
    if (this.state !== 'idle' || !cell || !cell.tile) return false;
    if (!cell.candy && !cell.blocker && !cell.jelly) return false;
    if (cell.candy && cell.candy.kind === 'ing') return false;
    this.state = 'busy';
    this.hint = null;
    this.beginMove(true);
    this.sfx('hammer');
    this.emit('hammer', { r: cell.r, c: cell.c });
    await this.tw.wait(250);
    await this.blast([[cell.r, cell.c, { force: true }]]);
    await this.gravity();
    await this.resolve(null);
    await this.endMove(true);
    return true;
  }

  async useShuffle() {
    if (this.state !== 'idle') return false;
    this.state = 'busy';
    await this.shuffle();
    this.state = 'idle';
    return true;
  }

  // Pre-level boosters: place specials on random normal candies.
  placeStartSpecial(type) {
    const cells = [...this.cells()].filter(c => this.canSwap(c) && c.candy.kind === 'candy' && !c.candy.special && !c.candy.timer);
    if (!cells.length) return;
    const cell = U.pick(cells);
    cell.candy.special = type === 's' ? U.pick(['h', 'v']) : type;
    if (type === 'b') cell.candy.color = -1;
  }

  beginMove() {
    this.chocHit = false;
    this.moveCascade = 0;
    this.moveCleared = 0;
  }

  // ---------- resolution ----------
  async resolve(swap) {
    let guard = 0;
    while (guard++ < 60) {
      const groups = this.findGroups();
      if (groups.length) {
        this.moveCascade++;
        await this.processGroups(groups, swap, this.moveCascade);
        swap = null;
        await this.gravity();
        continue;
      }
      const armed = [...this.cells()].filter(c => c.candy && c.candy.armed);
      if (armed.length) {
        await this.blast([], armed.map(c => ({ type: 'w2', r: c.r, c: c.c, candy: c.candy })));
        await this.gravity();
        continue;
      }
      break;
    }
  }

  chooseSpecialCell(g, swap) {
    const cand = [...g.cells].filter(c => c.candy && !c.lock && !c.candy.special && !c.candy.timer);
    if (!cand.length) return null;
    if (swap) { const s = swap.cells.find(c => cand.includes(c)); if (s) return s; }
    let best = null;
    for (const c of cand) if (!best || c.candy.movedAt > best.candy.movedAt) best = c;
    if (best && best.candy.movedAt > 0) return best;
    if (g.type === 'w') {
      const hr = g.runs.find(r => r.dir === 'h'), vr = g.runs.find(r => r.dir === 'v');
      const inter = hr && vr && hr.cells.find(c => vr.cells.includes(c));
      if (inter && cand.includes(inter)) return inter;
    }
    const run = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    const mid = run.cells[Math.floor((run.cells.length - 1) / 2)];
    return cand.includes(mid) ? mid : cand[0];
  }

  async processGroups(groups, swap, cascade) {
    const hits = [];
    const makes = [];
    const adj = new Set();
    for (const g of groups) {
      const base = g.type === 'b' ? 200 : g.type === 'w' ? 200 : g.type === 's' ? 120 : 60;
      const n = g.cells.size;
      const pts = (base + Math.max(0, n - 5) * 60) * cascade;
      const cellsArr = [...g.cells];
      const mid = cellsArr[Math.floor(cellsArr.length / 2)];
      this.addScore(pts, mid.r, mid.c, g.color);
      let sc = null;
      if (g.type) {
        sc = this.chooseSpecialCell(g, swap);
        if (sc) {
          let sp = g.type;
          if (sp === 's') {
            const run = g.runs[0];
            sp = swap && swap.cells.includes(sc) ? swap.dir : (run.dir === 'h' ? 'v' : 'h');
          }
          makes.push({ cell: sc, sp, others: cellsArr.filter(c => c !== sc) });
        }
      }
      for (const cell of cellsArr) {
        if (cell !== sc) hits.push([cell.r, cell.c, { match: true }]);
        for (const nb of this.neighbors(cell)) if (nb.blocker) adj.add(nb);
      }
    }
    this.sfx('match', cascade);
    if (makes.length) {
      // Matched candies slide into the new special.
      const ps = [];
      for (const m of makes) for (const o of m.others) {
        if (o.candy && !o.candy.special && !o.lock) ps.push(this.tw.to(o.candy, { x: m.cell.c, y: m.cell.r, scale: 0.7 }, 140, 'inQuad'));
      }
      await Promise.all(ps);
      for (const m of makes) {
        const k = m.cell.candy;
        k.special = m.sp;
        if (m.sp === 'b') k.color = -1;
        this.damageJelly(m.cell);
        this.emit('make', { r: m.cell.r, c: m.cell.c, sp: m.sp });
        k.scale = 1.4;
        this.tw.to(k, { scale: 1 }, 260, 'outBack');
      }
      this.sfx('special', makes[0].sp);
    }
    for (const b of adj) hits.push([b.r, b.c, { adj: true }]);
    await this.blast(hits);
  }

  // Hit a set of cells, then process chained special activations wave by wave.
  async blast(hits, acts = []) {
    const queue = acts.slice();
    for (const [r, c, o] of hits) this.hit(r, c, queue, o || {});
    let guard = 0;
    let waited = false;
    while (queue.length && guard++ < 300) {
      const wave = queue.splice(0, queue.length);
      for (const a of wave) this.activate(a, queue);
      await this.tw.wait(170);
      waited = true;
    }
    if (hits.length || waited) await this.tw.wait(waited ? 120 : 200);
  }

  hit(r, c, queue, o = {}) {
    const cell = this.get(r, c);
    if (!cell || !cell.tile) return;
    if (cell.blocker) {
      if (o.match) return;
      this.damageBlocker(cell);
      return;
    }
    if (o.adj) return;
    const k = cell.candy;
    if (!k) { if (!o.match) this.damageJelly(cell); return; }
    if (cell.lock) {
      cell.lock = false;
      this.sfx('lock');
      this.emit('lockBreak', { r, c });
      this.addScore(60, r, c, -1);
      return;
    }
    if (k.kind !== 'candy' || k.dying) return;
    this.damageJelly(cell);
    if (k.special) {
      if (k.special === 'w') {
        if (k.armed) return;
        k.armed = true;
        queue.push({ type: 'w', r, c, radius: k.radius, candy: k, color: k.color });
        return;
      }
      this.removeCandy(cell, o.match);
      queue.push({ type: k.special, r, c, color: k.color, candy: k });
      return;
    }
    this.removeCandy(cell, o.match);
  }

  removeCandy(cell, fromMatch) {
    const k = cell.candy;
    if (!k) return;
    cell.candy = null;
    k.dying = true;
    this.moveCleared++;
    if (k.kind === 'candy' && k.color >= 0) this.collect('color', k.color);
    if (!fromMatch) this.addScore(60, cell.r, cell.c, k.color);
    this.emit('pop', { r: cell.r, c: cell.c, color: k.color, special: k.special, candy: k });
    this.tw.to(k, { scale: 0, alpha: 0 }, 180, 'inQuad');
  }

  damageJelly(cell) {
    if (!cell.jelly) return;
    cell.jelly--;
    if (!cell.jelly) this.collect('jelly');
    this.addScore(1000, cell.r, cell.c, -2);
    this.emit('jelly', { r: cell.r, c: cell.c, left: cell.jelly });
  }

  damageBlocker(cell) {
    const b = cell.blocker;
    if (b.type === 'frost') {
      b.hp--;
      this.sfx('frost');
      this.emit('crumble', { r: cell.r, c: cell.c, type: 'frost' });
      this.addScore(20, cell.r, cell.c, -1);
      if (b.hp <= 0) { cell.blocker = null; this.collect('frost'); }
    } else if (b.type === 'choc') {
      cell.blocker = null;
      this.chocHit = true;
      this.sfx('choc');
      this.emit('crumble', { r: cell.r, c: cell.c, type: 'choc' });
      this.addScore(20, cell.r, cell.c, -1);
      this.collect('choc');
    }
  }

  mostCommonColor() {
    const n = new Array(this.colors).fill(0);
    for (const cell of this.cells()) {
      const k = cell.candy;
      if (k && k.kind === 'candy' && k.color >= 0 && !k.dying) n[k.color]++;
    }
    let best = 0;
    for (let i = 1; i < n.length; i++) if (n[i] > n[best]) best = i;
    return n[best] ? best : -1;
  }

  activate(a, queue) {
    const { r, c } = a;
    switch (a.type) {
      case 'h':
      case 'v': {
        this.collect('striped');
        this.sfx('stripe');
        this.emit('beam', { r, c, dir: a.type, color: a.color });
        if (a.type === 'h') for (let i = 0; i < this.cols; i++) { if (i !== c) this.hit(r, i, queue); }
        else for (let i = 0; i < this.rows; i++) { if (i !== r) this.hit(i, c, queue); }
        break;
      }
      case 'w': {
        this.collect('wrapped');
        this.sfx('wrap');
        this.emit('blast', { r, c, radius: a.radius, color: a.color });
        for (let dr = -a.radius; dr <= a.radius; dr++) for (let dc = -a.radius; dc <= a.radius; dc++) {
          if (dr || dc) this.hit(r + dr, c + dc, queue);
        }
        break;
      }
      case 'w2': {
        const cell = this.get(a.r, a.c);
        // The armed candy may have fallen; find its current cell.
        let at = cell && cell.candy === a.candy ? cell : null;
        if (!at) for (const x of this.cells()) if (x.candy === a.candy) at = x;
        if (!at) break;
        const rad = a.candy.radius;
        a.candy.armed = false;
        a.candy.special = null;
        this.removeCandy(at, false);
        this.sfx('wrap');
        this.emit('blast', { r: at.r, c: at.c, radius: rad, color: a.candy.color });
        for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
          if (dr || dc) this.hit(at.r + dr, at.c + dc, queue);
        }
        break;
      }
      case 'b': {
        this.collect('bomb');
        const color = a.target != null ? a.target : this.mostCommonColor();
        this.sfx('bomb');
        const targets = [];
        for (const cell of this.cells()) if (cell.candy && cell.candy.kind === 'candy' && cell.candy.color === color && !cell.candy.dying) targets.push(cell);
        this.emit('lightning', { r, c, targets: targets.map(t => [t.r, t.c]), color });
        for (const t of targets) this.hit(t.r, t.c, queue);
        break;
      }
      case 'cross3': {
        this.sfx('stripe');
        for (let d = -1; d <= 1; d++) {
          this.emit('beam', { r: r + d, c, dir: 'h', color: a.color, big: true });
          this.emit('beam', { r, c: c + d, dir: 'v', color: a.color, big: true });
        }
        for (let d = -1; d <= 1; d++) {
          for (let i = 0; i < this.cols; i++) this.hit(r + d, i, queue);
          for (let i = 0; i < this.rows; i++) this.hit(i, c + d, queue);
        }
        break;
      }
      case 'all': {
        this.sfx('bomb');
        this.emit('flash', {});
        for (const cell of this.cells()) this.hit(cell.r, cell.c, queue);
        break;
      }
    }
  }

  // Special + special (or bomb + anything) swaps. `pos` is where the dragged candy landed.
  async runCombo(pos, other) {
    const X = pos.candy, Y = other.candy;
    const sx = X.special, sy = Y.special;
    const has = s => sx === s || sy === s;
    const stripe = s => s === 'h' || s === 'v';
    this.moveCascade = 1;
    if (sx === 'b' && sy === 'b') {
      this.removeCandy(pos, true); this.removeCandy(other, true);
      this.emit('word', 'combo');
      this.moveCascade = 4;
      await this.tw.wait(150);
      await this.blast([], [{ type: 'all', r: pos.r, c: pos.c }]);
    } else if (has('b')) {
      const bombCell = sx === 'b' ? pos : other;
      const otherCell = bombCell === pos ? other : pos;
      const ok = otherCell.candy;
      const color = ok.color;
      this.removeCandy(bombCell, true);
      if (!ok.special) {
        await this.blast([], [{ type: 'b', r: bombCell.r, c: bombCell.c, target: color }]);
      } else {
        // Turn every candy of that color into the same kind of special, then fire them all.
        const sp = ok.special;
        this.collect('bomb');
        const targets = [...this.cells()].filter(c => c.candy && c.candy.kind === 'candy' && c.candy.color === color && !c.candy.dying);
        this.sfx('bomb');
        this.emit('lightning', { r: bombCell.r, c: bombCell.c, targets: targets.map(t => [t.r, t.c]), color });
        for (const t of targets) {
          if (!t.candy.special) {
            t.candy.special = sp === 'w' ? 'w' : U.pick(['h', 'v']);
            t.candy.scale = 1.3;
            this.tw.to(t.candy, { scale: 1 }, 200, 'outBack');
          }
        }
        this.sfx('special', sp);
        await this.tw.wait(500);
        await this.blast(targets.map(t => [t.r, t.c]));
      }
    } else if (stripe(sx) && stripe(sy)) {
      this.removeCandy(pos, true); this.removeCandy(other, true);
      await this.blast([], [{ type: 'h', r: pos.r, c: pos.c, color: X.color }, { type: 'v', r: pos.r, c: pos.c, color: X.color }]);
    } else if (has('w') && (stripe(sx) || stripe(sy))) {
      this.removeCandy(pos, true); this.removeCandy(other, true);
      this.emit('word', 'combo');
      await this.blast([], [{ type: 'cross3', r: pos.r, c: pos.c, color: X.color }]);
    } else if (sx === 'w' && sy === 'w') {
      this.removeCandy(other, true);
      X.radius = 2;
      await this.blast([[pos.r, pos.c]]);
    }
    await this.gravity();
  }

  // ---------- gravity ----------
  spawnCandy() {
    const L = this.L;
    if (L.type === 'ing' && this.ingSpawned < L.ing) {
      let onBoard = 0;
      for (const cell of this.cells()) if (cell.candy && cell.candy.kind === 'ing') onBoard++;
      if (onBoard < (L.ingMax || 1) && !this._spawnedIngThisTick && Math.random() < (onBoard === 0 ? 0.35 : 0.06)) {
        this._spawnedIngThisTick = true;
        const k = this.makeIngredient();
        this.ingSpawned++;
        return k;
      }
    }
    const k = this.makeCandy(U.ri(this.colors));
    if (L.bombs && Math.random() < L.bombs.chance) {
      let n = 0;
      for (const cell of this.cells()) if (cell.candy && cell.candy.timer) n++;
      if (n < (L.bombs.max || 2)) k.timer = L.bombs.moves;
    }
    return k;
  }

  gravityTick(flip) {
    const moved = new Set();
    const moves = [];
    this._spawnedIngThisTick = false;
    for (let c = 0; c < this.cols; c++) {
      for (let r = this.rows - 1; r >= 0; r--) {
        const cell = this.grid[r][c];
        if (!this.emptyPlayable(cell)) continue;
        const u = this.upTile(r, c);
        if (!u) {
          const k = this.spawnCandy();
          k.x = c; k.y = r - 1; k.alpha = 0;
          cell.candy = k;
          moved.add(k);
          moves.push({ k, cell });
        } else if (this.movable(u) && !moved.has(u.candy)) {
          const k = u.candy;
          u.candy = null;
          cell.candy = k;
          moved.add(k);
          moves.push({ k, cell });
        }
      }
    }
    const memo = new Map();
    const fillable = cell => {
      if (memo.has(cell)) return memo.get(cell);
      const u = this.upTile(cell.r, cell.c);
      let v;
      if (!u) v = true;
      else if (u.blocker || u.lock) v = false;
      else if (u.candy) v = !u.candy.dying;
      else v = fillable(u);
      memo.set(cell, v);
      return v;
    };
    const dirs = flip ? [1, -1] : [-1, 1];
    for (let r = this.rows - 1; r >= 0; r--) {
      for (let i = 0; i < this.cols; i++) {
        const c = flip ? this.cols - 1 - i : i;
        const cell = this.grid[r][c];
        if (!this.emptyPlayable(cell) || fillable(cell)) continue;
        for (const dc of dirs) {
          const s = this.get(r - 1, c + dc);
          if (!this.movable(s) || moved.has(s.candy)) continue;
          const d = this.downTile(s.r, s.c);
          if (d && this.emptyPlayable(d)) continue;
          const k = s.candy;
          s.candy = null;
          cell.candy = k;
          moved.add(k);
          moves.push({ k, cell });
          memo.clear();
          break;
        }
      }
    }
    return moves;
  }

  async gravity() {
    let dur = 105;
    let flip = false;
    for (let guard = 0; guard < 200; guard++) {
      const moves = this.gravityTick(flip = !flip);
      const collected = this.collectIngredients();
      if (!moves.length) { if (collected) { await this.tw.wait(200); continue; } break; }
      const stamp = ++this.moveCount * 1000;
      const ps = moves.map(m => {
        m.k.movedAt = stamp + m.cell.c;
        const dist = Math.max(1, Math.abs(m.k.y - m.cell.r));
        return this.tw.to(m.k, { x: m.cell.c, y: m.cell.r, alpha: 1 }, dur * Math.sqrt(dist), 'linear');
      });
      await Promise.all(ps);
      dur = Math.max(55, dur * 0.86);
    }
    this.emit('land', {});
  }

  collectIngredients() {
    let any = false;
    for (const cell of this.cells()) {
      if (!cell.exit || !cell.candy || cell.candy.kind !== 'ing') continue;
      // Only collect once it has visually arrived.
      if (Math.abs(cell.candy.y - cell.r) > 0.01) continue;
      const k = cell.candy;
      cell.candy = null;
      k.dying = true;
      this.ingCollected++;
      this.addScore(10000, cell.r, cell.c, -1);
      this.sfx('ing');
      this.emit('ingredient', { r: cell.r, c: cell.c, candy: k });
      this.tw.to(k, { y: cell.r + 1.2, alpha: 0, scale: 0.6 }, 350, 'inQuad');
      any = true;
    }
    return any;
  }

  // ---------- end of move ----------
  async endMove(booster = false) {
    // Chocolate grows if none was destroyed this move.
    if (!booster && !this.chocHit) {
      const chocs = [...this.cells()].filter(c => c.blocker && c.blocker.type === 'choc');
      const opts = [];
      for (const ch of chocs) for (const nb of this.neighbors(ch)) {
        if (this.playable(nb) && nb.candy && nb.candy.kind === 'candy' && !nb.candy.special && !nb.lock && !nb.candy.timer) opts.push(nb);
      }
      if (opts.length) {
        const t = U.pick(opts);
        const k = t.candy;
        t.candy = null;
        k.dying = true;
        t.blocker = { type: 'choc' };
        this.sfx('choc');
        this.emit('chocGrow', { r: t.r, c: t.c });
        this.tw.to(k, { scale: 0, alpha: 0 }, 200);
        await this.tw.wait(250);
      }
    }
    let bombOut = null;
    if (!booster) {
      for (const cell of this.cells()) {
        const k = cell.candy;
        if (k && k.timer > 0 && --k.timer === 0) { k.timer = -1; bombOut = bombOut || cell; }
      }
    }
    if (this.moveCascade >= 2 || this.moveCleared >= 12) {
      const lvl = this.moveCascade >= 5 || this.moveCleared >= 30 ? 3 : this.moveCascade >= 4 || this.moveCleared >= 22 ? 2 : this.moveCascade >= 3 || this.moveCleared >= 16 ? 1 : 0;
      this.emit('word', ['Sweet!', 'Tasty!', 'Delicious!', 'Divine!'][lvl]);
    }
    this.emit('hud', {});

    if (bombOut) return this.finish(false, 'A candy bomb exploded!', bombOut);

    if (this.goalMet()) return this.win();
    if (!this.timed && this.moves <= 0) {
      if (this.L.type === 'score') return this.score >= this.stars[0] ? this.win() : this.finish(false, 'You did not reach the target score.');
      return this.finish(false, this.failReason(), null, true);
    }
    if (this.timed && this.timeLeft <= 0) return this.finishTimed();
    if (!this.findMoves().length) await this.shuffle();
    this.state = 'idle';
    this.idleTime = 0;
  }

  goalMet() {
    const t = this.L.type;
    if (t === 'jelly') return this.jellyLeft() === 0;
    if (t === 'ing') return this.ingCollected >= this.L.ing;
    if (t === 'order') return this.orders.every(o => o.left <= 0);
    return false;
  }

  failReason() {
    const t = this.L.type;
    if (t === 'jelly') return `${this.jellyLeft()} jelly left to clear.`;
    if (t === 'ing') return `${this.L.ing - this.ingCollected} ingredient(s) left to bring down.`;
    if (t === 'order') return 'The order was not completed.';
    return 'You did not reach the target score.';
  }

  starCount() {
    let n = 0;
    for (const s of this.stars) if (this.score >= s) n++;
    return n;
  }

  update(dt) {
    if (this.state === 'idle') {
      this.idleTime += dt;
      if (this.idleTime > 5000 && !this.hint) {
        const m = this.findMoves();
        if (m.length) this.hint = U.pick(m);
      }
    }
    if (this.timed && this.state !== 'over' && this.timeLeft > 0 && !this.paused) {
      this.timeLeft = Math.max(0, this.timeLeft - dt / 1000);
      if (this.timeLeft <= 0 && this.state === 'idle') { this.state = 'busy'; this.finishTimed(); }
    }
  }

  finishTimed() {
    if (this.score >= this.stars[0]) return this.win(true);
    return this.finish(false, 'Time is up! You did not reach the target score.');
  }

  // Extra moves after failing (booster).
  async continueWith(extraMoves) {
    this.moves += extraMoves;
    this.result = null;
    this.state = 'idle';
    this.idleTime = 0;
    this.emit('hud', {});
  }

  async win(noCrush) {
    this.state = 'busy';
    if (!noCrush && (this.moves > 0 || this.hasSpecials())) await this.sugarCrush();
    return this.finish(true);
  }

  hasSpecials() {
    for (const cell of this.cells()) if (cell.candy && cell.candy.special && !cell.candy.dying) return true;
    return false;
  }

  async sugarCrush() {
    this.emit('sugarCrush', {});
    await this.tw.wait(1600);
    this.beginMove();
    await this.fireAllSpecials();
    let guard = 0;
    while (this.moves > 0 && guard++ < 200) {
      const opts = [...this.cells()].filter(c => this.canSwap(c) && c.candy.kind === 'candy' && !c.candy.special);
      if (!opts.length) break;
      const cell = U.pick(opts);
      this.moves--;
      cell.candy.special = U.pick(['h', 'v']);
      cell.candy.scale = 1.5;
      this.tw.to(cell.candy, { scale: 1 }, 220, 'outBack');
      this.addScore(3000, cell.r, cell.c, cell.candy.color);
      this.sfx('special', 'h');
      this.emit('fish', { r: cell.r, c: cell.c });
      this.emit('hud', {});
      await this.tw.wait(110);
    }
    await this.tw.wait(300);
    await this.fireAllSpecials();
  }

  async fireAllSpecials() {
    for (let guard = 0; guard < 30; guard++) {
      const specials = [...this.cells()].filter(c => c.candy && c.candy.special && !c.candy.armed && !c.candy.dying && !c.lock);
      if (!specials.length) break;
      // Fire one at a time for the classic sugar-crush cascade feel.
      const s = specials[0];
      await this.blast([[s.r, s.c]]);
      await this.gravity();
      await this.resolve(null);
    }
    await this.resolve(null);
  }

  finish(won, reason, bombCell, canContinue = false) {
    this.state = 'over';
    this.result = { won, reason, stars: won ? Math.max(1, this.starCount()) : 0, score: this.score, canContinue };
    if (bombCell) this.emit('bombExplode', { r: bombCell.r, c: bombCell.c });
    this.emit('end', this.result);
  }

  async shuffle() {
    this.emit('shuffle', {});
    await this.tw.wait(this.tw.instant ? 0 : 900);
    const cells = [...this.cells()].filter(c => this.canSwap(c) && c.candy.kind === 'candy');
    const candies = cells.map(c => c.candy);
    for (let tries = 0; tries < 200; tries++) {
      U.shuffle(candies);
      cells.forEach((c, i) => { c.candy = candies[i]; });
      if (tries > 100) for (const c of cells) if (!c.candy.special) c.candy.color = U.ri(this.colors);
      if (!this.findGroups().length && this.findMoves().length) break;
    }
    await Promise.all(cells.map(c => this.tw.to(c.candy, { x: c.c, y: c.r }, 450, 'inOutQuad')));
    // If shuffle could not avoid matches, resolve them.
    if (this.findGroups().length) { this.beginMove(); await this.resolve(null); }
  }
}

if (typeof module !== 'undefined') module.exports = { Game };

'use strict';
// App controller: screens, saga map, HUD, modals, lives, boosters, progress.

const MAX_LIVES = 5;
const LIFE_MS = 30 * 60 * 1000;
const EPISODES = [
  { name: 'Candy Town', bg: ['#4fc3ff', '#6fd65a'] },
  { name: 'Candy Factory', bg: ['#ff7fc0', '#ffbf47'] },
  { name: 'Lemonade Lake', bg: ['#ffe04a', '#3fb8ff'] },
  { name: 'Chocolate Mountains', bg: ['#a8683a', '#55b874'] },
];
const EP_LEN = 15;
const BOOSTERS = {
  hammer: { icon: '🍭', name: 'Lollipop Hammer', desc: 'Smash any one candy or blocker.' },
  switch: { icon: '🔄', name: 'Free Switch', desc: 'Swap two candies without using a move.' },
  shuffle: { icon: '🔀', name: 'Shuffle', desc: 'Mix up the board.' },
  extra5: { icon: '+5', name: '+5 Moves', desc: 'Keep playing with 5 more moves.' },
  startBomb: { icon: '💣', name: 'Color Bomb', desc: 'Start with a color bomb.' },
  startSW: { icon: '🍬', name: 'Striped + Wrapped', desc: 'Start with a striped and a wrapped candy.' },
  start3: { icon: '+3', name: '+3 Moves', desc: 'Start with 3 extra moves.' },
};

const $ = id => document.getElementById(id);

const App = {
  progress: Store.load('progress', { unlocked: 1, stars: {}, best: {} }),
  boosters: Store.load('boosters', { hammer: 3, switch: 3, shuffle: 2, extra5: 2, startBomb: 2, startSW: 2, start3: 2 }),
  livesState: Store.load('lives', { n: MAX_LIVES, t: 0 }),
  settings: Store.load('settings', { unlimited: false }),
  tw: new Tweener(),
  game: null,
  levelNum: 1,
  iconCache: new Map(),

  init() {
    this.renderer = new Renderer($('board'));
    this.renderer.onAction = (t, a, b) => this.onBoardAction(t, a, b);
    window.addEventListener('resize', () => this.renderer.resize());
    if (window.ResizeObserver) new ResizeObserver(() => this.renderer.resize()).observe($('board-wrap'));
    $('btn-play').onclick = () => { Sound.init(); Sound.play('click'); this.goFullscreen(); this.showMap(); };
    $('btn-settings').onclick = () => this.showSettings();
    $('btn-pause').onclick = () => this.showPause();
    document.addEventListener('pointerdown', () => Sound.init(), { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && this.current === 'game' && !this.game.result) this.showPause();
    });
    this.titleCandies();
    let last = performance.now();
    const loop = t => {
      const dt = Math.min(50, t - last);
      last = t;
      this.tw.update(dt);
      if (this.game && this.current === 'game') {
        this.game.update(dt);
        this.renderer.draw(t, dt);
        this.updateHud();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    setInterval(() => this.updateLivesUi(), 1000);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  },

  goFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  },

  show(name) {
    this.current = name;
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === 'screen-' + name);
  },

  candyIcon(color, special = null, size = 64) {
    const key = `${color}|${special}|${size}`;
    let src = this.iconCache.get(key);
    if (!src) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d');
      x.translate(size / 2, size / 2);
      if (special === 'ing') drawIngredient(x, color, size * 0.4);
      else window.drawCandyIcon(x, color, special, size * 0.4);
      src = c;
      this.iconCache.set(key, c);
    }
    const out = document.createElement('canvas');
    out.width = out.height = size;
    out.getContext('2d').drawImage(src, 0, 0);
    return out;
  },

  titleCandies() {
    const wrap = $('title-candies');
    const spots = [[8, 12], [82, 8], [14, 70], [86, 66], [50, 86], [30, 28], [70, 34], [6, 42], [92, 40]];
    spots.forEach(([x, y], i) => {
      const sp = i === 4 ? 'b' : i === 6 ? 'w' : i === 2 ? 'h' : null;
      const c = this.candyIcon(i % 6, sp, 96);
      c.style.left = x + '%'; c.style.top = y + '%';
      c.style.width = c.style.height = (70 + (i % 3) * 20) + 'px';
      c.style.animationDelay = (i * -0.7) + 's';
      wrap.appendChild(c);
    });
  },

  // ---------- lives ----------
  lives() {
    const s = this.livesState;
    if (this.settings.unlimited) return { n: MAX_LIVES, next: 0 };
    const now = Date.now();
    while (s.n < MAX_LIVES && s.t && now >= s.t) {
      s.n++;
      s.t = s.n < MAX_LIVES ? s.t + LIFE_MS : 0;
    }
    Store.save('lives', s);
    return { n: s.n, next: s.n < MAX_LIVES ? s.t - now : 0 };
  },
  loseLife() {
    if (this.settings.unlimited) return;
    const s = this.livesState;
    this.lives();
    if (s.n >= MAX_LIVES) s.t = Date.now() + LIFE_MS;
    s.n = Math.max(0, s.n - 1);
    Store.save('lives', s);
  },
  updateLivesUi() {
    if (this.current !== 'map') return;
    const l = this.lives();
    $('lives-n').textContent = l.n;
    if (this.settings.unlimited) $('lives-t').textContent = '∞';
    else if (l.n >= MAX_LIVES) $('lives-t').textContent = 'Full';
    else {
      const s = Math.ceil(l.next / 1000);
      $('lives-t').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
  },

  // ---------- map ----------
  showMap() {
    this.game = null;
    this.show('map');
    this.updateLivesUi();
    const map = $('map');
    const scroller = $('map-scroll');
    const W = scroller.clientWidth;
    const gap = 120, top = 140, bottom = 160;
    const H = top + bottom + (LEVEL_COUNT - 1) * gap;
    map.style.height = H + 'px';
    map.innerHTML = '';
    const pos = i => {
      const y = H - bottom - i * gap;
      const amp = Math.min(W * 0.3, 260);
      const x = W / 2 + Math.sin(i * 0.85) * amp;
      return [x, y];
    };
    // episode backgrounds
    const epCount = Math.ceil(LEVEL_COUNT / EP_LEN);
    for (let e = 0; e < epCount; e++) {
      const ep = EPISODES[e % EPISODES.length];
      const y0 = e === 0 ? H : pos(e * EP_LEN)[1] + gap / 2;
      const y1 = e === epCount - 1 ? 0 : pos((e + 1) * EP_LEN)[1] + gap / 2;
      const d = document.createElement('div');
      d.className = 'episode';
      d.style.top = y1 + 'px'; d.style.height = (y0 - y1) + 'px';
      d.style.background = `linear-gradient(${ep.bg[0]}, ${ep.bg[1]})`;
      const nm = document.createElement('div');
      nm.className = 'episode-name';
      nm.textContent = ep.name;
      nm.style.bottom = (e === 0 ? bottom - 110 : 20) + 'px';
      d.appendChild(nm);
      map.appendChild(d);
      // decorations
      const rnd = U.seeded(e * 31 + 7);
      for (let k = 0; k < 10; k++) {
        const c = this.candyIcon(Math.floor(rnd() * 6), rnd() < 0.2 ? 'w' : null, 80);
        c.className = 'deco';
        const sz = 40 + rnd() * 50;
        c.style.width = c.style.height = sz + 'px';
        const side = rnd() < 0.5;
        c.style.left = (side ? rnd() * 12 : 86 + rnd() * 10) + '%';
        c.style.top = (y1 + rnd() * (y0 - y1)) + 'px';
        c.style.transform = `rotate(${rnd() * 360}deg)`;
        map.appendChild(c);
      }
    }
    // path
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'path');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    let d = '';
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const [x, y] = pos(i);
      if (!i) d = `M${x},${y}`;
      else {
        const [px, py] = pos(i - 1);
        d += ` C${px},${py - gap / 2} ${x},${y + gap / 2} ${x},${y}`;
      }
    }
    for (const [w, col, dash] of [[26, 'rgba(255,255,255,.75)', ''], [10, '#ff8cc8', '2 18']]) {
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', d); p.setAttribute('fill', 'none');
      p.setAttribute('stroke', col); p.setAttribute('stroke-width', w); p.setAttribute('stroke-linecap', 'round');
      if (dash) p.setAttribute('stroke-dasharray', dash);
      svg.appendChild(p);
    }
    map.appendChild(svg);
    let total = 0;
    const unlocked = this.progress.unlocked;
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const n = i + 1;
      const [x, y] = pos(i);
      const b = document.createElement('button');
      const st = this.progress.stars[n] || 0;
      total += st;
      b.className = 'node' + (n > unlocked ? ' locked' : n === unlocked ? ' current' : ' done');
      b.style.left = x + 'px'; b.style.top = y + 'px';
      b.textContent = n;
      if (n <= unlocked) {
        const s = document.createElement('div');
        s.className = 'stars';
        s.innerHTML = [1, 2, 3].map(k => `<i class="${k <= st ? 'on' : ''}">★</i>`).join('');
        b.appendChild(s);
        b.onclick = () => { Sound.play('click'); this.showLevelStart(n); };
      }
      map.appendChild(b);
    }
    $('stars-total').textContent = total;
    const [, cy] = pos(Math.min(unlocked, LEVEL_COUNT) - 1);
    scroller.scrollTop = cy - scroller.clientHeight / 2;
  },

  // ---------- modals ----------
  modal(html, handlers = {}) {
    const box = $('modal-box');
    box.innerHTML = html;
    $('modal').classList.remove('hidden');
    for (const [id, fn] of Object.entries(handlers)) {
      const el = box.querySelector('#' + id);
      if (el) el.onclick = e => { Sound.play('click'); fn(e, el); };
    }
    return box;
  },
  closeModal() { $('modal').classList.add('hidden'); },

  goalNodes(L, game) {
    const frag = document.createElement('div');
    frag.className = 'goal-line';
    const add = (icon, text, done) => {
      const it = document.createElement('div');
      it.className = 'goal-item' + (done ? ' done' : '');
      if (icon) it.appendChild(icon);
      const t = document.createElement('span');
      t.textContent = text;
      it.appendChild(t);
      frag.appendChild(it);
    };
    const jellyIcon = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = 'rgba(255,120,210,.85)'; x.strokeStyle = '#fff'; x.lineWidth = 5;
      x.beginPath(); x.roundRect ? x.roundRect(8, 8, 48, 48, 12) : x.rect(8, 8, 48, 48); x.fill(); x.stroke();
      return c;
    };
    if (L.type === 'jelly') add(jellyIcon(), game ? String(game.jellyLeft()) : '', game && !game.jellyLeft());
    else if (L.type === 'ing') {
      add(this.candyIcon(0, 'ing', 64), game ? `${game.ingCollected}/${L.ing}` : `×${L.ing}`, game && game.ingCollected >= L.ing);
    } else if (L.type === 'order') {
      const orders = game ? game.orders : L.orders.map(o => ({ ...o, left: o.n }));
      for (const o of orders) {
        let icon;
        if (o.t === 'color') icon = this.candyIcon(o.color, null, 64);
        else if (o.t === 'striped') icon = this.candyIcon(4, 'h', 64);
        else if (o.t === 'wrapped') icon = this.candyIcon(1, 'w', 64);
        else if (o.t === 'bomb') icon = this.candyIcon(0, 'b', 64);
        else if (o.t === 'choc') { icon = document.createElement('canvas'); icon.width = icon.height = 64; const x = icon.getContext('2d'); x.fillStyle = '#6b3a1e'; x.fillRect(8, 8, 48, 48); x.strokeStyle = '#3a1a08'; x.lineWidth = 4; x.strokeRect(8, 8, 48, 48); x.beginPath(); x.moveTo(32, 8); x.lineTo(32, 56); x.moveTo(8, 32); x.lineTo(56, 32); x.stroke(); }
        else icon = null;
        add(icon, o.left > 0 ? String(o.left) : '✔', o.left <= 0);
      }
    } else {
      const t = document.createElement('div');
      t.className = 'goal-text';
      t.textContent = (game ? '' : 'Target: ') + L.stars[0].toLocaleString();
      frag.appendChild(t);
    }
    return frag;
  },

  showLevelStart(n) {
    const L = getLevel(n);
    const best = this.progress.best[n];
    const sel = new Set();
    const pre = ['startBomb', 'startSW', 'start3'];
    const box = this.modal(`
      <h2>Level ${n}</h2>
      <p>${describeGoal(L)}</p>
      <div id="ls-goal"></div>
      ${best ? `<p class="small-note">Best score: ${best.toLocaleString()}</p>` : ''}
      <p class="small-note">Boosters</p>
      <div class="pre-boosters">${pre.map(k => `<button class="booster" id="pb-${k}" title="${BOOSTERS[k].name}">${BOOSTERS[k].icon}<span class="cnt">${this.boosters[k] || 0}</span></button>`).join('')}</div>
      <div class="row"><button class="btn btn-grey" id="ls-close">Back</button><button class="btn btn-green" id="ls-play">Play!</button></div>`, {
      'ls-close': () => this.closeModal(),
      'ls-play': () => {
        if (this.lives().n <= 0) { this.showNoLives(); return; }
        for (const k of sel) this.boosters[k]--;
        Store.save('boosters', this.boosters);
        this.closeModal();
        this.startLevel(n, sel);
      },
    });
    box.querySelector('#ls-goal').appendChild(this.goalNodes(L));
    for (const k of pre) {
      const b = box.querySelector('#pb-' + k);
      if (!this.boosters[k]) b.disabled = true;
      b.onclick = () => { Sound.play('click'); if (sel.has(k)) sel.delete(k); else sel.add(k); b.classList.toggle('sel', sel.has(k)); };
    }
  },

  showNoLives() {
    const l = this.lives();
    const s = Math.ceil(l.next / 1000);
    this.modal(`<h2>No Lives</h2><p>You're out of lives!</p><p>Next life in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</p>
      <p class="small-note">Tip: turn on Unlimited Lives in Settings.</p>
      <div class="row"><button class="btn" id="nl-ok">OK</button></div>`, { 'nl-ok': () => this.closeModal() });
  },

  toggleRow(id, label, on) {
    return `<div class="toggle-row"><span>${label}</span><button class="toggle ${on ? 'on' : ''}" id="${id}" aria-label="${label}"></button></div>`;
  },

  settingsHtml() {
    return this.toggleRow('t-sfx', 'Sound effects', Sound.sfxOn) +
      this.toggleRow('t-music', 'Music', Sound.musicOn) +
      this.toggleRow('t-voice', 'Announcer voice', Sound.voiceOn);
  },

  bindSettingToggles() {
    const map = { 't-sfx': 'sfxOn', 't-music': 'musicOn', 't-voice': 'voiceOn' };
    for (const [id, key] of Object.entries(map)) {
      const el = $(id);
      if (!el) continue;
      el.onclick = () => { Sound.init(); Sound.set(key, !Sound[key]); el.classList.toggle('on', Sound[key]); Sound.play('click'); };
    }
  },

  showSettings() {
    this.modal(`<h2>Settings</h2>${this.settingsHtml()}
      ${this.toggleRow('t-unl', 'Unlimited lives', this.settings.unlimited)}
      <div class="row"><button class="btn btn-orange" id="st-full">Full screen</button><button class="btn btn-grey" id="st-reset">Reset progress</button></div>
      <div class="row"><button class="btn btn-green" id="st-close">Done</button></div>`, {
      'st-close': () => { this.closeModal(); this.showMap(); },
      'st-full': () => this.goFullscreen(),
      'st-reset': (e, el) => {
        if (el.dataset.sure) {
          this.progress = { unlocked: 1, stars: {}, best: {} };
          Store.save('progress', this.progress);
          this.closeModal(); this.showMap();
        } else { el.dataset.sure = 1; el.textContent = 'Tap again to confirm'; }
      },
    });
    this.bindSettingToggles();
    $('t-unl').onclick = () => {
      this.settings.unlimited = !this.settings.unlimited;
      Store.save('settings', this.settings);
      $('t-unl').classList.toggle('on', this.settings.unlimited);
      this.updateLivesUi();
    };
  },

  showPause() {
    if (!this.game || this.game.result) return;
    this.game.paused = true;
    this.modal(`<h2>Paused</h2>${this.settingsHtml()}
      <div class="row"><button class="btn btn-grey" id="pz-quit">Quit level</button><button class="btn btn-green" id="pz-resume">Resume</button></div>
      <p class="small-note">Quitting costs a life.</p>`, {
      'pz-resume': () => { this.closeModal(); this.game.paused = false; },
      'pz-quit': () => { this.closeModal(); this.loseLife(); this.showMap(); },
    });
    this.bindSettingToggles();
  },

  // ---------- gameplay ----------
  startLevel(n, preBoosters = new Set()) {
    this.levelNum = n;
    const L = getLevel(n);
    if (preBoosters.has('start3') && L.moves) L.moves += 3;
    this.tw = new Tweener();
    this.game = new Game(L, {
      tweener: this.tw,
      emit: (t, d) => this.onGameEvent(t, d),
      sfx: (name, arg) => Sound.play(name, arg),
    });
    if (preBoosters.has('startBomb')) this.game.placeStartSpecial('b');
    if (preBoosters.has('startSW')) { this.game.placeStartSpecial('s'); this.game.placeStartSpecial('w'); }
    this.show('game');
    $('hud-level').textContent = n;
    $('hud-moves-label').textContent = L.type === 'time' ? 'Time' : 'Moves';
    this.hudCache = {};
    this.renderGoal();
    this.renderBoosters();
    this.renderer.setGame(this.game);
    requestAnimationFrame(() => this.renderer.resize());
    // Intro: candies drop in.
    for (const cell of this.game.cells()) if (cell.candy) {
      const k = cell.candy;
      k.y = cell.r - this.game.rows - 1;
      this.tw.to(k, { y: cell.r }, 500 + cell.r * 40, 'outBounce', cell.c * 25);
    }
    this.game.state = 'busy';
    this.tw.wait(900).then(() => {
      if (this.game && this.game.state === 'busy') this.game.state = 'idle';
      this.banner(describeGoal(L), 'small pink');
    });
  },

  renderGoal() {
    const g = $('hud-goal');
    g.innerHTML = '';
    g.appendChild(this.goalNodes(this.game.L, this.game));
  },

  renderBoosters() {
    const wrap = $('hud-boosters');
    wrap.innerHTML = '';
    for (const k of ['hammer', 'switch', 'shuffle']) {
      const b = document.createElement('button');
      b.className = 'booster' + (this.renderer.mode === k ? ' active' : '');
      b.title = BOOSTERS[k].name;
      b.innerHTML = `${BOOSTERS[k].icon}<span class="cnt">${this.boosters[k] || 0}</span>`;
      b.disabled = !this.boosters[k];
      b.onclick = () => {
        Sound.play('click');
        if (!this.game || this.game.state !== 'idle') return;
        if (k === 'shuffle') {
          this.boosters.shuffle--; Store.save('boosters', this.boosters);
          this.renderer.mode = null;
          this.game.useShuffle().then(() => this.renderBoosters());
          this.renderBoosters();
          return;
        }
        this.renderer.mode = this.renderer.mode === k ? null : k;
        this.renderer.selected = null;
        if (this.renderer.mode) this.banner(BOOSTERS[k].desc, 'small');
        this.renderBoosters();
      };
      wrap.appendChild(b);
    }
  },

  async onBoardAction(type, a, b) {
    Sound.init();
    const g = this.game;
    if (!g || g.state !== 'idle' || g.paused) return;
    if (type === 'hammer') {
      if (await g.useHammer(a)) { this.boosters.hammer--; Store.save('boosters', this.boosters); }
      this.renderer.mode = null;
      this.renderBoosters();
      return;
    }
    const free = this.renderer.mode === 'switch';
    if (free) {
      this.renderer.mode = null;
      this.boosters.switch--; Store.save('boosters', this.boosters);
      this.renderBoosters();
    }
    await g.trySwap(a, b, free);
  },

  updateHud() {
    const g = this.game, h = this.hudCache;
    const mv = g.timed ? Math.ceil(g.timeLeft) : g.moves;
    if (h.mv !== mv) {
      h.mv = mv;
      const el = $('hud-moves');
      el.textContent = g.timed ? `${Math.floor(mv / 60)}:${String(mv % 60).padStart(2, '0')}` : mv;
      el.classList.toggle('low', g.timed ? mv <= 10 : mv <= 5);
    }
    if (h.score !== g.score) {
      h.score = g.score;
      $('hud-score').textContent = g.score.toLocaleString();
      const max = g.stars[2] * 1.08;
      $('hud-starfill').style.width = Math.min(100, (g.score / max) * 100) + '%';
      const stars = document.querySelectorAll('#hud .starbar .s');
      g.stars.forEach((s, i) => {
        stars[i].style.left = (s / max) * 100 + '%';
        const on = g.score >= s;
        if (on && !stars[i].classList.contains('on')) Sound.play('star');
        stars[i].classList.toggle('on', on);
      });
    }
    const goalKey = g.jellyLeft() + ':' + g.ingCollected + ':' + g.orders.map(o => o.left).join(',');
    if (h.goal !== goalKey) { h.goal = goalKey; this.renderGoal(); }
  },

  banner(text, cls = '') {
    const b = $('banner');
    b.className = '';
    void b.offsetWidth;
    b.innerHTML = `<span>${text}</span>`;
    b.className = 'show ' + cls;
  },

  onGameEvent(type, d) {
    this.renderer.on(type, d);
    switch (type) {
      case 'word':
        if (d === 'combo') break;
        this.banner(d);
        Sound.say(d);
        break;
      case 'sugarCrush':
        this.banner('Sugar Crush!', 'pink');
        Sound.say('Sugar Crush');
        break;
      case 'shuffle': this.banner('Shuffling...', 'small'); break;
      case 'end': setTimeout(() => this.onEnd(d), d.won ? 500 : 900); break;
    }
  },

  onEnd(res) {
    const n = this.levelNum;
    if (!this.game || this.current !== 'game') return;
    if (res.won) {
      Sound.play('win');
      const prev = this.progress.stars[n] || 0;
      this.progress.stars[n] = Math.max(prev, res.stars);
      this.progress.best[n] = Math.max(this.progress.best[n] || 0, res.score);
      if (n >= this.progress.unlocked) this.progress.unlocked = Math.min(LEVEL_COUNT, n + 1);
      Store.save('progress', this.progress);
      // Reward: a random booster for a new 3-star or first completion every few levels.
      let reward = '';
      if ((res.stars === 3 && prev < 3) || (prev === 0 && n % 3 === 0)) {
        const k = U.pick(Object.keys(BOOSTERS));
        this.boosters[k] = (this.boosters[k] || 0) + 1;
        Store.save('boosters', this.boosters);
        reward = `<p>Reward: ${BOOSTERS[k].name}!</p>`;
      }
      const stars = [1, 2, 3].map(k => `<i class="${k <= res.stars ? 'on' : ''}" style="animation-delay:${k * 0.25}s">★</i>`).join('');
      [1, 2, 3].slice(0, res.stars).forEach(k => setTimeout(() => Sound.play('star'), k * 250 + 200));
      this.modal(`<h2>Level Complete!</h2><div class="bigstars">${stars}</div>
        <p>Score: <b>${res.score.toLocaleString()}</b></p>${reward}
        <div class="row"><button class="btn btn-grey" id="w-map">Map</button><button class="btn btn-blue" id="w-retry">Replay</button>${n < LEVEL_COUNT ? '<button class="btn btn-green" id="w-next">Next</button>' : ''}</div>`, {
        'w-map': () => { this.closeModal(); this.showMap(); },
        'w-retry': () => { this.closeModal(); this.showLevelStart(n); },
        'w-next': () => { this.closeModal(); this.showMap(); this.showLevelStart(n + 1); },
      });
      return;
    }
    if (res.canContinue && this.boosters.extra5 > 0) {
      this.modal(`<h2>Out of Moves!</h2><p>${res.reason}</p><p>Use a <b>+5 Moves</b> booster? (you have ${this.boosters.extra5})</p>
        <div class="row"><button class="btn btn-grey" id="x-no">Give up</button><button class="btn btn-green" id="x-yes">+5 Moves</button></div>`, {
        'x-yes': () => { this.closeModal(); this.boosters.extra5--; Store.save('boosters', this.boosters); this.game.continueWith(5); },
        'x-no': () => { this.closeModal(); this.showLose(res); },
      });
      return;
    }
    this.showLose(res);
  },

  showLose(res) {
    Sound.play('lose');
    this.loseLife();
    const n = this.levelNum;
    this.modal(`<h2>Level Failed</h2><p>${res.reason}</p><p>Score: ${res.score.toLocaleString()}</p>
      <div class="row"><button class="btn btn-grey" id="l-map">Map</button><button class="btn btn-green" id="l-retry">Try Again</button></div>`, {
      'l-map': () => { this.closeModal(); this.showMap(); },
      'l-retry': () => { this.closeModal(); this.showMap(); this.showLevelStart(n); },
    });
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());

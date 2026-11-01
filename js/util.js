'use strict';
// Shared helpers: random, easing, tweens, persistence.

const U = {
  ri(n) { return Math.floor(Math.random() * n); },
  pick(a) { return a[Math.floor(Math.random() * a.length)]; },
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  // Deterministic RNG for level generation and sprite decoration.
  seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  },
  ease: {
    linear: t => t,
    inQuad: t => t * t,
    outQuad: t => t * (2 - t),
    inOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    outCubic: t => 1 - Math.pow(1 - t, 3),
    outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outBounce: t => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
  },
};

// Promise-based tween manager. In `instant` mode (headless tests) everything
// completes immediately so game logic can run without a render loop.
class Tweener {
  constructor() { this.list = []; this.timers = []; this.instant = false; this.speed = 1; }

  to(obj, props, dur, ease = 'outQuad', delay = 0) {
    if (this.instant) { Object.assign(obj, props); return Promise.resolve(); }
    // Cancel conflicting tweens on the same props (snap them to completion).
    for (const tw of this.list) {
      if (tw.obj !== obj) continue;
      for (const k in props) if (k in tw.props) delete tw.props[k];
    }
    return new Promise(res => {
      this.list.push({ obj, props: { ...props }, dur: Math.max(1, dur), ease: U.ease[ease] || U.ease.linear, delay, t: 0, from: null, res });
    });
  }

  wait(ms) {
    if (this.instant || ms <= 0) return Promise.resolve();
    return new Promise(res => this.timers.push({ t: ms, res }));
  }

  update(dtMs) {
    const dt = dtMs * this.speed;
    if (this.timers.length) {
      const keep = [];
      for (const tm of this.timers) { tm.t -= dt; if (tm.t <= 0) tm.res(); else keep.push(tm); }
      this.timers = keep;
    }
    if (!this.list.length) return;
    const keep = [];
    for (const tw of this.list) {
      if (tw.delay > 0) { tw.delay -= dt; if (tw.delay > 0) { keep.push(tw); continue; } }
      if (!tw.from) {
        tw.from = {};
        for (const k in tw.props) tw.from[k] = tw.obj[k];
      }
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      const e = tw.ease(p);
      for (const k in tw.props) tw.obj[k] = tw.from[k] + (tw.props[k] - tw.from[k]) * e;
      if (p >= 1) tw.res(); else keep.push(tw);
    }
    this.list = keep;
  }
}

const Store = {
  prefix: 'sugarswap.',
  load(key, def) {
    try {
      const v = localStorage.getItem(this.prefix + key);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  save(key, val) {
    try { localStorage.setItem(this.prefix + key, JSON.stringify(val)); } catch (e) { /* storage unavailable */ }
  },
};

if (typeof module !== 'undefined') module.exports = { U, Tweener, Store };

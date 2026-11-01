'use strict';
// All sound is synthesized with WebAudio (no audio files needed).

const Sound = {
  ctx: null,
  sfxOn: Store.load('sfx', true),
  musicOn: Store.load('music', true),
  voiceOn: Store.load('voice', true),
  musicTimer: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.musicOn) this.startMusic();
  },

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.005, out } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  noise(dur, { vol = 0.3, freq = 2000, q = 1, type = 'bandpass', delay = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.05);
  },

  play(name, arg) {
    if (!this.sfxOn || !this.ctx) return;
    const semis = n => Math.pow(2, n / 12);
    switch (name) {
      case 'swap': this.noise(0.12, { vol: 0.25, freq: 800, slide: 3000, q: 2 }); break;
      case 'bad': this.tone(220, 0.12, { type: 'square', vol: 0.12 }); this.tone(180, 0.18, { type: 'square', vol: 0.12, delay: 0.1 }); break;
      case 'match': {
        // Rising pitch with each cascade, like the original's escalating chimes.
        const base = 520 * semis(Math.min(12, (arg - 1) * 2));
        this.tone(base, 0.25, { type: 'sine', vol: 0.3 });
        this.tone(base * 2, 0.15, { type: 'triangle', vol: 0.12 });
        this.tone(base * 1.5, 0.2, { type: 'sine', vol: 0.12, delay: 0.04 });
        break;
      }
      case 'special':
        [0, 4, 7, 12].forEach((n, i) => this.tone(660 * semis(n), 0.2, { type: 'triangle', vol: 0.2, delay: i * 0.05 }));
        break;
      case 'stripe':
        this.noise(0.35, { vol: 0.35, freq: 6000, slide: 800, q: 1.5 });
        this.tone(1200, 0.3, { type: 'sawtooth', vol: 0.07, slide: 300 });
        break;
      case 'wrap':
        this.tone(140, 0.45, { type: 'sine', vol: 0.5, slide: 45 });
        this.noise(0.4, { vol: 0.4, freq: 600, type: 'lowpass' });
        break;
      case 'bomb':
        for (let i = 0; i < 10; i++) this.tone(1200 + Math.random() * 1800, 0.12, { type: 'sine', vol: 0.12, delay: i * 0.035 });
        this.noise(0.6, { vol: 0.2, freq: 5000, slide: 1500, q: 3 });
        break;
      case 'frost': this.noise(0.12, { vol: 0.3, freq: 3500, q: 0.8 }); break;
      case 'choc': this.noise(0.15, { vol: 0.35, freq: 900, q: 0.8 }); break;
      case 'lock': this.tone(300, 0.1, { type: 'square', vol: 0.12 }); this.noise(0.1, { vol: 0.2, freq: 1500 }); break;
      case 'hammer': this.noise(0.3, { vol: 0.5, freq: 400, type: 'lowpass' }); this.tone(90, 0.3, { vol: 0.4, slide: 40 }); break;
      case 'ing': [0, 4, 7, 12, 16].forEach((n, i) => this.tone(523 * semis(n), 0.25, { type: 'triangle', vol: 0.2, delay: i * 0.07 })); break;
      case 'star': this.tone(1046, 0.4, { type: 'triangle', vol: 0.25 }); this.tone(1568, 0.5, { type: 'sine', vol: 0.15, delay: 0.05 }); break;
      case 'click': this.tone(880, 0.06, { type: 'triangle', vol: 0.15 }); break;
      case 'win': [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => this.tone(523 * semis(n), 0.3, { type: 'triangle', vol: 0.22, delay: i * 0.12 })); break;
      case 'lose': [7, 4, 0, -5].forEach((n, i) => this.tone(392 * semis(n), 0.4, { type: 'triangle', vol: 0.2, delay: i * 0.2 })); break;
    }
  },

  // Deep "announcer" voice using the browser's speech synthesizer.
  say(text) {
    if (!this.voiceOn || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace('!', ''));
      u.pitch = 0.2; u.rate = 0.8; u.volume = 1;
      const voices = speechSynthesis.getVoices();
      const v = voices.find(v => /en[-_]US/i.test(v.lang) && /male|david|guy/i.test(v.name)) || voices.find(v => /^en/i.test(v.lang));
      if (v) u.voice = v;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* speech unavailable */ }
  },

  // Light-hearted looping music-box tune (original composition).
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const mel = [0, 4, 7, 9, 7, 4, 2, 4, 5, 9, 12, 9, 7, 4, 2, -1, 0, 4, 7, 12, 11, 9, 7, 9, 5, 4, 2, 4, 0, -1, 0, null];
    const bass = [0, 0, -3, -3, -7, -7, -5, -5];
    const beat = 0.24;
    let step = 0;
    let next = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.ctx) return;
      while (next < this.ctx.currentTime + 0.5) {
        const n = mel[step % mel.length];
        if (n != null) {
          const f = 523.25 * Math.pow(2, n / 12);
          this.tone(f, beat * 1.6, { type: 'triangle', vol: 0.35, delay: next - this.ctx.currentTime, out: this.musicGain });
        }
        if (step % 4 === 0) {
          const b = bass[(step / 4) % bass.length];
          this.tone(130.81 * Math.pow(2, b / 12), beat * 3.5, { type: 'sine', vol: 0.5, delay: next - this.ctx.currentTime, out: this.musicGain });
        }
        next += beat;
        step++;
      }
    };
    this.musicTimer = setInterval(tick, 120);
  },

  stopMusic() { clearInterval(this.musicTimer); this.musicTimer = null; },

  set(key, on) {
    this[key] = on;
    Store.save(key.replace('On', ''), on);
    if (key === 'musicOn') { if (on) { this.init(); this.startMusic(); } else this.stopMusic(); }
  },
};

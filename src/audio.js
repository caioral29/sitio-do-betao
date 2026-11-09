// Áudio 100% sintetizado (WebAudio) — ambiente, efeitos e músicas de dança
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.music = null;
    this.birdT = 2;
    this.cricketT = 1;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = this.bus(0.9);
    this.amb = this.bus(0.7);
    this.mus = this.bus(0.0);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // ruído marrom p/ o rio
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }

    // rio
    const river = this.src(this.brownBuf, true);
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 900;
    this.riverGain = ctx.createGain();
    this.riverGain.gain.value = 0;
    river.connect(rf).connect(this.riverGain).connect(this.amb);
    river.start();
    // água borbulhando (camada aguda)
    const bub = this.src(this.noiseBuf, true);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 2400;
    bf.Q.value = 2.5;
    this.bubGain = ctx.createGain();
    this.bubGain.gain.value = 0;
    bub.connect(bf).connect(this.bubGain).connect(this.amb);
    bub.start();
    // vento
    const wind = this.src(this.noiseBuf, true);
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 380;
    wf.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 180;
    lfo.connect(lfoG).connect(wf.frequency);
    lfo.start();
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    wind.connect(wf).connect(this.windGain).connect(this.amb);
    wind.start();
  }

  bus(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(this.master);
    return g;
  }
  src(buf, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    return s;
  }
  get t() {
    return this.ctx.currentTime;
  }
  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.t, 0.05);
  }

  env(g, t, a, peak, dcy, sustain = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + dcy);
  }
  tone({ type = 'sine', f0, f1 = f0, dur = 0.2, vol = 0.2, at = 0, bus = this.sfx, attack = 0.005, pan = 0, filter = null }) {
    if (!this.ctx) return;
    const t = this.t + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, attack, vol, dur);
    let node = o;
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.f;
      f.Q.value = filter.q || 0.7;
      node.connect(f);
      node = f;
    }
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(g).connect(p).connect(bus);
    } else node.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + attack + 0.05);
  }
  noise({ dur = 0.2, vol = 0.2, type = 'bandpass', f = 1000, f1 = f, q = 1, at = 0, bus = this.sfx, attack = 0.004, pan = 0 }) {
    if (!this.ctx) return;
    const t = this.t + at;
    const s = this.src(this.noiseBuf);
    const fl = this.ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t);
    if (f1 !== f) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    fl.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, attack, vol, dur);
    let out = g;
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    s.connect(fl).connect(g);
    out.connect(bus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.1);
  }

  // ----------------------------------------------------------------- ambiente
  updateAmbience(dt, { riverDist, night }) {
    if (!this.ctx) return;
    const rv = Math.max(0, 1 - riverDist / 16);
    this.riverGain.gain.setTargetAtTime(rv * rv * 0.5, this.t, 0.3);
    this.bubGain.gain.setTargetAtTime(rv * rv * 0.035, this.t, 0.3);
    this.birdT -= dt;
    if (this.birdT < 0) {
      this.birdT = 1.5 + Math.random() * 5;
      if (night < 0.5) this.bird();
    }
    this.cricketT -= dt;
    if (this.cricketT < 0) {
      this.cricketT = 0.4 + Math.random() * 0.9;
      if (night > 0.4) this.cricket(night);
    }
  }
  bird() {
    const pan = Math.random() * 1.6 - 0.8;
    const base = 2200 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    const kind = Math.random();
    for (let i = 0; i < n; i++) {
      const at = i * (0.09 + Math.random() * 0.05);
      if (kind < 0.5) this.tone({ f0: base, f1: base * 1.5, dur: 0.07, vol: 0.035, at, pan, bus: this.amb });
      else this.tone({ f0: base * 1.4, f1: base * 0.9, dur: 0.1, vol: 0.03, at, pan, bus: this.amb });
    }
  }
  cricket(night) {
    const pan = Math.random() * 1.6 - 0.8;
    const f = 4300 + Math.random() * 600;
    for (let i = 0; i < 3; i++) this.tone({ f0: f, dur: 0.025, vol: 0.02 * night, at: i * 0.045, pan, bus: this.amb });
  }

  // ----------------------------------------------------------------- efeitos
  step(surface, run) {
    const v = run ? 0.16 : 0.11;
    if (surface === 'wood') {
      this.noise({ dur: 0.07, vol: v * 1.3, f: 520, q: 1.6 });
      this.tone({ f0: 180, f1: 120, dur: 0.06, vol: v * 0.6 });
    } else if (surface === 'road') this.noise({ dur: 0.05, vol: v, f: 1800, q: 1.2 });
    else this.noise({ dur: 0.08, vol: v, f: 1100 + Math.random() * 400, q: 0.8 });
  }
  jump() {
    this.tone({ type: 'triangle', f0: 300, f1: 620, dur: 0.14, vol: 0.12 });
  }
  land() {
    this.noise({ dur: 0.1, vol: 0.16, f: 700, q: 0.8 });
  }
  whoosh() {
    this.noise({ dur: 0.35, vol: 0.18, f: 400, f1: 2500, q: 1.5 });
  }
  splash(size = 1, vol = 1) {
    this.noise({ dur: 0.35 + size * 0.2, vol: 0.28 * size * vol, type: 'lowpass', f: 3500, f1: 400, q: 0.5 });
    this.tone({ f0: 700, f1: 160, dur: 0.14, vol: 0.12 * size * vol });
  }
  plop() {
    this.tone({ f0: 900, f1: 250, dur: 0.1, vol: 0.18 });
  }
  nibble() {
    this.tone({ f0: 500, f1: 300, dur: 0.06, vol: 0.08 });
  }
  bite() {
    this.tone({ f0: 600, f1: 200, dur: 0.12, vol: 0.25 });
    this.tone({ f0: 600, f1: 200, dur: 0.12, vol: 0.22, at: 0.13 });
    this.tone({ type: 'square', f0: 1320, dur: 0.08, vol: 0.06, at: 0.02, filter: { f: 3000 } });
  }
  reelTick(pitch = 1) {
    this.tone({ type: 'square', f0: 1800 * pitch, dur: 0.012, vol: 0.035, filter: { f: 4000 } });
  }
  snap() {
    this.tone({ type: 'sawtooth', f0: 900, f1: 80, dur: 0.25, vol: 0.18, filter: { f: 2500 } });
    this.noise({ dur: 0.15, vol: 0.2, f: 3000, q: 2 });
  }
  catchJingle(rare = false) {
    const notes = rare ? [72, 76, 79, 84, 88, 91] : [72, 76, 79, 84];
    notes.forEach((n, i) => this.tone({ type: 'triangle', f0: mtof(n), dur: 0.22, vol: 0.16, at: i * 0.085 }));
    notes.forEach((n, i) => this.tone({ type: 'square', f0: mtof(n + 12), dur: 0.12, vol: 0.03, at: i * 0.085, filter: { f: 3000 } }));
  }
  fail() {
    [64, 61, 57].forEach((n, i) => this.tone({ type: 'triangle', f0: mtof(n), dur: 0.25, vol: 0.13, at: i * 0.14 }));
  }
  pop() {
    this.tone({ f0: 520, f1: 1300, dur: 0.09, vol: 0.18 });
    this.tone({ type: 'triangle', f0: 1560, dur: 0.1, vol: 0.06, at: 0.06 });
  }
  coin() {
    this.tone({ type: 'square', f0: mtof(83), dur: 0.08, vol: 0.06, filter: { f: 4000 } });
    this.tone({ type: 'square', f0: mtof(88), dur: 0.3, vol: 0.06, at: 0.08, filter: { f: 4000 } });
  }
  thud(vol = 1) {
    this.tone({ f0: 140, f1: 55, dur: 0.16, vol: 0.32 * vol });
    this.noise({ dur: 0.08, vol: 0.12 * vol, f: 600, q: 0.8 });
  }
  rustle() {
    this.noise({ dur: 0.55, vol: 0.2, f: 3200, q: 0.6, attack: 0.05 });
    this.noise({ dur: 0.4, vol: 0.12, f: 1800, q: 0.6, at: 0.15, attack: 0.04 });
  }
  gate(open) {
    this.tone({ type: 'sawtooth', f0: open ? 160 : 230, f1: open ? 260 : 150, dur: 0.5, vol: 0.06, filter: { f: 1100, q: 3 } });
    this.thud(0.4);
  }
  shout() {
    // "Ô de casa!" — vogal sintetizada
    const t0 = 0;
    for (const [f, at, d] of [[220, t0, 0.18], [190, 0.22, 0.12], [240, 0.36, 0.35]]) {
      this.tone({ type: 'sawtooth', f0: f, f1: f * 0.92, dur: d, vol: 0.09, at, filter: { f: 900, q: 4 }, attack: 0.03 });
      this.tone({ type: 'sawtooth', f0: f, f1: f * 0.92, dur: d, vol: 0.05, at, filter: { type: 'bandpass', f: 2400, q: 6 }, attack: 0.03 });
    }
  }
  reply() {
    for (const [f, at, d] of [[300, 0, 0.12], [340, 0.15, 0.12], [280, 0.3, 0.3]]) {
      this.tone({ type: 'sawtooth', f0: f, f1: f * 0.9, dur: d, vol: 0.05, at, filter: { f: 1200, q: 4 }, attack: 0.02 });
    }
  }
  gulp() {
    for (let i = 0; i < 3; i++) this.tone({ f0: 260, f1: 140, dur: 0.1, vol: 0.18, at: i * 0.32 });
    this.tone({ type: 'triangle', f0: mtof(79), f1: mtof(84), dur: 0.2, vol: 0.08, at: 1.1 });
  }
  ui() {
    this.tone({ type: 'triangle', f0: 880, f1: 1320, dur: 0.06, vol: 0.08 });
  }
  achievement() {
    [76, 79, 83, 88].forEach((n, i) => this.tone({ type: 'triangle', f0: mtof(n), dur: 0.3, vol: 0.12, at: i * 0.1 }));
    this.tone({ type: 'sine', f0: mtof(100), dur: 0.6, vol: 0.04, at: 0.4 });
  }
  honk() {
    this.tone({ type: 'square', f0: 392, dur: 0.18, vol: 0.06, filter: { f: 1500 } });
    this.tone({ type: 'square', f0: 466, dur: 0.18, vol: 0.05, filter: { f: 1500 } });
    this.tone({ type: 'square', f0: 392, dur: 0.3, vol: 0.06, at: 0.25, filter: { f: 1500 } });
  }
  // ---- Strada
  carHorn() {
    for (const [f, v] of [[349, 0.05], [440, 0.045]]) {
      this.tone({ type: 'square', f0: f, dur: 0.42, vol: v, attack: 0.01, filter: { f: 1700 } });
    }
  }
  door() {
    this.tone({ f0: 130, f1: 60, dur: 0.12, vol: 0.28 });
    this.noise({ dur: 0.07, vol: 0.18, type: 'lowpass', f: 900, q: 0.7 });
  }
  engineStart() {
    this.tone({ type: 'sawtooth', f0: 38, f1: 75, dur: 0.55, vol: 0.09, filter: { f: 450 } });
    this.noise({ dur: 0.5, vol: 0.08, type: 'lowpass', f: 300, f1: 700, q: 0.8 });
  }
  skid() {
    this.noise({ dur: 0.55, vol: 0.1, f: 2300, f1: 1700, q: 3 });
  }
  engine() {
    if (!this.ctx) return null;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 62;
    const o2 = this.ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 31.5;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const p = this.ctx.createStereoPanner();
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(p).connect(this.amb);
    o.start();
    o2.start();
    return {
      set: (vol, pan, speed) => {
        g.gain.setTargetAtTime(vol * 0.11, this.t, 0.1);
        p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), this.t, 0.1);
        o.frequency.setTargetAtTime(48 + speed * 3, this.t, 0.2);
      },
      stop: () => {
        g.gain.setTargetAtTime(0, this.t, 0.1);
        o.stop(this.t + 0.5);
        o2.stop(this.t + 0.5);
      },
    };
  }

  // ----------------------------------------------------------------- música
  startMusic(style) {
    if (!this.ctx) return;
    this.musicStyle = style;
    this.mus.gain.cancelScheduledValues(this.t);
    this.mus.gain.setTargetAtTime(0.5, this.t, 0.15);
    if (this.music) {
      this.music.stopping = false;
      this.music.step = 0;
      this.music.t0 = this.music.next;
      return;
    }
    this.music = { step: 0, next: this.t + 0.06, t0: this.t + 0.06 };
    this.musicTimer = setInterval(() => this.schedule(), 25);
  }
  stopMusic() {
    if (!this.ctx || !this.music) return;
    this.mus.gain.setTargetAtTime(0, this.t, 0.25);
    const m = this.music;
    m.stopping = true;
    setTimeout(() => {
      if (this.music === m && m.stopping) {
        clearInterval(this.musicTimer);
        this.music = null;
      }
    }, 1200);
  }
  get beatPhase() {
    if (!this.music || !this.ctx) return null;
    const S = SONGS[this.musicStyle];
    const spb = 60 / S.bpm;
    return (((this.t - this.music.t0) / spb) % 1 + 1) % 1;
  }
  schedule() {
    const S = SONGS[this.musicStyle];
    const s16 = 60 / S.bpm / 4;
    while (this.music && this.music.next < this.t + 0.12) {
      this.playStep(S, this.music.step, this.music.next, s16);
      this.music.next += s16;
      this.music.step = (this.music.step + 1) % 64;
    }
  }
  playStep(S, step, t, s16) {
    const bar = Math.floor(step / 16), st = step % 16;
    const at = t - this.t;
    const chord = S.chords[bar];
    if (S.kick.includes(st)) this.kick(at, S.kickF);
    if (S.snare && S.snare.includes(st)) this.clap(at);
    if (S.hat) {
      const h = S.hat[st];
      if (h) this.hat(at, h === 2, S.hatF);
    }
    for (const [bs, off, dur] of S.bass) if (bs === st) this.bassNote(at, chord + off - 12, dur * s16, S.bassType);
    for (const [ss, dur] of S.stabs || []) if (ss === st) this.stab(at, chord, dur * s16, S.stabType);
    for (const [ms, n, dur] of S.melody) if (ms === step) this.lead(at, n, dur * s16, S.leadType, S.vibrato);
  }
  kick(at, f = 150) {
    this.tone({ f0: f, f1: 42, dur: 0.22, vol: 0.5, at, bus: this.mus });
  }
  clap(at) {
    this.noise({ dur: 0.12, vol: 0.22, f: 1500, q: 0.9, at, bus: this.mus });
  }
  hat(at, open, f = 8000) {
    this.noise({ dur: open ? 0.14 : 0.035, vol: open ? 0.08 : 0.05, type: 'highpass', f, q: 0.6, at, bus: this.mus });
  }
  bassNote(at, m, dur, type = 'triangle') {
    this.tone({ type, f0: mtof(m), dur: Math.max(dur * 0.9, 0.06), vol: 0.22, at, bus: this.mus, attack: 0.01, filter: { f: 700 } });
  }
  stab(at, root, dur, type = 'square') {
    for (const iv of [12, 16, 19]) this.tone({ type, f0: mtof(root + iv), dur: dur * 0.8, vol: 0.035, at, bus: this.mus, filter: { f: 2200 } });
  }
  lead(at, m, dur, type = 'sawtooth', vibrato = false) {
    if (!this.ctx) return;
    const t = this.t + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = mtof(m);
    const o2 = this.ctx.createOscillator();
    o2.type = type;
    o2.frequency.value = mtof(m) * 1.006;
    if (vibrato) {
      const l = this.ctx.createOscillator();
      l.frequency.value = 5.5;
      const lg = this.ctx.createGain();
      lg.gain.value = 4;
      l.connect(lg);
      lg.connect(o.frequency);
      lg.connect(o2.frequency);
      l.start(t);
      l.stop(t + dur + 0.1);
    }
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    f.Q.value = 1.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.015);
    g.gain.setValueAtTime(0.07, t + Math.max(dur - 0.04, 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.mus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
  }
}

// 0 = Forró (baião + sanfona), 1 = Eletrônico "robô", 2 = Axé
const SONGS = [
  {
    name: 'Forró',
    bpm: 118,
    chords: [48, 53, 55, 48],
    kick: [0, 3, 8, 11],
    kickF: 120,
    hat: [1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1],
    hatF: 6500,
    bass: [[0, 0, 3], [3, 7, 1], [4, 12, 3], [8, 0, 3], [11, 7, 1], [12, 12, 3]],
    bassType: 'triangle',
    stabs: [[2, 1], [6, 1], [10, 1], [14, 1]],
    stabType: 'sawtooth',
    leadType: 'sawtooth',
    vibrato: true,
    melody: [
      [0, 67, 2], [2, 64, 2], [4, 67, 2], [6, 69, 1], [7, 70, 1], [8, 69, 2], [10, 67, 2], [12, 64, 4],
      [16, 65, 2], [18, 69, 2], [20, 72, 2], [22, 69, 1], [23, 72, 1], [24, 74, 2], [26, 72, 2], [28, 69, 4],
      [32, 71, 2], [34, 74, 2], [36, 67, 2], [38, 71, 1], [39, 72, 1], [40, 74, 2], [42, 77, 2], [44, 74, 4],
      [48, 76, 2], [50, 74, 2], [52, 72, 2], [54, 70, 1], [55, 69, 1], [56, 67, 2], [58, 64, 2], [60, 60, 4],
    ],
  },
  {
    name: 'Eletrônico',
    bpm: 124,
    chords: [57, 53, 48, 55],
    kick: [0, 4, 8, 12],
    kickF: 160,
    snare: [4, 12],
    hat: [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 1],
    hatF: 9000,
    bass: [[2, 0, 1], [6, 0, 1], [10, 0, 1], [14, 0, 1], [3, 12, 1], [7, 12, 1], [11, 12, 1], [15, 12, 1]],
    bassType: 'sawtooth',
    leadType: 'square',
    melody: (() => {
      const out = [];
      const arps = [[69, 72, 76, 72], [65, 69, 72, 69], [60, 64, 67, 64], [67, 71, 74, 71]];
      for (let bar = 0; bar < 4; bar++) for (let s = 0; s < 16; s += 2) out.push([bar * 16 + s, arps[bar][(s / 2) % 4] + (s >= 8 ? 12 : 0), 1]);
      return out;
    })(),
  },
  {
    name: 'Axé',
    bpm: 132,
    chords: [48, 55, 57, 53],
    kick: [0, 3, 6, 8, 11, 14],
    kickF: 110,
    snare: [4, 12],
    hat: [2, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 1, 1, 2, 1],
    hatF: 7000,
    bass: [[0, 0, 2], [3, 0, 1], [6, 7, 2], [8, 12, 2], [11, 7, 1], [14, 0, 2]],
    bassType: 'triangle',
    stabs: [[4, 1], [7, 1], [12, 1], [15, 1]],
    stabType: 'square',
    leadType: 'sawtooth',
    melody: [
      [0, 72, 2], [2, 72, 1], [3, 74, 1], [4, 76, 2], [6, 72, 2], [8, 79, 3], [11, 76, 1], [12, 74, 4],
      [16, 71, 2], [18, 71, 1], [19, 72, 1], [20, 74, 2], [22, 71, 2], [24, 79, 3], [27, 77, 1], [28, 74, 4],
      [32, 72, 2], [34, 72, 1], [35, 74, 1], [36, 76, 2], [38, 72, 2], [40, 81, 3], [43, 79, 1], [44, 76, 4],
      [48, 77, 2], [50, 76, 2], [52, 74, 2], [54, 72, 2], [56, 74, 2], [58, 71, 2], [60, 72, 4],
    ],
  },
];
export const DANCE_NAMES = SONGS.map((s) => s.name);

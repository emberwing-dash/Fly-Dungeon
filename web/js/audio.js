// Fly Dungeon sound: everything is synthesised with the Web Audio API (no audio files, so nothing to license).
// Music: a small generative dungeon loop (arpeggio, pad, bass, soft pulse) whose tempo rises with danger.
// SFX: short synth blips, whooshes and thumps, with distance fall-off and stereo pan for in-world events.

const STORE = 'flyfix.audio';
const D_MIN = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25];
// chord = [root, third, fifth, octave] as frequencies
const CH = { Dm: [146.83, 174.61, 220.0, 293.66], Bb: [116.54, 146.83, 174.61, 233.08], F: [174.61, 220.0, 261.63, 349.23], C: [130.81, 164.81, 196.0, 261.63], Gm: [196.0, 233.08, 293.66, 392.0], A: [110.0, 138.59, 164.81, 220.0] };
const PROG = { menu: ['Dm', 'Bb', 'F', 'C'], game: ['Dm', 'Bb', 'Gm', 'A'] };
const PAT = [0, 1, 2, 3, 2, 1, 3, 2];

export class Sound {
  constructor() {
    this.ctx = null; this.mode = 'off'; this.intensity = 0; this.paused = false; this.last = {};
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { /* private mode */ }
    this.muted = !!saved.muted; this.music = saved.music ?? 0.55; this.sfx = saved.sfx ?? 0.8;
    this.step = 0; this.bar = 0; this.next = 0; this.humOn = false;
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify({ muted: this.muted, music: this.music, sfx: this.sfx })); } catch { /* ignore */ } }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return; const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; this.master.connect(comp); comp.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.music * 0.55; this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 9000; this.musicBus.connect(this.musicFilter); this.musicFilter.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfx; this.sfxBus.connect(this.master);
    const len = ctx.sampleRate * 1.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = buf;
    this.next = ctx.currentTime + 0.1; this.timer = setInterval(() => this.schedule(), 60);
    this.startHum();
  }
  // ---- volume / mute ----
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); this.save(); }
  setMusic(v) { this.music = v; if (this.musicBus) this.musicBus.gain.setTargetAtTime(v * 0.55, this.ctx.currentTime, 0.05); this.save(); }
  setSfx(v) { this.sfx = v; if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); this.save(); }
  setMode(m) { if (m !== this.mode) { this.mode = m; this.step = 0; this.bar = 0; if (this.ctx) this.next = Math.max(this.next, this.ctx.currentTime + 0.05); } }
  setIntensity(v) { this.intensity += (Math.max(0, Math.min(1, v)) - this.intensity) * 0.15; }
  setPaused(p) { this.paused = p; if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(p ? 380 : 9000, this.ctx.currentTime, 0.08); if (this.humGain) this.humGain.gain.setTargetAtTime(p ? 0 : this.humLevel || 0, this.ctx.currentTime, 0.05); }

  // ---- building blocks ----
  voice(o) {
    const ctx = this.ctx; if (!ctx) return; const t0 = ctx.currentTime + (o.delay || 0), g = ctx.createGain(), osc = ctx.createOscillator();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t0); if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.dur);
    const a = o.attack ?? 0.005, v = (o.vol ?? 0.3); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node = osc; osc.connect(g); node = g; if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); node.connect(p); node = p; }
    node.connect(o.bus || this.sfxBus); osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }
  noise(o) {
    const ctx = this.ctx; if (!ctx) return; const t0 = ctx.currentTime + (o.delay || 0), src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = this.noiseBuf; f.type = o.ftype || 'bandpass'; f.Q.value = o.q ?? 1; f.frequency.setValueAtTime(o.f, t0); if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f2), t0 + o.dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(o.vol ?? 0.3, t0 + (o.attack ?? 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); let node = g; if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); node.connect(p); node = p; } node.connect(o.bus || this.sfxBus); src.start(t0); src.stop(t0 + o.dur + 0.05);
  }
  // continuous wing hum for the selected fly (and the menu fly)
  startHum() {
    const ctx = this.ctx; this.humGain = ctx.createGain(); this.humGain.gain.value = 0; this.humOsc = ctx.createOscillator(); this.humOsc.type = 'sawtooth'; this.humOsc.frequency.value = 190; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 38; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); const am = ctx.createGain(); am.gain.value = 0.6; lg.connect(am.gain); this.humOsc.connect(lp); lp.connect(am); am.connect(this.humGain); this.humGain.connect(this.sfxBus); this.humOsc.start(); lfo.start(); this.humLevel = 0;
  }
  /** level 0..1, pitch in Hz */
  hum(level, pitch = 190) { if (!this.ctx || !this.humGain) return; this.humLevel = this.paused ? 0 : level * 0.07; this.humGain.gain.setTargetAtTime(this.humLevel, this.ctx.currentTime, 0.08); this.humOsc.frequency.setTargetAtTime(pitch, this.ctx.currentTime, 0.1); }

  // ---- effects ----
  /** opts: {vol 0..1, pan -1..1} */
  play(name, o = {}) {
    if (!this.ctx || this.muted) return; const now = this.ctx.currentTime, gap = { hurt: 0.08, death: 0.06, birth: 0.4, dash: 0.1, hover: 0.04, eat: 0.1 }[name] || 0.02;
    if (this.last[name] && now - this.last[name] < gap) return; this.last[name] = now;
    const v = o.vol ?? 1, pan = o.pan || 0; if (v <= 0.02) return; const T = (x) => ({ ...x, vol: (x.vol ?? 0.3) * v, pan });
    const V = (x) => this.voice(T(x)), N = (x) => this.noise(T(x));
    switch (name) {
      case 'click': V({ f: 520, f2: 760, dur: 0.07, type: 'square', vol: 0.12 }); break;
      case 'hover': V({ f: 880, dur: 0.03, type: 'triangle', vol: 0.06 }); break;
      case 'back': V({ f: 520, f2: 330, dur: 0.1, type: 'triangle', vol: 0.16 }); break;
      case 'pop': V({ f: 300, f2: 700, dur: 0.12, type: 'sine', vol: 0.25 }); V({ f: 600, f2: 1200, dur: 0.09, type: 'triangle', vol: 0.1, delay: 0.04 }); break;
      case 'statUp': V({ f: 660, f2: 990, dur: 0.09, type: 'triangle', vol: 0.18 }); break;
      case 'statDown': V({ f: 520, f2: 330, dur: 0.09, type: 'triangle', vol: 0.15 }); break;
      case 'zip': N({ f: 400, f2: 3000, q: 2, dur: 0.35, vol: 0.12 }); V({ f: 300, f2: 900, dur: 0.3, type: 'sawtooth', vol: 0.05 }); break;
      case 'start': [262, 330, 392, 523].forEach((f, i) => V({ f, dur: 0.22, type: 'triangle', vol: 0.2, delay: i * 0.08 })); N({ f: 500, f2: 2500, dur: 0.5, vol: 0.08, delay: 0.1 }); break;
      case 'poke': V({ f: 400 + 500 * (o.level || 0.5), f2: 200, dur: 0.2, type: 'sine', vol: 0.22 }); break;
      case 'dash': N({ f: 800, f2: 3500, q: 1.5, dur: 0.22, vol: 0.28 }); V({ f: 500, f2: 200, dur: 0.15, type: 'sawtooth', vol: 0.05 }); break;
      case 'eat': V({ f: 880, dur: 0.1, type: 'triangle', vol: 0.22 }); V({ f: 1320, dur: 0.16, type: 'triangle', vol: 0.18, delay: 0.07 }); break;
      case 'key': [784, 988, 1175, 1568].forEach((f, i) => V({ f, dur: 0.3, type: 'sine', vol: 0.18, delay: i * 0.06 })); break;
      case 'hurt': V({ f: 180, f2: 70, dur: 0.18, type: 'square', vol: 0.18 }); N({ f: 600, q: 0.8, dur: 0.12, vol: 0.2 }); break;
      case 'death': V({ f: 440, f2: 110, dur: 0.4, type: 'triangle', vol: 0.22 }); V({ f: 330, f2: 80, dur: 0.45, type: 'sine', vol: 0.16, delay: 0.05 }); break;
      case 'escape': [523, 659, 784, 1047, 1319].forEach((f, i) => V({ f, dur: 0.35, type: 'triangle', vol: 0.22, delay: i * 0.09 })); V({ f: 262, dur: 0.9, type: 'sine', vol: 0.2, delay: 0.1 }); break;
      case 'level': [392, 494, 587, 784, 988].forEach((f, i) => V({ f, dur: 0.28, type: 'square', vol: 0.1, delay: i * 0.075 })); break;
      case 'birth': V({ f: 700, f2: 1100, dur: 0.07, type: 'sine', vol: 0.07 }); break;
      case 'swatWind': V({ f: 180, f2: 480, dur: 0.7, type: 'sawtooth', vol: 0.1 }); N({ f: 300, f2: 1200, q: 1, dur: 0.7, vol: 0.06 }); break;
      case 'slam': V({ f: 110, f2: 38, dur: 0.45, type: 'sine', vol: 0.55 }); N({ f: 700, f2: 120, ftype: 'lowpass', q: 0.5, dur: 0.4, vol: 0.45 }); break;
      case 'bird': V({ f: 1500, f2: 2400, dur: 0.14, type: 'square', vol: 0.09 }); V({ f: 2400, f2: 1400, dur: 0.16, type: 'square', vol: 0.08, delay: 0.14 }); break;
      case 'alert': V({ f: 740, dur: 0.08, type: 'square', vol: 0.12 }); V({ f: 740, dur: 0.08, type: 'square', vol: 0.12, delay: 0.12 }); break;
      case 'resume': V({ f: 440, f2: 660, dur: 0.1, type: 'triangle', vol: 0.18 }); break;
      case 'pause': V({ f: 660, f2: 440, dur: 0.12, type: 'triangle', vol: 0.18 }); break;
      case 'lesion': V({ f: 300, f2: 90, dur: 0.35, type: 'sawtooth', vol: 0.15 }); N({ f: 1500, f2: 200, dur: 0.3, vol: 0.12 }); break;
      case 'restore': [330, 440, 660].forEach((f, i) => V({ f, dur: 0.15, type: 'triangle', vol: 0.15, delay: i * 0.06 })); break;
    }
  }

  // ---- music ----
  schedule() {
    const ctx = this.ctx; if (!ctx || this.mode === 'off') return; const game = this.mode === 'game';
    const bpm = (game ? 92 : 78) * (1 + 0.28 * this.intensity), spb = 60 / bpm, eighth = spb / 2;
    while (this.next < ctx.currentTime + 0.3) {
      const t = this.next, prog = PROG[game ? 'game' : 'menu'], chord = CH[prog[Math.floor(this.bar / 2) % prog.length]], s = this.step % 8;
      const at = t - ctx.currentTime;
      // pluck arpeggio
      this.voice({ f: chord[PAT[s]] * (s % 4 === 3 ? 2 : 1), dur: eighth * 1.8, type: game ? 'triangle' : 'triangle', vol: game ? 0.12 : 0.15, attack: 0.004, delay: at, bus: this.musicBus });
      if (this.intensity > 0.35 && s % 2 === 1) this.voice({ f: chord[PAT[(s + 3) % 8]] * 2, dur: eighth, type: 'square', vol: 0.035 * this.intensity, delay: at, bus: this.musicBus });
      if (s === 0) {   // pad + bass on the downbeat of every bar
        for (const m of [1, 2]) this.voice({ f: chord[m] * (m === 2 ? 1 : 0.5), dur: spb * 4, type: 'sawtooth', vol: game ? 0.035 : 0.045, attack: spb * 1.2, delay: at, bus: this.musicBus });
        this.voice({ f: chord[0] / 2, dur: spb * 1.6, type: 'sine', vol: 0.34, attack: 0.01, delay: at, bus: this.musicBus });
      }
      if (game && s % 2 === 0) { this.voice({ f: 110, f2: 45, dur: 0.18, type: 'sine', vol: 0.22 + 0.12 * this.intensity, attack: 0.002, delay: at, bus: this.musicBus }); }
      if (game && s % 2 === 1 && this.intensity > 0.2) this.noiseTick(at, 0.05 * this.intensity);
      this.next += eighth; this.step++; if (this.step % 8 === 0) this.bar++;
    }
  }
  noiseTick(delay, vol) { this.noise({ f: 7000, q: 3, ftype: 'highpass', dur: 0.04, vol, delay, bus: this.musicBus }); }
}

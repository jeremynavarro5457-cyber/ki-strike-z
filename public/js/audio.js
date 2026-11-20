/**
 * Effets sonores 100 % synthétiques (Web Audio API).
 * Aucun fichier audio : tout est généré à la volée.
 */
(function () {
  'use strict';
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('ksz-muted') === '1'; } catch (_) { /* stockage indisponible */ }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  // Le navigateur exige un geste utilisateur pour démarrer l'audio.
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, init, { passive: true }));

  const now = () => ctx.currentTime;

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function tone({ type = 'square', f0, f1 = f0, dur = 0.2, vol = 0.3, at = 0, attack = 0.005 }) {
    const t = now() + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    env(g, t, attack, vol, dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + attack + dur + 0.05);
    return o;
  }

  function noise({ dur = 0.4, vol = 0.4, at = 0, filter = 'lowpass', f0 = 4000, f1 = 200, q = 1, attack = 0.005 }) {
    const t = now() + at;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = filter; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    env(g, t, attack, vol, dur);
    s.connect(flt).connect(g).connect(master);
    s.start(t, Math.random()); s.stop(t + attack + dur + 0.05);
  }

  const sfx = {
    click() { tone({ type: 'square', f0: 660, f1: 990, dur: 0.06, vol: 0.12 }); },
    hover() { tone({ type: 'sine', f0: 1400, f1: 1800, dur: 0.03, vol: 0.04 }); },
    place() { tone({ type: 'square', f0: 220, f1: 440, dur: 0.08, vol: 0.15 }); noise({ dur: 0.08, vol: 0.12, filter: 'highpass', f0: 3000, f1: 2000 }); },
    rotate() { tone({ type: 'triangle', f0: 500, f1: 800, dur: 0.07, vol: 0.15 }); },
    error() { tone({ type: 'square', f0: 140, f1: 110, dur: 0.18, vol: 0.18 }); },
    ready() {
      [392, 523, 659, 784].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.12, vol: 0.14, at: i * 0.07 }));
    },
    shoot() {
      tone({ type: 'sawtooth', f0: 300, f1: 1800, dur: 0.22, vol: 0.18 });
      tone({ type: 'square', f0: 900, f1: 2600, dur: 0.15, vol: 0.08, at: 0.02 });
      noise({ dur: 0.25, vol: 0.18, filter: 'bandpass', f0: 1200, f1: 6000, q: 2 });
    },
    hit() {
      noise({ dur: 0.7, vol: 0.7, f0: 3000, f1: 80 });
      tone({ type: 'sine', f0: 140, f1: 38, dur: 0.6, vol: 0.55 });
      tone({ type: 'square', f0: 80, f1: 40, dur: 0.25, vol: 0.15 });
    },
    miss() {
      noise({ dur: 0.45, vol: 0.3, filter: 'bandpass', f0: 2500, f1: 400, q: 3 });
      tone({ type: 'sine', f0: 600, f1: 180, dur: 0.3, vol: 0.12 });
    },
    sunk() {
      noise({ dur: 1.6, vol: 0.8, f0: 2200, f1: 40 });
      tone({ type: 'sine', f0: 90, f1: 25, dur: 1.5, vol: 0.7 });
      tone({ type: 'sawtooth', f0: 220, f1: 55, dur: 0.9, vol: 0.12, at: 0.05 });
      noise({ dur: 0.9, vol: 0.4, f0: 5000, f1: 300, at: 0.25 });
    },
    charge(dur = 1.2) {
      const t = now();
      const o = ctx.createOscillator(); const lfo = ctx.createOscillator();
      const lg = ctx.createGain(); const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(880, t + dur);
      lfo.frequency.setValueAtTime(8, t); lfo.frequency.linearRampToValueAtTime(30, t + dur);
      lg.gain.value = 25;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 2400;
      o.connect(flt).connect(g).connect(master);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
      noise({ dur, vol: 0.12, filter: 'bandpass', f0: 300, f1: 4000, q: 4, attack: dur * 0.8 });
    },
    beam(dur = 1.1) {
      noise({ dur, vol: 0.55, filter: 'lowpass', f0: 6000, f1: 300, attack: 0.02 });
      tone({ type: 'sawtooth', f0: 220, f1: 160, dur, vol: 0.2 });
      tone({ type: 'square', f0: 110, f1: 70, dur, vol: 0.16 });
      tone({ type: 'sine', f0: 60, f1: 30, dur: dur + 0.4, vol: 0.6 });
    },
    turn() { tone({ type: 'square', f0: 880, dur: 0.07, vol: 0.12 }); tone({ type: 'square', f0: 1320, dur: 0.1, vol: 0.12, at: 0.08 }); },
    kiFull() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.1, vol: 0.13, at: i * 0.05 })); },
    victory() {
      const notes = [523, 659, 784, 1046, 784, 1046, 1318];
      notes.forEach((f, i) => tone({ type: 'square', f0: f, dur: i === notes.length - 1 ? 0.6 : 0.14, vol: 0.15, at: i * 0.13 }));
      notes.forEach((f, i) => tone({ type: 'triangle', f0: f / 2, dur: 0.14, vol: 0.12, at: i * 0.13 }));
    },
    defeat() {
      [392, 370, 349, 262].forEach((f, i) => tone({ type: 'sawtooth', f0: f, f1: f * 0.97, dur: i === 3 ? 0.9 : 0.3, vol: 0.13, at: i * 0.32 }));
    },
  };

  window.Sound = {
    play(name, ...args) {
      if (muted || !init() || !sfx[name]) return;
      try { sfx[name](...args); } catch (_) { /* ignore */ }
    },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('ksz-muted', muted ? '1' : '0'); } catch (_) { /* ignore */ }
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    },
    get muted() { return muted; },
  };
})();

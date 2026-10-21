/* Patas mockups: sounds, synthesised with Web Audio (no files, no network), like Gastos.
   Different sounds on purpose: money leaving you should never sound like a coin reward (Erina).
     tick    a soft wooden tick when a payment is saved
     done    a gentle rising three-note chime when a debt becomes "patas na"
     swish   a quiet swish on delete
     thanks  a two-note chime when feedback is sent
   One Sounds switch in Settings. `__sounds` records what was asked to play, so tests can prove the switch works. */
(function (root) {
  const log = [];
  root.__sounds = log;
  let on = true, ctx = null;

  function audio() {
    if (ctx) return ctx;
    try { const C = root.AudioContext || root.webkitAudioContext; if (C) ctx = new C(); } catch (e) { ctx = null; }
    return ctx;
  }
  function tone(c, type, f0, f1, t0, dur, vol) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(c, t0, dur, f0, f1, vol) {
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t0);
  }
  function play(name, gain) {
    if (!on) return;
    log.push(name);
    try {
      const c = audio(); if (!c) return;
      if (c.state === 'suspended') c.resume();
      const t = c.currentTime + 0.01, v = gain || 1;
      if (name === 'tick') { tone(c, 'sine', 1500, 900, t, 0.06, 0.1 * v); tone(c, 'triangle', 240, 170, t, 0.08, 0.08 * v); }
      else if (name === 'done') { [523.25, 659.25, 783.99].forEach((f, i) => tone(c, 'sine', f, f, t + i * 0.13, 0.45, 0.09 * v)); }
      else if (name === 'swish') { noise(c, t, 0.16, 1800, 300, 0.08 * v); }
      else if (name === 'thanks') { [659.25, 987.77].forEach((f, i) => tone(c, 'sine', f, f, t + i * 0.14, 0.4, 0.09 * v)); }
    } catch (e) { /* no audio here: silent */ }
  }
  const setSounds = (v) => { on = !!v; };
  const haptic = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {} };
  root.PatasFx = { play, setSounds, haptic, isOn: () => on };
})(window);

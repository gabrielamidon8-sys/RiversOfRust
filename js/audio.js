// SFX for RiversOfRust: every sound is synthesised (no sound files): the clank of a part going on, the ratchet of
// its bolts, a pick-up, the engine (revs follow the car), the machine gun, impacts.
let ctx = null, master = null, muted = false;
try { muted = localStorage.getItem('rr_muted') === '1'; } catch (e) { }
export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function setMuted(m) { muted = m; try { localStorage.setItem('rr_muted', m ? '1' : '0'); } catch (e) { } if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.05); }
export function isMuted() { return muted; }

let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return noiseBuf;
}
function burst(t, dur, freq, q, gain, type = 'bandpass') {
  const s = ctx.createBufferSource(); s.buffer = noise();
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
}
function ping(t, freq, dur, gain, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
// heavy steel set down on steel, then the bolts run in
export function clank(weight = 1) {
  if (!audio()) return; const t = ctx.currentTime;
  burst(t, 0.18, 900 / Math.sqrt(weight), 1.2, 0.9);
  burst(t, 0.06, 3200, 3, 0.4);
  for (const [f, g] of [[311, 0.25], [523, 0.16], [877, 0.1], [1290, 0.06]]) ping(t, f / Math.sqrt(weight) * (0.97 + Math.random() * 0.06), 0.5 + Math.random() * 0.3, g, 'triangle');
  for (let i = 0; i < 9; i++) burst(t + 0.28 + i * 0.045, 0.025, 2600 + Math.random() * 600, 6, 0.22);
}
export function pickup() { if (!audio()) return; const t = ctx.currentTime; burst(t, 0.09, 1800, 2, 0.35); ping(t, 640, 0.18, 0.08, 'triangle'); }
export function uiTick() { if (!audio()) return; const t = ctx.currentTime; burst(t, 0.03, 4000, 4, 0.18); }
export function unlock() { if (!audio()) return; const t = ctx.currentTime; [392, 523, 659, 784].forEach((f, i) => ping(t + i * 0.09, f, 0.5, 0.12, 'triangle')); burst(t, 0.6, 600, 0.6, 0.25, 'lowpass'); }
export function shot() { if (!audio()) return; const t = ctx.currentTime; burst(t, 0.12, 1400, 0.8, 0.8); burst(t, 0.35, 220, 0.7, 0.6, 'lowpass'); ping(t, 95, 0.12, 0.35, 'sine'); }
export function hit(metal) { if (!audio()) return; const t = ctx.currentTime; if (metal) { burst(t, 0.08, 3000, 5, 0.25); ping(t, 1800 + Math.random() * 900, 0.15, 0.05, 'triangle'); } else burst(t, 0.2, 500, 0.8, 0.2, 'lowpass'); }

// the engine: two detuned saws and a pulse through a low-pass, with a noisy intake on top
export function engineSound() {
  if (!audio()) return null;
  const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 2; lp.connect(out);
  const shaper = ctx.createWaveShaper(); const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * 2.4); } shaper.curve = c; shaper.connect(lp);
  const oscs = [['sawtooth', 1, 0.35], ['sawtooth', 1.007, 0.3], ['square', 0.5, 0.25]].map(([type, mul, g]) => {
    const o = ctx.createOscillator(); o.type = type; const gg = ctx.createGain(); gg.gain.value = g; o.connect(gg); gg.connect(shaper); o.start(); return { o, mul };
  });
  const n = ctx.createBufferSource(); n.buffer = noise(); n.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 1.2; const ng = ctx.createGain(); ng.gain.value = 0.0;
  n.connect(nf); nf.connect(ng); ng.connect(out); n.start();
  out.gain.setTargetAtTime(0.32, ctx.currentTime, 0.4);
  return {
    set(rpm, throttle) {
      const t = ctx.currentTime, f = rpm / 60 * 4 / 2;   // a V8 fires four times a turn; the drone sits an octave down
      for (const { o, mul } of oscs) o.frequency.setTargetAtTime(f * mul, t, 0.05);
      lp.frequency.setTargetAtTime(300 + rpm * 0.32 + throttle * 900, t, 0.08);
      nf.frequency.setTargetAtTime(400 + rpm * 0.4, t, 0.1); ng.gain.setTargetAtTime(0.05 + throttle * 0.18, t, 0.1);
      out.gain.setTargetAtTime(0.22 + throttle * 0.16, t, 0.1);
    },
    stop() { const t = ctx.currentTime; out.gain.setTargetAtTime(0, t, 0.15); setTimeout(() => { for (const { o } of oscs) o.stop(); n.stop(); out.disconnect(); }, 700); }
  };
}

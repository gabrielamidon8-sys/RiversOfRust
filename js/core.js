/* ================= CORE: the engine hub (RiversOfRust port of Zombie City's CORE) =================
   RiversOfRust is built the same way as Zombie City: out of engines that each do one job (the garage, the builder,
   the physics, the sound...) and meet here. The contract is the same as Zombie City's core.js, so an engine written
   for one game can be plugged into the other:
   - coreAdd({ name, does, kind, ver, needs, provides, covers, check, repair, trim, boost, isolate, restore, selfTest,
     on: { event: fn } }) registers an engine.
   - coreOn(event, who, fn) / coreEmit(event, data): the message bus. A listener that keeps throwing is taken off it.
   - coreCost(name, ms): what a frame cost an engine. coreHurt(name, err): an engine reports an error.
   - coreTick(now): call once a frame. Every second it averages the costs; every two seconds the watchdog asks every
     engine whether it is sound and tries its repair, then rests it for a while if the problem keeps coming back.
   - coreUp(name): is this engine running? Engines ask before leaning on another one.
   Zombie City's learning layer (learn.js) is not part of this port yet; the watchdog here uses the simple order
   (own repair, then rest). Nothing here may stop the game: every hook and listener call is guarded. */
const CORE = { list: [], by: {}, bus: new Map(), log: [], lastSec: 0, watchT: 0, fc: 0, fps: 0, frameMs: 0 };

function coreAdd(e) {
  if (CORE.by[e.name]) return CORE.by[e.name];
  Object.assign(e, { ms: 0, msAvg: 0, errs: 0, errsSeen: 0, repairs: 0, lastErr: '', health: 'ok', ver: e.ver || 1, bad: 0, down: false, downs: 0, hist: [] });
  CORE.list.push(e); CORE.by[e.name] = e;
  if (e.on) for (const k in e.on) coreOn(k, e.name, e.on[k]);
  if (e.selfTest) { const t = coreCall(e, 'selfTest', { ok: false, why: 'self-test threw' }); e.testOk = !!(t && t.ok); if (!e.testOk) coreLog(e.name + ' self-test failed: ' + (t && t.why || '?')); }
  return e;
}
function coreCost(name, ms) { const e = CORE.by[name]; if (e) e.ms += ms; }
function coreHurt(name, err) { const e = CORE.by[name]; if (!e) return; e.errs++; e.lastErr = String(err && err.message || err).slice(0, 120); }
function coreLog(msg) { CORE.log.push({ t: Date.now(), msg: String(msg).slice(0, 160) }); if (CORE.log.length > 40) CORE.log.shift(); }
function coreUp(name) { const e = CORE.by[name]; return !!e && !e.down; }
const coreCall = (e, k, d) => { try { return e[k] ? e[k]() : d; } catch (x) { coreHurt(e.name, x); return d; } };

/* ---------- the message bus ---------- */
function coreOn(evt, who, fn) { let L = CORE.bus.get(evt); if (!L) CORE.bus.set(evt, L = []); if (!L.some(l => l.who === who && l.fn === fn)) L.push({ who, fn, fails: 0 }); }
function coreEmit(evt, data) {
  const L = CORE.bus.get(evt); if (!L || !L.length) return 0;
  let n = 0;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    try { l.fn(data); n++; l.fails = 0; } catch (x) {
      coreHurt(l.who, x);
      if (++l.fails >= 5) { L.splice(i--, 1); coreLog(l.who + ' was taken off "' + evt + '" after repeated errors'); }
    }
  }
  return n;
}

/* ---------- the frame and the watchdog ---------- */
function coreTick(now) {
  CORE.fc++;
  if (now - CORE.lastSec < 1000) return;
  const n = Math.max(1, CORE.fc); CORE.fps = Math.round(CORE.fc * 1000 / Math.max(1, now - CORE.lastSec)); CORE.fc = 0; CORE.lastSec = now;
  for (const e of CORE.list) {
    const ms = e.ms / n; e.msAvg = e.msAvg ? e.msAvg * 0.6 + ms * 0.4 : ms; e.ms = 0;
    e.hist.push(Math.round(e.msAvg * 100) / 100); if (e.hist.length > 60) e.hist.shift();
  }
  if (now - CORE.watchT >= 2000) { CORE.watchT = now; try { coreWatch(now); } catch (x) { } }
}
function coreWatch(now) {
  for (const e of CORE.list) {
    if (e.down) {
      if (now >= e.downUntil) { coreCall(e, 'restore'); e.down = false; e.health = 'back'; e.bad = 0; coreLog(e.name + ' is back after resting'); coreEmit('engineUp', { name: e.name }); }
      continue;
    }
    let problem = '';
    if (e.errs - e.errsSeen >= 3) problem = (e.errs - e.errsSeen) + ' errors (' + e.lastErr + ')';
    e.errsSeen = e.errs;
    if (!problem && e.check) problem = String(coreCall(e, 'check', '') || '');
    if (!problem) { if (e.bad) coreLog(e.name + ' is sound again'); e.bad = 0; if (e.health !== 'back') e.health = e.repairs ? 'mended' : 'ok'; continue; }
    e.bad++; e.health = 'mending';
    if (e.bad <= 2 && e.repair) { coreCall(e, 'repair'); e.repairs++; coreLog(e.name + ': ' + problem + ' (tried its own repair)'); }
    else if (e.bad > 2) {
      e.downs++; e.down = true; e.downUntil = now + 60000 * Math.min(5, e.downs); e.health = 'resting'; e.bad = 0;
      coreCall(e, 'isolate'); coreLog(e.name + ' is resting (' + problem + ')'); coreEmit('engineDown', { name: e.name, why: problem });
    }
  }
}
function coreStatus() { return CORE.list.map(e => ({ name: e.name, does: e.does, health: e.health, ms: Math.round(e.msAvg * 100) / 100, errs: e.errs })); }

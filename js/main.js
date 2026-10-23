// RiversOfRust: the game's start-up and its loop. The garage (build mode) and the test drive share one renderer;
// each is an engine registered with CORE, the same hub Zombie City's engines plug into. Keyboard and mouse, touch and
// a controller all work everywhere; input.js says which one is in use and the hints follow it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VERSION, PART_DEFS, INVENTORY } from './config.js';
import { buildGarage } from './garage.js';
import { createBuilder } from './builder.js';
import { createDrive } from './drive.js';
import { buildPart } from './parts.js';
import { mats } from './materials.js';
import { clank, uiTick, unlock, setMuted, isMuted, audio, pauseAudio, resumeAudio } from './audio.js';
import { IN, pollPad, pad, B, padKey, glyph, onInputChange, onPadChange } from './input.js';
import { Q } from './quality.js';

const $ = id => document.getElementById(id);
const bootBar = $('bootBar'), bootMsg = $('bootMsg');
const step = (pct, msg) => { bootBar.style.width = pct + '%'; bootMsg.textContent = msg; return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); };
$('ver').textContent = VERSION;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

async function boot() {
  /* ---------- renderer ---------- */
  await step(8, 'Warming up the lamps…');
  const dom = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas: dom, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!window.RR_TEST });
  const bestRatio = Math.min(window.devicePixelRatio || 1, Q.maxRatio);
  let ratio = bestRatio; renderer.setPixelRatio(ratio);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  /* ---------- garage ---------- */
  await step(22, 'Pouring the concrete…');
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0e0f); scene.environment = envTex; scene.environmentIntensity = 0.32;
  scene.fog = new THREE.Fog(0x15130f, 14, 30);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 80); camera.position.set(5.2, 2.9, 6.4);
  const garage = buildGarage(scene);
  await step(46, 'Painting the parts…'); mats();
  const controls = new OrbitControls(camera, dom);
  controls.target.set(0, 1.1, 0.2); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.minDistance = 3.2; controls.maxDistance = 10.5; controls.maxPolarAngle = Math.PI * 0.49; controls.minPolarAngle = 0.15;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  // the controller turns and zooms the same camera
  const sph = new THREE.Spherical(), off = new THREE.Vector3();
  function orbit(dTheta, dPhi) {
    off.copy(camera.position).sub(controls.target); sph.setFromVector3(off);
    sph.theta -= dTheta; sph.phi = clamp(sph.phi + dPhi, controls.minPolarAngle, controls.maxPolarAngle);
    off.setFromSpherical(sph); camera.position.copy(controls.target).add(off); controls.autoRotate = false;
  }
  function dolly(k) {
    off.copy(camera.position).sub(controls.target);
    off.setLength(clamp(off.length() * (1 - k), controls.minDistance, controls.maxDistance)); camera.position.copy(controls.target).add(off);
  }

  /* ---------- UI ---------- */
  const toastEl = $('toast'); let toastT = 0;
  const toast = (msg, good) => { toastEl.textContent = msg; toastEl.className = 'toast show' + (good ? ' good' : ''); clearTimeout(toastT); toastT = setTimeout(() => toastEl.className = 'toast', 2600); };
  let wasComplete = null, padRow = 0;
  const builder = createBuilder({ scene, camera, dom, garage, toast, onChange: (changed) => refresh(changed) });

  await step(62, 'Photographing the parts…');
  const thumbs = await makeThumbs(renderer, envTex);

  const partsEl = $('parts');
  function refresh(changed) {
    const left = builder.remaining(), complete = builder.complete(), holding = builder.holding;
    $('left').textContent = complete ? 'all fitted' : left.length + ' of ' + INVENTORY.length + ' left';
    // one row per kind of part still on the shelf
    const kinds = [...new Set(left)];
    padRow = clamp(padRow, 0, Math.max(0, kinds.length - 1));
    partsEl.innerHTML = '';
    kinds.forEach((key, row) => {
      const n = left.filter(k => k === key).length, why = builder.lockReason(key), d = PART_DEFS[key];
      const li = document.createElement('li');
      li.className = 'part' + (why ? ' locked' : '') + (holding === key ? ' holding' : '') + (!builder.buildMode ? ' idle' : '') + (IN.kind === 'pad' && row === padRow ? ' focus' : '');
      li.dataset.key = key; li.title = d.desc;
      li.innerHTML = `<div class="thumb"><img alt="" src="${thumbs[key]}"></div><div class="pn"><b>${d.name}</b><small>${d.sub} · ${d.mass} kg</small>${why ? `<div class="why">${why}</div>` : ''}</div>${n > 1 ? `<span class="count">×${n}</span>` : ''}`;
      li.addEventListener('pointerdown', e => {
        if (e.button !== 0) return; if (e.pointerType === 'mouse') e.preventDefault(); uiTick();
        if (why) { toast(why); return; }
        if (builder.holding === key) { builder.cancelHolding(); return; }
        builder.startHolding(key, { drag: true }); controls.autoRotate = false;
      });
      partsEl.appendChild(li);
    });
    const f = partsEl.querySelector('.focus'); if (f) f.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('doneCard').hidden = !complete;
    const b = $('build'); b.classList.toggle('on', builder.buildMode);
    $('buildLbl').textContent = builder.buildMode ? 'Done' : 'Build';
    $('buildSub').textContent = builder.buildMode ? 'Leave build mode' : complete ? 'Change your car' : 'Bolt parts onto the frame';
    $('buildPad').innerHTML = IN.kind === 'pad' ? 'Press ' + padKey(B.Y) : '';
    $('goDrive').innerHTML = 'Test drive ' + (IN.kind === 'pad' ? padKey(B.MENU) : '<span>→</span>');
    const tab = $('tabDrive'); tab.classList.toggle('locked', !complete); tab.classList.toggle('ready', complete && !drive.active);
    tab.title = complete ? 'Take your car out' : 'Fit every part to unlock the test drive';
    hint(); stats(); frameGarage();
    if (wasComplete === false && complete && changed) { unlock(); toast('Car complete! Test drive unlocked', true); if (IN.kind === 'pad') pad.rumble(250, 0.5, 0.6); }
    wasComplete = complete;
  }
  // what to do next, said the way the player is playing
  function hint() {
    const h = $('hint'), placed = builder.placed, k = IN.kind, done = builder.complete();
    if (k === 'pad') {
      const P = padKey;
      if (builder.holding) h.innerHTML = `${P(B.A)} bolt it on · ${P(B.LB)} ${P(B.RB)} next spot · ${P(B.B)} put it back`;
      else if (done && !builder.buildMode) h.innerHTML = `Your car is built. ${P(B.MENU)} test drive · ${P(B.Y)} change it · right stick to look around`;
      else h.innerHTML = `${P(B.UP)}${P(B.DOWN)} choose a part, ${P(B.A)} pick it up · ${P(B.LB)}${P(B.RB)} choose a part on the car, ${P(B.X)} take it off · ${P(B.Y)} build mode · right stick look, ${P(B.LT)}${P(B.RT)} zoom` + (done ? ` · ${P(B.MENU)} test drive` : '');
    } else if (k === 'touch') {
      if (!builder.buildMode) h.innerHTML = done ? 'Your car is built. Tap <b>Test drive</b>, or <b>Build</b> to change it. Drag to look around, pinch to zoom.' : 'Tap <b>Build</b> or a part to start bolting your car together. Drag to look around, pinch to zoom.';
      else if (builder.holding) h.innerHTML = 'Tap a <b>glowing spot</b> to bolt it on. Tap the part in the list again to put it back.';
      else if (!placed.length) h.innerHTML = 'Start with the <b>Frame</b>: tap it, then tap the lift.';
      else h.innerHTML = 'Tap the next part. Tap a part on the car to take it off again.';
    } else {
      if (!builder.buildMode) h.innerHTML = done ? 'Your car is built. Open the <b>Test drive</b> tab, or press <b>Build</b> to change it. Drag to look around.' : 'Press <b>Build</b> (or pick a part on the right) to start bolting your car together. Drag to look around, scroll to zoom.';
      else if (builder.holding) h.innerHTML = 'Move the part onto a <b>glowing spot</b> and click to bolt it on. Right-click or <b>Esc</b> puts it back.';
      else if (!placed.length) h.innerHTML = 'Start with the <b>Frame</b>: pick it on the right and drop it on the lift.';
      else h.innerHTML = 'Pick the next part on the right. Click a part on the car to take it off again. Drag to look around.';
    }
  }
  function stats() {
    const sp = builder.spec(), placed = builder.placed;
    $('stats').innerHTML = placed.length ? `<div>Mass<b>${sp.mass} kg</b></div><div>Parts<b>${placed.length}/${INVENTORY.length}</b></div>` + (placed.some(p => p.key === 'engine') ? `<div>Power<b>${PART_DEFS.engine.power} hp</b></div>` : '') : '';
  }
  $('build').addEventListener('click', () => { uiTick(); builder.setBuildMode(!builder.buildMode); controls.autoRotate = false; });
  $('clear').addEventListener('click', stripCar);
  function stripCar() {
    if (!builder.placed.length) return;
    ask('Strip the car?', 'Every part comes off and goes back on the shelf.', 'Strip it', () => { builder.reset(); clank(1.6); });
  }
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (!$('modal').hidden) { if (e.key === 'Escape') closeModal(false); return; }
    if (e.code === 'KeyB' && !drive.active) { builder.setBuildMode(!builder.buildMode); }
    if (e.code === 'Tab') { e.preventDefault(); drive.active ? toGarage() : builder.complete() && toDrive(); }
  });
  const mute = $('mute'); const syncMute = () => mute.classList.toggle('off', isMuted()); syncMute();
  mute.addEventListener('click', () => { setMuted(!isMuted()); syncMute(); });
  window.addEventListener('pointerdown', () => audio(), { once: true });
  // the DeclAIre account: shared with Zombie City in this browser (same accounts, same Wix hub)
  try {
    const m = JSON.parse(localStorage.getItem('dcl_member') || 'null');
    if (m && m.username) { const a = $('acct'); a.classList.add('in'); a.querySelector('span').textContent = m.username; a.title = 'Signed in to your DeclAIre account'; }
    else $('acct').title = 'Sign in or create a DeclAIre account (the same one Zombie City uses)';
  } catch (e) { }

  /* ---------- a question box that works with a mouse, a finger or a controller ---------- */
  let modalCb = null;
  function ask(title, text, yes, cb) {
    $('modalT').textContent = title; $('modalP').textContent = text;
    $('modalYes').innerHTML = yes + (IN.kind === 'pad' ? ' ' + padKey(B.A) : '');
    $('modalNo').innerHTML = 'Cancel' + (IN.kind === 'pad' ? ' ' + padKey(B.B) : '');
    modalCb = cb; $('modal').hidden = false; $('modalNo').focus({ preventScroll: true });
  }
  function closeModal(yes) { $('modal').hidden = true; const cb = modalCb; modalCb = null; if (yes && cb) cb(); }
  $('modalYes').addEventListener('click', () => closeModal(true));
  $('modalNo').addEventListener('click', () => closeModal(false));
  $('modal').addEventListener('pointerdown', e => { if (e.target === $('modal')) closeModal(false); });

  /* ---------- test drive ---------- */
  await step(78, 'Laying out the test track…');
  const driveHud = $('driveHud');
  const hud = {
    update(s) { $('spd').textContent = Math.round(s.kmh); $('gear').textContent = s.gear === 'D' ? s.gearN : s.gear; $('rpm').style.width = Math.min(100, s.rpm / 70) + '%'; $('flipped').hidden = s.flippedFor < 2; },
    lock(on) { driveHud.classList.toggle('locked-aim', on); }
  };
  const drive = createDrive({ renderer, dom, hud, onExit: () => toGarage() });
  drive.scene.environment = envTex; drive.scene.environmentIntensity = 0.5;
  // the drive's controls and messages for the way the player is playing
  function driveLabels() {
    const k = IN.kind, P = padKey;
    $('keys').innerHTML = k === 'pad'
      ? `<span>${P(B.RT)} gas · ${P(B.LT)} brake / reverse</span><span>Left stick: steer</span><span>Right stick: aim · ${P(B.RB)} fire</span><span>${P(B.A)} handbrake · ${P(B.Y)} flip · ${P(B.B)} camera</span>`
      : '<span><kbd>W</kbd><kbd>S</kbd> drive / brake</span><span><kbd>A</kbd><kbd>D</kbd> steer</span><span><kbd>Space</kbd> handbrake</span><span><kbd>Mouse</kbd> aim · <kbd>Click</kbd> fire</span><span><kbd>R</kbd> flip upright</span>';
    $('flipped').innerHTML = 'On its roof? ' + (k === 'pad' ? 'Press ' + P(B.Y) : k === 'touch' ? 'Tap <b>Flip</b>' : 'Press <kbd>R</kbd>');
    $('back').innerHTML = '← Garage ' + (k === 'pad' ? P(B.VIEW) : '<small>Tab</small>');
  }
  function toDrive() {
    if (!builder.complete() || drive.active) return;
    uiTick(); builder.setBuildMode(false); controls.enabled = false;
    drive.start(builder.spec());
    document.body.classList.add('driving'); driveHud.hidden = false; driveLabels();
    $('tabDrive').classList.add('on'); $('tabDrive').classList.remove('ready'); $('tabGarage').classList.remove('on');
    $('tabDrive').setAttribute('aria-selected', 'true'); $('tabGarage').setAttribute('aria-selected', 'false');
    coreEmit('mode', 'drive'); resize();
  }
  function toGarage() {
    if (!drive.active) return;
    uiTick(); drive.stop(); controls.enabled = true;
    document.body.classList.remove('driving'); driveHud.hidden = true;
    $('tabGarage').classList.add('on'); $('tabDrive').classList.remove('on');
    $('tabGarage').setAttribute('aria-selected', 'true'); $('tabDrive').setAttribute('aria-selected', 'false');
    coreEmit('mode', 'garage'); refresh(); resize();
  }
  $('tabDrive').addEventListener('click', () => builder.complete() ? toDrive() : toast('Fit every part first: ' + builder.remaining().length + ' still on the shelf'));
  $('goDrive').addEventListener('click', toDrive);
  $('tabGarage').addEventListener('click', toGarage);
  $('back').addEventListener('click', toGarage);

  /* ---------- the controller in the garage ---------- */
  function padGarage(dt) {
    if (IN.kind !== 'pad' || !pad.connected) return;
    if (!$('modal').hidden) { if (pad.hit(B.A)) closeModal(true); else if (pad.hit(B.B)) closeModal(false); return; }
    const ls = pad.stick(0), rs = pad.stick(1);
    const tx = rs.x + ls.x, ty = rs.y + ls.y;
    if (tx || ty) orbit(tx * dt * 2.2, ty * dt * 1.5);
    const z = pad.value(B.RT) - pad.value(B.LT); if (Math.abs(z) > 0.05) dolly(z * dt * 1.6);
    if (pad.hit(B.MENU)) { if (builder.complete()) { toDrive(); return; } toast('Fit every part first: ' + builder.remaining().length + ' still on the shelf'); }
    if (pad.hit(B.Y)) { uiTick(); builder.setBuildMode(!builder.buildMode); }
    const kinds = [...new Set(builder.remaining())];
    if (builder.holding) {
      if (pad.hit(B.LB) || pad.hit(B.LEFT)) { builder.cycleSnap(-1); uiTick(); }
      if (pad.hit(B.RB) || pad.hit(B.RIGHT)) { builder.cycleSnap(1); uiTick(); }
      if (pad.hit(B.A)) { if (builder.placeHeld()) pad.rumble(90, 0.2, 0.45); }
      if (pad.hit(B.B)) builder.cancelHolding();
      if (pad.hit(B.UP) || pad.hit(B.DOWN)) { builder.cancelHolding(); padRow = clamp(padRow + (pad.hit(B.UP) ? -1 : 1), 0, Math.max(0, kinds.length - 1)); refresh(); }
      return;
    }
    if (pad.hit(B.UP) || pad.hit(B.DOWN)) { padRow = clamp(padRow + (pad.hit(B.UP) ? -1 : 1), 0, Math.max(0, kinds.length - 1)); uiTick(); refresh(); }
    if (pad.hit(B.A) && kinds[padRow]) {
      const key = kinds[padRow], why = builder.lockReason(key);
      if (why) toast(why); else builder.startHolding(key);
    }
    if (pad.hit(B.LB) || pad.hit(B.LEFT)) { builder.selectPlaced(-1); uiTick(); }
    if (pad.hit(B.RB) || pad.hit(B.RIGHT)) { builder.selectPlaced(1); uiTick(); }
    if (pad.hit(B.X)) { if (!builder.takeOffSelected()) toast('Choose a part on the car first with ' + glyph(B.LB) + ' / ' + glyph(B.RB)); }
    if (pad.hit(B.B) && builder.buildMode) builder.setBuildMode(false);
  }

  /* ---------- the input in use changed: swap every hint ---------- */
  onInputChange(kind => { refresh(); if (drive.active) driveLabels(); checkRotate(); if (kind === 'pad') audio(); });
  onPadChange(p => { if (p) toast((p.type === 'ps' ? 'PlayStation' : 'Xbox-style') + ' controller ready', true); refresh(); if (drive.active) driveLabels(); });

  /* ---------- phones: full screen, sideways, and the Android back button ---------- */
  const fs = $('fs');
  if (IN.mobile && !IN.app && document.documentElement.requestFullscreen) fs.hidden = false;
  fs.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => { }); }
    } catch (e) { }
  });
  function checkRotate() { $('rotate').hidden = !(drive.active && IN.kind === 'touch' && !IN.app && window.innerHeight > window.innerWidth); }
  window.rrBack = () => {
    if (!$('modal').hidden) { closeModal(false); return true; }
    if (drive.active) { toGarage(); return true; }
    if (builder.holding) { builder.cancelHolding(); return true; }
    if (builder.buildMode) { builder.setBuildMode(false); return true; }
    return false;
  };
  window.rrAppPause = () => pauseAudio();
  window.rrAppResume = () => resumeAudio();

  /* ---------- engines on the CORE hub ---------- */
  coreAdd({ name: 'GARAGE', does: 'The workshop, its lift, lamps and dust', kind: 'render', provides: ['garage'], check: () => scene.children.length ? '' : 'the garage is empty' });
  coreAdd({ name: 'BUILDER', does: 'Build mode: parts, sockets, snapping, the saved car', kind: 'sim', needs: ['GARAGE'], provides: ['car'],
    selfTest() { const r = builder.remaining(); return { ok: Array.isArray(r), why: 'remaining() broke' }; } });
  coreAdd({ name: 'DRIVE', does: 'The test drive: raycast-vehicle physics, 4WD, the gun', kind: 'sim', needs: ['BUILDER'], provides: ['vehicle'],
    check: () => drive.active && drive.car && !isFinite(drive.car.body.position.y) ? 'the car left the world' : '', repair: () => drive.resetCar() });
  coreAdd({ name: 'INPUT', does: 'Keyboard and mouse, touch or a controller, whichever was used last', kind: 'sim', provides: ['input'] });
  coreAdd({ name: 'PERF', does: 'Keeps the frame rate up: steps the resolution down when frames run late, back up when there is room', kind: 'render', provides: ['quality'] });
  coreAdd({ name: 'TEXEL', does: 'Paints every surface in code', kind: 'render', provides: ['textures'] });
  coreAdd({ name: 'SFX', does: 'Synthesised clanks, bolts, engine and gun', kind: 'audio', provides: ['sound'] });

  /* ---------- loop ---------- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false);
    camera.aspect = w / h; frameGarage(); drive.resize(w, h); checkRotate();
  }
  // keep the car in the middle of the space the parts panel leaves free, and see more of it on a tall screen
  function frameGarage() {
    const w = window.innerWidth, h = window.innerHeight, r = $('panel').getBoundingClientRect();
    let ox = 0, oy = 0;
    if (r.width && r.left > w * 0.5) ox = (w - r.left) / 2;                       // panel down the right side
    else if (r.height && r.top > h * 0.3) oy = Math.max(0, (h - r.top - 52) / 2);  // panel along the bottom
    camera.setViewOffset(w, h, ox, oy, w, h);
    camera.fov = w / h < 1 ? 48 + (1 - w / h) * 34 : 48;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();
  // the frame-rate governor: 3 slow seconds in a row step the resolution down, 10 smooth ones step it back up
  let perfT = 0, slow = 0, smooth = 0;
  function govern(now) {
    if (window.RR_TEST || now - perfT < 1000) return; perfT = now;
    const fps = CORE.fps; if (!fps) return;
    if (fps < 42) { smooth = 0; if (++slow >= 3 && ratio > 0.75) { ratio = Math.max(0.75, ratio - 0.25); renderer.setPixelRatio(ratio); resize(); slow = 0; coreLog('PERF: resolution down to ' + ratio + 'x (' + fps + ' fps)'); } }
    else if (fps > 56) { slow = 0; if (++smooth >= 10 && ratio < bestRatio) { ratio = Math.min(bestRatio, ratio + 0.25); renderer.setPixelRatio(ratio); resize(); smooth = 0; } }
    else slow = smooth = 0;
  }
  refresh();
  await step(100, 'Ready.');
  setTimeout(() => $('boot').classList.add('gone'), 150);
  const clock = new THREE.Clock(); let tAll = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta()); tAll += dt;
    const t0 = performance.now();
    pollPad();
    if (drive.active) {
      try { drive.update(dt); } catch (e) { coreHurt('DRIVE', e); console.error(e); }
      coreCost('DRIVE', performance.now() - t0);
      if (drive.active) renderer.render(drive.scene, drive.camera);
    } else {
      try { padGarage(dt); } catch (e) { coreHurt('INPUT', e); console.error(e); }
      builder.update(dt); garage.dust(tAll);
      const ty = builder.carHeight() + 0.75; controls.target.y += (ty - controls.target.y) * Math.min(1, dt * 3);
      controls.update(dt);
      coreCost('BUILDER', performance.now() - t0);
      renderer.render(scene, camera);
    }
    const now = performance.now(); coreTick(now); govern(now);
  });

  // test hooks (used by the automated checks; harmless otherwise)
  window.RR = { builder, drive, toDrive, toGarage, camera, controls, renderer, refresh, IN, core: () => coreStatus(), ratio: () => ratio };
}

// a small picture of each part for the panel, lit like a catalogue shot
async function makeThumbs(renderer, envTex) {
  const out = {}, W = 228, H = 171;
  const scene = new THREE.Scene(); scene.environment = envTex; scene.environmentIntensity = 0.9;
  scene.add(new THREE.HemisphereLight(0xe8eef5, 0x4a4036, 2.2));
  const key = new THREE.DirectionalLight(0xfff0dc, 3.4); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.6); rim.position.set(-4, 2, -3); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  const px = new Uint8Array(W * H * 4), img = ctx.createImageData(W, H);
  for (const k of Object.keys(PART_DEFS)) {
    const o = buildPart(k); scene.add(o);
    const box = new THREE.Box3().setFromObject(o), ctr = box.getCenter(new THREE.Vector3());
    const r = box.getBoundingSphere(new THREE.Sphere()).radius;
    const dir = k.startsWith('wheel') ? new THREE.Vector3(1.4, 0.5, 0.9) : k === 'frame' ? new THREE.Vector3(1.6, 1.1, 1.0) : new THREE.Vector3(1.1, 0.75, 1.3);
    cam.position.copy(ctr).addScaledVector(dir.normalize(), r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 0.82); cam.lookAt(ctr);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    ctx.clearRect(0, 0, W, H); ctx.putImageData(img, 0, 0); out[k] = c.toDataURL('image/png');
    scene.remove(o);
    await new Promise(r => setTimeout(r, 0));
  }
  renderer.setRenderTarget(null); rt.dispose();
  return out;
}

boot().catch(e => { console.error(e); bootMsg.textContent = 'Something broke while opening the garage: ' + (e && e.message || e); });

// RiversOfRust: the game's start-up and its loop. The garage (build mode) and the test drive share one renderer;
// each is an engine registered with CORE, the same hub Zombie City's engines plug into.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VERSION, PART_DEFS, INVENTORY } from './config.js';
import { buildGarage } from './garage.js';
import { createBuilder } from './builder.js';
import { createDrive } from './drive.js';
import { buildPart } from './parts.js';
import { mats } from './materials.js';
import { clank, uiTick, unlock, setMuted, isMuted, audio } from './audio.js';

const $ = id => document.getElementById(id);
const bootBar = $('bootBar'), bootMsg = $('bootMsg');
const step = (pct, msg) => { bootBar.style.width = pct + '%'; bootMsg.textContent = msg; return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); };
$('ver').textContent = VERSION;

async function boot() {
  /* ---------- renderer ---------- */
  await step(8, 'Warming up the lamps…');
  const dom = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas: dom, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!window.RR_TEST });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
  controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  /* ---------- UI ---------- */
  const toastEl = $('toast'); let toastT = 0;
  const toast = (msg, good) => { toastEl.textContent = msg; toastEl.className = 'toast show' + (good ? ' good' : ''); clearTimeout(toastT); toastT = setTimeout(() => toastEl.className = 'toast', 2600); };
  let wasComplete = null;
  const builder = createBuilder({ scene, camera, dom, garage, toast, onChange: (changed) => refresh(changed) });

  await step(62, 'Photographing the parts…');
  const thumbs = await makeThumbs(renderer, envTex);

  const partsEl = $('parts');
  function refresh(changed) {
    const left = builder.remaining(), complete = builder.complete(), holding = builder.holding;
    $('left').textContent = complete ? 'all fitted' : left.length + ' of ' + INVENTORY.length + ' left';
    // one row per kind of part still on the shelf
    const kinds = [...new Set(left)];
    partsEl.innerHTML = '';
    for (const key of kinds) {
      const n = left.filter(k => k === key).length, why = builder.lockReason(key), d = PART_DEFS[key];
      const li = document.createElement('li');
      li.className = 'part' + (why ? ' locked' : '') + (holding === key ? ' holding' : '') + (!builder.buildMode ? ' idle' : '');
      li.dataset.key = key; li.title = d.desc;
      li.innerHTML = `<div class="thumb"><img alt="" src="${thumbs[key]}"></div><div class="pn"><b>${d.name}</b><small>${d.sub} · ${d.mass} kg</small>${why ? `<div class="why">${why}</div>` : ''}</div>${n > 1 ? `<span class="count">×${n}</span>` : ''}`;
      li.addEventListener('pointerdown', e => {
        if (e.button !== 0) return; e.preventDefault(); uiTick();
        if (why) { toast(why); return; }
        if (builder.holding === key) { builder.cancelHolding(); return; }
        builder.startHolding(key, { drag: true }); controls.autoRotate = false;
      });
      partsEl.appendChild(li);
    }
    $('doneCard').hidden = !complete;
    const b = $('build'); b.classList.toggle('on', builder.buildMode);
    $('buildLbl').textContent = builder.buildMode ? 'Done' : 'Build';
    $('buildSub').textContent = builder.buildMode ? 'Leave build mode' : complete ? 'Change your car' : 'Bolt parts onto the frame';
    const tab = $('tabDrive'); tab.classList.toggle('locked', !complete); tab.classList.toggle('ready', complete && !drive.active);
    tab.title = complete ? 'Take your car out' : 'Fit every part to unlock the test drive';
    hint(); stats();
    if (wasComplete === false && complete && changed) { unlock(); toast('Car complete! Test drive unlocked', true); }
    wasComplete = complete;
  }
  function hint() {
    const h = $('hint'), placed = builder.placed;
    if (!builder.buildMode) h.innerHTML = builder.complete() ? 'Your car is built. Open the <b>Test drive</b> tab, or press <b>Build</b> to change it. Drag to look around.' : 'Press <b>Build</b> (or pick a part on the right) to start bolting your car together. Drag to look around, scroll to zoom.';
    else if (builder.holding) h.innerHTML = 'Move the part onto a <b>glowing spot</b> and click to bolt it on. Right-click or <b>Esc</b> puts it back.';
    else if (!placed.length) h.innerHTML = 'Start with the <b>Frame</b>: pick it on the right and drop it on the lift.';
    else h.innerHTML = 'Pick the next part on the right. Click a part on the car to take it off again. Drag to look around.';
  }
  function stats() {
    const sp = builder.spec(), placed = builder.placed;
    $('stats').innerHTML = placed.length ? `<div>Mass<b>${sp.mass} kg</b></div><div>Parts<b>${placed.length}/${INVENTORY.length}</b></div>` + (placed.some(p => p.key === 'engine') ? `<div>Power<b>${PART_DEFS.engine.power} hp</b></div>` : '') : '';
  }
  $('build').addEventListener('click', () => { uiTick(); builder.setBuildMode(!builder.buildMode); controls.autoRotate = false; });
  $('clear').addEventListener('click', () => { if (!builder.placed.length) return; if (confirm('Take every part off the car and put it back on the shelf?')) { builder.reset(); clank(1.6); } });
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
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

  /* ---------- test drive ---------- */
  await step(78, 'Laying out the test track…');
  const driveHud = $('driveHud');
  const hud = {
    update(s) { $('spd').textContent = Math.round(s.kmh); $('gear').textContent = s.gear === 'D' ? s.gearN : s.gear; $('rpm').style.width = Math.min(100, s.rpm / 70) + '%'; $('flipped').hidden = s.flippedFor < 2; },
    lock(on) { driveHud.classList.toggle('locked-aim', on); }
  };
  const drive = createDrive({ renderer, dom, hud });
  drive.scene.environment = envTex; drive.scene.environmentIntensity = 0.5;
  function toDrive() {
    if (!builder.complete() || drive.active) return;
    uiTick(); builder.setBuildMode(false); controls.enabled = false;
    drive.start(builder.spec());
    document.body.classList.add('driving'); driveHud.hidden = false;
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

  /* ---------- engines on the CORE hub ---------- */
  coreAdd({ name: 'GARAGE', does: 'The workshop, its lift, lamps and dust', kind: 'render', provides: ['garage'], check: () => scene.children.length ? '' : 'the garage is empty' });
  coreAdd({ name: 'BUILDER', does: 'Build mode: parts, sockets, snapping, the saved car', kind: 'sim', needs: ['GARAGE'], provides: ['car'],
    selfTest() { const r = builder.remaining(); return { ok: Array.isArray(r), why: 'remaining() broke' }; } });
  coreAdd({ name: 'DRIVE', does: 'The test drive: raycast-vehicle physics, 4WD, the gun', kind: 'sim', needs: ['BUILDER'], provides: ['vehicle'],
    check: () => drive.active && drive.car && !isFinite(drive.car.body.position.y) ? 'the car left the world' : '', repair: () => drive.resetCar() });
  coreAdd({ name: 'TEXEL', does: 'Paints every surface in code', kind: 'render', provides: ['textures'] });
  coreAdd({ name: 'SFX', does: 'Synthesised clanks, bolts, engine and gun', kind: 'audio', provides: ['sound'] });

  /* ---------- loop ---------- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix(); drive.resize(w, h);
  }
  window.addEventListener('resize', resize); resize();
  refresh();
  await step(100, 'Ready.');
  setTimeout(() => $('boot').classList.add('gone'), 150);
  const clock = new THREE.Clock(); let tAll = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta()); tAll += dt;
    const t0 = performance.now();
    if (drive.active) {
      try { drive.update(dt); } catch (e) { coreHurt('DRIVE', e); console.error(e); }
      coreCost('DRIVE', performance.now() - t0);
      renderer.render(drive.scene, drive.camera);
    } else {
      builder.update(dt); garage.dust(tAll);
      const ty = builder.carHeight() + 0.75; controls.target.y += (ty - controls.target.y) * Math.min(1, dt * 3);
      controls.update(dt);
      coreCost('BUILDER', performance.now() - t0);
      renderer.render(scene, camera);
    }
    coreTick(performance.now());
  });

  // test hooks (used by the automated checks; harmless otherwise)
  window.RR = { builder, drive, toDrive, toGarage, camera, controls, renderer, refresh, core: () => coreStatus() };
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

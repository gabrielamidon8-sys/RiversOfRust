// BUILDER for RiversOfRust: build mode in the garage. Pick a part from the panel, and every spot it can bolt onto
// glows; move near one and the part snaps there (green); click to bolt it on. Click a part on the car to take it off
// again (with anything bolted to it). Right-click or Esc puts the part you're holding back in the panel.
import * as THREE from 'three';
import { U, LIFT_BUILD, WHEEL } from './config.js';
import { buildPart } from './parts.js';
import * as A from './assembly.js';
import { clank, pickup } from './audio.js';

const ON_WHEELS = WHEEL.radius - (0.5 * U - WHEEL.drop);   // frame underside height when the car stands on its wheels
const SNAP_PX = 170;

export function createBuilder({ scene, camera, dom, garage, onChange, toast }) {
  const carRoot = new THREE.Group(); carRoot.name = 'car'; scene.add(carRoot);
  let placed = [], nextUid = 1, buildMode = false, holding = null, hover = null, mouse = { x: -1e4, y: -1e4, in: false };
  let carY = 0.55, liftY = 0.55;
  const anims = [];
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

  /* ---------- saved car ---------- */
  try { placed = A.deserialize(localStorage.getItem('rr_build') || '[]'); } catch (e) { placed = []; }
  for (const p of placed) { p.obj = makePart(p); nextUid = Math.max(nextUid, p.uid + 1); }
  const save = () => { try { localStorage.setItem('rr_build', A.serialize(placed)); } catch (e) { } };

  function makePart(p) {
    const o = buildPart(p.key); o.userData.uid = p.uid; o.userData.key = p.key;
    put(o, p.socket); carRoot.add(o); return o;
  }
  function put(o, socket) {
    const t = A.socketTransform(socket, placed);
    o.position.set(t.pos[0], t.pos[1], t.pos[2]); o.rotation.set(0, t.rotY, 0);
  }

  /* ---------- the glow on free spots ---------- */
  const markers = new THREE.Group(); carRoot.add(markers);
  const mkMat = () => new THREE.MeshBasicMaterial({ color: 0x3fd4ff, transparent: true, opacity: 0.25, depthWrite: false });
  const edgeMat = () => new THREE.LineBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.9 });
  function region(socket) {
    const [k, a] = socket.split(':');
    if (k === 'lift') return { id: 'lift', size: [4 * U, 0.03, 12 * U], pos: [0, 0.02, 0] };
    if (k === 'deck') return { id: 'deck', size: [4 * U, 0.03, 8 * U], pos: [0, 2 * U + 0.02, -2 * U] };
    if (k === 'well') return { id: 'well', size: [2.8 * U, 0.03, 3.6 * U], pos: [0, 0.5 * U + 0.02, 4 * U] };
    if (k === 'mount') { const t = A.socketTransform(socket, placed); return { id: socket, size: [0.03, U, 2 * U], pos: [t.pos[0] + t.side * 0.005, t.pos[1], t.pos[2]] }; }
    if (k === 'roof') { const t = A.socketTransform('roof:0', placed); return { id: 'roof', size: [4 * U, 0.03, 2 * U], pos: [0, t.pos[1] + 0.02, t.pos[2]] }; }
  }
  function showMarkers(key) {
    clearMarkers(); if (!key) return;
    const seen = {};
    for (const s of A.freeSockets(key, placed)) {
      const r = region(s); if (seen[r.id]) continue; seen[r.id] = 1;
      const geo = new THREE.BoxGeometry(...r.size), mesh = new THREE.Mesh(geo, mkMat());
      mesh.position.set(...r.pos); mesh.userData.region = r.id; mesh.renderOrder = 5;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat()); mesh.add(edges);
      markers.add(mesh);
    }
  }
  function clearMarkers() { for (const c of markers.children.slice()) { c.geometry.dispose(); c.material.dispose(); c.children[0].geometry.dispose(); c.children[0].material.dispose(); markers.remove(c); } }

  /* ---------- holding a part ---------- */
  function ghostOf(key) {
    const o = buildPart(key), mat = new THREE.MeshStandardMaterial({ color: 0x55ff9a, emissive: 0x1b8f4a, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, roughness: 0.4, depthWrite: false });
    o.traverse(c => { if (c.isMesh) { c.material = mat; c.castShadow = false; c.renderOrder = 6; } });
    o.userData.ghostMat = mat; return o;
  }
  function startHolding(key, opts = {}) {
    if (!buildMode) setBuildMode(true);
    if (holding) cancelHolding(true);
    if (!A.remaining(placed).includes(key)) return false;
    const why = A.lockReason(key, placed); if (why) { toast(why); return false; }
    const g = ghostOf(key); g.visible = false; carRoot.add(g);
    // the part starts on the most likely free spot (steering wheels at the front, drive wheels at the back), so on a
    // phone or a controller you see where it goes straight away; the mouse takes over as soon as it moves
    holding = { key, ghost: g, snap: preferred(key, A.freeSockets(key, placed)), drag: !!opts.drag, manual: true };
    selIdx = -1; setHover(null);
    showMarkers(key); pickup(); showSnap(); onChange(); return true;
  }
  function preferred(key, free) {
    const want = { body: ['deck:-1'], turret: ['roof:0'], wheelS: ['mount:FL', 'mount:FR'], wheelD: ['mount:RL', 'mount:RR'] }[key] || [];
    return want.find(w => free.includes(w)) || free[0] || null;
  }
  // put the ghost on the chosen spot (or hide it) and light that spot's marker green
  function showSnap() {
    if (!holding) return;
    const g = holding.ghost, s = holding.snap;
    carRoot.updateMatrixWorld();
    if (s) { put(g, s); g.visible = true; g.userData.ghostMat.color.set(0x55ff9a); g.userData.ghostMat.emissive.set(0x1b8f4a); g.userData.ghostMat.opacity = 0.6; }
    else g.visible = false;
    paintMarkers(s);
  }
  function paintMarkers(s) {
    for (const mk of markers.children) {
      const on = s && region(s).id === mk.userData.region;
      mk.material.color.set(on ? 0x55ff9a : 0x3fd4ff); mk.children[0].material.color.set(on ? 0xb4ffd0 : 0x8fe8ff);
    }
  }
  // controller: the next free spot for the part in hand
  function cycleSnap(dir) {
    if (!holding) return;
    const free = A.freeSockets(holding.key, placed); if (!free.length) return;
    const i = free.indexOf(holding.snap), n = free.length;
    holding.snap = free[i < 0 ? 0 : ((i + dir) % n + n) % n]; holding.manual = true; showSnap();
  }
  // controller: step through the parts on the car, then take the chosen one off
  let selIdx = -1;
  function selectPlaced(dir) {
    if (holding || !placed.length) return;
    const n = placed.length; selIdx = selIdx < 0 ? (dir > 0 ? 0 : n - 1) : ((selIdx + dir) % n + n) % n;
    setHover(placed[selIdx].obj);
  }
  function takeOffSelected() { const p = placed[selIdx]; selIdx = -1; if (!p) return false; takeOff(p.uid); return true; }
  function cancelHolding(silent) {
    if (!holding) return;
    carRoot.remove(holding.ghost); holding.ghost.traverse(c => c.geometry && c.geometry.dispose());
    holding = null; clearMarkers(); if (!silent) { pickup(); onChange(); }
  }
  // the candidate spot nearest the pointer on screen
  const v = new THREE.Vector3();
  function anchor(key, socket) {
    const t = A.socketTransform(socket, placed);
    const off = { frame: [0, U, 0], body: [0, 1.5 * U, 0], engine: [0, 0.4, 0], turret: [0, 0.3, 0] }[key] || [t.side * 0.25, -WHEEL.drop, 0];
    return v.set(t.pos[0] + off[0], t.pos[1] + off[1], t.pos[2] + off[2]).applyMatrix4(carRoot.matrixWorld);
  }
  function nearest(key) {
    const r = dom.getBoundingClientRect(); let best = null, bd = SNAP_PX;
    if (!mouse.in) return null;
    for (const s of A.freeSockets(key, placed)) {
      const p = anchor(key, s).project(camera);
      if (p.z > 1) continue;
      const sx = (p.x + 1) / 2 * r.width, sy = (1 - p.y) / 2 * r.height, d = Math.hypot(sx - mouse.x, sy - mouse.y);
      if (d < bd || key === 'frame') { bd = d; best = s; }
    }
    return best;
  }
  function updateGhost() {
    if (!holding) return;
    if (holding.manual) return showSnap();
    carRoot.updateMatrixWorld();
    const s = nearest(holding.key), g = holding.ghost;
    holding.snap = s;
    if (s) { put(g, s); g.visible = true; g.userData.ghostMat.color.set(0x55ff9a); g.userData.ghostMat.emissive.set(0x1b8f4a); g.userData.ghostMat.opacity = 0.6; }
    else if (mouse.in) {
      // float under the pointer, at the height of the car
      const r = dom.getBoundingClientRect(); ndc.set(mouse.x / r.width * 2 - 1, -(mouse.y / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(carY + 0.9)), hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, hit)) { carRoot.worldToLocal(hit); g.position.copy(hit); g.rotation.set(0, 0, 0); g.visible = true; }
      g.userData.ghostMat.color.set(0xff8a3d); g.userData.ghostMat.emissive.set(0x7a2a00); g.userData.ghostMat.opacity = 0.35;
    } else g.visible = false;
    paintMarkers(s);
  }
  function placeHeld() {
    if (!holding || !holding.snap) return false;
    const p = { uid: nextUid++, key: holding.key, socket: holding.snap };
    const key = holding.key; cancelHolding(true);
    placed.push(p); p.obj = makePart(p);
    // drop it in: wheels slide on from outside, everything else comes down from above
    const to = p.obj.position.clone(), t = A.socketTransform(p.socket, placed);
    const from = key.startsWith('wheel') ? to.clone().add(new THREE.Vector3(t.side * 0.45, 0.05, 0)) : to.clone().add(new THREE.Vector3(0, key === 'frame' ? 1.2 : 0.5, 0));
    p.obj.position.copy(from); anims.push({ o: p.obj, from, to, t: 0, dur: key === 'frame' ? 0.45 : 0.24, done: () => clank(key === 'frame' || key === 'body' ? 1.6 : key.startsWith('wheel') ? 0.7 : 1) });
    save(); onChange(true);
    // keep going: pick up the next of the same part straight away (the second wheel of a pair)
    if (A.remaining(placed).includes(key) && key.startsWith('wheel')) setTimeout(() => { if (!holding && buildMode) startHolding(key); }, 60);
    return true;
  }
  function takeOff(uid) {
    const list = A.dependents(placed, uid); if (!list.length) return;
    const main = placed.find(p => p.uid === uid);
    for (const p of list) { carRoot.remove(p.obj); placed = placed.filter(q => q !== p); }
    // anything that rode on a moved part (the turret on the body) goes back to the panel
    save(); hover = null; setHover(null);
    startHolding(main.key);
    if (list.length > 1) toast(list.length - 1 === 1 ? 'The part bolted to it went back on the shelf' : (list.length - 1) + ' parts bolted to it went back on the shelf');
    onChange(true);
  }

  /* ---------- hover outline on parts already on the car ---------- */
  const outline = new THREE.BoxHelper(new THREE.Object3D(), 0xffa040); outline.visible = false; outline.material.depthTest = false; outline.renderOrder = 7; scene.add(outline);
  function setHover(o) { hover = o; if (o) { outline.setFromObject(o); outline.visible = true; } else outline.visible = false; dom.style.cursor = o ? 'pointer' : holding ? 'crosshair' : ''; }
  function pickAt() {
    const r = dom.getBoundingClientRect(); ndc.set(mouse.x / r.width * 2 - 1, -(mouse.y / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const objs = placed.map(p => p.obj); const hits = ray.intersectObjects(objs, true);
    for (const h of hits) { let o = h.object; while (o && o.userData.uid === undefined) o = o.parent; if (o) return o; }
    return null;
  }

  /* ---------- pointer: mouse, finger or pen ---------- */
  let down = null;
  const at = e => { const r = dom.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
  dom.addEventListener('pointermove', e => {
    // a finger dragging on the car is turning the camera, not moving the part
    if (e.pointerType !== 'mouse') return;
    at(e); mouse.in = true;
    if (!buildMode) return;
    if (holding) { holding.manual = false; updateGhost(); } else { selIdx = -1; setHover(pickAt()); }
  });
  dom.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse') return; mouse.in = false; if (holding && !holding.manual) updateGhost(); });
  dom.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button, touch: e.pointerType !== 'mouse' }; });
  dom.addEventListener('pointerup', e => {
    if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), quick = performance.now() - down.t < 450, b = down.b, touch = down.touch; down = null;
    if (!buildMode || moved > (touch ? 14 : 6) || !quick) return;
    if (b === 2) { if (holding) cancelHolding(); return; }
    if (b !== 0) return;
    at(e); mouse.in = true;
    if (holding) {
      // a click or a tap bolts the part to the glowing spot nearest to it
      carRoot.updateMatrixWorld();
      const s = nearest(holding.key);
      if (s) { holding.snap = s; placeHeld(); }
      else toast(touch ? 'Tap one of the glowing spots to bolt it on' : 'Move it onto a glowing spot to bolt it on');
      if (touch) mouse.in = false;
    } else { const o = pickAt(); if (o) takeOff(o.userData.uid); if (touch) mouse.in = false; }
  });
  dom.addEventListener('contextmenu', e => e.preventDefault());
  // dragging a part in from the panel and letting go over the car (a finger stays captured by the panel, so look at
  // what is under it instead of at the event's target)
  const overCar = e => document.elementFromPoint(e.clientX, e.clientY) === dom;
  window.addEventListener('pointermove', e => {
    if (!holding || !holding.drag) return;
    at(e); mouse.in = overCar(e);
    if (mouse.in) holding.manual = false;
    if (!holding.manual) updateGhost();
  });
  window.addEventListener('pointerup', e => {
    if (!holding || !holding.drag) return;
    holding.drag = false;
    if (overCar(e) && !holding.manual && holding.snap) placeHeld();
    if (e.pointerType !== 'mouse') { mouse.in = false; if (holding && !holding.manual) { holding.manual = true; holding.snap = holding.snap || preferred(holding.key, A.freeSockets(holding.key, placed)); showSnap(); } }
  });
  // a finger that started on the parts list and turned into a scroll: the part stays in hand, nothing follows it
  window.addEventListener('pointercancel', () => { if (holding && holding.drag) { holding.drag = false; holding.manual = true; showSnap(); } });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && holding && !document.querySelector('.modal:not([hidden])')) cancelHolding(); });

  /* ---------- modes ---------- */
  function setBuildMode(b) {
    if (buildMode === b) return; buildMode = b;
    if (!b) { cancelHolding(true); setHover(null); }
    onChange();
  }
  function reset() { cancelHolding(true); for (const p of placed) carRoot.remove(p.obj); placed = []; save(); onChange(true); }

  /* ---------- every frame ---------- */
  let pulse = 0;
  function update(dt) {
    const complete = A.complete(placed);
    // only the lift moves; the car rides on it, or stands on its wheels once the lift drops below it
    const wantLift = buildMode ? LIFT_BUILD : complete ? 0.16 : 0.55;
    const d = wantLift - liftY, step = Math.sign(d) * Math.min(Math.abs(d), dt * (0.25 + Math.abs(d) * 1.8));
    liftY += step;
    carY = complete && placed.some(p => p.key.startsWith('wheel')) ? Math.max(ON_WHEELS, liftY) : liftY;
    if (!placed.length) carY = liftY;
    carRoot.position.y = carY; garage.lift.set(liftY);
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i]; a.t += dt; const k = Math.min(1, a.t / a.dur), e = k * k;
      a.o.position.lerpVectors(a.from, a.to, e);
      if (k >= 1) { a.o.position.copy(a.to); anims.splice(i, 1); a.done && a.done(); if (hover) outline.setFromObject(hover); }
    }
    pulse += dt;
    for (const mk of markers.children) { mk.material.opacity = 0.18 + Math.sin(pulse * 5) * 0.08; mk.children[0].material.opacity = 0.65 + Math.sin(pulse * 5) * 0.3; }
    if (holding && mouse.in && !holding.snap && !holding.manual) updateGhost();
    if (hover) outline.setFromObject(hover);
  }

  return {
    carRoot, update, startHolding, cancelHolding, setBuildMode, reset, placeHeld, cycleSnap, selectPlaced, takeOffSelected,
    get selected() { return selIdx >= 0 && placed[selIdx] ? placed[selIdx].key : null; },
    get buildMode() { return buildMode; }, get holding() { return holding && holding.key; },
    get placed() { return placed.map(p => ({ uid: p.uid, key: p.key, socket: p.socket })); },
    settle(secs) { for (let i = 0; i < secs * 60; i++) update(1 / 60); },
    remaining: () => A.remaining(placed), lockReason: key => A.lockReason(key, placed), complete: () => A.complete(placed),
    spec: () => A.vehicleSpec(placed), carHeight: () => carY,
    // for tests: put every remaining part in its first free spot
    autoBuild() { for (const key of A.remaining(placed)) { const s = A.freeSockets(key, placed); if (!s.length) continue; const sock = key === 'body' ? (s.includes('deck:-1') ? 'deck:-1' : s[0]) : key === 'turret' ? (s.includes('roof:0') ? 'roof:0' : s[0]) : s[0]; const p = { uid: nextUid++, key, socket: sock }; placed.push(p); p.obj = makePart(p); } save(); onChange(true); },
    // for tests: where a free socket for this part is on screen
    screenOf(key, socket) { carRoot.updateMatrixWorld(); const r = dom.getBoundingClientRect(), p = anchor(key, socket).project(camera); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; }
  };
}

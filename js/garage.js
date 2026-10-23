// The garage: a rusted workshop with a scissor lift in the middle, lamps over it, and the junk of a mechanic's life
// around the walls. Everything is built in code.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { concreteTex, corrugatedTex, hazardTex, plankTex, rustPaintTex, rubberTex } from './materials.js';

const ROOM = { w: 17, d: 15, h: 6.2 };
function m(geo, mat, x, y, z, parent, shadow = true) { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o; }
const rb = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));

function textCanvas(lines, w, h, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  for (const L of lines) {
    x.font = L.font; x.fillStyle = L.color; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (L.stroke) { x.lineWidth = L.stroke; x.strokeStyle = L.strokeColor || '#000'; x.strokeText(L.text, w / 2, L.y); }
    x.fillText(L.text, w / 2, L.y);
  }
  // weather it: knock random chips out of the paint
  const img = x.getImageData(0, 0, w, h), d = img.data;
  let s = 7; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && r() < (opts.wear || 0.12)) d[i + 3] *= r() * 0.6;
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function buildGarage(scene) {
  const G = new THREE.Group(); G.name = 'garage'; scene.add(G);
  const conc = concreteTex();
  // floor
  const floorMat = new THREE.MeshStandardMaterial({ map: conc.color, bumpMap: conc.bump, bumpScale: 0.6, roughness: 0.82, metalness: 0.02 });
  const floor = m(new THREE.PlaneGeometry(ROOM.w, ROOM.d), floorMat, 0, 0, 0, G); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
  // hazard border around the lift bay
  const hz = hazardTex(); hz.wrapS = hz.wrapT = THREE.RepeatWrapping;
  const strip = (len, x, z, rot) => {
    const t = hz.clone(); t.needsUpdate = true; t.repeat.set(len / 0.6, 1);
    const o = m(new THREE.PlaneGeometry(len, 0.16), new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 }), x, 0.003, z, G, false);
    o.rotation.x = -Math.PI / 2; o.rotation.z = rot;
  };
  strip(4.6, 0, 3.4, 0); strip(4.6, 0, -3.4, 0); strip(6.96, 2.3, 0, Math.PI / 2); strip(6.96, -2.3, 0, Math.PI / 2);
  // walls: corrugated sheet on two sides, block wall with a painted sign at the back, a roller door at the front
  const corr = corrugatedTex();
  const wallMat = (rep) => { const c = corr.color.clone(), b = corr.bump.clone(); c.needsUpdate = b.needsUpdate = true; c.repeat.set(rep, 1); b.repeat.set(rep, 1); return new THREE.MeshStandardMaterial({ map: c, bumpMap: b, bumpScale: 1.2, roughness: 0.7, metalness: 0.55, side: THREE.DoubleSide }); };
  const left = m(new THREE.PlaneGeometry(ROOM.d, ROOM.h), wallMat(4), -ROOM.w / 2, ROOM.h / 2, 0, G); left.rotation.y = Math.PI / 2;
  const right = m(new THREE.PlaneGeometry(ROOM.d, ROOM.h), wallMat(4), ROOM.w / 2, ROOM.h / 2, 0, G); right.rotation.y = -Math.PI / 2;
  const blockT = rustPaintTex('#6d6a62', 0.08, 44, 512); const bt = blockT.color.clone(); bt.needsUpdate = true; bt.repeat.set(5, 2);
  const back = m(new THREE.PlaneGeometry(ROOM.w, ROOM.h), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.9, metalness: 0.05 }), 0, ROOM.h / 2, -ROOM.d / 2, G);
  // block courses scored into the back wall
  for (let y = 0.4; y < ROOM.h; y += 0.4) m(new THREE.BoxGeometry(ROOM.w, 0.012, 0.01), new THREE.MeshStandardMaterial({ color: 0x3d3b37, roughness: 1 }), 0, y, -ROOM.d / 2 + 0.006, G, false);
  const sign = textCanvas([
    { text: 'RIVERS OF RUST', y: 120, font: '900 150px Impact, "Arial Black", sans-serif', color: '#c4561e', stroke: 6, strokeColor: '#2a1508' },
    { text: 'SALVAGE · FAB · REPAIR', y: 250, font: '700 64px Impact, "Arial Black", sans-serif', color: '#d9c9a4' },
    { text: 'DECLAIRE STUDIOS', y: 330, font: '700 40px "Courier New", monospace', color: '#9c9184' }
  ], 1400, 380, { wear: 0.16 });
  const sg = m(new THREE.PlaneGeometry(7, 1.9), new THREE.MeshStandardMaterial({ map: sign, transparent: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 4.15, -ROOM.d / 2 + 0.02, G, false);
  // roller door on the front wall: horizontal slats
  const doorMat = new THREE.MeshStandardMaterial({ map: (() => { const t = corrugatedTex().color.clone(); t.needsUpdate = true; t.rotation = Math.PI / 2; t.repeat.set(1, 3); return t; })(), roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide });
  const front = m(new THREE.PlaneGeometry(ROOM.w, ROOM.h), doorMat, 0, ROOM.h / 2, ROOM.d / 2, G); front.rotation.y = Math.PI;
  for (let y = 0.15; y < 4.4; y += 0.15) m(new THREE.BoxGeometry(5.6, 0.018, 0.03), new THREE.MeshStandardMaterial({ color: 0x4f5357, roughness: 0.5, metalness: 0.7 }), 0, y, ROOM.d / 2 - 0.02, G, false);
  // ceiling and trusses
  const ceil = m(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.9 }), 0, ROOM.h, 0, G, false); ceil.rotation.x = Math.PI / 2;
  const steel = new THREE.MeshStandardMaterial({ color: 0x3d4247, roughness: 0.5, metalness: 0.75 });
  for (const z of [-5, -1.7, 1.7, 5]) { m(new THREE.BoxGeometry(ROOM.w, 0.28, 0.14), steel, 0, ROOM.h - 0.25, z, G); m(new THREE.BoxGeometry(ROOM.w, 0.05, 0.3), steel, 0, ROOM.h - 0.4, z, G); }
  m(new THREE.BoxGeometry(0.16, 0.16, ROOM.d), steel, 0, ROOM.h - 0.5, 0, G);
  // pillars
  for (const x of [-ROOM.w / 2 + 0.2, ROOM.w / 2 - 0.2]) for (const z of [-ROOM.d / 2 + 0.2, 0, ROOM.d / 2 - 0.2]) m(new THREE.BoxGeometry(0.3, ROOM.h, 0.3), steel, x, ROOM.h / 2, z, G);

  props(G);
  const lift = buildLift(G);
  const lights = buildLights(scene, G);
  const dust = buildDust(G);
  return { group: G, lift, lights, dust, room: ROOM };
}

/* ---------- the scissor lift ---------- */
function buildLift(G) {
  const L = new THREE.Group(); L.name = 'lift'; G.add(L);
  const yel = new THREE.MeshStandardMaterial({ map: rustPaintTex('#c99a1f', 0.3, 61, 256).color, roughness: 0.55, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.6, metalness: 0.7 });
  m(rb(1.6, 0.08, 4.2, 0.02), dark, 0, 0.04, 0, L);
  const top = new THREE.Group(); L.add(top);
  for (const s of [-1, 1]) {
    m(rb(0.42, 0.1, 4.3, 0.02), yel, s * 0.6, -0.05, 0, top);
    for (let z = -2; z <= 2; z += 0.4) m(new THREE.BoxGeometry(0.4, 0.012, 0.03), dark, s * 0.6, 0.003, z, top, false);
  }
  // the scissor arms on both sides, re-angled as the lift rises
  const arms = [];
  for (const s of [-1, 1]) for (const k of [-1, 1]) { const a = m(rb(0.07, 0.09, 3.3, 0.01), yel, s * 0.6, 0, 0, L); a.userData = { k }; arms.push(a); }
  const ram = m(new THREE.CylinderGeometry(0.06, 0.06, 1, 12), new THREE.MeshStandardMaterial({ color: 0xd0d2d4, roughness: 0.2, metalness: 1 }), 0, 0.5, 0.6, L);
  const set = (h) => {
    h = Math.max(0.16, h);
    top.position.y = h;
    const span = 3.3, rise = h - 0.08, ang = Math.asin(Math.min(0.95, rise / span));
    for (const a of arms) { a.position.y = 0.08 + rise / 2; a.rotation.x = a.userData.k * ang; }
    ram.scale.y = rise; ram.position.y = 0.08 + rise / 2; ram.rotation.x = 0.4;
  };
  set(0.16);
  return { group: L, set, height: 0.16 };
}

/* ---------- lights ---------- */
function buildLights(scene, G) {
  scene.add(new THREE.HemisphereLight(0x8c97a6, 0x2a2420, 0.42));
  const out = [];
  // three pendant lamps over the bay; the middle one throws the shadows
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2f4a3c, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 3 });
  [[-1.6, 0.6, false], [0, 0, true], [1.6, -0.6, false]].forEach(([x, z, shadow]) => {
    const y = 3.9;
    m(new THREE.CylinderGeometry(0.008, 0.008, 6.2 - y, 4), new THREE.MeshStandardMaterial({ color: 0x111111 }), x, (6.2 + y) / 2, z, G, false);
    m(new THREE.ConeGeometry(0.42, 0.32, 24, 1, true), shadeMat, x, y, z, G, false);
    m(new THREE.SphereGeometry(0.09, 16, 12), bulbMat, x, y - 0.12, z, G, false);
    const sp = new THREE.SpotLight(0xffdcae, shadow ? 95 : 42, 16, Math.PI / 3.2, 0.55, 1.6);
    sp.position.set(x, y - 0.15, z); sp.target.position.set(x * 0.4, 0, z * 0.4); G.add(sp, sp.target);
    if (shadow) { sp.castShadow = true; sp.shadow.mapSize.set(2048, 2048); sp.shadow.bias = -0.0004; sp.shadow.normalBias = 0.02; sp.shadow.radius = 4; sp.shadow.camera.near = 0.5; sp.shadow.camera.far = 12; }
    out.push(sp);
    // a faint cone of light through the dust
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.9, 3.7, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd8a0, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    cone.position.set(x, y - 1.95, z); G.add(cone);
  });
  // cool daylight through the high windows on the right wall
  const win = new THREE.MeshStandardMaterial({ color: 0xbfd6e8, emissive: 0x9cc1de, emissiveIntensity: 1.4 });
  for (const z of [-4.5, -1.5, 1.5, 4.5]) m(new THREE.PlaneGeometry(2, 0.8), win, 8.48, 5.2, z, G, false).rotation.y = -Math.PI / 2;
  const day = new THREE.DirectionalLight(0xb8d0ea, 0.9); day.position.set(8, 6, 2); day.target.position.set(-2, 0, 0); G.add(day, day.target);
  // warm fill from the workbench lamp
  const bench = new THREE.PointLight(0xffb070, 6, 7, 1.8); bench.position.set(-7.6, 1.9, -5.5); G.add(bench);
  const fill = new THREE.PointLight(0x7f95b5, 4, 12, 1.5); fill.position.set(5, 3, 6); G.add(fill);
  return out;
}

/* ---------- dust in the air ---------- */
function buildDust(G) {
  const n = 420, pos = new Float32Array(n * 3), seed = [];
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 7; pos[i * 3 + 1] = Math.random() * 4.5; pos[i * 3 + 2] = (Math.random() - 0.5) * 7; seed.push(Math.random() * 100); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(1, 'rgba(255,240,210,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.025, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  G.add(pts);
  return (t) => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < n; i++) { a[i * 3] += Math.sin(t * 0.3 + seed[i]) * 0.0009; a[i * 3 + 1] += 0.0006 + Math.sin(t * 0.5 + seed[i] * 2) * 0.0004; a[i * 3 + 2] += Math.cos(t * 0.27 + seed[i]) * 0.0009; if (a[i * 3 + 1] > 4.5) a[i * 3 + 1] = 0; }
    geo.attributes.position.needsUpdate = true;
  };
}

/* ---------- props ---------- */
function props(G) {
  const plank = new THREE.MeshStandardMaterial({ map: plankTex(), roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.55, metalness: 0.7 });
  const red = new THREE.MeshStandardMaterial({ map: rustPaintTex('#8c2a1c', 0.45, 71, 256).color, roughness: 0.6, metalness: 0.5 });
  const blue = new THREE.MeshStandardMaterial({ map: rustPaintTex('#2c4f6e', 0.5, 72, 256).color, roughness: 0.6, metalness: 0.5 });
  const rubber = new THREE.MeshStandardMaterial({ map: rubberTex(), roughness: 0.92 });
  // workbench with a vise and a tool wall behind it (back-left corner)
  const bx = -5.6, bz = -6.9;
  m(rb(3.2, 0.08, 0.9, 0.01), plank, bx, 0.95, bz, G);
  for (const sx of [-1.5, 1.5]) for (const sz of [-0.38, 0.38]) m(new THREE.BoxGeometry(0.06, 0.95, 0.06), dark, bx + sx, 0.475, bz + sz, G);
  m(new THREE.BoxGeometry(3.1, 0.04, 0.8), dark, bx, 0.25, bz, G);
  m(rb(0.22, 0.14, 0.18, 0.02), blue, bx + 1.1, 1.06, bz + 0.25, G);
  const peg = m(new THREE.PlaneGeometry(3.2, 1.4), new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 0.9 }), bx, 1.9, -ROOM.d / 2 + 0.03, G, false);
  for (let i = 0; i < 9; i++) { const t = m(rb(0.05, 0.3 + (i % 3) * 0.12, 0.02, 0.01), new THREE.MeshStandardMaterial({ color: 0x9da3a8, roughness: 0.3, metalness: 1 }), bx - 1.3 + i * 0.32, 1.9, -ROOM.d / 2 + 0.06, G); t.rotation.z = (i % 2 ? 0.15 : -0.1); }
  m(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 20), red, bx + 1.3, 2.2, -ROOM.d / 2 + 0.06, G).rotation.x = Math.PI / 2;
  // a red rolling tool chest
  m(rb(1.1, 1.0, 0.55, 0.03), red, -2.6, 0.58, -7.05, G);
  for (let i = 0; i < 5; i++) m(new THREE.BoxGeometry(1.0, 0.012, 0.01), dark, -2.6, 0.25 + i * 0.17, -6.77, G, false);
  for (const sx of [-0.45, 0.45]) for (const sz of [-0.2, 0.2]) m(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 10), rubber, -2.6 + sx, 0.04, -7.05 + sz, G).rotation.z = Math.PI / 2;
  // tyre stacks
  const tire = new THREE.TorusGeometry(0.33, 0.13, 12, 28);
  for (const [x, z, n] of [[6.9, -6.4, 5], [7.4, -5.6, 3], [6.2, -6.9, 2]]) for (let i = 0; i < n; i++) { const t = m(tire, rubber, x + (i % 2) * 0.03, 0.13 + i * 0.26, z, G); t.rotation.x = Math.PI / 2; }
  // oil drums
  const drumMat = [red, blue, new THREE.MeshStandardMaterial({ map: rustPaintTex('#4c5a2e', 0.6, 73, 256).color, roughness: 0.65, metalness: 0.5 })];
  [[7.3, 3.6], [7.4, 4.5], [6.6, 4.1], [7.2, 6.4]].forEach(([x, z], i) => {
    const d = m(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 24), drumMat[i % 3], x, 0.44, z, G);
    for (const y of [0.25, 0.6]) m(new THREE.TorusGeometry(0.295, 0.012, 6, 24), dark, x, y, z, G, false).rotation.x = Math.PI / 2;
  });
  // shelving with crates and cans along the left wall
  for (const z of [1.5, 4.0]) {
    for (const y of [0.05, 0.85, 1.65, 2.45]) m(new THREE.BoxGeometry(0.6, 0.04, 2.3), dark, -7.95, y, z, G);
    for (const dz of [-1.13, 1.13]) m(new THREE.BoxGeometry(0.05, 2.5, 0.05), dark, -7.7, 1.25, z + dz, G);
    for (let i = 0; i < 4; i++) m(rb(0.45, 0.4, 0.45, 0.02), plank, -7.95, 0.27 + (i % 2) * 0.8, z - 0.7 + i * 0.45, G);
    for (let i = 0; i < 5; i++) m(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 14), i % 2 ? blue : red, -7.95, 1.81, z - 0.8 + i * 0.4, G);
  }
  // an engine hoist, a welding bottle and a fire extinguisher
  const yel = new THREE.MeshStandardMaterial({ color: 0xb8861c, roughness: 0.55, metalness: 0.5 });
  m(new THREE.BoxGeometry(0.1, 2.2, 0.1), yel, 4.6, 1.1, -5.6, G);
  const boom = m(new THREE.BoxGeometry(0.09, 0.09, 1.9), yel, 4.6, 2.15, -4.9, G); boom.rotation.x = 0.25;
  for (const s of [-1, 1]) m(new THREE.BoxGeometry(0.08, 0.08, 1.6), yel, 4.6 + s * 0.4, 0.08, -5.0, G).rotation.y = s * 0.25;
  m(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 4), dark, 4.6, 1.45, -4.05, G, false);
  m(new THREE.TorusGeometry(0.05, 0.012, 6, 12), dark, 4.6, 0.88, -4.05, G);
  m(new THREE.CylinderGeometry(0.12, 0.12, 1.3, 16), blue, 3.3, 0.65, -7.1, G);
  m(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xb01b12, roughness: 0.35, metalness: 0.3 }), 8.25, 1.2, -2.5, G);
  // a stack of plank crates in the front-right corner
  [[6.5, 6.2, 0], [6.5, 6.2, 1], [5.6, 6.5, 0], [6.9, 5.2, 0]].forEach(([x, z, k]) => m(rb(0.85, 0.85, 0.85, 0.02), plank, x, 0.425 + k * 0.85, z, G).rotation.y = k * 0.3);
  // an oil stain and a drain under the lift
  m(new THREE.CircleGeometry(0.3, 24), new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.4, metalness: 0.8 }), 1.2, 0.004, -1.2, G, false).rotation.x = -Math.PI / 2;
}

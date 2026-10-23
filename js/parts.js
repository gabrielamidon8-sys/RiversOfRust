// GARAGE for RiversOfRust: the parts, modelled in code. Every builder returns a THREE.Group in its own space:
//   frame  - origin at the middle of its footprint, on its underside; +z is the front, +x the right
//   body   - origin at the middle of its 4 x 6 footprint, on its floor
//   engine - origin at the middle of its underside (it sits on the engine cradle)
//   wheel  - origin on the face of the 1 x 2 mount it bolts to; the wheel sticks out along +x
//   turret - origin at the middle of its 2 x 2 base plate, underneath
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { U, WHEEL, PART_DEFS } from './config.js';
import { mats } from './materials.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m); return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rbox = (w, h, d, r = 0.02, s = 2) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
const cyl = (rt, rb, h, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);
// a hex bolt head facing +axis
function bolt(parent, x, y, z, axis = 'y', size = 0.022) {
  const b = mesh(new THREE.CylinderGeometry(size, size, size * 0.7, 6), mats().bolt, x, y, z, parent);
  if (axis === 'x') b.rotation.z = Math.PI / 2; else if (axis === 'z') b.rotation.x = Math.PI / 2;
  b.castShadow = false; return b;
}
// a tube along a list of points
function tube(points, r, mat, parent, seg = 24) {
  const c = new THREE.CatmullRomCurve3(points.map(p => V3(p[0], p[1], p[2])), false, 'catmullrom', 0.3);
  return mesh(new THREE.TubeGeometry(c, seg, r, 10, false), mat, 0, 0, 0, parent);
}

/* ================= FRAME: 4 x 12 x 2 ================= */
export function buildFrame() {
  const M = mats(), g = new THREE.Group(); g.name = 'frame';
  const W = 4 * U, L = 12 * U, H = 2 * U, t = 0.028;
  // the two side rails: a web plate with lightening holes, and top and bottom flanges
  const web = new THREE.Shape(); web.moveTo(-L / 2, 0); web.lineTo(L / 2, 0); web.lineTo(L / 2, H); web.lineTo(-L / 2, H); web.closePath();
  for (let i = -5; i <= 5; i++) {
    const z = i * U; if (Math.abs(Math.abs(z) - 4 * U) < 1.3 * U) continue;   // no holes where the wheel mounts are
    const h = new THREE.Path(); h.absellipse(z, H * 0.52, U * 0.3, H * 0.25, 0, Math.PI * 2, false); web.holes.push(h);
  }
  const webGeo = new THREE.ExtrudeGeometry(web, { depth: t, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
  webGeo.rotateY(-Math.PI / 2);   // shape x -> z, extrusion -> -x
  for (const s of [-1, 1]) {
    const w = mesh(webGeo, M.frame, s > 0 ? W / 2 : -W / 2 + t, 0, 0, g);
    w.userData.side = s;
    for (const y of [0.012, H - 0.012]) mesh(box(0.6 * U, 0.024, L), M.frame, s * (W / 2 - 0.3 * U), y, 0, g);   // flanges
    // inner web, so the rail is a box section
    mesh(box(t, H - 0.05, L), M.frame, s * (W / 2 - 0.6 * U), H / 2, 0, g);
    // rivets along the top flange
    for (let i = -11; i <= 11; i += 2) bolt(g, s * (W / 2 - 0.15 * U), H + 0.006, i * U / 2, 'y', 0.013);
  }
  // cross members (none inside the engine well except the cradle)
  for (const z of [-5.6, -3.2, -0.6, 1.9, 5.65]) mesh(rbox(W - 1.2 * U, 0.6 * U, 0.35 * U, 0.02), M.frame, 0, z > 2 ? 0.55 * U : 1.3 * U, z * U, g);
  // the engine cradle at the bottom of the well, with two rubber mounts
  mesh(rbox(W - 1.2 * U, 0.22 * U, 1.2 * U, 0.015), M.frame, 0, 0.39 * U, 4 * U, g);
  for (const s of [-1, 1]) mesh(cyl(0.05, 0.06, 0.05, 12), M.rubber, s * 0.55 * U, 0.5 * U + 0.0, 3.8 * U, g);
  // the deck: diamond-plate floor over the rear 8 units, where the body bolts down
  const deckMat = M.frame.clone(); deckMat.metalness = 0.7; deckMat.roughness = 0.55;
  mesh(box(W, 0.035, 8 * U), deckMat, 0, H - 0.0175, -2 * U, g);
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) bolt(g, s * 1.6 * U, H + 0.004, (-5.5 + i) * U, 'y', 0.012);
  // the wheel mounts: 1 x 2 zinc-yellow plates on the side faces, bolted through
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = mesh(rbox(0.03, U * 0.98, 2 * U * 0.98, 0.01), M.mount, sx * (W / 2 + 0.017), 0.5 * U, sz * 4 * U, g);
    p.userData.mount = true;
    for (const dz of [-0.7, 0, 0.7]) for (const dy of [-0.28, 0.28]) bolt(g, sx * (W / 2 + 0.035), 0.5 * U + dy * U, sz * 4 * U + dz * U, 'x', 0.014);
  }
  // bumpers: a push bar at the front, a tow bar at the back
  mesh(rbox(W + 0.25, 0.5 * U, 0.3 * U, 0.03), M.frame, 0, 0.75 * U, L / 2 + 0.12 * U, g);
  for (const s of [-1, 1]) {
    tube([[s * 0.5 * U, 0.95 * U, L / 2 + 0.2 * U], [s * 0.6 * U, 1.9 * U, L / 2 + 0.55 * U], [s * 0.4 * U, 2.6 * U, L / 2 + 0.3 * U]], 0.03, M.cage, g, 12);
    const lamp = mesh(cyl(0.07, 0.07, 0.07, 18), M.cage, s * (W / 2 - 0.1), 1.55 * U, L / 2 + 0.2 * U, g); lamp.rotation.x = Math.PI / 2;
    const lens = mesh(cyl(0.058, 0.058, 0.01, 18), M.lamp, s * (W / 2 - 0.1), 1.55 * U, L / 2 + 0.24 * U, g); lens.rotation.x = Math.PI / 2; lens.castShadow = false;
    lens.userData.headlight = s;
  }
  mesh(cyl(0.025, 0.025, W - 0.1, 10), M.cage, 0, 2.55 * U, L / 2 + 0.3 * U, g).rotation.z = Math.PI / 2;
  mesh(rbox(W, 0.45 * U, 0.25 * U, 0.03), M.frame, 0, 0.6 * U, -L / 2 - 0.1 * U, g);
  const hook = mesh(new THREE.TorusGeometry(0.05, 0.015, 8, 16), M.bolt, 0, 0.6 * U, -L / 2 - 0.3 * U, g); hook.rotation.y = Math.PI / 2;
  for (const s of [-1, 1]) { const tl = mesh(rbox(0.12, 0.06, 0.02, 0.01), M.tail, s * (W / 2 - 0.15), 0.85 * U, -L / 2 - 0.2 * U, g); tl.castShadow = false; }
  return g;
}

/* ================= HALF BODY: 4 x 6 x 3, no hood, 4 x 2 roof ================= */
// side profile in the body's (z, y): front is +z
const BP = { cowl: 1.6, shieldZ: 2.55, roofF: 1.0, roofR: -1.0, rearZ: -2.3, deck: 1.65, top: 3 };
export function buildBody() {
  const M = mats(), g = new THREE.Group(); g.name = 'body';
  const W = 4 * U, inset = 0.05;
  // the lower tub: everything under the belt line, with the door sills cut low
  const s = new THREE.Shape();
  s.moveTo(-3 * U, 0.05); s.lineTo(3 * U - 0.06, 0.05); s.quadraticCurveTo(3 * U, 0.05, 3 * U, 0.12);
  s.lineTo(3 * U, BP.cowl * U - 0.04); s.quadraticCurveTo(3 * U, BP.cowl * U, 3 * U - 0.05, BP.cowl * U);
  s.lineTo(-3 * U + 0.06, BP.deck * U); s.quadraticCurveTo(-3 * U, BP.deck * U, -3 * U, BP.deck * U - 0.06); s.lineTo(-3 * U, 0.05);
  const tub = new THREE.ExtrudeGeometry(s, { depth: W - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 6 });
  tub.rotateY(-Math.PI / 2); tub.translate((W - 0.04) / 2, 0, 0);
  mesh(tub, M.body, 0, 0, 0, g);
  // the floor rail it bolts down with
  mesh(box(W, 0.05, 6 * U), M.bodyDark, 0, 0.025, 0, g);
  // door seams, handles and sills
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.021);
    for (const z of [1.95, -0.25, -2.25]) mesh(box(0.006, BP.cowl * U - 0.15, 0.012), M.bodyDark, x, (BP.cowl * U) / 2 + 0.04, z * U, g);
    mesh(box(0.006, 0.012, 4.2 * U), M.bodyDark, x, 0.12, -0.15 * U, g);
    for (const z of [0.3, -1.8]) mesh(rbox(0.025, 0.025, 0.12, 0.008), M.chrome, x + sx * 0.008, BP.cowl * U - 0.12, z * U, g);
    mesh(rbox(0.06, 0.05, 6 * U, 0.015), M.bodyDark, sx * (W / 2 + 0.01), 0.05, 0, g);
  }
  // the firewall behind the missing hood, and the dash cowl over it
  mesh(box(W - 0.06, BP.cowl * U - 0.1, 0.03), M.bodyDark, 0, (BP.cowl * U) / 2, 3 * U + 0.012, g);
  mesh(rbox(W - 0.02, 0.06, 0.32 * U, 0.02), M.body, 0, BP.cowl * U - 0.01, 2.8 * U, g);
  // the greenhouse: pillars, roof, glass
  const y0 = BP.cowl * U, y1 = BP.top * U - 0.045;
  const pillar = (z0, ya, z1, yb, x) => {
    const a = V3(x, ya, z0), b = V3(x, yb, z1), len = a.distanceTo(b);
    const p = mesh(rbox(0.06, len, 0.07, 0.015), M.body, 0, 0, 0, g);
    p.position.copy(a).add(b).multiplyScalar(0.5); p.quaternion.setFromUnitVectors(V3(0, 1, 0), b.clone().sub(a).normalize());
  };
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.035);
    pillar(BP.shieldZ * U, y0, BP.roofF * U, y1, x);            // A
    pillar(-0.15 * U, y0 + 0.02, -0.15 * U, y1, x);              // B
    pillar(BP.rearZ * U, BP.deck * U, BP.roofR * U, y1, x);      // C
  }
  // roof: a flat 4 x 2 plate with bolt holes on top, the only place parts can go
  const roof = mesh(rbox(W, 0.05, 2 * U + 0.06, 0.02), M.body, 0, BP.top * U - 0.025, 0, g); roof.userData.roof = true;
  for (const sx of [-1.5, -0.5, 0.5, 1.5]) for (const sz of [-0.5, 0.5]) bolt(g, sx * U, BP.top * U + 0.002, sz * U, 'y', 0.012);
  // glass: windscreen, back light, side windows
  const quad = (pts) => {
    const geo = new THREE.BufferGeometry(); const v = [];
    const tri = (a, b, c) => v.push(...a, ...b, ...c);
    tri(pts[0], pts[1], pts[2]); tri(pts[0], pts[2], pts[3]); tri(pts[0], pts[2], pts[1]); tri(pts[0], pts[3], pts[2]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M.glass); m.castShadow = false; g.add(m); return m;
  };
  const xw = W / 2 - 0.06;
  quad([[-xw, y0, BP.shieldZ * U - 0.02], [xw, y0, BP.shieldZ * U - 0.02], [xw, y1, BP.roofF * U + 0.02], [-xw, y1, BP.roofF * U + 0.02]]);
  quad([[-xw, BP.deck * U, BP.rearZ * U + 0.02], [xw, BP.deck * U, BP.rearZ * U + 0.02], [xw, y1, BP.roofR * U - 0.02], [-xw, y1, BP.roofR * U - 0.02]]);
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.03);
    quad([[x, y0 + 0.02, BP.shieldZ * U - 0.06], [x, y0 + 0.02, -0.25 * U], [x, y1 - 0.02, -0.25 * U], [x, y1 - 0.02, BP.roofF * U - 0.02]]);
    quad([[x, y0 + 0.02, -0.05 * U], [x, BP.deck * U + 0.02, BP.rearZ * U + 0.08], [x, y1 - 0.02, BP.roofR * U + 0.02], [x, y1 - 0.02, -0.05 * U]]);
  }
  // inside: two seats and a wheel, so the cabin isn't empty
  for (const sx of [-1, 1]) {
    mesh(rbox(0.42, 0.1, 0.45, 0.04), M.bodyDark, sx * 0.32, 0.3, 0.2 * U, g);
    const back = mesh(rbox(0.42, 0.55, 0.1, 0.04), M.bodyDark, sx * 0.32, 0.6, -0.55 * U, g); back.rotation.x = -0.18;
  }
  const sw = mesh(new THREE.TorusGeometry(0.16, 0.02, 8, 24), M.bodyDark, -0.32, 0.72, 1.85 * U, g); sw.rotation.x = -0.9;
  // tail lights and a roll bar over the rear deck
  for (const sx of [-1, 1]) { const t = mesh(rbox(0.16, 0.08, 0.02, 0.01), M.tail, sx * (W / 2 - 0.16), BP.deck * U - 0.12, -3 * U - 0.022, g); t.castShadow = false; }
  return g;
}

/* ================= ENGINE: supercharged V8 with its radiator ================= */
export function buildEngine() {
  const M = mats(), g = new THREE.Group(); g.name = 'engine';
  const bz = -0.12;   // the block sits behind the middle; the radiator is in front
  mesh(rbox(0.46, 0.14, 0.62, 0.03), M.block, 0, 0.07, bz, g);                        // oil pan
  mesh(rbox(0.5, 0.32, 0.66, 0.025), M.block, 0, 0.3, bz, g);                         // block
  const bell = mesh(cyl(0.2, 0.26, 0.2, 24), M.block, 0, 0.3, bz - 0.42, g); bell.rotation.x = Math.PI / 2;   // bellhousing
  for (const s of [-1, 1]) {
    const bank = new THREE.Group(); bank.position.set(s * 0.15, 0.46, bz); bank.rotation.z = -s * 0.72; g.add(bank);
    mesh(rbox(0.2, 0.2, 0.64, 0.02), M.block, 0, 0.1, 0, bank);                        // head
    mesh(rbox(0.19, 0.08, 0.66, 0.035, 3), M.chrome, 0, 0.23, 0, bank);                // valve cover
    for (let i = 0; i < 4; i++) bolt(bank, 0, 0.28, -0.24 + i * 0.16, 'y', 0.012);
    // headers: dragster "zoomies", one short pipe per cylinder, out over the rail and up, with chrome tips
    for (let i = 0; i < 4; i++) {
      const z = bz - 0.24 + i * 0.16, end = [s * 0.6, 0.78, z - 0.1];
      tube([[s * 0.3, 0.5, z], [s * 0.43, 0.52, z], [s * 0.53, 0.6, z - 0.03], end], 0.021, M.header, g, 14);
      const tip = mesh(cyl(0.026, 0.022, 0.07, 12), M.chrome, end[0] + s * 0.012, end[1] + 0.03, end[2] - 0.012, g); tip.rotation.z = -s * 0.5; tip.rotation.x = -0.25;
    }
  }
  // intake, the blower with its belt, and the scoop with two velocity stacks
  mesh(rbox(0.22, 0.12, 0.6, 0.02), M.block, 0, 0.6, bz, g);
  const blower = mesh(rbox(0.26, 0.2, 0.5, 0.05, 3), M.red, 0, 0.78, bz, g);
  for (let i = 0; i < 6; i++) mesh(box(0.27, 0.012, 0.012), M.chrome, 0, 0.71 + i * 0.03, bz + 0.26, g);
  const pul = mesh(cyl(0.07, 0.07, 0.04, 20), M.chrome, 0, 0.78, bz + 0.28, g); pul.rotation.x = Math.PI / 2;
  const pul2 = mesh(cyl(0.08, 0.08, 0.04, 20), M.chrome, 0, 0.28, bz + 0.35, g); pul2.rotation.x = Math.PI / 2;
  mesh(box(0.035, 0.5, 0.012), M.rubber, 0.05, 0.53, bz + 0.37, g).rotation.z = 0.12;
  mesh(box(0.035, 0.5, 0.012), M.rubber, -0.05, 0.53, bz + 0.37, g).rotation.z = -0.12;
  mesh(rbox(0.3, 0.06, 0.34, 0.02), M.chrome, 0, 0.91, bz - 0.02, g);
  for (const s of [-1, 1]) {
    mesh(cyl(0.06, 0.05, 0.12, 18), M.chrome, s * 0.07, 1.0, bz - 0.02, g);
    mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20), M.chrome, s * 0.07, 1.06, bz - 0.02, g).rotation.x = Math.PI / 2;
  }
  mesh(rbox(0.12, 0.12, 0.14, 0.03), M.chrome, -0.24, 0.35, bz + 0.3, g);              // alternator
  mesh(cyl(0.025, 0.025, 0.4, 8), M.copper, 0.2, 0.22, bz + 0.1, g).rotation.x = Math.PI / 2;
  // the radiator and its fan, at the front of the well
  const rz = 0.6;
  mesh(rbox(0.86, 0.6, 0.08, 0.015), M.cage, 0, 0.42, rz, g);
  const core = new THREE.Mesh(box(0.78, 0.5, 0.01), new THREE.MeshStandardMaterial({ color: 0x3a3d3f, roughness: 0.8, metalness: 0.6 }));
  core.position.set(0, 0.42, rz + 0.045); g.add(core);
  for (let i = 0; i < 18; i++) mesh(box(0.78, 0.006, 0.012), M.bolt, 0, 0.19 + i * 0.027, rz + 0.05, g).castShadow = false;
  const fan = new THREE.Group(); fan.position.set(0, 0.42, rz - 0.07); g.add(fan); fan.name = 'fan';
  for (let i = 0; i < 6; i++) { const b = mesh(box(0.05, 0.22, 0.01), M.cage, 0, 0.11, 0, new THREE.Group()); b.parent.rotation.z = i * Math.PI / 3; b.rotation.y = 0.5; fan.add(b.parent); }
  mesh(cyl(0.035, 0.035, 0.05, 12), M.chrome, 0, 0, 0, fan).rotation.x = Math.PI / 2;
  tube([[0.3, 0.6, rz - 0.04], [0.28, 0.62, rz - 0.3], [0.16, 0.5, bz + 0.36]], 0.025, M.rubber, g, 10);
  return g;
}

/* ================= WHEELS ================= */
let tireGeo = null;
function tireGeometry() {
  if (tireGeo) return tireGeo;
  const R = WHEEL.radius, w = WHEEL.width / 2, r0 = R * 0.62, pts = [];
  // half the tyre's cross-section, inside to outside and back (lathed around the axle)
  const prof = [[r0, -w * 0.82], [R - 0.06, -w * 0.98], [R - 0.02, -w * 0.9], [R, -w * 0.62], [R, w * 0.62], [R - 0.02, w * 0.9], [R - 0.06, w * 0.98], [r0, w * 0.82]];
  for (const p of prof) pts.push(new THREE.Vector2(p[0], p[1]));
  tireGeo = new THREE.LatheGeometry(pts, 48);
  tireGeo.rotateZ(Math.PI / 2);   // lathe axis y -> x
  return tireGeo;
}
export function buildWheel(steer) {
  const M = mats(), g = new THREE.Group(); g.name = steer ? 'wheelS' : 'wheelD';
  const R = WHEEL.radius, cx = WHEEL.armOut + WHEEL.width / 2 + 0.04, cy = -WHEEL.drop;
  // the arm: swings from the mount to the hub (it is turned to follow the wheel when driving)
  mesh(rbox(0.05, U * 0.92, 2 * U * 0.85, 0.01), M.frame, 0.025, 0, 0, g);              // bracket against the mount
  for (const dz of [-0.24, 0.24]) mesh(cyl(0.03, 0.03, 0.08, 12), M.gun, 0.07, 0, dz, g).rotation.x = Math.PI / 2;
  const arm = new THREE.Group(); arm.name = 'arm'; arm.position.x = 0.07; g.add(arm);
  const hx = cx - WHEEL.width * 0.5;   // the arm meets the hub on the inside of the wheel
  const reach = Math.hypot(hx - 0.07, cy);
  const armDir = Math.atan2(cy, hx - 0.07);
  arm.userData.rest = armDir; arm.userData.reach = reach; arm.rotation.z = armDir;
  for (const dz of [-0.22, 0.22]) mesh(rbox(reach, 0.045, 0.05, 0.012), M.frame, reach / 2, 0, dz, arm);
  mesh(rbox(0.05, 0.12, 0.5, 0.012), M.frame, reach, 0, 0, arm);
  // the coilover, from the top of the bracket to the hub
  const coil = new THREE.Group(); coil.name = 'coil'; g.add(coil);
  const helix = [];
  for (let i = 0; i <= 80; i++) { const a = i / 80 * Math.PI * 2 * 6; helix.push(V3(Math.cos(a) * 0.045, 0.06 + i / 80 * 0.2, Math.sin(a) * 0.045)); }
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 200, 0.008, 6, false), M.spring, 0, 0, 0, coil);
  mesh(cyl(0.022, 0.022, 0.34, 10), M.chrome, 0, 0.17, 0, coil);
  mesh(cyl(0.032, 0.032, 0.12, 12), M.gun, 0, 0.08, 0, coil);
  coil.position.set(cx - 0.08, cy + 0.05, 0.12); coil.rotation.z = 0.55;
  // the part that spins: tyre with chunky lugs, beadlock rim, hub
  const spin = new THREE.Group(); spin.name = 'spin'; spin.position.set(cx, cy, 0); g.add(spin);
  const knuckle = new THREE.Group(); knuckle.name = 'knuckle'; spin.add(knuckle);   // steering turns this, rolling turns `roll`
  const roll = new THREE.Group(); roll.name = 'roll'; knuckle.add(roll);
  mesh(tireGeometry(), M.rubber, 0, 0, 0, roll);
  const lug = rbox(WHEEL.width * 0.42, 0.04, 0.085, 0.012);
  const n = 26;
  const lugs = new THREE.InstancedMesh(lug, M.rubber, n * 2); lugs.castShadow = lugs.receiveShadow = true;
  const o = new THREE.Object3D();
  for (let i = 0; i < n * 2; i++) {
    const side = i % 2 ? 1 : -1, a = (Math.floor(i / 2) + (side > 0 ? 0.5 : 0)) / n * Math.PI * 2;
    o.position.set(side * WHEEL.width * 0.22, Math.cos(a) * (R + 0.008), Math.sin(a) * (R + 0.008));
    o.rotation.set(a, 0, 0); o.updateMatrix(); lugs.setMatrixAt(i, o.matrix);
  }
  roll.add(lugs);
  const rimMat = steer ? M.rimS : M.rimD;
  const dish = mesh(cyl(R * 0.6, R * 0.6, WHEEL.width * 0.8, 32), M.rim, 0, 0, 0, roll); dish.rotation.z = Math.PI / 2;
  const face = mesh(cyl(R * 0.58, R * 0.58, 0.02, 32), rimMat, WHEEL.width * 0.38, 0, 0, roll); face.rotation.z = Math.PI / 2;
  const ring = mesh(new THREE.TorusGeometry(R * 0.6, 0.022, 8, 40), M.rim, WHEEL.width * 0.42, 0, 0, roll); ring.rotation.y = Math.PI / 2;
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; bolt(roll, WHEEL.width * 0.44, Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, 'x', 0.011); }
  for (let i = 0; i < 6; i++) {
    const sp = mesh(rbox(0.024, R * 0.42, 0.05, 0.01), M.rim, WHEEL.width * 0.41, 0, 0, new THREE.Group());
    sp.position.y = R * 0.27; sp.parent.rotation.x = i * Math.PI / 3; roll.add(sp.parent);
  }
  const hub = mesh(cyl(0.065, 0.075, 0.08, 16), M.chrome, WHEEL.width * 0.42, 0, 0, roll); hub.rotation.z = Math.PI / 2;
  // steering wheels carry a tie-rod arm, so you can tell them apart
  if (steer) { mesh(rbox(0.05, 0.05, 0.22, 0.012), M.mount, -WHEEL.width * 0.5 - 0.02, 0, 0.1, knuckle); }
  return g;
}

/* ================= TURRET: machine gun on a 2 x 2 base ================= */
export function buildTurret() {
  const M = mats(), g = new THREE.Group(); g.name = 'turret';
  const B = 2 * U;
  mesh(rbox(B, 0.05, B, 0.012), M.turret, 0, 0.025, 0, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bolt(g, sx * (B / 2 - 0.05), 0.055, sz * (B / 2 - 0.05), 'y', 0.016);
  mesh(cyl(0.27, 0.29, 0.07, 32), M.gun, 0, 0.085, 0, g);
  const yaw = new THREE.Group(); yaw.name = 'yaw'; yaw.position.y = 0.12; g.add(yaw);
  // the armoured housing: a squat wedge, wider at the back
  const s = new THREE.Shape(); s.moveTo(-0.26, -0.24); s.lineTo(0.26, -0.24); s.lineTo(0.2, 0.26); s.lineTo(-0.2, 0.26); s.closePath();
  const hous = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
  hous.rotateX(Math.PI / 2); hous.translate(0, 0.21, 0);
  mesh(hous, M.turret, 0, 0, 0, yaw);
  for (const sx of [-1, 1]) mesh(rbox(0.04, 0.2, 0.32, 0.01), M.turret, sx * 0.17, 0.33, 0.02, yaw);
  const pitch = new THREE.Group(); pitch.name = 'pitch'; pitch.position.set(0, 0.33, 0.04); yaw.add(pitch);
  // the gun: receiver, perforated barrel jacket, muzzle brake, feed tray and ammo can
  mesh(rbox(0.13, 0.13, 0.42, 0.012), M.gun, 0, 0, -0.02, pitch);
  mesh(rbox(0.1, 0.05, 0.18, 0.01), M.gun, 0, 0.08, -0.06, pitch);
  const jacket = mesh(cyl(0.032, 0.032, 0.42, 14), M.gun, 0, 0, 0.38, pitch); jacket.rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) mesh(new THREE.TorusGeometry(0.033, 0.006, 6, 14), M.cage, 0, 0, 0.22 + i * 0.06, pitch).castShadow = false;
  const barrel = mesh(cyl(0.017, 0.017, 0.86, 12), M.gun, 0, 0, 0.6, pitch); barrel.rotation.x = Math.PI / 2;
  const brake = mesh(cyl(0.03, 0.026, 0.09, 12), M.gun, 0, 0, 1.04, pitch); brake.rotation.x = Math.PI / 2;
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0, 1.1); pitch.add(muzzle);
  mesh(rbox(0.12, 0.13, 0.2, 0.012), M.turret, 0.15, -0.02, -0.04, pitch);
  for (let i = 0; i < 7; i++) mesh(cyl(0.008, 0.008, 0.06, 6), M.brass, 0.085, 0.045 - i * 0.003, 0.05 - i * 0.025, pitch).rotation.z = Math.PI / 2;
  // the shield, with a slot for the barrel
  const sh = new THREE.Shape(); sh.moveTo(-0.3, -0.12); sh.lineTo(0.3, -0.12); sh.lineTo(0.26, 0.22); sh.lineTo(-0.26, 0.22); sh.closePath();
  const slot = new THREE.Path(); slot.moveTo(-0.045, -0.05); slot.lineTo(0.045, -0.05); slot.lineTo(0.045, 0.05); slot.lineTo(-0.045, 0.05); slot.closePath(); sh.holes.push(slot);
  const shield = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: false }), M.turret, 0, 0, 0.2, pitch);
  shield.rotation.x = -0.12;
  mesh(rbox(0.05, 0.05, 0.08, 0.01), M.gun, 0, 0.1, 0.18, pitch);
  return g;
}

export function buildPart(key) {
  if (key === 'frame') return buildFrame();
  if (key === 'body') return buildBody();
  if (key === 'engine') return buildEngine();
  if (key === 'wheelS') return buildWheel(true);
  if (key === 'wheelD') return buildWheel(false);
  if (key === 'turret') return buildTurret();
  throw new Error('no part ' + key);
}
export { PART_DEFS };

// TEST DRIVE for RiversOfRust: a stretch of desert with ramps, barriers, crates and drums to knock about, and the car
// you built, driven by the physics in vehicle.js. Mouse aims the camera and the turret; left click fires.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Sky } from 'three/addons/objects/Sky.js';
import { WHEEL } from './config.js';
import { buildPart } from './parts.js';
import { createVehicle } from './vehicle.js';
import { sandTex, plankTex, rustPaintTex, rubberTex } from './materials.js';
import { engineSound, shot, hit } from './audio.js';

// sandstone: horizontal bands of red, buff and ochre, weathered
function strata() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 512; const x = c.getContext('2d');
  let s = 3; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const cols = ['#a8603a', '#b8774a', '#c99363', '#9a5233', '#b06a40', '#d0a070', '#8e4a2e'];
  for (let y = 0; y < 512;) { const h = 6 + r() * 40; x.fillStyle = cols[Math.floor(r() * cols.length)]; x.fillRect(0, y, 64, h); y += h; }
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '40,20,10' : '240,210,170'},${r() * 0.12})`; x.fillRect(r() * 64, r() * 512, 1 + r() * 3, 1 + r() * 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1); return t;
}

export function createDrive({ renderer, dom, hud }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1500);
  let world = null, car = null, carVis = null, wheelsVis = [], turret = null, statics = [], dynamics = [], active = false, eng = null;
  const keys = {}; let yaw = Math.PI, pitch = 0.32, dist = 8.5, firing = false, fireT = 0, locked = false;

  /* ---------- the world you see ---------- */
  const sky = new Sky(); sky.scale.setScalar(4000); scene.add(sky);
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(68), THREE.MathUtils.degToRad(215));
  sky.material.uniforms.turbidity.value = 9; sky.material.uniforms.rayleigh.value = 1.6;
  sky.material.uniforms.mieCoefficient.value = 0.006; sky.material.uniforms.mieDirectionalG.value = 0.86; sky.material.uniforms.sunPosition.value.copy(sun);
  scene.fog = new THREE.Fog(0xd6b38a, 90, 520);
  scene.add(new THREE.HemisphereLight(0xcfe0f2, 0x9a7650, 0.9));
  const sunL = new THREE.DirectionalLight(0xffe2b8, 3.1); sunL.position.copy(sun).multiplyScalar(80); sunL.castShadow = true;
  sunL.shadow.mapSize.set(2048, 2048); const sc = sunL.shadow.camera; sc.left = sc.bottom = -38; sc.right = sc.top = 38; sc.near = 1; sc.far = 220; sunL.shadow.bias = -0.0005; sunL.shadow.normalBias = 0.03;
  scene.add(sunL, sunL.target);
  const sand = sandTex();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 1, 1), new THREE.MeshStandardMaterial({ map: sand.color, bumpMap: sand.bump, bumpScale: 0.8, roughness: 0.96 }));
  sand.color.repeat.set(300, 300); sand.bump.repeat.set(300, 300);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // mesas on the horizon
  const rock = new THREE.MeshStandardMaterial({ map: strata(), roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2 + Math.sin(i * 7) * 0.1, r = 330 + (i % 5) * 45, h = 25 + ((i * 37) % 50);
    const g = new THREE.CylinderGeometry(30 + (i % 4) * 14, 48 + (i % 3) * 20, h, 7, 2); const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) * (0.85 + Math.sin(k * 3.1 + i) * 0.15));
    g.computeVertexNormals(); const mm = new THREE.Mesh(g, rock); mm.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r); mm.rotation.y = i; scene.add(mm);
  }
  // tyre tracks and dust
  const dustTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(214,180,130,0.9)'); g.addColorStop(1, 'rgba(214,180,130,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const puffs = []; const puffGeo = new THREE.PlaneGeometry(1, 1);
  function puff(p, size, life, vel, color) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0.6, color: color || 0xffffff }));
    m.position.copy(p); m.scale.setScalar(size); scene.add(m); puffs.push({ m, life, age: 0, vel: vel || new THREE.Vector3(0, 0.6, 0), grow: size * 1.6 });
  }

  /* ---------- the course: things to drive into, over and through ---------- */
  const PM = { ground: new CANNON.Material('ground') };
  function addStatic(mesh, shape, pos, quat) {
    const b = new CANNON.Body({ mass: 0, material: PM.ground }); b.addShape(shape); b.position.copy(pos); if (quat) b.quaternion.copy(quat);
    world.addBody(b); mesh.position.copy(pos); if (quat) mesh.quaternion.copy(quat); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); statics.push({ b, mesh });
  }
  function addDynamic(mesh, shape, mass, pos, metal) {
    const b = new CANNON.Body({ mass, material: PM.ground, linearDamping: 0.05, angularDamping: 0.1 }); b.addShape(shape); b.position.copy(pos); b.allowSleep = true; b.sleepSpeedLimit = 0.2;
    world.addBody(b); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); dynamics.push({ b, mesh, metal });
  }
  function buildCourse() {
    const plank = new THREE.MeshStandardMaterial({ map: plankTex(), roughness: 0.85 });
    const steel = new THREE.MeshStandardMaterial({ map: rustPaintTex('#6e5a44', 0.7, 81).color, roughness: 0.7, metalness: 0.5 });
    const conc = new THREE.MeshStandardMaterial({ color: 0xb5ada0, roughness: 0.9 });
    const cont = new THREE.MeshStandardMaterial({ map: rustPaintTex('#2f5d7a', 0.55, 82).color, roughness: 0.7, metalness: 0.45 });
    const drumM = new THREE.MeshStandardMaterial({ map: rustPaintTex('#9a2a18', 0.5, 83, 256).color, roughness: 0.6, metalness: 0.5 });
    const rubber = new THREE.MeshStandardMaterial({ map: rubberTex(), roughness: 0.92 });
    // ramps: a tilted slab
    const ramp = (x, z, yawA, len, wid, ang, mat) => {
      const q = new CANNON.Quaternion().setFromEuler(-ang, yawA, 0, 'YXZ'), th = 0.3;
      const pos = new CANNON.Vec3(x, Math.sin(ang) * len / 2 - th / 2 * Math.cos(ang) + 0.02, z);
      addStatic(new THREE.Mesh(new THREE.BoxGeometry(wid, th, len), mat), new CANNON.Box(new CANNON.Vec3(wid / 2, th / 2, len / 2)), pos, q);
    };
    ramp(0, 45, 0, 9, 5, 0.22, steel); ramp(-30, 20, Math.PI / 2, 8, 4, 0.28, plank); ramp(35, -25, -0.6, 10, 6, 0.18, steel);
    ramp(0, 62, Math.PI, 9, 5, 0.22, steel);
    // jersey barriers in a chicane
    for (let i = 0; i < 9; i++) addStatic(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 3.2), conc), new CANNON.Box(new CANNON.Vec3(0.3, 0.425, 1.6)), new CANNON.Vec3(-18 + (i % 2) * 7, 0.425, -10 - i * 6), null);
    // shipping containers
    for (const [x, z, r] of [[25, 18, 0.3], [28, 12, 0.3], [-40, -40, 1.2]]) addStatic(new THREE.Mesh(new THREE.BoxGeometry(2.44, 2.6, 6.1), cont), new CANNON.Box(new CANNON.Vec3(1.22, 1.3, 3.05)), new CANNON.Vec3(x, 1.3, z), new CANNON.Quaternion().setFromEuler(0, r, 0));
    // crates and drums to plough through
    for (let i = 0; i < 14; i++) { const s = 0.9; addDynamic(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), plank), new CANNON.Box(new CANNON.Vec3(s / 2, s / 2, s / 2)), 40, new CANNON.Vec3(12 + (i % 4) * 1.0, s / 2 + Math.floor(i / 4) * s, 8 + (i % 2) * 0.1), false); }
    for (let i = 0; i < 12; i++) addDynamic(new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 18), drumM), new CANNON.Cylinder(0.29, 0.29, 0.88, 10), 30, new CANNON.Vec3(-8 + (i % 6) * 0.7, 0.44, 24 + Math.floor(i / 6) * 0.7), true);
    // a wall of tyres
    for (let i = 0; i < 16; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.14, 10, 20), rubber); t.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(t); addDynamic(g, new CANNON.Cylinder(0.48, 0.48, 0.28, 10), 12, new CANNON.Vec3(-25 + (i % 8) * 1.0, 0.14 + Math.floor(i / 8) * 0.28, 40), false); }
    // marker posts with rags for flags
    const pole = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.6, metalness: 0.5 }), rag = new THREE.MeshStandardMaterial({ color: 0xb8461e, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, x = Math.cos(a) * 70, z = Math.sin(a) * 70; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4, 6), pole); p.position.set(x, 2, z); p.castShadow = true; scene.add(p); statics.push({ mesh: p }); const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), rag); f.position.set(x + 0.5, 3.6, z); f.userData.flag = i; scene.add(f); statics.push({ mesh: f }); }
  }

  /* ---------- the car ---------- */
  function buildCarVisual(spec) {
    carVis = new THREE.Group(); const inner = new THREE.Group(); carVis.add(inner);
    inner.position.set(-car.com.x, -car.com.y, -car.com.z);   // part space is frame space; the body's origin is its centre of mass
    wheelsVis = [];
    for (const p of spec.parts) {
      const o = buildPart(p.key); o.position.set(...p.pos); o.rotation.y = p.rotY; inner.add(o);
      if (p.key === 'turret') turret = { o, yaw: o.getObjectByName('yaw'), pitch: o.getObjectByName('pitch'), muzzle: o.getObjectByName('muzzle') };
      if (p.key.startsWith('wheel')) {
        const spin = o.getObjectByName('spin'), arm = o.getObjectByName('arm'), coil = o.getObjectByName('coil');
        // the spinning part moves to wherever the physics puts the wheel
        o.remove(spin); scene.add(spin);
        wheelsVis.push({ socket: p.socket, spin, roll: spin.getObjectByName('roll'), knuckle: spin.getObjectByName('knuckle'), arm, coil, mount: o, side: p.side });
      }
      if (p.key === 'engine') carVis.userData.fan = o.getObjectByName('fan');
    }
    carVis.traverse(c => { if (c.isMesh) c.castShadow = true; });
    scene.add(carVis);
    // headlights
    for (const s of [-1, 1]) { const l = new THREE.SpotLight(0xffe6c0, 30, 40, 0.45, 0.6, 1.5); l.position.set(s * 0.6 - car.com.x, 0.55 - car.com.y, 2.2 - car.com.z); l.target.position.set(s * 0.6 - car.com.x, 0 - car.com.y, 14 - car.com.z); carVis.add(l, l.target); }
  }
  function start(spec) {
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world); world.allowSleep = true;
    world.defaultContactMaterial.friction = 0.35; world.defaultContactMaterial.restitution = 0.05;
    const gb = new CANNON.Body({ mass: 0, material: PM.ground }); gb.addShape(new CANNON.Plane()); gb.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(gb);
    buildCourse();
    car = createVehicle(world, spec, { x: 0, y: 1.0, z: 0, yaw: 0 });
    car.body.collisionFilterGroup = 2;   // so the gun's rays pass through your own car
    buildCarVisual(spec);
    eng = engineSound();
    yaw = Math.PI; pitch = 0.3; active = true;
    for (const k in keys) keys[k] = false;
  }
  function stop() {
    active = false; if (eng) { eng.stop(); eng = null; }
    if (document.pointerLockElement === dom) document.exitPointerLock();
    for (const s of statics) scene.remove(s.mesh); for (const d of dynamics) scene.remove(d.mesh); for (const w of wheelsVis) scene.remove(w.spin);
    for (const p of puffs) scene.remove(p.m); puffs.length = 0;
    for (const t of tracers) scene.remove(t.line); tracers.length = 0;
    if (carVis) scene.remove(carVis);
    statics = []; dynamics = []; wheelsVis = []; carVis = null; car = null; world = null; turret = null;
  }

  /* ---------- input ---------- */
  const map = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'handbrake' };
  window.addEventListener('keydown', e => {
    if (!active) return; if (map[e.code]) { keys[map[e.code]] = true; e.preventDefault(); }
    if (e.code === 'KeyR') resetCar();
  });
  window.addEventListener('keyup', e => { if (map[e.code]) keys[map[e.code]] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; firing = false; });
  dom.addEventListener('mousedown', e => {
    if (!active) return;
    if (e.button === 0) { if (!locked && dom.requestPointerLock) { const r = dom.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } firing = true; }
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) firing = false; });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === dom; hud.lock(locked); if (!locked) firing = false; });
  let lookT = 0;   // seconds since the mouse last moved the camera
  dom.addEventListener('mousemove', e => {
    if (!active) return;
    if (locked) { yaw -= e.movementX * 0.0025; pitch = Math.max(-0.15, Math.min(1.2, pitch + e.movementY * 0.0022)); lookT = 0; }
    else if (e.buttons & 2) { yaw -= e.movementX * 0.004; pitch = Math.max(-0.15, Math.min(1.2, pitch + e.movementY * 0.003)); lookT = 0; }
  });
  dom.addEventListener('wheel', e => { if (active) dist = Math.max(4.5, Math.min(16, dist * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: true });
  function resetCar() { if (!car) return; const p = car.body.position, f = car.body.quaternion.vmult(new CANNON.Vec3(0, 0, 1)); car.reset(p.x, p.z, Math.atan2(f.x, f.z)); }

  /* ---------- the gun ---------- */
  const tracers = [], tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
  const flash = new THREE.PointLight(0xffb060, 0, 8, 2); scene.add(flash);
  const rayRes = new CANNON.RaycastResult();
  function fire(dt) {
    fireT -= dt; if (!firing || fireT > 0 || !turret) { flash.intensity = Math.max(0, flash.intensity - dt * 120); return; }
    fireT = 0.09;
    const from = new THREE.Vector3(); turret.muzzle.getWorldPosition(from);
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(turret.muzzle.getWorldQuaternion(new THREE.Quaternion())).normalize();
    dir.x += (Math.random() - 0.5) * 0.012; dir.y += (Math.random() - 0.5) * 0.012; dir.normalize();
    const to = from.clone().addScaledVector(dir, 300);
    rayRes.reset(); world.raycastClosest(new CANNON.Vec3(from.x, from.y, from.z), new CANNON.Vec3(to.x, to.y, to.z), { skipBackfaces: true, collisionFilterMask: 1 }, rayRes);
    let end = to;
    if (rayRes.hasHit && rayRes.body !== car.body) {
      end = new THREE.Vector3(rayRes.hitPointWorld.x, rayRes.hitPointWorld.y, rayRes.hitPointWorld.z);
      const d = dynamics.find(q => q.b === rayRes.body);
      if (d) { d.b.wakeUp(); d.b.applyImpulse(new CANNON.Vec3(dir.x * 140, dir.y * 140 + 30, dir.z * 140), rayRes.hitPointWorld); }
      hit(d ? d.metal : false);
      for (let i = 0; i < 3; i++) puff(end.clone().add(new THREE.Vector3(0, 0.1, 0)), 0.5 + Math.random() * 0.4, 0.7, new THREE.Vector3((Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5));
    }
    const geo = new THREE.BufferGeometry().setFromPoints([from, from.clone().lerp(end, 0.12)]);
    const line = new THREE.Line(geo, tracerMat); scene.add(line); tracers.push({ line, from: from.clone(), end, t: 0, len: from.distanceTo(end) });
    flash.position.copy(from); flash.intensity = 40; shot();
    car.body.applyImpulse(new CANNON.Vec3(-dir.x * 25, 0, -dir.z * 25), car.body.position);
  }

  /* ---------- every frame ---------- */
  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), camTarget = new THREE.Vector3(), aim = new THREE.Vector3();
  let t = 0;
  function update(dt) {
    if (!active) return;
    t += dt;
    const input = { up: keys.up, down: keys.down, left: keys.left, right: keys.right, handbrake: keys.handbrake };
    car.drive(input, dt);
    world.step(1 / 60, dt, 4);
    const b = car.body;
    carVis.position.copy(b.position); carVis.quaternion.copy(b.quaternion);
    if (carVis.userData.fan) carVis.userData.fan.rotation.z += dt * (car.state.rpm / 60) * 2;
    // wheels: the physics wheel transform, then each arm swings to meet its hub
    for (let i = 0; i < car.vehicle.wheelInfos.length; i++) {
      car.vehicle.updateWheelTransform(i);
      const tr = car.vehicle.wheelInfos[i].worldTransform, wv = wheelsVis[i]; if (!wv) continue;
      wv.spin.position.copy(tr.position);
      // steering about the car's up, then the roll about the axle; the left-side wheels are the same part turned round
      tmpQ.copy(b.quaternion); wv.spin.quaternion.copy(tmpQ);
      if (wv.side < 0) wv.spin.rotateY(Math.PI);
      wv.knuckle.rotation.y = car.vehicle.wheelInfos[i].steering * (wv.side < 0 ? 1 : 1);
      wv.roll.rotation.x = -car.vehicle.wheelInfos[i].rotation * (wv.side < 0 ? -1 : 1);   // cannon counts forward roll as negative
      // swing the arm to point at the hub
      tmpV.copy(tr.position); wv.mount.worldToLocal(tmpV);
      const arm = wv.arm, hx = tmpV.x - (WHEEL.width * 0.5), ang = Math.atan2(tmpV.y, hx - arm.position.x);
      arm.rotation.z = ang; wv.coil.position.y = tmpV.y + 0.05;
      // dust from fast or sliding wheels
      const info = car.vehicle.wheelInfos[i];
      if (info.isInContact && (car.state.kmh > 25 || info.sliding) && Math.random() < (info.sliding ? 0.5 : car.state.kmh / 400)) {
        const p = new THREE.Vector3(info.raycastResult.hitPointWorld.x, 0.2, info.raycastResult.hitPointWorld.z);
        puff(p, 0.8 + Math.random() * 0.6, 1.4 + Math.random(), new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8));
      }
    }
    for (const d of dynamics) { d.mesh.position.copy(d.b.position); d.mesh.quaternion.copy(d.b.quaternion); }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.age += dt; const k = p.age / p.life;
      p.m.position.addScaledVector(p.vel, dt); p.m.scale.setScalar(p.m.scale.x + p.grow * dt * 0.6); p.m.material.opacity = 0.55 * (1 - k); p.m.quaternion.copy(camera.quaternion);
      if (k >= 1) { scene.remove(p.m); p.m.material.dispose(); puffs.splice(i, 1); }
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i]; tr.t += dt; const head = Math.min(1, tr.t * 900 / tr.len), tail = Math.max(0, head - 30 / tr.len);
      const pos = tr.line.geometry.attributes.position;
      const a = tr.from.clone().lerp(tr.end, tail), c = tr.from.clone().lerp(tr.end, head); pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, c.x, c.y, c.z); pos.needsUpdate = true;
      if (head >= 1 && tr.t > 0.05) { scene.remove(tr.line); tr.line.geometry.dispose(); tracers.splice(i, 1); }
    }
    for (const s of statics) if (s.mesh.userData.flag !== undefined) s.mesh.rotation.y = Math.sin(t * 3 + s.mesh.userData.flag) * 0.4;
    // camera: orbit behind the car where the mouse puts it; left alone, it drifts back behind the car
    const bp = carVis.position;
    lookT += dt;
    if (lookT > 1.5 && Math.abs(car.state.speed) > 2) {
      const f = car.body.quaternion.vmult(new CANNON.Vec3(0, 0, 1)), behind = Math.atan2(-f.x, -f.z);
      let d = behind - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * 1.8);
    }
    camTarget.lerp(tmpV.set(bp.x, bp.y + 1.1, bp.z), Math.min(1, dt * 10));
    const cx = camTarget.x + Math.sin(yaw) * Math.cos(pitch) * dist, cz = camTarget.z + Math.cos(yaw) * Math.cos(pitch) * dist, cy = Math.max(0.6, camTarget.y + Math.sin(pitch) * dist);
    camera.position.set(cx, cy, cz); camera.lookAt(camTarget);
    // the turret turns toward what the camera looks at
    if (turret) {
      aim.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(60).add(camera.position); aim.y += 1.5;
      const local = turret.yaw.parent.worldToLocal(aim.clone());
      const wantYaw = Math.atan2(local.x, local.z);
      let dy = wantYaw - turret.yaw.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      turret.yaw.rotation.y += Math.max(-dt * 2.6, Math.min(dt * 2.6, dy));
      const lp = turret.pitch.parent.worldToLocal(aim.clone()); const wantPitch = -Math.atan2(lp.y - turret.pitch.position.y, Math.hypot(lp.x, lp.z));
      turret.pitch.rotation.x += (Math.max(-0.5, Math.min(0.25, wantPitch)) - turret.pitch.rotation.x) * Math.min(1, dt * 6);
    }
    fire(dt);
    // the sun's shadow box follows the car
    sunL.position.copy(bp).addScaledVector(sun, 80); sunL.target.position.copy(bp); sunL.target.updateMatrixWorld();
    if (eng) eng.set(car.state.rpm, car.state.throttle);
    hud.update(car.state);
  }
  function resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  // for tests: run the drive for a while without drawing (the same update the frame loop calls)
  function simulate(secs, input) { const save = Object.assign({}, keys); Object.assign(keys, { up: false, down: false, left: false, right: false, handbrake: false }, input || {}); for (let i = 0; i < secs * 60; i++) update(1 / 60); Object.assign(keys, save); }
  return { scene, camera, start, stop, update, resize, simulate, get active() { return active; }, get car() { return car; }, keys, resetCar };
}

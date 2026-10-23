// DRIVE for RiversOfRust: turns the car you built into a physics vehicle (cannon-es raycast vehicle) and drives it.
// No drawing here, so it runs (and is tested) without a screen. Everything is in metres, kilograms and seconds.
import * as CANNON from 'cannon-es';
import { U, WHEEL, PART_DEFS } from './config.js';
import { wheelCentre } from './config.js';

// the collision box of each part, in its own space: [half extents], [centre]
const HULL = {
  frame: { h: [2 * U, 1 * U, 6 * U], c: [0, 1 * U, 0] },
  body: { h: [2 * U, 1.5 * U, 3 * U], c: [0, 1.5 * U, 0] },
  engine: { h: [0.32, 0.4, 0.55], c: [0, 0.45, 0.1] },
  turret: { h: [0.33, 0.3, 0.33], c: [0, 0.3, 0] }
};
const TUNE = {
  stiffness: 42, dampC: 3.6, dampR: 4.6, frictionSlip: 2.6, rollInfluence: 0.06,
  maxForce: 5600,           // newtons at the wheels, all four together, before the power runs out
  topSpeed: 33.5,           // m/s (about 120 km/h): the gearing tops out here
  reverseTop: 9,            // m/s
  brake: 52,                // brake impulse per wheel per step (N·s at 60 Hz ≈ 3.1 kN per wheel)
  handbrake: 70, steerMax: 0.56, steerRate: 2.6, drag: 0.55, rolling: 18
};

export function createVehicle(world, spec, at = { x: 0, y: 1.2, z: 0, yaw: 0 }, groundMaterial) {
  // centre of mass from where each part sits and what it weighs (the wheels count at their hubs)
  let m = 0; const com = new CANNON.Vec3();
  const centreOf = p => {
    if (p.key === 'wheelS' || p.key === 'wheelD') { const w = wheelCentre(p.side, p.end); return [w.x, w.y, w.z]; }
    const h = HULL[p.key]; return [p.pos[0] + h.c[0], p.pos[1] + h.c[1], p.pos[2] + h.c[2]];
  };
  for (const p of spec.parts) { const c = centreOf(p); com.x += c[0] * p.mass; com.y += c[1] * p.mass; com.z += c[2] * p.mass; m += p.mass; }
  com.scale(1 / m, com);
  const body = new CANNON.Body({ mass: m, material: new CANNON.Material('chassis'), linearDamping: 0.02, angularDamping: 0.25, allowSleep: false });
  for (const p of spec.parts) {
    const h = HULL[p.key]; if (!h) continue;
    const c = centreOf(p);
    body.addShape(new CANNON.Box(new CANNON.Vec3(h.h[0], h.h[1], h.h[2])), new CANNON.Vec3(c[0] - com.x, c[1] - com.y, c[2] - com.z));
  }
  body.position.set(at.x, at.y, at.z);
  body.quaternion.setFromEuler(0, at.yaw || 0, 0);
  const vehicle = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
  const wheels = [];
  for (const p of spec.parts) {
    if (p.key !== 'wheelS' && p.key !== 'wheelD') continue;
    const w = wheelCentre(p.side, p.end);
    // the ray starts `rest` above where the hub sits at rest, so at rest the wheel is where the build put it
    const conn = new CANNON.Vec3(w.x - com.x, w.y - com.y + WHEEL.rest, w.z - com.z);
    vehicle.addWheel({
      radius: WHEEL.radius, directionLocal: new CANNON.Vec3(0, -1, 0), axleLocal: new CANNON.Vec3(1, 0, 0), chassisConnectionPointLocal: conn,
      suspensionStiffness: TUNE.stiffness, suspensionRestLength: WHEEL.rest, maxSuspensionTravel: WHEEL.travel, maxSuspensionForce: 1e6,
      dampingCompression: TUNE.dampC, dampingRelaxation: TUNE.dampR, frictionSlip: TUNE.frictionSlip, rollInfluence: TUNE.rollInfluence,
      useCustomSlidingRotationalSpeed: true, customSlidingRotationalSpeed: -30
    });
    wheels.push({ socket: p.socket, key: p.key, steer: !!PART_DEFS[p.key].steer, end: p.end, side: p.side });
  }
  vehicle.addToWorld(world);
  const st = { steer: 0, throttle: 0, speed: 0, kmh: 0, rpm: 900, gear: 'N', grounded: 0, slip: 0, flippedFor: 0 };

  // one physics step's worth of driving. input: { up, down, left, right, handbrake } booleans
  function drive(input, dt) {
    const v = body.velocity, q = body.quaternion;
    const fwd = q.vmult(new CANNON.Vec3(0, 0, 1)), up = q.vmult(new CANNON.Vec3(0, 1, 0));
    const along = v.dot(fwd); st.speed = along; st.kmh = Math.abs(along) * 3.6;
    // throttle: forward, or brake then reverse
    let force = 0, brake = 0;
    if (input.up && !input.down) { force = along < TUNE.topSpeed ? 1 : 0; st.gear = 'D'; }
    else if (input.down && !input.up) {
      if (along > 1.2) brake = TUNE.brake;
      else { force = along > -TUNE.reverseTop ? -0.55 : 0; st.gear = 'R'; }
    } else if (Math.abs(along) < 0.3) st.gear = 'N';
    st.throttle += ((force !== 0 ? 1 : 0) - st.throttle) * Math.min(1, dt * 6);
    // the engine's power runs out as speed rises (P = F v), so the push fades toward the top speed
    const power = PART_DEFS.engine.power * 745.7 * 0.6;   // what reaches the ground through the box and the 4WD
    const avail = Math.min(TUNE.maxForce, power / Math.max(4, Math.abs(along)));
    const fade = force > 0 ? Math.max(0, 1 - Math.pow(Math.max(0, along) / TUNE.topSpeed, 6)) : 1;
    const driven = wheels.length || 1, per = force * avail * fade / driven;
    // steering, gentler at speed
    const target = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    st.steer += Math.max(-1, Math.min(1, target - st.steer)) * Math.min(1, dt * TUNE.steerRate * (target === 0 ? 1.6 : 1));
    if (Math.abs(st.steer) < 0.002 && target === 0) st.steer = 0;
    const steerAng = st.steer * TUNE.steerMax / (1 + Math.abs(along) / 16);
    st.grounded = 0;
    wheels.forEach((w, i) => {
      const info = vehicle.wheelInfos[i];
      if (info.isInContact) st.grounded++;
      vehicle.applyEngineForce(-per, i);                             // 4WD: every wheel is driven (cannon pushes -z for +force)
      vehicle.setSteeringValue(w.steer ? steerAng * (w.end > 0 ? 1 : -1) : 0, i);
      const hb = input.handbrake && w.end < 0;
      vehicle.setBrake(hb ? TUNE.handbrake : brake, i);
      info.frictionSlip = hb ? TUNE.frictionSlip * 0.55 : TUNE.frictionSlip;
    });
    // air drag and rolling resistance
    if (v.lengthSquared() > 0.01) {
      const sp = v.length(), f = TUNE.drag * sp * sp + (st.grounded ? TUNE.rolling * Math.min(sp, 3) : 0);
      body.applyForce(v.scale(-f / sp), body.position);
    }
    // the sound and the gauge: revs from wheel speed through a three-speed box
    const ws = Math.abs(along), gearTop = [9, 19, 34], gi = ws < gearTop[0] ? 0 : ws < gearTop[1] ? 1 : 2;
    const lo = gi ? gearTop[gi - 1] : 0, frac = (ws - lo) / (gearTop[gi] - lo);
    const target_rpm = 900 + (st.throttle > 0.1 || ws > 0.5 ? (gi === 0 ? frac * 5200 : 2600 + frac * 3600) : 0) + st.throttle * (st.grounded ? 400 : 2200);
    st.rpm += (target_rpm - st.rpm) * Math.min(1, dt * 5);
    st.gearN = gi + 1;
    let slip = 0; for (const info of vehicle.wheelInfos) slip = Math.max(slip, info.sliding ? 1 - info.skidInfo : 0); st.slip = slip;
    // on its roof or side for a while: the game offers a reset
    st.flippedFor = up.y < 0.35 ? st.flippedFor + dt : 0;
  }
  function reset(x, z, yaw) {
    body.position.set(x, 1.6, z); body.quaternion.setFromEuler(0, yaw || 0, 0);
    body.velocity.setZero(); body.angularVelocity.setZero(); st.steer = 0; st.flippedFor = 0;
  }
  return { body, vehicle, wheels, com, mass: m, state: st, drive, reset, tune: TUNE };
}

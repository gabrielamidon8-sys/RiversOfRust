// Drives the built car with no screen and checks it behaves like a car: sits still, accelerates, tops out,
// turns without rolling over, brakes, and reverses. Run: node tests/physics.test.mjs
import * as CANNON from '../vendor/cannon-es.js';
import { createVehicle } from '../js/vehicle.js';
import { vehicleSpec } from '../js/assembly.js';

const FULL = [
  { uid: 1, key: 'frame', socket: 'lift' }, { uid: 2, key: 'body', socket: 'deck:-1' }, { uid: 3, key: 'engine', socket: 'well' },
  { uid: 4, key: 'wheelS', socket: 'mount:FL' }, { uid: 5, key: 'wheelS', socket: 'mount:FR' },
  { uid: 6, key: 'wheelD', socket: 'mount:RL' }, { uid: 7, key: 'wheelD', socket: 'mount:RR' }, { uid: 8, key: 'turret', socket: 'roof:0' }
];
function setup() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world); world.defaultContactMaterial.friction = 0.3;
  const ground = new CANNON.Body({ mass: 0 }); ground.addShape(new CANNON.Plane()); ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(ground);
  const car = createVehicle(world, vehicleSpec(FULL), { x: 0, y: 1.0, z: 0, yaw: 0 });
  return { world, car };
}
const DT = 1 / 60;
function run(w, car, secs, input, each) { for (let i = 0; i < secs / DT; i++) { car.drive(input, DT); w.step(DT); if (each) each(i * DT); } }
let fails = 0; const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const up = car => car.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y;

{ // sits still
  const { world, car } = setup();
  run(world, car, 4, {});
  const p = car.body.position, v = car.body.velocity.length();
  ok(v < 0.05 && Math.abs(p.x) < 0.05 && Math.abs(p.z) < 0.05 && up(car) > 0.99, `rests level and still (speed ${v.toFixed(3)} m/s, drift ${Math.hypot(p.x, p.z).toFixed(3)} m, mass ${car.mass} kg, wheels on ground ${car.state.grounded || 'n/a'})`);
  const lows = car.vehicle.wheelInfos.map(w => w.suspensionLength.toFixed(3));
  console.log('   suspension lengths at rest', lows.join(' '), ' com', car.com.toString());
}
{ // accelerates forward and tops out
  const { world, car } = setup(); run(world, car, 1, {});
  let t100 = null, t = 0; const z0 = car.body.position.z;
  run(world, car, 22, { up: true }, tt => { t = tt; if (t100 === null && car.state.kmh >= 100) t100 = tt; });
  ok(car.body.position.z - z0 > 20, `W drives forward (+z moved ${(car.body.position.z - z0).toFixed(1)} m)`);
  ok(t100 !== null && t100 > 4 && t100 < 11, `0-100 km/h in ${t100 && t100.toFixed(1)} s`);
  ok(car.state.kmh > 105 && car.state.kmh < 128, `top speed ${car.state.kmh.toFixed(0)} km/h`);
  ok(up(car) > 0.95, 'stays upright flat out');
  // brakes from top speed
  const zb = car.body.position.z, k0 = car.state.kmh; let tb = 0, dist = 0, stopped = false;
  run(world, car, 8, { down: true }, tt => { if (!stopped && car.state.speed < 0.5) { stopped = true; tb = tt; dist = car.body.position.z - zb; } });
  ok(stopped && dist > 30 && dist < 90, `brakes from ${k0.toFixed(0)} km/h in ${dist.toFixed(0)} m, ${tb.toFixed(1)} s`);
}
{ // turns: full lock at 40 km/h for 6 s, must not roll
  const { world, car } = setup(); run(world, car, 1, {});
  for (let i = 0; i < 600 && car.state.kmh < 40; i++) { car.drive({ up: true }, DT); world.step(DT); }
  let minUp = 1, yaw0 = Math.atan2(car.body.quaternion.vmult(new CANNON.Vec3(0, 0, 1)).x, car.body.quaternion.vmult(new CANNON.Vec3(0, 0, 1)).z);
  const pts = [];
  let turned = 0, prev = null;
  for (let i = 0; i < 6 / DT; i++) {
    car.drive({ up: car.state.kmh < 40, left: true }, DT); world.step(DT);
    minUp = Math.min(minUp, up(car)); pts.push([car.body.position.x, car.body.position.z]);
    const f = car.body.quaternion.vmult(new CANNON.Vec3(0, 0, 1)), yw = Math.atan2(f.x, f.z);
    if (prev !== null) { let d = yw - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; turned += d; } prev = yw;
  }
  const f = car.body.quaternion.vmult(new CANNON.Vec3(0, 0, 1)), yaw1 = Math.atan2(f.x, f.z);
  // turning circle from the path's extent
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]), span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  ok(minUp > 0.6, `full lock at speed keeps it on its wheels (lowest up ${minUp.toFixed(2)})`);
  const radius = (40 / 3.6) * 6 / Math.abs(turned);
  ok(Math.abs(turned) > Math.PI, `A turns the car at 40 km/h: ${(turned * 180 / Math.PI).toFixed(0)} deg in 6 s, radius about ${radius.toFixed(1)} m`);
  const fl = car.body.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
  console.log('   heading change', ((yaw1 - yaw0) * 180 / Math.PI).toFixed(0), 'deg; right axis', fl.toString());
}
{ // left really is left: from rest, a gentle left turn should move toward +x (the car's left when facing +z is +x? check)
  const { world, car } = setup(); run(world, car, 1, {});
  run(world, car, 3, { up: true, left: true });
  const p = car.body.position;
  console.log(`   after 3 s of W+A: x ${p.x.toFixed(2)} z ${p.z.toFixed(2)}`);
  ok(p.x > 0.5, 'A steers to the left (+x is the left-hand side when the car faces +z and the camera sits behind it)');
}
{ // reverses
  const { world, car } = setup(); run(world, car, 1, {});
  run(world, car, 4, { down: true });
  ok(car.body.position.z < -3 && car.state.gear === 'R', `S from rest reverses (${car.body.position.z.toFixed(1)} m, ${car.state.kmh.toFixed(0)} km/h)`);
}
{ // the handbrake swings the back out
  const { world, car } = setup(); run(world, car, 1, {});
  run(world, car, 30, { up: true }, () => {}); // up to speed
  run(world, car, 1.2, { up: true, left: true, handbrake: true });
  ok(up(car) > 0.5, 'handbrake turn at speed stays on its wheels');
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);

// RiversOfRust: shared numbers. One grid unit is 0.35 m, so the 4 x 12 x 2 frame is 1.4 m wide, 4.2 m long and
// 0.7 m tall, the 4 x 6 half body is a real cabin's footprint and its 3-unit height (1.05 m) a real cabin's height.
export const U = 0.35;
export const VERSION = '0.1.0';

// what each part is, what it weighs (kg) and what it says in the parts panel
export const PART_DEFS = {
  frame: { name: 'Frame', sub: '4 × 12 × 2', mass: 420, hp: 900, desc: 'Ladder frame. Everything bolts to it: the body on top, the engine in the well, a wheel on each 1 × 2 mount.' },
  body: { name: 'Half body', sub: '4 × 6 cabin', mass: 260, hp: 600, desc: 'A cabin with no hood. Sits on the frame’s deck; its 4 × 2 roof takes parts on top only.' },
  engine: { name: 'Engine', sub: 'V8 · 420 hp', mass: 230, hp: 300, power: 420, desc: 'Drops into the engine well at the front of the frame. Powers all four wheels.' },
  wheelS: { name: 'Steering wheel', sub: 'steers + driven', mass: 32, hp: 160, steer: true, desc: 'Turns. Fit them at the front; at the back they steer the other way. 4WD: they are driven too.' },
  wheelD: { name: 'Drive wheel', sub: 'accelerates', mass: 32, hp: 160, steer: false, desc: 'Puts the power down. Fit them on the rear mounts.' },
  turret: { name: 'Turret', sub: '2 × 2 base · MG', mass: 140, hp: 220, desc: 'Machine-gun turret on a 2 × 2 base. Bolts to the roof.' }
};
// the parts in the garage at the start, in panel order
export const INVENTORY = ['frame', 'body', 'engine', 'wheelS', 'wheelS', 'wheelD', 'wheelD', 'turret'];

// wheels and suspension (metres, seconds)
export const WHEEL = { radius: 0.42, width: 0.3, armOut: 0.11, drop: 0.12, rest: 0.26, travel: 0.22 };
// the frame's wheel mounts: 1 x 2 plates on the side faces, centred 0.5 units up, 4 units from the middle
export const MOUNT = { y: 0.5 * U, z: 4 * U, x: 2 * U + 0.032 };   // x: the outer face of the mount plate
// where the wheel's centre sits in frame space when the suspension rests: outboard of the mount and a little lower
export function wheelCentre(side, zSign) {
  return { x: side * (MOUNT.x + WHEEL.armOut + WHEEL.width / 2 + 0.04), y: MOUNT.y - WHEEL.drop, z: zSign * MOUNT.z };
}
// the lift raises the frame this far in build mode, so the wheels hang clear of the floor
export const LIFT_BUILD = 0.95;

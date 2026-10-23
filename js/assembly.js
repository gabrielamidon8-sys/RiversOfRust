// BUILDER rules for RiversOfRust: which part bolts where. Pure logic, no drawing, so it can be tested on its own.
// Sockets are named, and every position is in frame space (see parts.js):
//   lift              the frame itself, on the garage lift
//   deck:-3..-1       the half body on the frame's deck (the number is where its middle sits, in units)
//   well              the engine, in the well at the front of the frame
//   mount:FL/FR/RL/RR the wheels, on the four 1 x 2 mounts
//   roof:-1/0/1       the turret on the body's 4 x 2 roof (the number is its sideways offset, in units)
import { U, PART_DEFS, INVENTORY } from './config.js';

const MOUNT_FACE = 2 * U + 0.032;
export const SOCKET_KIND = { frame: 'lift', body: 'deck', engine: 'well', wheelS: 'mount', wheelD: 'mount', turret: 'roof' };

export function partAt(placed, socket) { return placed.find(p => p.socket === socket) || null; }
export function has(placed, key) { return placed.some(p => p.key === key); }

// where a socket puts a part, in frame space: position and turn about the vertical
export function socketTransform(socket, placed) {
  const [kind, arg] = socket.split(':');
  if (kind === 'lift') return { pos: [0, 0, 0], rotY: 0 };
  if (kind === 'deck') return { pos: [0, 2 * U, +arg * U], rotY: 0 };
  if (kind === 'well') return { pos: [0, 0.5 * U, 4 * U], rotY: 0 };
  if (kind === 'mount') {
    const sx = arg[1] === 'R' ? 1 : -1, sz = arg[0] === 'F' ? 1 : -1;
    return { pos: [sx * MOUNT_FACE, 0.5 * U, sz * 4 * U], rotY: sx > 0 ? 0 : Math.PI, side: sx, end: sz };
  }
  if (kind === 'roof') {
    const body = placed.find(p => p.key === 'body');
    const bz = body ? +body.socket.split(':')[1] : -1;
    return { pos: [+arg * U, 5 * U, bz * U], rotY: 0 };
  }
  throw new Error('unknown socket ' + socket);
}

// the free sockets this part could go on right now
export function freeSockets(key, placed) {
  const kind = SOCKET_KIND[key], frame = has(placed, 'frame');
  if (kind === 'lift') return frame ? [] : ['lift'];
  if (!frame) return [];
  if (kind === 'deck') return has(placed, 'body') ? [] : ['deck:-3', 'deck:-2', 'deck:-1'];
  if (kind === 'well') return partAt(placed, 'well') ? [] : ['well'];
  if (kind === 'mount') return ['mount:FL', 'mount:FR', 'mount:RL', 'mount:RR'].filter(s => !partAt(placed, s));
  if (kind === 'roof') {
    if (!has(placed, 'body')) return [];
    // a turret covers two units of the four-unit-wide roof
    const used = placed.filter(p => SOCKET_KIND[p.key] === 'roof').map(p => +p.socket.split(':')[1]);
    return ['roof:-1', 'roof:0', 'roof:1'].filter(s => { const x = +s.split(':')[1]; return used.every(u => Math.abs(u - x) >= 2); });
  }
  return [];
}

// why a part can't go on yet ('' when it can)
export function lockReason(key, placed) {
  if (freeSockets(key, placed).length) return '';
  if (key !== 'frame' && !has(placed, 'frame')) return 'Place the frame first';
  if (key === 'turret' && !has(placed, 'body')) return 'Needs the half body: it bolts to the roof';
  return 'No free spot';
}

// what comes off with this part (itself and everything bolted to it)
export function dependents(placed, uid) {
  const p = placed.find(q => q.uid === uid); if (!p) return [];
  if (p.key === 'frame') return placed.slice();
  if (p.key === 'body') return placed.filter(q => q.uid === uid || SOCKET_KIND[q.key] === 'roof');
  return [p];
}

// the parts still in the panel, given what's on the car
export function remaining(placed) {
  const left = INVENTORY.slice();
  for (const p of placed) { const i = left.indexOf(p.key); if (i >= 0) left.splice(i, 1); }
  return left;
}
export function complete(placed) { return remaining(placed).length === 0; }

// everything the physics needs to know about the car, in frame space
export function vehicleSpec(placed) {
  const parts = placed.map(p => {
    const t = socketTransform(p.socket, placed), d = PART_DEFS[p.key];
    return { key: p.key, socket: p.socket, pos: t.pos, rotY: t.rotY, side: t.side, end: t.end, mass: d.mass };
  });
  return { parts, mass: parts.reduce((s, p) => s + p.mass, 0) };
}

export function serialize(placed) { return JSON.stringify(placed.map(p => ({ key: p.key, socket: p.socket }))); }
// rebuild a saved car, skipping anything that no longer fits the rules
export function deserialize(json) {
  let list; try { list = JSON.parse(json); } catch (e) { return []; }
  if (!Array.isArray(list)) return [];
  const placed = []; let uid = 1;
  const order = ['frame', 'body', 'engine', 'wheelS', 'wheelD', 'turret'];
  list.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  for (const it of list) {
    if (!it || !PART_DEFS[it.key] || !remaining(placed).includes(it.key)) continue;
    if (!freeSockets(it.key, placed).includes(it.socket)) continue;
    placed.push({ uid: uid++, key: it.key, socket: it.socket });
  }
  return placed;
}

// INPUT for RiversOfRust: keyboard and mouse, touch, or a controller. The game uses whatever you used last and
// switches on the spot (the same idea as Zombie City's input engine): a finger on the screen means touch, a key or the
// mouse means keyboard and mouse, a button or a stick on a controller means controller. <html data-input="..."> carries
// the current one so the page can show the right controls.

const mq = q => { try { return matchMedia(q).matches; } catch (e) { return false; } };
const FINE = mq('(any-pointer: fine)'), COARSE = mq('(pointer: coarse)');
export const IN = {
  kind: COARSE && !FINE ? 'touch' : 'kbm',
  mobile: COARSE && !FINE,                                    // a phone or tablet: lighter graphics, the touch layout
  app: /RiversOfRustApp/.test(navigator.userAgent),           // running inside the Android app
  pad: null                                                   // { index, id, type: 'xbox' | 'ps' } once a controller is used
};
const kindListeners = [], padListeners = [];
export function onInputChange(fn) { kindListeners.push(fn); }
export function onPadChange(fn) { padListeners.push(fn); }
function emit(list, v) { for (const f of list) { try { f(v); } catch (e) { console.error(e); } } }
document.documentElement.dataset.input = IN.kind;
export function setInput(kind) {
  if (IN.kind === kind) return;
  IN.kind = kind; document.documentElement.dataset.input = kind; emit(kindListeners, kind);
}

/* ---------- keyboard, mouse, touch ---------- */
let lastPadT = -1e9, mAcc = 0;
// on Android a controller's D-pad also sends arrow keys: a key right after controller input is the controller
window.addEventListener('keydown', e => { if (e.isTrusted && performance.now() - lastPadT > 400) setInput('kbm'); }, true);
window.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  mAcc += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
  if (mAcc > 30) { mAcc = 0; setInput('kbm'); }
}, true);
window.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') setInput('touch');
  else if (e.pointerType === 'mouse') { mAcc = 0; setInput('kbm'); }
}, true);

/* ---------- controller (the browser's standard mapping) ----------
   0 A / Cross   1 B / Circle   2 X / Square   3 Y / Triangle   4 LB / L1   5 RB / R1   6 LT / L2   7 RT / R2
   8 View / Share   9 Menu / Options   10 left stick press   11 right stick press   12-15 D-pad up, down, left, right */
export const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DEAD = 0.2;
let cur = [], prev = [], axes = [0, 0, 0, 0], gp = null;
// Xbox first: "Xbox Wireless Controller" would otherwise match Sony's "Wireless Controller" (a DualShock 4's name)
function padType(id) { return /xbox|xinput|045e/i.test(id) ? 'xbox' : /054c|playstation|dualsense|dualshock|wireless controller/i.test(id) ? 'ps' : 'xbox'; }
function livePads() { try { return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(g => g && g.connected) : []; } catch (e) { return []; } }
// call once a frame, before reading the controller
export function pollPad() {
  const pads = livePads();
  prev = cur; cur = [];
  // keep the controller in use; take another one as soon as it is touched
  let g = IN.pad && pads.find(p => p.index === IN.pad.index);
  const busy = p => p.buttons.some(b => (typeof b === 'object' ? b.value : b) > 0.5) || p.axes.some(a => Math.abs(a) > 0.6);
  const other = pads.find(p => (!g || p.index !== g.index) && busy(p));
  if (other) g = other;
  if (!g) {
    axes = [0, 0, 0, 0]; gp = null;
    if (IN.pad && !pads.length) { IN.pad = null; emit(padListeners, null); if (IN.kind === 'pad') setInput(IN.mobile ? 'touch' : 'kbm'); }
    return;
  }
  gp = g;
  for (let i = 0; i < g.buttons.length; i++) { const b = g.buttons[i]; cur[i] = typeof b === 'object' ? b.value : (b ? 1 : 0); }
  axes = [g.axes[0] || 0, g.axes[1] || 0, g.axes[2] || 0, g.axes[3] || 0];
  if (busy(g)) {
    lastPadT = performance.now();
    if (!IN.pad || IN.pad.index !== g.index || IN.pad.id !== g.id) { IN.pad = { index: g.index, id: g.id, type: padType(g.id) }; emit(padListeners, IN.pad); }
    setInput('pad');
  }
}
export const pad = {
  held: i => (cur[i] || 0) > 0.5,
  value: i => cur[i] || 0,
  hit: i => (cur[i] || 0) > 0.5 && !((prev[i] || 0) > 0.5),
  // a stick (0 left, 1 right) with a round dead zone, rescaled so movement starts smoothly at its edge
  stick(n) {
    const x = axes[n * 2], y = axes[n * 2 + 1], m = Math.hypot(x, y);
    if (m < DEAD) return { x: 0, y: 0 };
    const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
    return { x: x * k, y: y * k };
  },
  rumble(ms, weak, strong) {
    try { const a = gp && gp.vibrationActuator; if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, weakMagnitude: weak, strongMagnitude: strong }); } catch (e) { }
  },
  get connected() { return !!gp; }
};
window.addEventListener('gamepadconnected', e => { lastPadT = performance.now(); IN.pad = { index: e.gamepad.index, id: e.gamepad.id, type: padType(e.gamepad.id) }; emit(padListeners, IN.pad); setInput('pad'); });
window.addEventListener('gamepaddisconnected', () => { setTimeout(() => pollPad(), 0); });

// the button names on the controller in use, for the on-screen hints
const GLYPH = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', '↑', '↓', '←', '→'],
  ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', '↑', '↓', '←', '→']
};
export function glyph(i) { return GLYPH[(IN.pad && IN.pad.type) || 'xbox'][i]; }
// a button as a small badge: <kbd class="pb pb-a">A</kbd>
export function padKey(i) {
  const face = ['a', 'b', 'x', 'y'][i];
  return `<kbd class="pb${face ? ' pb-' + face : ''}${IN.pad && IN.pad.type === 'ps' ? ' ps' : ''}">${glyph(i)}</kbd>`;
}

/* ---------- touch vibration (Android) ---------- */
export function buzz(ms) { try { if (IN.kind === 'touch' && navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }

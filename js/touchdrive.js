// TOUCH for RiversOfRust's test drive: a floating stick on the left half of the screen (left and right steer, push up
// for gas, pull down to brake and reverse), any finger on the right half turns the camera and the turret with it, and
// three buttons: FIRE (keep your thumb on it and slide to aim while firing), HANDBRAKE and FLIP.
export function createTouchDrive(root) {
  const $ = id => root.querySelector('#' + id);
  const T = { steer: 0, gas: 0, brake: 0, hb: false, fire: false, flip: false, lookX: 0, lookY: 0 };
  const left = $('tLeft'), right = $('tRight'), base = $('tBase'), knob = $('tKnob');
  const R = 62, DZ = 0.12;
  const dz = v => Math.abs(v) < DZ ? 0 : (v - Math.sign(v) * DZ) / (1 - DZ);

  /* ---------- the stick: it appears wherever the left thumb lands ---------- */
  let stick = null;
  left.addEventListener('pointerdown', e => {
    if (stick !== null) return;
    e.preventDefault(); stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { left.setPointerCapture(e.pointerId); } catch (x) { }
    const r = left.getBoundingClientRect();
    base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px'; base.classList.add('on');
    move(e);
  });
  left.addEventListener('pointermove', e => { if (stick && e.pointerId === stick.id) move(e); });
  const endStick = e => {
    if (!stick || e.pointerId !== stick.id) return;
    stick = null; T.steer = T.gas = T.brake = 0; knob.style.transform = ''; base.classList.remove('on');
    base.style.left = base.style.top = '';   // back to its resting place, bottom left
  };
  left.addEventListener('pointerup', endStick); left.addEventListener('pointercancel', endStick);
  function move(e) {
    let dx = e.clientX - stick.x, dy = e.clientY - stick.y; const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dz(dx / R), ny = dz(dy / R);
    T.steer = -nx; T.gas = Math.max(0, -ny); T.brake = Math.max(0, ny);
  }

  /* ---------- looking: the right half, and the fire button while it's held ---------- */
  const looks = new Map();
  const lookStart = (el, e) => { looks.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { el.setPointerCapture(e.pointerId); } catch (x) { } };
  const lookMove = e => { const l = looks.get(e.pointerId); if (!l) return; T.lookX += e.clientX - l.x; T.lookY += e.clientY - l.y; l.x = e.clientX; l.y = e.clientY; };
  const lookEnd = e => looks.delete(e.pointerId);
  right.addEventListener('pointerdown', e => { e.preventDefault(); lookStart(right, e); });
  right.addEventListener('pointermove', lookMove);
  right.addEventListener('pointerup', lookEnd); right.addEventListener('pointercancel', lookEnd);

  /* ---------- buttons ---------- */
  function hold(id, onDown, onUp, look) {
    const b = $(id);
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); onDown(); if (look) lookStart(b, e); else try { b.setPointerCapture(e.pointerId); } catch (x) { } });
    if (look) b.addEventListener('pointermove', lookMove);
    const up = e => { b.classList.remove('down'); onUp(); if (look) lookEnd(e); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  hold('tFire', () => { T.fire = true; }, () => { T.fire = false; }, true);
  hold('tHb', () => { T.hb = true; }, () => { T.hb = false; });
  hold('tFlip', () => { T.flip = true; }, () => { });

  // how far the fingers have dragged since the last frame (then starts counting again)
  T.takeLook = () => { const d = { x: T.lookX, y: T.lookY }; T.lookX = T.lookY = 0; return d; };
  T.reset = () => {
    stick = null; looks.clear(); Object.assign(T, { steer: 0, gas: 0, brake: 0, hb: false, fire: false, flip: false, lookX: 0, lookY: 0 });
    knob.style.transform = ''; base.classList.remove('on'); base.style.left = base.style.top = ''; root.querySelectorAll('.tbtn.down').forEach(b => b.classList.remove('down'));
  };
  return T;
}

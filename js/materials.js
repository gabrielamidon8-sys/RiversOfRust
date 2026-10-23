// TEXEL for RiversOfRust: every surface is painted here in code (no image files): concrete, rusty paint, rubber,
// sand, planks, corrugated sheet. Each texture is made once and shared.
import * as THREE from 'three';

/* ---------- noise ---------- */
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function makeNoise(seed, size = 256) {
  const r = rng(seed), g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const sm = t => t * t * (3 - 2 * t);
  // tileable value noise at a frequency of `f` cells across the texture
  return (x, y, f) => {
    const fx = x * f, fy = y * f, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
    const w = f | 0, i = (a, b) => g[((((b % w) + w) % w) % size) * size + ((((a % w) + w) % w) % size)];
    const a = i(x0, y0), b = i(x0 + 1, y0), c = i(x0, y0 + 1), d = i(x0 + 1, y0 + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}
function fbm(n, x, y, f, oct = 5) { let s = 0, a = 0.5, t = 0; for (let o = 0; o < oct; o++) { s += n(x, y, f) * a; t += a; f *= 2; a *= 0.5; } return s / t; }

function canvasTex(size, paint, { repeat = 1, srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); paint(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// fill pixels with fn(u, v) -> [r, g, b] (0..255)
function pixels(ctx, size, fn) {
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = fn(x / size, y / size), i = (y * size + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
const cl = v => v < 0 ? 0 : v > 255 ? 255 : v;
const mix = (a, b, t) => a + (b - a) * t;

/* ---------- textures ---------- */
const cache = {};
function once(key, make) { return cache[key] || (cache[key] = make()); }

export function concreteTex() {
  return once('concrete', () => {
    const n = makeNoise(11), n2 = makeNoise(37), size = 1024;
    const color = canvasTex(size, (ctx, S) => {
      pixels(ctx, S, (u, v) => {
        const base = fbm(n, u, v, 8, 6), fine = n2(u, v, 256), blot = fbm(n2, u, v, 3, 3);
        let g = 112 + base * 70 + fine * 18 - Math.max(0, blot - 0.55) * 160;
        return [cl(g * 1.0), cl(g * 0.985), cl(g * 0.95)];
      });
      const r = rng(5);
      // oil stains
      for (let i = 0; i < 9; i++) {
        const x = r() * S, y = r() * S, rad = 30 + r() * 110;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(18,14,10,0.55)'); gr.addColorStop(0.6, 'rgba(25,20,14,0.25)'); gr.addColorStop(1, 'rgba(25,20,14,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, rad, rad * (0.6 + r() * 0.5), r() * 3, 0, 7); ctx.fill();
      }
      // cracks
      ctx.strokeStyle = 'rgba(30,28,25,0.55)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 14; i++) {
        let x = r() * S, y = r() * S, a = r() * 6.28; ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 40; k++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 6; y += Math.sin(a) * 6; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      // saw-cut joints
      ctx.strokeStyle = 'rgba(40,38,34,0.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
    }, { repeat: 4 });
    const bump = canvasTex(512, (ctx, S) => pixels(ctx, S, (u, v) => { const g = cl(128 + (fbm(n, u, v, 16, 4) - 0.5) * 120 + (n2(u, v, 128) - 0.5) * 60); return [g, g, g]; }), { repeat: 4, srgb: false });
    return { color, bump };
  });
}

// painted steel worn to rust: `paint` is the colour it was once painted, `wear` how far the rust has got (0..1)
export function rustPaintTex(paint, wear = 0.5, seed = 3, size = 512) {
  return once('rp' + paint + wear + seed, () => {
    const n = makeNoise(seed), n2 = makeNoise(seed * 7 + 1), p = new THREE.Color(paint);
    const pr = p.r * 255, pg = p.g * 255, pb = p.b * 255;
    const rough = new Float32Array(size * size);
    const color = canvasTex(size, (ctx, S) => {
      pixels(ctx, S, (u, v) => {
        const m = fbm(n, u, v, 4, 5), f = n2(u, v, 64), streak = fbm(n2, u * 0.3, v, 6, 3);
        const rust = Math.max(0, Math.min(1, (m + streak * 0.35 - (1.05 - wear * 0.75)) * 4.5));
        const fade = 0.82 + f * 0.25;
        const rr = mix(pr * fade, 92 + f * 38, rust), rg = mix(pg * fade, 44 + f * 20, rust), rb = mix(pb * fade, 22 + f * 10, rust);
        const dirt = 1 - Math.max(0, v - 0.7) * 0.5;
        rough[Math.floor(v * S) * S + Math.floor(u * S)] = rust;
        return [cl(rr * dirt), cl(rg * dirt), cl(rb * dirt)];
      });
      // scratches through the paint
      const r = rng(seed + 9); ctx.strokeStyle = 'rgba(190,180,165,0.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 40; i++) { const x = r() * S, y = r() * S, a = r() * 6.28, l = 8 + r() * 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
    });
    const roughness = canvasTex(size, (ctx, S) => pixels(ctx, S, (u, v) => { const g = cl(150 + rough[Math.floor(v * S) * S + Math.floor(u * S)] * 100); return [g, g, g]; }), { srgb: false });
    return { color, roughness };
  });
}

export function rubberTex() {
  return once('rubber', () => { const n = makeNoise(21); return canvasTex(256, (ctx, S) => pixels(ctx, S, (u, v) => { const g = 26 + fbm(n, u, v, 16, 3) * 18; return [g, g, g * 1.02]; })); });
}

export function sandTex() {
  return once('sand', () => {
    const n = makeNoise(77), n2 = makeNoise(78), size = 1024;
    const color = canvasTex(size, (ctx, S) => pixels(ctx, S, (u, v) => {
      const b = fbm(n, u, v, 6, 6), g = n2(u, v, 512), rip = Math.sin((v * 90 + fbm(n2, u, v, 4, 3) * 18) * 1.0) * 0.5 + 0.5;
      const k = 0.78 + b * 0.32 + g * 0.08 + rip * 0.05;
      return [cl(196 * k), cl(160 * k), cl(112 * k)];
    }), { repeat: 40 });
    const bump = canvasTex(512, (ctx, S) => pixels(ctx, S, (u, v) => {
      const rip = Math.sin((v * 90 + fbm(n2, u, v, 4, 3) * 18)) * 0.5 + 0.5; const g = cl(100 + rip * 80 + n2(u, v, 256) * 60); return [g, g, g];
    }), { repeat: 40, srgb: false });
    return { color, bump };
  });
}

export function plankTex() {
  return once('plank', () => {
    const n = makeNoise(41);
    return canvasTex(512, (ctx, S) => {
      pixels(ctx, S, (u, v) => {
        const plank = Math.floor(v * 4), grain = fbm(n, u * 0.15 + plank * 0.37, v * 4 + plank, 8, 4);
        const ring = Math.sin(grain * 40) * 0.5 + 0.5, k = 0.7 + ring * 0.15 + (plank % 2) * 0.06;
        return [cl(150 * k), cl(112 * k), cl(70 * k)];
      });
      ctx.fillStyle = 'rgba(30,20,10,0.8)'; for (let i = 1; i < 4; i++) ctx.fillRect(0, i * S / 4 - 2, S, 4);
    });
  });
}

export function corrugatedTex() {
  return once('corr', () => {
    const n = makeNoise(55);
    const color = canvasTex(512, (ctx, S) => pixels(ctx, S, (u, v) => {
      const m = fbm(n, u, v, 4, 5), rust = Math.max(0, Math.min(1, (m - 0.5) * 3 + v * 0.6 - 0.2));
      const rib = Math.sin(u * Math.PI * 32) * 0.5 + 0.5, k = 0.75 + rib * 0.25;
      return [cl(mix(120, 120, rust) * k), cl(mix(124, 64, rust) * k), cl(mix(126, 34, rust) * k)];
    }), { repeat: 1 });
    const bump = canvasTex(256, (ctx, S) => pixels(ctx, S, (u) => { const g = cl(128 + Math.sin(u * Math.PI * 32) * 110); return [g, g, g]; }), { srgb: false });
    return { color, bump };
  });
}

export function hazardTex() {
  return once('hazard', () => canvasTex(256, (ctx, S) => {
    ctx.fillStyle = '#1b1a18'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#e0a420';
    for (let i = -S; i < S * 2; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 32, 0); ctx.lineTo(i + 32 - S, S); ctx.lineTo(i - S, S); ctx.fill(); }
    const n = makeNoise(9), img = ctx.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const p = i / 4, u = (p % S) / S, v = Math.floor(p / S) / S, k = 0.7 + fbm(n, u, v, 8, 3) * 0.45; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
    ctx.putImageData(img, 0, 0);
  }));
}

/* ---------- materials ---------- */
export function mats() {
  return once('mats', () => {
    const steel = rustPaintTex('#3b3f43', 0.55, 3);
    const body = rustPaintTex('#7a8a7c', 0.42, 12);
    const turret = rustPaintTex('#4a5236', 0.5, 19);
    const engineT = rustPaintTex('#2b2b2c', 0.25, 27, 256);
    return {
      frame: new THREE.MeshStandardMaterial({ map: steel.color, roughnessMap: steel.roughness, roughness: 1, metalness: 0.55 }),
      body: new THREE.MeshStandardMaterial({ map: body.color, roughnessMap: body.roughness, roughness: 1, metalness: 0.35 }),
      bodyDark: new THREE.MeshStandardMaterial({ color: 0x23282a, roughness: 0.7, metalness: 0.4 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x8aa2a8, roughness: 0.08, metalness: 0, transmission: 0, transparent: true, opacity: 0.38, envMapIntensity: 1.6 }),
      cage: new THREE.MeshStandardMaterial({ color: 0x2c2f31, roughness: 0.55, metalness: 0.75 }),
      turret: new THREE.MeshStandardMaterial({ map: turret.color, roughnessMap: turret.roughness, roughness: 1, metalness: 0.45 }),
      gun: new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.42, metalness: 0.85 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xb58a3c, roughness: 0.32, metalness: 1 }),
      block: new THREE.MeshStandardMaterial({ map: engineT.color, roughness: 0.75, metalness: 0.6 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.12, metalness: 1 }),
      red: new THREE.MeshStandardMaterial({ color: 0x9a1f17, roughness: 0.38, metalness: 0.35 }),
      copper: new THREE.MeshStandardMaterial({ color: 0xa8673a, roughness: 0.4, metalness: 0.9 }),
      header: new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.55, metalness: 0.8 }),
      rubber: new THREE.MeshStandardMaterial({ map: rubberTex(), roughness: 0.92, metalness: 0 }),
      rim: new THREE.MeshStandardMaterial({ color: 0x55585b, roughness: 0.35, metalness: 0.9 }),
      rimS: new THREE.MeshStandardMaterial({ color: 0xc8901f, roughness: 0.4, metalness: 0.7 }),
      rimD: new THREE.MeshStandardMaterial({ color: 0x9c3b1e, roughness: 0.42, metalness: 0.7 }),
      spring: new THREE.MeshStandardMaterial({ color: 0xc23b22, roughness: 0.45, metalness: 0.6 }),
      bolt: new THREE.MeshStandardMaterial({ color: 0x8b8e90, roughness: 0.3, metalness: 1 }),
      lamp: new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffd28a, emissiveIntensity: 1.2, roughness: 0.3 }),
      tail: new THREE.MeshStandardMaterial({ color: 0x7a0e0a, emissive: 0x500805, emissiveIntensity: 0.8, roughness: 0.3 }),
      mount: new THREE.MeshStandardMaterial({ color: 0xd0a030, roughness: 0.5, metalness: 0.6 })
    };
  });
}

// Gobo patterns: Tom's stock set of 25 (from his photo of the set) plus the underwater gobo.
// Each pattern is drawn once, with canvas shapes, onto a sheet of tiles. The portrait shader
// samples the sheet as a texture and the 3D studio view reads the same pixels, so both views
// always show the same pattern. These are drawn to match the set, not copied from it.
//
// Tile coordinates: -1..1 across, y up. Tile edge = TILE_UV beam units (1 = the published
// beam edge), so a pattern drawn out to about 0.85 lands just inside the beam edge. Outside
// the tile no light passes, like the metal around a real gobo's cut-outs.

// Order = gobo number used by the renderers (1-based) and the order in the menu.
export const GOBO_IDS = [
  "window-arched", "rain", "sun-rays", "starburst", "moon",
  "fan", "slot", "shards", "window-angled", "palm",
  "blinds", "blinds-slanted", "butterflies", "stars", "hearts",
  "dot-swirl", "triangle", "slit", "leaves", "music",
  "dots", "halftone", "window", "heart", "circle",
  "underwater",
];
// Older setup files used these names.
export const GOBO_ALIASES = { "window-small": "window", "blinds-wide": "blinds", branches: "leaves" };
export const COLS = 6, ROWS = 5, TILE = 256, TILE_UV = 1.2;

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const TAU = Math.PI * 2;
function heartPath(g, cx, cy, s) {
  g.moveTo(cx, cy - 0.85 * s);
  g.bezierCurveTo(cx - 0.2 * s, cy - 0.55 * s, cx - 1.0 * s, cy - 0.2 * s, cx - 0.95 * s, cy + 0.3 * s);
  g.bezierCurveTo(cx - 0.9 * s, cy + 0.85 * s, cx - 0.15 * s, cy + 0.95 * s, cx, cy + 0.45 * s);
  g.bezierCurveTo(cx + 0.15 * s, cy + 0.95 * s, cx + 0.9 * s, cy + 0.85 * s, cx + 0.95 * s, cy + 0.3 * s);
  g.bezierCurveTo(cx + 1.0 * s, cy - 0.2 * s, cx + 0.2 * s, cy - 0.55 * s, cx, cy - 0.85 * s);
  g.closePath();
}
function starPath(g, cx, cy, r, rot = 0) {
  for (let k = 0; k < 10; k++) {
    const a = rot + Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.42 : r;
    g[k ? "lineTo" : "moveTo"](cx + rr * Math.cos(a), cy + rr * Math.sin(a));
  }
  g.closePath();
}
const circle = (g, x, y, r) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); };
const clipCircle = (g, r) => { g.beginPath(); circle(g, 0, 0, r); g.clip(); };
function wedges(g, ax, ay, a0, a1, n, fill, r = 3, r0 = 0) {
  const step = (a1 - a0) / n;
  for (let i = 0; i < n; i++) {
    const s = a0 + i * step, e = s + step * fill;
    g.beginPath(); g.arc(ax, ay, r, s, e); g.arc(ax, ay, r0, e, s, true); g.closePath(); g.fill();
  }
}

// Each draws white (light passes) on black, in tile units with y up.
const DRAW = {
  "window-arched"(g) {
    g.beginPath(); g.rect(-0.45, -0.8, 0.9, 1.05); g.arc(0, 0.25, 0.45, 0, Math.PI); g.fill();
    g.strokeStyle = "#000"; g.lineWidth = 0.05; g.beginPath();
    for (const x of [-0.15, 0.15]) { g.moveTo(x, -0.82); g.lineTo(x, 0.25); }
    for (const y of [-0.45, -0.1, 0.25]) { g.moveTo(-0.47, y); g.lineTo(0.47, y); }
    for (const a of [Math.PI / 3, (2 * Math.PI) / 3]) { g.moveTo(0, 0.25); g.lineTo(0.5 * Math.cos(a), 0.25 + 0.5 * Math.sin(a)); }
    g.moveTo(0.25, 0.25); g.arc(0, 0.25, 0.25, 0, Math.PI);
    g.stroke();
  },
  rain(g) {
    const r = rng(2); clipCircle(g, 0.78); g.lineWidth = 0.022; g.lineCap = "butt"; g.beginPath();
    for (let x = -0.75; x <= 0.76; x += 0.075) {
      let y = -0.8 - r() * 0.2;
      while (y < 0.8) { const len = 0.08 + r() * 0.3; g.moveTo(x, y); g.lineTo(x, y + len); y += len + 0.03 + r() * 0.1; }
    }
    g.stroke();
  },
  "sun-rays"(g) { clipCircle(g, 0.78); wedges(g, 0, -0.78, (12 * Math.PI) / 180, (168 * Math.PI) / 180, 10, 0.6); },
  starburst(g) {
    const r = rng(4); g.lineWidth = 0.022; g.lineCap = "round"; g.beginPath();
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU + r() * 0.05, r1 = (i % 2 ? 0.55 : 0.8) - r() * 0.08;
      g.moveTo(0.12 * Math.cos(a), 0.12 * Math.sin(a)); g.lineTo(r1 * Math.cos(a), r1 * Math.sin(a));
    }
    g.stroke();
  },
  moon(g) { g.beginPath(); circle(g, -0.05, 0, 0.62); g.fill(); g.fillStyle = "#000"; g.beginPath(); circle(g, 0.22, 0.1, 0.52); g.fill(); },
  fan(g) { wedges(g, 0, -0.95, (50 * Math.PI) / 180, (130 * Math.PI) / 180, 8, 0.82, 1.5, 0.5); },
  slot(g) { g.fillRect(-0.6, -0.07, 1.2, 0.14); },
  shards(g) {
    const r = rng(8);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + r() * 0.25, w = 0.06 + r() * 0.14, r0 = 0.14 + r() * 0.12, r1 = 0.5 + r() * 0.32, sk = (r() - 0.5) * 0.15;
      g.beginPath();
      g.moveTo(r0 * Math.cos(a), r0 * Math.sin(a));
      g.lineTo(r1 * Math.cos(a - w / 2 + sk), r1 * Math.sin(a - w / 2 + sk));
      g.lineTo(r1 * 0.88 * Math.cos(a + w / 2 + sk), r1 * 0.88 * Math.sin(a + w / 2 + sk));
      g.closePath(); g.fill();
    }
  },
  "window-angled"(g) {
    const BL = [-0.62, -0.42], BR = [0.62, -0.42], TR = [0.62, 0.55], TL = [-0.62, 0.05];
    const P = (s, t) => [0, 1].map((k) => (1 - t) * ((1 - s) * BL[k] + s * BR[k]) + t * ((1 - s) * TL[k] + s * TR[k]));
    g.beginPath(); g.moveTo(...BL); g.lineTo(...BR); g.lineTo(...TR); g.lineTo(...TL); g.closePath(); g.fill();
    g.strokeStyle = "#000"; g.lineWidth = 0.04; g.beginPath();
    for (let i = 0; i <= 5; i++) { g.moveTo(...P(i / 5, 0)); g.lineTo(...P(i / 5, 1)); }
    for (let j = 0; j <= 4; j++) { g.moveTo(...P(0, j / 4)); g.lineTo(...P(1, j / 4)); }
    g.stroke();
  },
  palm(g) {
    g.lineCap = "round";
    const fronds = [[-0.8, -0.1, -0.5, 0.6], [-0.65, -0.55, -0.35, 0.2], [-0.05, -0.8, -0.1, 0.1], [0.55, -0.6, 0.3, 0.25], [0.8, 0.0, 0.45, 0.65]];
    const base = [0.0, 0.55];
    for (const [ex, ey, cx, cy] of fronds) {
      const pt = (t) => [(1 - t) ** 2 * base[0] + 2 * (1 - t) * t * cx + t * t * ex, (1 - t) ** 2 * base[1] + 2 * (1 - t) * t * cy + t * t * ey];
      g.lineWidth = 0.022; g.beginPath(); g.moveTo(...base); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
      g.lineWidth = 0.02; g.beginPath();
      for (let t = 0.12; t < 0.98; t += 0.055) {
        const [x, y] = pt(t), [x2, y2] = pt(t + 0.01), dl = Math.hypot(x2 - x, y2 - y), tx = (x2 - x) / dl, ty = (y2 - y) / dl;
        const len = 0.24 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.03;
        for (const sd of [1, -1]) { g.moveTo(x, y); g.lineTo(x + (-ty * sd * 0.8 + tx * 0.55) * len, y + (tx * sd * 0.8 + ty * 0.55) * len); }
      }
      g.stroke();
    }
  },
  blinds(g) {
    for (let y = -0.65; y < 0.65; y += 0.085) g.fillRect(-0.5, y, 1.0, 0.06);
    g.fillStyle = "#000"; for (const x of [-0.25, 0.25]) g.fillRect(x - 0.006, -0.66, 0.012, 1.32);
  },
  "blinds-slanted"(g) {
    g.beginPath(); g.moveTo(-0.6, -0.45); g.lineTo(0.38, -0.45); g.lineTo(0.6, 0.45); g.lineTo(-0.38, 0.45); g.closePath(); g.clip();
    g.lineWidth = 0.04; g.beginPath();
    for (let x = -1.2; x < 1.2; x += 0.075) { g.moveTo(x, -0.5); g.lineTo(x + 0.244, 0.5); }
    g.stroke();
  },
  butterflies(g) {
    const r = rng(13), pos = [];
    while (pos.length < 15) { const x = (r() - 0.5) * 1.4, y = (r() - 0.5) * 1.3; if (Math.hypot(x, y) < 0.7 && pos.every(([a, b]) => Math.hypot(a - x, b - y) > 0.24)) pos.push([x, y]); }
    for (const [x, y] of pos) {
      const s = 0.08 + r() * 0.04;
      g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 1.6); g.beginPath();
      g.ellipse(-0.5 * s, 0.35 * s, 0.5 * s, 0.38 * s, -0.5, 0, TAU); g.ellipse(0.5 * s, 0.35 * s, 0.5 * s, 0.38 * s, 0.5, 0, TAU);
      g.ellipse(-0.35 * s, -0.35 * s, 0.32 * s, 0.25 * s, 0.5, 0, TAU); g.ellipse(0.35 * s, -0.35 * s, 0.32 * s, 0.25 * s, -0.5, 0, TAU);
      g.fill(); g.restore();
    }
  },
  stars(g) {
    const r = rng(14), pos = [];
    while (pos.length < 34) { const x = (r() - 0.5) * 1.5, y = (r() - 0.5) * 1.3; if (Math.hypot(x, y) < 0.72 && pos.every(([a, b]) => Math.hypot(a - x, b - y) > 0.13)) pos.push([x, y]); }
    for (const [x, y] of pos) { g.beginPath(); if (r() < 0.6) starPath(g, x, y, 0.03 + r() * 0.035, r()); else circle(g, x, y, 0.012 + r() * 0.01); g.fill(); }
  },
  hearts(g) {
    g.lineWidth = 0.06; g.lineJoin = "round"; g.beginPath(); heartPath(g, -0.15, 0.08, 0.5); g.stroke();
    g.beginPath(); heartPath(g, 0.32, -0.15, 0.28); g.save(); g.strokeStyle = "#000"; g.lineWidth = 0.08; g.stroke(); g.restore(); g.fill();
  },
  "dot-swirl"(g) {
    for (let k = 1; k <= 9; k++) {
      const rr = 0.085 * k, n = Math.round((TAU * rr) / 0.09);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + k * 0.2, f = 0.5 + 0.5 * Math.cos(a - (3 * Math.PI) / 4), d = 0.036 * (0.2 + 0.8 * f) * (0.6 + 0.4 * (1 - k / 10));
        if (d < 0.01) continue;
        g.beginPath(); circle(g, rr * Math.cos(a), rr * Math.sin(a), d); g.fill();
      }
    }
  },
  triangle(g) { g.beginPath(); g.moveTo(0, 0.52); g.lineTo(-0.58, -0.45); g.lineTo(0.58, -0.45); g.closePath(); g.fill(); },
  slit(g) { g.fillRect(-0.035, -0.68, 0.07, 1.36); },
  leaves(g) {
    const r = rng(19);
    g.lineJoin = "round";
    for (let i = 0; i < 16; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.4, x = d * Math.cos(a), y = d * Math.sin(a), len = 0.42 + r() * 0.22, w = len * 0.26, rot = a + (r() - 0.5) * 1.2;
      g.save(); g.translate(x, y); g.rotate(rot);
      g.beginPath(); g.moveTo(-len / 2, 0); g.quadraticCurveTo(0, w, len / 2, 0); g.quadraticCurveTo(0, -w, -len / 2, 0); g.closePath();
      g.fillStyle = "#fff"; g.fill(); g.strokeStyle = "#000"; g.lineWidth = 0.025; g.stroke();
      g.lineWidth = 0.014; g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0);
      for (let t = -0.32; t <= 0.33; t += 0.13) { g.moveTo(t * len, 0); g.lineTo(t * len + 0.06, w * 0.55); g.moveTo(t * len, 0); g.lineTo(t * len + 0.06, -w * 0.55); }
      g.stroke(); g.restore();
    }
  },
  music(g) {
    g.lineWidth = 0.012; g.beginPath();
    for (let k = -2; k <= 2; k++) { g.moveTo(-0.75, k * 0.045); g.lineTo(0.75, k * 0.045); }
    g.stroke();
    const notes = [[-0.6, -1], [-0.42, 1], [-0.22, 0], [-0.04, 2], [0.16, -2], [0.34, 1], [0.54, 0]];
    const tops = [];
    for (const [x, step] of notes) {
      const y = step * 0.0225;
      g.beginPath(); g.ellipse(x, y, 0.042, 0.03, 0.35, 0, TAU); g.fill();
      g.fillRect(x + 0.033, y, 0.014, 0.2); tops.push([x + 0.04, y + 0.2]);
    }
    for (const [a, b] of [[0, 1], [2, 3], [4, 5]]) {
      const [x1, y1] = tops[a], [x2, y2] = tops[b];
      g.beginPath(); g.moveTo(x1 - 0.007, y1); g.lineTo(x2 + 0.007, y2); g.lineTo(x2 + 0.007, y2 - 0.035); g.lineTo(x1 - 0.007, y1 - 0.035); g.closePath(); g.fill();
    }
    const [fx, fy] = tops[6]; g.lineWidth = 0.018; g.beginPath(); g.moveTo(fx, fy); g.quadraticCurveTo(fx + 0.07, fy - 0.05, fx + 0.05, fy - 0.13); g.stroke();
  },
  dots(g) { for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { g.beginPath(); circle(g, i * 0.27, j * 0.27, 0.045); g.fill(); } },
  halftone(g) {
    for (let i = 0; i < 13; i++) for (let j = 0; j < 11; j++) {
      const x = -0.6 + i * 0.1, y = 0.45 - j * 0.09, d = 0.042 * (0.25 + 0.75 * ((y + 0.45) / 0.9));
      g.beginPath(); circle(g, x, y, d); g.fill();
    }
  },
  window(g) {
    g.fillRect(-0.32, -0.55, 0.64, 1.1);
    g.fillStyle = "#000"; g.fillRect(-0.035, -0.56, 0.07, 1.12); g.fillRect(-0.33, -0.035, 0.66, 0.07);
  },
  heart(g) { g.beginPath(); heartPath(g, 0, 0.05, 0.55); g.fill(); },
  circle(g) { g.beginPath(); circle(g, 0, 0, 0.42); g.fill(); },
};

// Underwater ripples are a light texture across the whole beam, so they're worked out per
// pixel (the same formula the app used before the stock set was added).
function underwater(img, x0, y0, W) {
  for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
    const u = (((i + 0.5) / TILE) * 2 - 1) * TILE_UV, v = (1 - ((j + 0.5) / TILE) * 2) * TILE_UV, qx = u * 3, qy = v * 3;
    const w = Math.sin(qx * 2.1 + Math.sin(qy * 1.7) * 1.6) + Math.sin(qy * 2.4 + Math.sin(qx * 1.3) * 1.8) + Math.sin((qx + qy) * 1.6);
    const val = Math.round(255 * (0.3 + 0.7 * Math.pow(1 - Math.abs(w) / 3, 6)));
    const o = ((y0 + j) * W + x0 + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = val; img.data[o + 3] = 255;
  }
}

let sheet = null, red = null;
// The whole sheet (a canvas, COLS × ROWS tiles), drawn on first use.
export function goboSheet() {
  if (sheet) return sheet;
  const c = document.createElement("canvas");
  c.width = COLS * TILE; c.height = ROWS * TILE;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
  GOBO_IDS.forEach((id, k) => {
    const x0 = (k % COLS) * TILE, y0 = Math.floor(k / COLS) * TILE;
    if (id === "underwater") { const img = g.getImageData(0, 0, c.width, c.height); underwater(img, x0, y0, c.width); g.putImageData(img, 0, 0); return; }
    g.save();
    g.beginPath(); g.rect(x0, y0, TILE, TILE); g.clip();
    g.translate(x0 + TILE / 2, y0 + TILE / 2); g.scale(TILE / 2, -TILE / 2);
    g.fillStyle = "#fff"; g.strokeStyle = "#fff";
    DRAW[id](g);
    g.restore();
  });
  const d = g.getImageData(0, 0, c.width, c.height).data;
  red = new Uint8Array(c.width * c.height);
  for (let i = 0; i < red.length; i++) red[i] = d[i * 4];
  return (sheet = c);
}

// How much light passes gobo number n (1-based) at beam position u, v (1 = beam edge).
// Bilinear, like the shader's texture lookup.
export function goboSample(n, u, v) {
  if (!n) return 1;
  const tu = u / TILE_UV, tv = v / TILE_UV;
  if (Math.abs(tu) >= 1 || Math.abs(tv) >= 1) return 0;
  goboSheet();
  const k = n - 1, W = COLS * TILE;
  const px = Math.min(TILE - 1, Math.max(0, ((tu + 1) / 2) * TILE - 0.5)), py = Math.min(TILE - 1, Math.max(0, ((1 - tv) / 2) * TILE - 0.5));
  const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(TILE - 1, x0 + 1), y1 = Math.min(TILE - 1, y0 + 1), fx = px - x0, fy = py - y0;
  const bx = (k % COLS) * TILE, by = Math.floor(k / COLS) * TILE, at = (x, y) => red[(by + y) * W + bx + x] / 255;
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
}

// A small picture of one gobo (for the settings panel): white where light passes.
export function goboThumb(id, size = 56) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const k = GOBO_IDS.indexOf(id);
  if (k < 0) return c;
  const g = c.getContext("2d");
  g.drawImage(goboSheet(), (k % COLS) * TILE, Math.floor(k / COLS) * TILE, TILE, TILE, 0, 0, size, size);
  return c;
}

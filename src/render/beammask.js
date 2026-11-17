// The shape of a beam across its width: barn doors, flags and gobo patterns. The 3D studio
// view projects this as a mask from each light. It mirrors the portrait shader's beamMask()
// and gobo() exactly, so both views agree on where light lands.
const fract = (x) => x - Math.floor(x);
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// u, v: position across the beam, -1..1 at the published beam edge.
export function goboValue(id, u, v) {
  switch (id) {
    case 1: { const gx = Math.abs(fract(u * 1.2 + 0.5) - 0.5), gy = Math.abs(fract(v * 1.2 + 0.5) - 0.5);
      return smoothstep(0.03, 0.07, Math.min(gx, gy)) * (Math.max(Math.abs(u), Math.abs(v)) <= 0.85 ? 1 : 0); }
    case 2: return smoothstep(0.15, 0.35, Math.abs(fract(v * 3.5) - 0.5) * 2);
    case 3: return 1 - smoothstep(0.2, 0.3, Math.hypot(fract(u * 2.5) - 0.5, fract(v * 2.5) - 0.5));
    case 4: return smoothstep(0.2, 0.4, Math.abs(fract((u + v) * 2.2) - 0.5) * 2);
    case 5: { const gx = Math.abs(fract(u * 3.2 + 0.5) - 0.5), gy = Math.abs(fract(v * 3.2 + 0.5) - 0.5);
      return smoothstep(0.05, 0.09, Math.min(gx, gy)) * (Math.max(Math.abs(u), Math.abs(v)) <= 0.86 ? 1 : 0); }
    case 6: {
      const inside = (v < 0.15 && Math.abs(u) < 0.5 && v > -0.85) || Math.hypot(u, v - 0.15) < 0.5;
      return inside ? smoothstep(0.02, 0.045, Math.abs(u)) * smoothstep(0.02, 0.045, Math.abs(v + 0.3)) : 0;
    }
    case 7: return smoothstep(0.25, 0.45, Math.abs(fract(v * 2) - 0.5) * 2);
    case 8: {
      const qx = u * 3, qy = v * 3;
      const w = Math.sin(qx * 2.1 + Math.sin(qy * 1.7) * 1.6) + Math.sin(qy * 2.4 + Math.sin(qx * 1.3) * 1.8) + Math.sin((qx + qy) * 1.6);
      return 0.3 + 0.7 * Math.pow(1 - Math.abs(w) / 3, 6);
    }
    default: return 1;
  }
}

// Draw the mask for a resolved light onto a square canvas covering `spreadRad` (the half-
// angle the 3D spotlight covers). x across the canvas = the beam's "right", y = its "up".
export function drawBeamMask(L, spreadRad, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d"), img = g.createImageData(size, size);
  const T = Math.tan(Math.min((L.coneDeg * Math.PI) / 180, 1.4)), S = Math.tan(spreadRad);
  const d = Math.hypot(L.target[0] - L.position[0], L.target[1] - L.position[1], L.target[2] - L.position[2]);
  const w = Math.max(0.015, Math.min(0.3, ((L.size * 0.5) / d) * 2));
  const s = L.shutters;
  for (let j = 0; j < size; j++) {
    const y = (1 - ((j + 0.5) / size) * 2) * S;      // canvas top = up
    for (let i = 0; i < size; i++) {
      const x = (((i + 0.5) / size) * 2 - 1) * S;
      let m = smoothstep(s.xmin - w, s.xmin + w, x) * (1 - smoothstep(s.xmax - w, s.xmax + w, x))
            * smoothstep(s.ymin - w, s.ymin + w, y) * (1 - smoothstep(s.ymax - w, s.ymax + w, y));
      if (L.gobo) m *= goboValue(L.gobo, x / T, y / T);
      const o = (j * size + i) * 4, v = Math.round(255 * m);
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// True when the mask would be plain white (no doors, flags or gobo): skip the texture.
export function plainBeam(L) {
  const s = L.shutters;
  return !L.gobo && s.xmin <= -9 && s.xmax >= 9 && s.ymin <= -9 && s.ymax >= 9;
}

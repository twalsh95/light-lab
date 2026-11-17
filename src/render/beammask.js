// The shape of a beam across its width: barn doors, flags and gobo patterns. The 3D studio
// view projects this as a mask from each light. It mirrors the portrait shader's beamMask()
// and gobo() exactly, so both views agree on where light lands.
import { goboSample } from "./gobos.js";
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// u, v: position across the beam, -1..1 at the published beam edge.
export function goboValue(id, u, v) { return goboSample(id, u, v); }

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

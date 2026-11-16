// The clay head-and-shoulders model, in the prototype's units (render_prototype.py).
// 1 unit = UNIT metres, so the head is about 0.25 m tall. Shared by every renderer.
export const UNIT = 0.15;

export const HEAD = {
  head:      { c: [0, 0.15, 0],  r: [0.62, 0.82, 0.62] },
  neck:      { c: [0, -0.78, 0], r: [0.17, 0.30, 0.20] },
  shoulders: { c: [0, -1.45, 0], r: [1.35, 0.60, 0.55] },
  // Bumps on the front of the head: [x, y, sx, sy, amount].
  features: [
    [0, 0.05, 0.09, 0.16, 0.16],       // nose
    [-0.24, 0.22, 0.10, 0.05, -0.05],  // eye socket, camera-left
    [0.24, 0.22, 0.10, 0.05, -0.05],   // eye socket, camera-right
    [0, 0.62, 0.40, 0.07, 0.04],       // brow
    [0, -0.45, 0.17, 0.10, 0.05],      // chin
  ],
};

export function featureHeight(x, y) {
  let h = 0;
  for (const [cx, cy, sx, sy, a] of HEAD.features) h += a * Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
  return h;
}

// Camera: a long portrait lens, 2.2 m from the face, framing head and shoulders.
export const CAMERA = { position: [0, -0.03, 2.2], target: [0, -0.03, 0], fovDeg: 11.7 };

// Neutral clay, slightly warm. Skin and clothing presets come in Phase 3.
export const SKIN = { albedo: [0.74, 0.718, 0.688], roughness: 0.5 };

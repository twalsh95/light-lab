// Light geometry, colour and exposure. Pure functions, no DOM: the renderers, the map,
// and the tests all use these, so every view agrees about where a light is and how bright.
//
// World: metres, y up, face centre at the origin, camera on +z looking toward -z.
// azimuthDeg 0 = on the camera axis, negative = camera-left (-x). elevationDeg 0 = level.
import { SKIN } from "./head.js";

const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export function lightPosition(l) {
  const az = rad(l.azimuthDeg), el = rad(l.elevationDeg), d = l.distance;
  return [d * Math.sin(az) * Math.cos(el), d * Math.sin(el), d * Math.cos(az) * Math.cos(el)];
}

// Map <-> light: the map shows x (left/right) and z (toward camera), seen from above.
export function mapPoint(l) {
  const p = lightPosition(l);
  return { x: p[0], z: p[2] };
}
export function fromMapPoint(l, x, z) {
  const horiz = Math.max(0.05, Math.hypot(x, z));
  const azimuthDeg = deg(Math.atan2(x, z));
  const distance = horiz / Math.cos(rad(l.elevationDeg));
  return { azimuthDeg, distance };
}

// The backdrop light hides behind the subject and points at the backdrop.
export function backdropLightPosition(state) {
  return [0, -0.2, -Math.min(0.55, state.backdrop.distance * 0.45)];
}

export function kelvinToRGB(k) {
  // Tanner Helland's curve fit, linearised and balanced so 5600 K is neutral.
  const raw = (kk) => {
    const t = Math.max(1000, Math.min(40000, kk)) / 100;
    const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    return [r, g, b].map((v) => { const c = Math.max(0, Math.min(255, v)) / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  };
  const c = raw(k), ref = raw(5600);
  const bal = c.map((v, i) => v / ref[i]);
  const m = Math.max(...bal);
  return bal.map((v) => v / m);
}

// Everything a renderer needs per light, in world units.
export function resolveLights(state) {
  const out = [];
  for (const l of state.lights) {
    if (!l.on || l.power <= 0) continue;
    const position = lightPosition(l);
    out.push({
      id: l.id, role: l.role, position, target: [0, 0, 0], dir: norm(sub([0, 0, 0], position)),
      intensity: l.power, color: kelvinToRGB(l.kelvin ?? 5600), size: l.size, coneDeg: l.coneDeg ?? 60, shadow: true,
    });
  }
  const bl = state.backdrop.light;
  if (bl && bl.on && bl.power > 0) {
    const position = backdropLightPosition(state), target = [0, -0.05, -state.backdrop.distance];
    out.push({
      id: "backdrop", role: "backdrop", position, target, dir: norm(sub(target, position)),
      intensity: bl.power, color: kelvinToRGB(bl.kelvin ?? 5600), size: 0.15, coneDeg: 70, shadow: false,
    });
  }
  return out;
}

export function coneFactor(L, fromLight) {
  const c = dot(norm(fromLight), L.dir);
  const outer = Math.cos(rad(L.coneDeg)), inner = Math.cos(rad(L.coneDeg * 0.6));
  const t = Math.max(0, Math.min(1, (c - outer) / (inner - outer)));
  return t * t * (3 - 2 * t);
}

// Light falling on a point with normal n (no shadows): inverse-square, cosine, beam shape.
export function irradianceAt(state, p, n) {
  let E = state.room.ambient;
  for (const L of resolveLights(state)) {
    const toL = sub(L.position, p), d2 = dot(toL, toL), l = norm(toL);
    E += (L.intensity / d2) * Math.max(0, dot(n, l)) * coneFactor(L, sub(p, L.position)) * lum(L.color);
  }
  return E;
}

// Auto exposure meters the lit side of the face, the way a photographer spot-meters the
// highlight side. Averaging the whole frame would brighten a low-key shot and darken a
// high-key one until they looked alike, which would teach the wrong idea.
export function meterFace(state) {
  const samples = [];
  for (let a = -60; a <= 60; a += 15) {
    for (let e = -30; e <= 45; e += 15) {
      const n = [Math.sin(rad(a)) * Math.cos(rad(e)), Math.sin(rad(e)), Math.cos(rad(a)) * Math.cos(rad(e))];
      samples.push(irradianceAt(state, [0, 0, 0], n));
    }
  }
  samples.sort((x, y) => x - y);
  return samples[Math.floor(samples.length * 0.9)];
}

// Exposure multiplier: the lit side of the face lands at about 0.8 on screen.
// With very little light, auto exposure stops brightening (like a camera running out of
// ISO), so a dark studio looks dark. 0.1 is a full-power light about 3.2 m away.
const DARKEST_METERED = 0.1;
export function exposureFor(state) {
  const ev = Math.pow(2, state.camera.evCompensation || 0);
  if (!state.camera.autoExposure) return state.camera.manualExposure * ev;
  const E = Math.max(DARKEST_METERED, meterFace(state));
  return (0.8 / (E * lum(SKIN.albedo))) * ev;
}

export function hexToRGB(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
}

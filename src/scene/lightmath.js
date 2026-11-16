// Light geometry, colour and exposure. Pure functions, no DOM: the renderers, the map,
// the snapshot and the tests all use these, so every view agrees about every light.
//
// World: metres, y up, face centre at the origin, camera on +z looking toward -z.
// azimuthDeg 0 = on the camera axis, negative = camera-left (-x). elevationDeg 0 = level.
// Intensity unit: 1.0 = 10,000 lux at 1 m on the beam axis.
import { SKIN } from "./head.js";
import { gear, fixture, modifier, reflectorItem } from "./gear.js";

const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const LUX_UNIT = 10000;

export function lightPosition(l) {
  const az = rad(l.azimuthDeg), el = rad(l.elevationDeg), d = l.distance;
  return [d * Math.sin(az) * Math.cos(el), d * Math.sin(el), d * Math.cos(az) * Math.cos(el)];
}
export function mapPoint(l) { const p = lightPosition(l); return { x: p[0], z: p[2] }; }
export function fromMapPoint(l, x, z) {
  const horiz = Math.max(0.05, Math.hypot(x, z));
  return { azimuthDeg: deg(Math.atan2(x, z)), distance: horiz / Math.cos(rad(l.elevationDeg)) };
}
// Backdrop lights hide behind the subject and point at the backdrop.
export function backdropLightPosition(state, index = 0) {
  const x = index === 0 ? 0 : index % 2 ? 0.12 : -0.12;
  return [x, -0.22, -Math.min(0.55, state.backdrop.distance * 0.45)];
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
// Hue (degrees) and saturation (0..1) to linear RGB with the brightest channel at 1.
export function hueToRGB(hue, sat) {
  const h = ((hue % 360) + 360) % 360 / 60, x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  return [r, g, b].map((v) => Math.pow(1 - sat + sat * v, 2.2));
}

// Everything that follows from a light's fixture and modifier: size, beam, output, colour.
export function lightSpec(l, state) {
  const f = fixture(l.fixture), m = modifier(l.modifier) || modifier(f.defaultModifier);
  const fresnel = !!f.beamDeg;
  const t = l.flood ?? 0.5;
  const size = l.sizeOverride ?? (m.sizeFromFixture ? (f.lensSize ?? f.panelSize ?? 0.2) : m.size);
  const coneDeg = fresnel ? (f.beamDeg.spot + (f.beamDeg.flood - f.beamDeg.spot) * t) / 2 : m.coneDeg;
  const lux = fresnel ? Math.exp(Math.log(f.luxAt1m.spot) + (Math.log(f.luxAt1m.flood) - Math.log(f.luxAt1m.spot)) * t) : f.luxAt1m * (m.factor ?? 1);
  const dimmed = state.mode === "room" && !f.dimmable ? 1 : l.power;
  let color = f.rgb && l.color?.mode === "rgb" ? hueToRGB(l.color.hue, l.color.sat) : kelvinToRGB(Math.min(f.kelvin[1], Math.max(f.kelvin[0], l.kelvin)));
  if (m.gels && l.gel && l.gel !== "none") color = color.map((c, i) => c * gear().gels[l.gel].color[i]);
  if (m.tint) color = color.map((c, i) => c * m.tint[i]);
  return { size, coneDeg, lux, intensity: (lux / LUX_UNIT) * dimmed, color, fresnel, gobo: m.gobo ? l.gobo : null };
}

// The frame a light's beam is measured in (right, up), shared with the shader.
export function beamFrame(dir) {
  let r = cross(dir, [0, 1, 0]);
  if (Math.hypot(...r) < 1e-3) r = [1, 0, 0];
  r = norm(r);
  return { right: r, up: cross(r, dir) };
}

// Barn doors and flags as limits on the beam, in tangent units: [xmin, xmax, ymin, ymax].
// "Camera side" is whichever side of the beam faces the camera.
function shutterLimits(l, dir, coneDeg) {
  const T = Math.tan(rad(Math.min(coneDeg, 80)));
  const sh = { ...(l.shutters || {}) };
  if (fixture(l.fixture).barnDoors !== true) { sh.top = sh.bottom = sh.camera = sh.backdrop = 0; }
  if (l.flag) sh[l.flag.side] = Math.max(sh[l.flag.side] || 0, l.flag.amount);
  const { right } = beamFrame(dir);
  const camRight = right[2] >= 0;                 // does +right point toward the camera?
  const cut = (a) => (a > 0 ? T * (1 - a * 2) : 10);  // a=0.5 cuts at the beam centre
  const camLim = cut(sh.camera || 0), bdLim = cut(sh.backdrop || 0);
  return {
    xmin: camRight ? -bdLim : -camLim, xmax: camRight ? camLim : bdLim,
    ymin: -cut(sh.bottom || 0), ymax: cut(sh.top || 0),
  };
}

const GOBO_INDEX = { window: 1, blinds: 2, dots: 3, branches: 4 };

// Every light the renderers draw: fixtures, plus reflectors bouncing light back.
export function resolveLights(state) {
  const out = [];
  let bgIndex = 0;
  for (const l of state.lights) {
    if (!l.on || l.power <= 0) continue;
    const spec = lightSpec(l, state);
    if (spec.intensity <= 0) continue;
    const isBg = l.role === "backdrop";
    const position = isBg ? backdropLightPosition(state, bgIndex++) : lightPosition(l);
    const target = isBg ? [0, -0.05, -state.backdrop.distance] : [0, 0, 0];
    const dir = norm(sub(target, position));
    out.push({
      id: l.id, role: l.role, position, target, dir, intensity: spec.intensity, color: spec.color,
      size: spec.size, coneDeg: spec.coneDeg, shadow: !isBg,
      shutters: shutterLimits(l, dir, spec.coneDeg), gobo: spec.gobo ? GOBO_INDEX[spec.gobo] : 0,
    });
  }
  // Reflectors: light that reaches the card bounces back as a big soft source.
  for (const r of state.reflectors || []) {
    const item = reflectorItem(r.item), side = item?.sides[r.side];
    if (!side || side.reflect <= 0) continue;
    const position = lightPosition(r);
    const toSubject = norm(scale(position, -1));
    let E = [0, 0, 0];
    for (const L of out) {
      if (L.role === "backdrop") continue;
      const toL = sub(L.position, position), d2 = dot(toL, toL), lDir = norm(toL);
      // The card is angled to bounce this light at the subject (halfway between the two).
      const n = norm(add(lDir, toSubject));
      const e = (L.intensity / d2) * Math.max(0, dot(n, lDir)) * coneFactor(L, sub(position, L.position)) * shutterFactor(L, position);
      E = add(E, scale(L.color, e));
    }
    const area = item.width * item.height, m = Math.max(...E);
    if (m <= 0) continue;
    const tint = side.tint || [1, 1, 1];
    const dir = toSubject;
    out.push({
      id: r.id, role: "reflector", position, target: [0, 0, 0], dir,
      intensity: (side.reflect * area / Math.PI) * m, color: E.map((c, i) => (c / m) * tint[i]),
      size: item.width, coneDeg: 80, shadow: true,
      shutters: { xmin: -10, xmax: 10, ymin: -10, ymax: 10 }, gobo: 0,
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
// Barn doors / flags, sharp-edged (the shader softens them; this is for metering).
export function shutterFactor(L, p) {
  const v = sub(p, L.position), { right, up } = beamFrame(L.dir), z = dot(v, L.dir);
  if (z <= 0) return 0;
  const x = dot(v, right) / z, y = dot(v, up) / z, s = L.shutters;
  return x >= s.xmin && x <= s.xmax && y >= s.ymin && y <= s.ymax ? 1 : 0;
}

// Light falling on a point with normal n (no shadows): inverse-square, cosine, beam shape.
export function irradianceAt(state, p, n, lights = resolveLights(state)) {
  let E = state.room.ambient;
  for (const L of lights) {
    const toL = sub(L.position, p), d2 = dot(toL, toL), l = norm(toL);
    E += (L.intensity / d2) * Math.max(0, dot(n, l)) * coneFactor(L, sub(p, L.position)) * shutterFactor(L, p) * lum(L.color);
  }
  return E;
}

// Auto exposure works like a light meter held at the face, reading the lit side. So a
// low-key shot stays dark and a high-key shot stays bright, and darker skin looks darker,
// as it should (averaging the whole frame would undo all three).
export function meterFace(state) {
  const lights = resolveLights(state), samples = [];
  for (let a = -60; a <= 60; a += 15) for (let e = -30; e <= 45; e += 15) {
    const n = [Math.sin(rad(a)) * Math.cos(rad(e)), Math.sin(rad(e)), Math.cos(rad(a)) * Math.cos(rad(e))];
    samples.push(irradianceAt(state, [0, 0, 0], n, lights));
  }
  samples.sort((x, y) => x - y);
  return samples[Math.floor(samples.length * 0.9)];
}

// Exposure multiplier: the lit side of a mid-grey face lands at about 0.8 on screen.
// With very little light, auto exposure stops brightening (like a camera running out of
// ISO), so a dark studio looks dark. 0.05 is a bare CB60 at full power about 6 m away.
const DARKEST_METERED = 0.05;
export function exposureFor(state) {
  const ev = Math.pow(2, state.camera.evCompensation || 0);
  if (!state.camera.autoExposure) return state.camera.manualExposure * ev;
  const E = Math.max(DARKEST_METERED, meterFace(state));
  return (0.8 / (E * lum(SKIN.albedo))) * ev;
}

// White balance: the camera's idea of "white". A light that matches it looks neutral;
// warmer lights look orange and cooler ones blue. "auto" matches the key light.
export const WHITE_BALANCE = { daylight: 5600, tungsten: 3200 };
export function whiteBalanceKelvin(state) {
  const wb = state.camera.whiteBalance || "daylight";
  if (WHITE_BALANCE[wb]) return WHITE_BALANCE[wb];
  const key = state.lights.find((l) => l.on && l.role === "key") || state.lights.find((l) => l.on && l.role !== "backdrop");
  if (!key) return 5600;
  const f = fixture(key.fixture);
  return f.rgb && key.color?.mode === "rgb" ? 5600 : Math.min(f.kelvin[1], Math.max(f.kelvin[0], key.kelvin));
}
// Per-channel gain for the white balance, keeping overall brightness the same.
export function whiteBalanceGain(state) {
  const c = kelvinToRGB(whiteBalanceKelvin(state));
  const g = c.map((v) => 1 / Math.max(v, 1e-3));
  const k = lum(c) * (lum(g.map((v, i) => v * c[i])) ? 1 / lum(g.map((v, i) => v * c[i])) : 1);
  return g.map((v) => v * k);
}

// Surface colours (linear) for the subject and backdrop.
export function materials(state) {
  const G = gear();
  const skin = G.skins[state.subject.skin]?.albedo || SKIN.albedo;
  const cl = G.clothing[state.subject.clothing];
  const clothing = cl?.albedo || skin;
  const b = state.backdrop;
  const backdrop = b.type === "custom" ? [b.brightness, b.brightness, b.brightness] : G.backdrops[b.type]?.color || [0.5, 0.5, 0.5];
  return { skin, clothing, backdrop };
}

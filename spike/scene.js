// Light Lab rendering spike: shared scene model.
// Every candidate renderer reads the same scene state and the same light math from here,
// so differences on screen come from the renderer, not from different inputs.
//
// World: metres, y up. The face centre is the origin. The camera sits on +z looking at -z.
// azimuthDeg 0 = the camera axis, negative = camera-left (-x). elevationDeg 0 = level.

// The head is built in the prototype's units, then scaled: 1 unit = 0.15 m,
// so the head is about 0.25 m tall. Proportions match render_prototype.py.
export const UNIT = 0.15;
export const HEAD = {
  head:      { c: [0, 0.15, 0],   r: [0.62, 0.82, 0.62] },
  neck:      { c: [0, -0.78, 0],  r: [0.17, 0.30, 0.20] },
  shoulders: { c: [0, -1.45, 0],  r: [1.35, 0.60, 0.55] },
  // Features are bumps on the front of the head: [x, y, sx, sy, amount].
  features: [
    [0, 0.05, 0.09, 0.16, 0.16],    // nose
    [-0.24, 0.22, 0.10, 0.05, -0.05], // eye socket (camera-left)
    [0.24, 0.22, 0.10, 0.05, -0.05],  // eye socket (camera-right)
    [0, 0.62, 0.40, 0.07, 0.04],    // brow
    [0, -0.45, 0.17, 0.10, 0.05],   // chin
  ],
};

// Height added to the front of the head at (x, y) in prototype units.
export function featureHeight(x, y) {
  let h = 0;
  for (const [cx, cy, sx, sy, a] of HEAD.features) {
    h += a * Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
  }
  return h;
}

export const CAMERA = { position: [0, -0.03, 2.2], target: [0, -0.03, 0], fovDeg: 11.7 };
export const SKIN = { albedo: [0.74, 0.718, 0.688], roughness: 0.5, specular: 0.35 };

// Spike-only gear: placeholder numbers until the real gear.json (Phase 3).
// output = relative intensity at 1 m on the beam axis. size = emitting diameter in metres.
export const MODIFIERS = {
  "softbox-90":  { label: "Softbox 90 cm", size: 0.9,  coneDeg: 60 },
  "softbox-60":  { label: "Softbox 60 cm", size: 0.6,  coneDeg: 60 },
  "umbrella":    { label: "Umbrella", size: 1.0,       coneDeg: 70 },
  "beauty-dish": { label: "Beauty dish", size: 0.55,   coneDeg: 50 },
  "bare":        { label: "Bare bulb / reflector", size: 0.12, coneDeg: 55 },
  "grid":        { label: "Grid / snoot", size: 0.1,   coneDeg: 20 },
  "fresnel":     { label: "Fresnel (spot)", size: 0.15, coneDeg: 30 },
};

export function lightSize(light) {
  return light.sizeOverride ?? MODIFIERS[light.modifier]?.size ?? 0.3;
}
export function lightCone(light) {
  return MODIFIERS[light.modifier]?.coneDeg ?? 60;
}

const rad = (d) => (d * Math.PI) / 180;

// Light position in world space from its studio controls.
export function lightPosition(light) {
  const az = rad(light.azimuthDeg), el = rad(light.elevationDeg), d = light.distance;
  return [d * Math.sin(az) * Math.cos(el), d * Math.sin(el), d * Math.cos(az) * Math.cos(el)];
}
// Where the light points: the face, or the backdrop for a backdrop light.
export function lightTarget(light, state) {
  if (light.role === "backdrop") return [0, -0.05, -state.backdrop.distance];
  return [0, 0, 0];
}

// Kelvin to linear RGB, normalised so the brightest channel is 1.
// Tanner Helland's curve fit (approximate, fine for a teaching tool).
export function kelvinToRGB(k) {
  const t = Math.max(1000, Math.min(40000, k)) / 100;
  let r, g, b;
  r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = [r, g, b].map((v) => Math.max(0, Math.min(255, v)) / 255);
  const lin = c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  // Balance to a 5600 K "white" so daylight reads neutral and halogen reads warm.
  const ref = kelvinToRGBRaw(5600);
  const bal = lin.map((v, i) => v / ref[i]);
  const m = Math.max(...bal);
  return bal.map((v) => v / m);
}
function kelvinToRGBRaw(k) {
  const t = k / 100;
  const r = 255;
  const g = 99.4708025861 * Math.log(t) - 161.1195681661;
  const b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [r, g, b].map((v) => {
    const c = Math.max(0, Math.min(255, v)) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
}

// Everything a renderer needs per light, in world units.
export function resolveLights(state) {
  return state.lights.filter((l) => l.on).map((l) => {
    const p = lightPosition(l), t = lightTarget(l, state);
    const dir = norm(sub(t, p));
    return {
      id: l.id, role: l.role, position: p, target: t, dir,
      intensity: l.power * (l.output ?? 1),        // relative candela
      color: kelvinToRGB(l.kelvin ?? 5600),
      size: lightSize(l), coneDeg: lightCone(l),
    };
  });
}

// Auto exposure, metered on the lit side of the face (like a photographer spot-metering
// the highlight side). Averaging the whole frame would brighten a low-key shot and
// darken a high-key one until they looked alike, which would teach the wrong idea.
// Shadows are ignored here: the meter reads what the light could do, not occlusion.
export function meterFace(state) {
  const lights = resolveLights(state);
  const samples = [];
  for (let a = -60; a <= 60; a += 15) {
    for (let e = -30; e <= 45; e += 15) {
      const n = [Math.sin(rad(a)) * Math.cos(rad(e)), Math.sin(rad(e)), Math.cos(rad(a)) * Math.cos(rad(e))];
      let E = state.room.ambient;
      for (const L of lights) {
        const toL = sub(L.position, [0, 0, 0]);
        const d2 = dot(toL, toL), l = norm(toL);
        const cone = coneFactor(L, scale(l, -1));
        E += (L.intensity / d2) * Math.max(0, dot(n, l)) * cone * lum(L.color);
      }
      samples.push(E);
    }
  }
  samples.sort((x, y) => x - y);
  return samples[Math.floor(samples.length * 0.9)];   // 90th percentile = the lit side
}

// The exposure multiplier every renderer applies before display.
// Target: the lit side of the face lands at about 0.8 on screen before EV compensation.
export function exposureFor(state) {
  const ev = state.camera.evCompensation || 0;
  if (!state.camera.autoExposure) return state.camera.manualExposure * Math.pow(2, ev);
  const E = meterFace(state);
  const k = 0.8 / Math.max(1e-4, E * lum(SKIN.albedo));
  return k * Math.pow(2, ev);
}

export function coneFactor(L, dirFromLight) {
  const c = dot(norm(dirFromLight), L.dir);
  const outer = Math.cos(rad(L.coneDeg)), inner = Math.cos(rad(L.coneDeg * 0.6));
  const t = Math.max(0, Math.min(1, (c - outer) / (inner - outer)));
  return t * t * (3 - 2 * t);
}

export const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------- Presets (one per reference render) ----------
function light(o) {
  return Object.assign({ on: true, power: 1, output: 1, kelvin: 5600, modifier: "softbox-60", distance: 1.5 }, o);
}
function base() {
  return {
    version: 1,
    subject: { model: "clay-head", skin: "neutral-mid", yawDeg: 0 },
    camera: { evCompensation: 0, autoExposure: true, manualExposure: 1 },
    // A mid-grey backdrop 0.9 m behind. Lit only by spill from the key and fill, it reads
    // about as grey as the references (it would read darker farther back: falloff).
    backdrop: { color: [1, 1, 1], albedo: 0.5, distance: 0.9 },
    room: { ambient: 0.012 },   // bounce light from the room, in the same units as a light at 1 m
    lights: [],
  };
}
const KEY = { id: "key", role: "key", azimuthDeg: -45, elevationDeg: 30, distance: 1.5, modifier: "softbox-60" };
const FILL = { id: "fill", role: "fill", azimuthDeg: 40, elevationDeg: 5, distance: 1.8, modifier: "umbrella" };
const BACK = { id: "back", role: "back", azimuthDeg: 140, elevationDeg: 35, distance: 1.2, modifier: "grid" };
const BGL = { id: "bg", role: "backdrop", azimuthDeg: 180, elevationDeg: -20, distance: 0.55, modifier: "bare" };

export const PRESETS = {
  p1_key: { label: "Key only", ref: "p1_key.jpg", build() {
    const s = base(); s.lights = [light({ ...KEY, power: 1 })]; return s; } },
  p2_keyfill: { label: "Key + fill", ref: "p2_keyfill.jpg", build() {
    const s = base(); s.lights = [light({ ...KEY }), light({ ...FILL, power: 0.35 })]; return s; } },
  p3_three: { label: "Three-point", ref: "p3_three.jpg", build() {
    const s = base(); s.lights = [light({ ...KEY }), light({ ...FILL, power: 0.35 }), light({ ...BACK, power: 0.9 })]; return s; } },
  p4_highkey: { label: "High-key", ref: "p4_highkey.jpg", build() {
    const s = base();
    s.backdrop = { color: [1, 0.97, 0.93], albedo: 0.9, distance: 1.2 };
    s.room.ambient = 0.12;
    s.camera.evCompensation = 0.5;   // high-key: expose a little brighter than the lit-side meter says
    s.lights = [
      light({ ...KEY, azimuthDeg: -30, elevationDeg: 25, modifier: "softbox-90", power: 1 }),
      light({ ...FILL, azimuthDeg: 35, elevationDeg: 10, modifier: "umbrella", power: 0.85 }),
      light({ ...BGL, power: 1.2, output: 1 }),
    ];
    return s; } },
  p5_lowkey: { label: "Low-key", ref: "p5_lowkey.jpg", build() {
    const s = base();
    s.backdrop = { color: [1, 1, 1], albedo: 0.03, distance: 2.0 };
    s.room.ambient = 0;
    s.lights = [light({ ...KEY, azimuthDeg: -75, elevationDeg: 15, distance: 1.6, modifier: "grid", power: 1 })];
    return s; } },
  p6_trap: { label: "Trap: black backdrop, balanced 3-point", ref: "p6_trap.jpg", build() {
    const s = PRESETS.p3_three.build();
    s.backdrop = { color: [1, 1, 1], albedo: 0.03, distance: 2.0 };
    s.lights[1].power = 0.5;
    return s; } },
  p7_whitebg_lowkey: { label: "Trap: white backdrop, one-sided light", ref: "p7_whitebg_lowkey.jpg", build() {
    const s = PRESETS.p5_lowkey.build();
    s.backdrop = { color: [1, 0.96, 0.92], albedo: 0.9, distance: 1.2 };
    s.lights.push(light({ ...BGL, power: 1.4 }));
    return s; } },
};

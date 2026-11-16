// Scene state: the one JSON object that describes a whole setup. It's what undo stores,
// what a setup file contains, and (later) what an account saves.
//
// Units: metres and degrees. power 0..1. size = the light's width in metres
// (Phase 3 replaces it with a modifier from gear.json plus an optional override).

export const VERSION = 1;

export const LIMITS = {
  power: [0, 1], azimuthDeg: [-180, 180], elevationDeg: [-30, 75], distance: [0.4, 4],
  size: [0.05, 1.5], backdropDistance: [0.4, 3], brightness: [0.02, 0.95], ev: [-3, 3],
};

export const ROLES = {
  key:  { label: "Key light",  letter: "K", define: "The main light. The brightest. Sets the direction of the shadows." },
  fill: { label: "Fill light", letter: "F", define: "A softer light that lightens the shadows the key makes." },
  back: { label: "Back light", letter: "B", define: "A light behind the subject that outlines the head and shoulders." },
};

function light(id, o) {
  return Object.assign({ id, role: id, on: true, power: 0.8, azimuthDeg: 0, elevationDeg: 20, distance: 1.5, size: 0.6, kelvin: 5600 }, o);
}

export function blankScene() {
  return {
    version: VERSION,
    subject: { model: "clay-head" },
    camera: { autoExposure: true, evCompensation: 0, manualExposure: 1 },
    backdrop: { color: "#ffffff", brightness: 0.5, distance: 0.9, light: { on: false, power: 0.5 } },
    room: { ambient: 0.012 },
    lights: [
      light("key",  { on: false, power: 1,    azimuthDeg: -45, elevationDeg: 30, distance: 1.5, size: 0.6 }),
      light("fill", { on: false, power: 0.35, azimuthDeg: 40,  elevationDeg: 5,  distance: 1.8, size: 1.0 }),
      light("back", { on: false, power: 0.9,  azimuthDeg: 140, elevationDeg: 35, distance: 1.2, size: 0.1 }),
    ],
  };
}

export const PRESETS = {
  threePoint: {
    label: "Three-point",
    build() {
      const s = blankScene();
      s.lights.forEach((l) => { l.on = true; });
      return s;
    },
  },
  highKey: {
    label: "High-key",
    build() {
      const s = blankScene();
      s.backdrop = { color: "#fff8ee", brightness: 0.9, distance: 1.2, light: { on: true, power: 0.9 } };
      s.room.ambient = 0.12;
      s.camera.evCompensation = 0.5;
      const [k, f, b] = s.lights;
      Object.assign(k, { on: true, power: 1, azimuthDeg: -30, elevationDeg: 25, distance: 1.5, size: 0.9 });
      Object.assign(f, { on: true, power: 0.85, azimuthDeg: 35, elevationDeg: 10, distance: 1.8, size: 1.0 });
      Object.assign(b, { on: false });
      return s;
    },
  },
  lowKey: {
    label: "Low-key",
    build() {
      const s = blankScene();
      s.backdrop = { color: "#ffffff", brightness: 0.03, distance: 2.0, light: { on: false, power: 0.5 } };
      s.room.ambient = 0;
      const [k] = s.lights;
      Object.assign(k, { on: true, power: 1, azimuthDeg: -75, elevationDeg: 15, distance: 1.6, size: 0.1 });
      return s;
    },
  },
  blank: { label: "Blank studio", build: blankScene },
};

const clamp = (v, [lo, hi], dflt) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

// Accept anything (an old file, a hand-edited file, junk) and return a valid scene.
// Unknown fields are dropped; missing or bad values fall back to the blank studio's.
export function normalize(input) {
  const base = blankScene();
  if (!input || typeof input !== "object") return base;
  if (typeof input.version === "number" && input.version > VERSION) {
    throw new Error("This setup was made by a newer version of Light Lab.");
  }
  const s = base;
  const c = input.camera || {};
  s.camera.autoExposure = typeof c.autoExposure === "boolean" ? c.autoExposure : true;
  s.camera.evCompensation = clamp(c.evCompensation, LIMITS.ev, 0);
  s.camera.manualExposure = clamp(c.manualExposure, [0.01, 100], 1);
  const b = input.backdrop || {};
  s.backdrop.color = /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color.toLowerCase() : "#ffffff";
  s.backdrop.brightness = clamp(b.brightness, LIMITS.brightness, 0.5);
  s.backdrop.distance = clamp(b.distance, LIMITS.backdropDistance, 0.9);
  const bl = b.light || {};
  s.backdrop.light = { on: !!bl.on, power: clamp(bl.power, LIMITS.power, 0.5) };
  s.room.ambient = clamp(input.room?.ambient, [0, 0.5], 0.012);
  const given = Array.isArray(input.lights) ? input.lights : [];
  for (const l of s.lights) {
    const g = given.find((x) => x && x.id === l.id);
    if (!g) continue;
    l.on = !!g.on;
    l.power = clamp(g.power, LIMITS.power, l.power);
    l.azimuthDeg = clamp(g.azimuthDeg, LIMITS.azimuthDeg, l.azimuthDeg);
    l.elevationDeg = clamp(g.elevationDeg, LIMITS.elevationDeg, l.elevationDeg);
    l.distance = clamp(g.distance, LIMITS.distance, l.distance);
    l.size = clamp(g.size, LIMITS.size, l.size);
    l.kelvin = clamp(g.kelvin, [1500, 10000], 5600);
  }
  return s;
}

export const serialize = (s) => JSON.stringify(s, null, 2);
export function parse(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error("That file isn't a Light Lab setup."); }
  if (!data || typeof data !== "object" || !Array.isArray(data.lights)) throw new Error("That file isn't a Light Lab setup.");
  return normalize(data);
}

export const clone = (s) => JSON.parse(JSON.stringify(s));

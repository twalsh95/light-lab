// Scene state: the one JSON object that describes a whole setup. It's what undo stores,
// what a setup file contains, and (later) what an account saves.
//
// Version 2 (Phase 3): each light is a real fixture from data/gear.json with a modifier.
// Units: metres and degrees. power 0..1.
import { gear, fixture, modifier, reflectorItem } from "./gear.js";

export const VERSION = 2;

export const LIMITS = {
  power: [0, 1], azimuthDeg: [-180, 180], elevationDeg: [-30, 75], distance: [0.4, 4],
  size: [0.03, 1.5], backdropDistance: [0.4, 3], brightness: [0.02, 0.95], ev: [-3, 3],
  kelvin: [1500, 10000], hue: [0, 360], sat: [0, 1], flood: [0, 1], cut: [0, 0.95], aim: [-45, 45],
  maxLights: 6, maxReflectors: 2,
};

export const ROLES = {
  key:      { label: "Key light",      letter: "K", define: "The main light. The brightest. Sets the direction of the shadows." },
  fill:     { label: "Fill light",     letter: "F", define: "A softer light that lightens the shadows the key makes." },
  back:     { label: "Back light",     letter: "B", define: "A light behind the subject that outlines the head and shoulders." },
  hair:     { label: "Hair light",     letter: "H", define: "A back light aimed at the top of the head." },
  accent:   { label: "Accent light",   letter: "A", define: "An extra light for a detail, a colour, or a pattern." },
  backdrop: { label: "Backdrop light", letter: "BG", define: "A light hidden behind the subject, aimed at the backdrop. It changes the backdrop, not the face." },
};
export const SIDES = { top: "Top", bottom: "Bottom", camera: "Camera side", backdrop: "Backdrop side" };

let nextId = 1;
export function newId(prefix, state) {
  const used = new Set([...(state?.lights || []), ...(state?.reflectors || [])].map((x) => x.id));
  let id;
  do { id = prefix + nextId++; } while (used.has(id));
  return id;
}

// A light with sensible defaults for its fixture.
export function makeLight(o) {
  const f = fixture(o.fixture);
  const l = Object.assign({
    id: "L" + nextId++, role: "key", fixture: o.fixture, modifier: f.defaultModifier,
    on: true, power: 0.8, azimuthDeg: -45, elevationDeg: 25, distance: 1.5,
    kelvin: f.kelvin[0] === f.kelvin[1] ? f.kelvin[0] : 5600,
    color: { mode: "white", hue: 30, sat: 1 }, gel: "none", gobo: "window", flood: 0.5,
    shutters: { top: 0, bottom: 0, camera: 0, backdrop: 0 }, flag: null, sizeOverride: null,
    aim: { at: "face", panDeg: 0, tiltDeg: 0 },
  }, o);
  return l;
}
export function makeReflector(o) {
  return Object.assign({ id: "R" + nextId++, item: "flag-black-white", side: "white", azimuthDeg: 50, elevationDeg: 0, distance: 0.9 }, o);
}

export function blankScene() {
  return {
    version: VERSION,
    mode: "room",
    subject: { model: "clay-head", skin: "clay", clothing: "match" },
    camera: { autoExposure: true, evCompensation: 0, manualExposure: 1, whiteBalance: "daylight" },
    backdrop: { type: "white", brightness: 0.5, distance: 1.0 },
    room: { ambient: 0.006 },
    lights: [],
    reflectors: [],
  };
}

// Presets use only real gear, so they work in Room mode.
export const PRESETS = {
  threePoint: {
    label: "Three-point",
    build() {
      const s = blankScene();
      // White paper 1.8 m back reads mid-grey: only the key's spill reaches it (falloff).
      s.backdrop = { type: "white", brightness: 0.5, distance: 1.8 };
      s.lights = [
        makeLight({ id: "key", role: "key", fixture: "cb60-rgb", modifier: "cb60-softbox", power: 1, azimuthDeg: -45, elevationDeg: 30, distance: 1.5 }),
        makeLight({ id: "fill", role: "fill", fixture: "d50", power: 1, azimuthDeg: 40, elevationDeg: 5, distance: 1.2 }),
        makeLight({ id: "back", role: "back", fixture: "cb60-rgb", modifier: "cb60-reflector", power: 0.25, azimuthDeg: 140, elevationDeg: 35, distance: 1.3 }),
      ];
      return s;
    },
  },
  highKey: {
    label: "High-key",
    build() {
      const s = blankScene();
      s.backdrop = { type: "white", brightness: 0.9, distance: 1.2 };
      s.room.ambient = 0.012; s.camera.evCompensation = 0.5;
      s.lights = [
        makeLight({ id: "key", role: "key", fixture: "torjim-85", power: 1, azimuthDeg: -30, elevationDeg: 25, distance: 0.9, kelvin: 5600 }),
        makeLight({ id: "fill", role: "fill", fixture: "torjim-85", power: 0.85, azimuthDeg: 35, elevationDeg: 10, distance: 1.0, kelvin: 5600 }),
        makeLight({ id: "bg1", role: "backdrop", fixture: "s45-rgb", power: 1, kelvin: 5600 }),
      ];
      return s;
    },
  },
  lowKey: {
    label: "Low-key",
    build() {
      const s = blankScene();
      s.backdrop = { type: "black", brightness: 0.03, distance: 2.0 };
      s.camera.whiteBalance = "tungsten";   // halogen key: set the camera to match
      s.room.ambient = 0;
      s.lights = [
        makeLight({ id: "key", role: "key", fixture: "fresnel-650", power: 1, azimuthDeg: -75, elevationDeg: 15, distance: 2.6, flood: 0.6,
          shutters: { top: 0, bottom: 0, camera: 0, backdrop: 0.3 } }),
      ];
      return s;
    },
  },
  blank: { label: "Blank studio", build: blankScene },
};

const num = (v, [lo, hi], dflt) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const oneOf = (v, obj, dflt) => (typeof v === "string" && Object.prototype.hasOwnProperty.call(obj, v) ? v : dflt);

// Version 1 (Phase 2) had fixed key/fill/back lights of any size. They become
// any-size studio lights in Open studio, so old files look the same.
function fromV1(input) {
  const s = blankScene();
  s.mode = "open";
  const b = input.backdrop || {};
  s.backdrop = { type: "custom", brightness: num(b.brightness, LIMITS.brightness, 0.5), distance: num(b.distance, LIMITS.backdropDistance, 0.9) };
  s.camera = Object.assign(s.camera, input.camera || {});
  s.room.ambient = num(input.room?.ambient, [0, 0.5], 0.012);
  for (const l of input.lights || []) {
    if (!l || !ROLES[l.role]) continue;
    s.lights.push(makeLight({ id: l.id || newId("L", s), role: l.role, fixture: "studio-light", modifier: "any-size", on: !!l.on,
      power: num(l.power, LIMITS.power, 0.8), azimuthDeg: l.azimuthDeg, elevationDeg: l.elevationDeg, distance: l.distance,
      kelvin: num(l.kelvin, LIMITS.kelvin, 5600), sizeOverride: num(l.size, LIMITS.size, 0.6) }));
  }
  const bl = b.light;
  if (bl && bl.on) s.lights.push(makeLight({ id: "bg", role: "backdrop", fixture: "studio-light", modifier: "any-size", power: num(bl.power, LIMITS.power, 0.5), sizeOverride: 0.15 }));
  return s;
}

// Accept anything (an old file, a hand-edited file, junk) and return a valid scene.
export function normalize(input) {
  if (!input || typeof input !== "object") return blankScene();
  if (typeof input.version === "number" && input.version > VERSION) throw new Error("This setup was made by a newer version of Light Lab.");
  if (input.version === 1) input = fromV1(input);
  const G = gear();
  const s = blankScene();
  s.mode = input.mode === "open" ? "open" : "room";
  const sub = input.subject || {};
  s.subject.skin = oneOf(sub.skin, G.skins, "clay");
  s.subject.clothing = oneOf(sub.clothing, G.clothing, "match");
  const c = input.camera || {};
  s.camera.autoExposure = typeof c.autoExposure === "boolean" ? c.autoExposure : true;
  s.camera.evCompensation = num(c.evCompensation, LIMITS.ev, 0);
  s.camera.manualExposure = num(c.manualExposure, [0.01, 1000], 1);
  s.camera.whiteBalance = ["daylight", "tungsten", "auto"].includes(c.whiteBalance) ? c.whiteBalance : "daylight";
  const b = input.backdrop || {};
  s.backdrop.type = b.type === "custom" ? "custom" : oneOf(b.type, G.backdrops, "white");
  s.backdrop.brightness = num(b.brightness, LIMITS.brightness, 0.5);
  s.backdrop.distance = num(b.distance, LIMITS.backdropDistance, 1.0);
  s.room.ambient = num(input.room?.ambient, [0, 0.5], 0.006);

  const ids = new Set();
  for (const g of (Array.isArray(input.lights) ? input.lights : []).slice(0, LIMITS.maxLights + 1)) {
    if (!g || !G.fixtures[g.fixture]) continue;
    const f = G.fixtures[g.fixture];
    const id = typeof g.id === "string" && !ids.has(g.id) ? g.id.slice(0, 20) : newId("L", s);
    ids.add(id);
    const sh = g.shutters || {};
    s.lights.push(makeLight({
      id, fixture: g.fixture,
      role: oneOf(g.role, ROLES, "key"),
      modifier: f.modifiers.includes(g.modifier) ? g.modifier : f.defaultModifier,
      on: g.on !== false,
      power: num(g.power, LIMITS.power, 0.8),
      azimuthDeg: num(g.azimuthDeg, LIMITS.azimuthDeg, -45),
      elevationDeg: num(g.elevationDeg, LIMITS.elevationDeg, 25),
      distance: num(g.distance, LIMITS.distance, 1.5),
      kelvin: num(g.kelvin, f.kelvin, f.kelvin[0] === f.kelvin[1] ? f.kelvin[0] : 5600),
      color: { mode: f.rgb && g.color?.mode === "rgb" ? "rgb" : "white", hue: num(g.color?.hue, LIMITS.hue, 30), sat: num(g.color?.sat, LIMITS.sat, 1) },
      gel: oneOf(g.gel, G.gels, "none"),
      gobo: oneOf(g.gobo, G.gobos, "window"),
      flood: num(g.flood, LIMITS.flood, 0.5),
      shutters: { top: num(sh.top, LIMITS.cut, 0), bottom: num(sh.bottom, LIMITS.cut, 0), camera: num(sh.camera, LIMITS.cut, 0), backdrop: num(sh.backdrop, LIMITS.cut, 0) },
      flag: g.flag && SIDES[g.flag.side] ? { side: g.flag.side, amount: num(g.flag.amount, LIMITS.cut, 0.5) } : null,
      sizeOverride: s.mode === "open" && typeof g.sizeOverride === "number" ? num(g.sizeOverride, LIMITS.size, 0.6) : null,
      aim: { at: g.aim?.at === "backdrop" ? "backdrop" : "face", panDeg: num(g.aim?.panDeg, LIMITS.aim, 0), tiltDeg: num(g.aim?.tiltDeg, LIMITS.aim, 0) },
    }));
  }
  for (const g of (Array.isArray(input.reflectors) ? input.reflectors : []).slice(0, LIMITS.maxReflectors)) {
    if (!g || !G.reflectors[g.item]) continue;
    const item = G.reflectors[g.item];
    const side = item.sides[g.side] && item.sides[g.side].reflect > 0 ? g.side : Object.keys(item.sides).find((k) => item.sides[k].reflect > 0);
    s.reflectors.push(makeReflector({ id: typeof g.id === "string" ? g.id.slice(0, 20) : newId("R", s), item: g.item, side,
      azimuthDeg: num(g.azimuthDeg, LIMITS.azimuthDeg, 50), elevationDeg: num(g.elevationDeg, LIMITS.elevationDeg, 0), distance: num(g.distance, LIMITS.distance, 0.9) }));
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
export { modifier, reflectorItem };

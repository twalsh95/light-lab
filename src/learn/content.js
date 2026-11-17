// Learning content: lessons, predict-and-reveal questions, Match the look targets and Name the
// setup scenes, all as JSON files in content/ (listed in content/index.json) so Tom can add or
// change them without touching code.
//
// Every item has a "status". New drafts are "draft" until Tom approves them; students see only
// "approved" items. Add ?drafts=1 to the address to preview drafts (marked DRAFT).
import { PRESETS, normalize, makeLight, makeReflector } from "../scene/schema.js";
import { cameraSettings, meterFace } from "../scene/lightmath.js";
import { meterStops } from "../scene/camera.js";

export const showDrafts = () => new URLSearchParams(location.search).get("drafts") === "1";

export async function loadContent(base = new URL("../../content/", import.meta.url)) {
  const idx = await (await fetch(new URL("index.json", base))).json();
  const out = { lessons: [], predict: [], targets: [], quizzes: [] };
  const all = await Promise.all(idx.files.map(async (f) => {
    try { const r = await fetch(new URL(f, base)); return r.ok ? await r.json() : null; } catch (e) { return null; }
  }));
  for (const doc of all) {
    if (!doc) continue;
    for (const item of doc.items || [doc]) {
      if (item.status !== "approved" && !showDrafts()) continue;
      (out[doc.type] || out[item.type] || []).push({ ...item, draft: item.status !== "approved" });
    }
  }
  return out;
}

// A scene from content: a preset plus changes. Lights in "lights" are matched by id (or added
// if new); "remove" takes lights away. Example:
//   { "preset": "threePoint", "lights": { "fill": { "on": false } }, "backdrop": { "type": "black" } }
export function buildScene(def = {}, current = null) {
  const base = def.preset === "current" && current ? JSON.parse(JSON.stringify(current)) : (PRESETS[def.preset || "threePoint"] || PRESETS.threePoint).build();
  return applyPatch(base, def);
}
export function applyPatch(scene, def = {}) {
  const s = JSON.parse(JSON.stringify(scene));
  for (const k of ["mode", "subject", "camera", "backdrop", "room"]) if (def[k] !== undefined) s[k] = typeof def[k] === "object" ? { ...s[k], ...def[k] } : def[k];
  for (const id of def.remove || []) s.lights = s.lights.filter((l) => l.id !== id);
  for (const [id, change] of Object.entries(def.lights || {})) {
    const l = s.lights.find((x) => x.id === id);
    if (l) Object.assign(l, change, change.aim ? { aim: { ...l.aim, ...change.aim } } : {}, change.shutters ? { shutters: { ...l.shutters, ...change.shutters } } : {});
    else if (change.fixture) s.lights.push(makeLight({ id, role: change.role || "accent", ...change }));
  }
  if (def.reflectors) s.reflectors = def.reflectors.map((r) => makeReflector(r));
  return normalize(s);
}

// Lesson task checks. Each condition is one of:
//   { "light": "fill", "on": true }                 a light (by id, or by role) is on/off
//   { "light": "fill", "prop": "power", "<": 0.5 }   compare one of its settings
//   { "metric": "shadowStops", ">=": 2 }             compare a measured property
//   { "class": "low-key" }                           the classifier's call
//   { "path": "camera.mode", "eq": "manual" }        any scene setting ("in": [...] = one of)
//   { "count": "lightsOn", ">=": 3 }                 how many lights are on
//   { "meter": true, ">=": -0.3, "<=": 0.3 }         the camera meter, in stops (0 = correct)
export function checkAll(conds = [], state, metrics, cls) {
  return conds.every((c) => check(c, state, metrics, cls));
}
function compare(v, c) {
  for (const [op, x] of Object.entries(c)) {
    if (op === "<" && !(v < x)) return false;
    if (op === "<=" && !(v <= x)) return false;
    if (op === ">" && !(v > x)) return false;
    if (op === ">=" && !(v >= x)) return false;
    if (op === "eq" && v !== x) return false;
    if (op === "in" && !x.includes(v)) return false;
  }
  return true;
}
function check(c, state, metrics, cls) {
  const ops = Object.fromEntries(Object.entries(c).filter(([k]) => ["<", "<=", ">", ">=", "eq", "in"].includes(k)));
  if (c.light !== undefined) {
    const l = state.lights.find((x) => x.id === c.light) || state.lights.find((x) => x.role === c.light && x.on) || state.lights.find((x) => x.role === c.light);
    if (!l) return c.on === false;
    if (c.on !== undefined && l.on !== c.on) return false;
    return c.prop ? compare(l[c.prop], ops) : true;
  }
  if (c.metric) return !!metrics && compare(metrics[c.metric], ops);
  if (c.meter) return compare(meterStops(cameraSettings(state), meterFace(state)), ops);
  if (c.class) return !!cls && cls.id === c.class;
  if (c.path) return compare(c.path.split(".").reduce((o, k) => (o == null ? o : o[k]), state), ops);
  if (c.count === "lightsOn") return compare(state.lights.filter((l) => l.on).length, ops);
  return true;
}

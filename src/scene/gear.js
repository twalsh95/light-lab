// The gear catalogue (data/gear.json) and Room-mode inventory. Loaded once at start-up.
let GEAR = null, CAMERAS = null;

export async function loadGear(url = new URL("../../data/gear.json", import.meta.url)) {
  const [r, rc] = await Promise.all([fetch(url), fetch(new URL("../../data/cameras.json", import.meta.url))]);
  if (!r.ok) throw new Error("Couldn't load the gear list (" + r.status + ").");
  if (!rc.ok) throw new Error("Couldn't load the camera list (" + rc.status + ").");
  GEAR = await r.json();
  CAMERAS = await rc.json();
  return GEAR;
}
export function cameras() {
  if (!CAMERAS) throw new Error("Camera list not loaded yet.");
  return CAMERAS;
}
export function cameraGear(state) {
  const C = cameras();
  return { body: C.bodies[state.camera.body] || C.bodies[C.default.body], lens: C.lenses[state.camera.lens] || C.lenses[C.default.lens] };
}
export function setGear(g) { GEAR = g; }
export function gear() {
  if (!GEAR) throw new Error("Gear list not loaded yet.");
  return GEAR;
}

export const fixture = (id) => gear().fixtures[id];
export const modifier = (id) => gear().modifiers[id];
export const reflectorItem = (id) => gear().reflectors[id];

// What the room has: { fixtures: {id: n}, modifiers: {...}, reflectors: {...}, backdrops: [...] }.
// All of Tom's gear is available to use; there's no split by station.
export function inventory() {
  const g = gear();
  const pick = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => !v.openOnly).map(([k, v]) => [k, v.count ?? 0]));
  return { fixtures: pick(g.fixtures), modifiers: pick(g.modifiers), reflectors: pick(g.reflectors), backdrops: Object.keys(g.backdrops) };
}

// Gear a scene is using. The black/white flag counts once whether it's bouncing (white
// side) or blocking (black side, attached to a light).
export function usage(state) {
  const u = { fixtures: {}, modifiers: {}, reflectors: {} };
  const add = (bucket, id) => { u[bucket][id] = (u[bucket][id] || 0) + 1; };
  for (const l of state.lights) {
    add("fixtures", l.fixture);
    add("modifiers", l.modifier);
    if (l.flag) add("reflectors", "flag-black-white");
  }
  for (const r of state.reflectors) add("reflectors", r.item);
  return u;
}

// Problems with the scene in Room mode, as plain sentences. Empty in Open studio.
export function inventoryProblems(state) {
  if (state.mode !== "room") return [];
  const inv = inventory(), u = usage(state), out = [];
  const where = "the room";
  for (const [bucket, label] of [["fixtures", fixture], ["modifiers", modifier], ["reflectors", reflectorItem]]) {
    for (const [id, n] of Object.entries(u[bucket])) {
      const have = inv[bucket][id] || 0, unlimited = bucket === "modifiers" && modifier(id)?.count >= 99;
      if (!unlimited && n > have) out.push(`${have ? `Only ${have}` : "No"} ${label(id).name}${have === 1 ? "" : "s"} at ${where} (this setup uses ${n}).`);
    }
  }
  if (!inv.backdrops.includes(state.backdrop.type)) out.push(`${gear().backdrops[state.backdrop.type]?.name || "That"} backdrop isn't at ${where}.`);
  return out;
}

// How many more of something can be added in Room mode (Infinity in Open studio).
export function remaining(state, bucket, id) {
  if (state.mode !== "room") return Infinity;
  if (bucket === "modifiers" && modifier(id)?.count >= 99) return Infinity;
  return (inventory()[bucket][id] || 0) - (usage(state)[bucket][id] || 0);
}

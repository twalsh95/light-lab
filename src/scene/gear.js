// The gear catalogue (data/gear.json) and Room-mode inventory. Loaded once at start-up.
let GEAR = null;

export async function loadGear(url = new URL("../../data/gear.json", import.meta.url)) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Couldn't load the gear list (" + r.status + ").");
  GEAR = await r.json();
  return GEAR;
}
export function setGear(g) { GEAR = g; }
export function gear() {
  if (!GEAR) throw new Error("Gear list not loaded yet.");
  return GEAR;
}

export const fixture = (id) => gear().fixtures[id];
export const modifier = (id) => gear().modifiers[id];
export const reflectorItem = (id) => gear().reflectors[id];

export const STATIONS = ["all", "three-point", "high-key", "low-key"];
export function stationName(id) {
  return id === "all" ? "Whole room" : gear().stations[id]?.name || id;
}

// What a station (or the whole room) has: { fixtures: {id: n}, modifiers: {...}, reflectors: {...}, backdrops: [...] }
export function inventory(station) {
  const g = gear();
  if (station && station !== "all" && g.stations[station]) {
    const s = g.stations[station];
    return { fixtures: { ...s.fixtures }, modifiers: { ...s.modifiers }, reflectors: { ...s.reflectors }, backdrops: [...s.backdrops] };
  }
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
  const inv = inventory(state.station), u = usage(state), out = [];
  const where = state.station === "all" ? "the room" : "this station";
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
  return (inventory(state.station)[bucket][id] || 0) - (usage(state)[bucket][id] || 0);
}

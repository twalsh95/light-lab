// Settings panels: Studio (mode, add gear), the selected light or reflector,
// Subject, Backdrop and Camera. Every number has a slider and a number box, so students
// can drag or type: the same goal, different means.
import { ROLES, SIDES, LIMITS, makeLight, makeReflector, newId } from "../scene/schema.js";
import { gear, fixture, modifier, reflectorItem, inventory, inventoryProblems, remaining } from "../scene/gear.js";
import { lightSpec } from "../scene/lightmath.js";

let uid = 0;
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids) if (k != null && k !== false) e.append(k);
  return e;
}

function numberRow({ key, label, hint, min, max, step, unit, scale = 1, get, set, disabled }) {
  const id = "c" + ++uid;
  const range = h("input", { type: "range", id, min: min * scale, max: max * scale, step, "data-key": key, "aria-describedby": hint ? id + "h" : null });
  const box = h("input", { type: "number", min: min * scale, max: max * scale, step, "data-key": key + "-n", "aria-label": `${label} (${unit})`, class: "num" });
  const row = h("div", { class: "row" },
    h("label", { for: id }, label), range,
    h("span", { class: "numwrap" }, box, h("span", { class: "unit" }, unit)),
    hint ? h("p", { class: "hint", id: id + "h" }, hint) : null);
  const apply = (v) => { const n = parseFloat(v); if (Number.isFinite(n)) set(Math.min(max, Math.max(min, n / scale))); };
  range.addEventListener("input", () => apply(range.value));
  range.addEventListener("change", () => set.end?.());
  box.addEventListener("change", () => { apply(box.value); set.end?.(); });
  if (disabled) { range.disabled = true; box.disabled = true; }
  return { row, update(s) { const v = +(get(s) * scale).toFixed(2); range.value = v; if (document.activeElement !== box) box.value = v; } };
}
function checkRow({ key, label, get, set }) {
  const id = "c" + ++uid;
  const box = h("input", { type: "checkbox", id, "data-key": key, onchange: () => set(box.checked) });
  return { row: h("div", { class: "row check" }, box, h("label", { for: id }, label)), update(s) { box.checked = get(s); } };
}
function selectRow({ key, label, hint, options, get, set }) {
  const id = "c" + ++uid;
  const sel = h("select", { id, "data-key": key, onchange: () => set(sel.value) });
  for (const [value, text, disabled] of options) sel.append(h("option", { value, disabled: !!disabled }, text));
  return {
    row: h("div", { class: "row select" }, h("label", { for: id }, label), sel, hint ? h("p", { class: "hint" }, hint) : null),
    update(s) { sel.value = get(s); },
  };
}
function textRow(label, text) { return { row: h("div", { class: "row text" }, h("span", { class: "rowlabel" }, label), h("span", {}, text)), update() {} }; }

export function createPanels(els, history, { onSelect, announce }) {
  let selected = null, signature = "", rows = [];
  const G = () => gear();
  const findLight = (s, id = selected) => s.lights.find((l) => l.id === id);
  const findRefl = (s, id = selected) => s.reflectors.find((r) => r.id === id);
  const change = (fn, group) => history.change(fn, group);
  const grouped = (fn, group) => { const f = (v) => change((s) => fn(s, v), group); f.end = () => history.endGroup(); return f; };
  const onLight = (fn, group) => grouped((s, v) => { const l = findLight(s); if (l) fn(l, v, s); }, group);
  const onRefl = (fn, group) => grouped((s, v) => { const r = findRefl(s); if (r) fn(r, v, s); }, group);
  const restoreFocus = (key) => { if (!key) return; const e = els.inspector.querySelector(`[data-key="${key}"]`); e?.focus(); };

  // ----- Studio: mode, add gear -----
  const modeRow = selectRow({ key: "mode", label: "Mode", options: [["room", "Room mode: only the gear we have"], ["open", "Open studio: unlimited gear"]],
    get: (s) => s.mode, set: (v) => change((s) => { s.mode = v; if (v === "room") s.lights.forEach((l) => { l.sizeOverride = null; }); }) });
  const problems = h("ul", { class: "problems", "aria-live": "polite" });
  const invList = h("p", { class: "hint inventory" });
  const addFixture = h("select", { "aria-label": "Fixture to add" });
  const addRole = h("select", { "aria-label": "Role of the new light" });
  for (const [k, r] of Object.entries(ROLES)) addRole.append(h("option", { value: k }, r.label));
  const addBtn = h("button", { type: "button", class: "solid", onclick: () => addLight() }, "Add light");
  const addRefl = h("select", { "aria-label": "Reflector to add" });
  const addReflBtn = h("button", { type: "button", onclick: () => addReflector() }, "Add reflector");
  els.studio.append(modeRow.row, problems,
    h("div", { class: "addrow" }, h("label", {}, "Add a light"), addFixture, addRole, addBtn),
    h("div", { class: "addrow" }, h("label", {}, "Add a reflector"), addRefl, addReflBtn),
    invList);

  const PLACE = { key: [-45, 30, 1.5], fill: [40, 5, 1.5], back: [140, 35, 1.3], hair: [175, 60, 1.2], accent: [90, 10, 1.5], backdrop: [180, -20, 0.5] };
  function addLight() {
    const s = history.state;
    if (s.lights.length >= LIMITS.maxLights) { announce(`The studio holds ${LIMITS.maxLights} lights at most.`); return; }
    const fid = addFixture.value, role = addRole.value;
    if (!fid) return;
    const [az, el, d] = PLACE[role];
    const l = makeLight({ id: newId("L", s), fixture: fid, role, azimuthDeg: az, elevationDeg: el, distance: d });
    if (s.mode === "room" && remaining(s, "modifiers", l.modifier) <= 0) {
      const alt = fixture(fid).modifiers.find((m) => remaining(s, "modifiers", m) > 0);
      if (alt) l.modifier = alt;
    }
    change((st) => { st.lights.push(l); });
    selected = l.id; onSelect(l.id);
    announce(`Added ${ROLES[role].label.toLowerCase()}: ${fixture(fid).short}.`);
  }
  function addReflector() {
    const s = history.state;
    if (s.reflectors.length >= LIMITS.maxReflectors) { announce("Two reflectors at most."); return; }
    const [item, side] = addRefl.value.split(":");
    if (!item) return;
    const r = makeReflector({ id: newId("R", s), item, side, azimuthDeg: 55, distance: 0.8 });
    change((st) => { st.reflectors.push(r); });
    selected = r.id; onSelect(r.id);
    announce(`Added a reflector: ${reflectorItem(item).sides[side].name.toLowerCase()}.`);
  }
  function fillAddMenus(s) {
    addFixture.innerHTML = "";
    for (const [id, f] of Object.entries(G().fixtures)) {
      if (f.openOnly && s.mode !== "open") continue;
      const left = remaining(s, "fixtures", id);
      if (s.mode === "room" && (inventory().fixtures[id] || 0) === 0) continue;
      addFixture.append(h("option", { value: id, disabled: left <= 0 }, f.name + (s.mode === "room" ? ` (${Math.max(0, left)} free)` : "")));
    }
    const firstFree = [...addFixture.options].find((o) => !o.disabled);
    if (firstFree) addFixture.value = firstFree.value;
    addBtn.disabled = !firstFree || s.lights.length >= LIMITS.maxLights;
    addRefl.innerHTML = "";
    for (const [id, it] of Object.entries(G().reflectors)) {
      const left = remaining(s, "reflectors", id);
      if (s.mode === "room" && (inventory().reflectors[id] || 0) === 0) continue;
      for (const [side, sd] of Object.entries(it.sides)) if (sd.reflect > 0) addRefl.append(h("option", { value: `${id}:${side}`, disabled: left <= 0 }, sd.name.replace(" (bounce)", "") + ` (${it.name})`));
    }
    const firstRefl = [...addRefl.options].find((o) => !o.disabled);
    if (firstRefl) addRefl.value = firstRefl.value;
    addReflBtn.disabled = !firstRefl || s.reflectors.length >= LIMITS.maxReflectors;
    addRefl.disabled = addRefl.options.length === 0;
  }

  // ----- Inspector -----
  function lightRows(s, l) {
    const f = fixture(l.fixture), spec = lightSpec(l, s), out = [];
    const room = s.mode === "room";
    out.push(selectRow({ key: "role", label: "Role", options: Object.entries(ROLES).map(([k, r]) => [k, r.label]),
      get: () => findLight(history.state)?.role, set: (v) => change((st) => { findLight(st).role = v; }) }));
    out.push(selectRow({ key: "fixture", label: "Fixture",
      options: Object.entries(G().fixtures).filter(([id, x]) => (!x.openOnly || !room) && (!room || id === l.fixture || remaining(s, "fixtures", id) > 0)).map(([id, x]) => [id, x.name]),
      get: () => findLight(history.state)?.fixture,
      set: (v) => change((st) => { const x = findLight(st), nf = fixture(v); x.fixture = v; x.modifier = nf.defaultModifier; x.kelvin = Math.min(nf.kelvin[1], Math.max(nf.kelvin[0], x.kelvin)); if (!nf.rgb) x.color.mode = "white"; }) }));
    out.push(selectRow({ key: "modifier", label: "Modifier",
      options: f.modifiers.map((m) => [m, modifier(m).name + (room && m !== l.modifier && remaining(s, "modifiers", m) <= 0 ? " (all in use)" : ""), room && m !== l.modifier && remaining(s, "modifiers", m) <= 0]),
      get: () => findLight(history.state)?.modifier, set: (v) => change((st) => { findLight(st).modifier = v; }) }));
    out.push(checkRow({ key: "on", label: "On", get: () => !!findLight(history.state)?.on, set: (v) => change((st) => { findLight(st).on = v; }) }));
    const noDimmer = room && !f.dimmable;
    out.push(numberRow({ key: "power", label: "Power", min: 0, max: 1, step: 1, unit: "%", scale: 100, disabled: noDimmer,
      hint: noDimmer ? "This light has no dimmer. To change how bright it is, move it, use the focus dial (spot or flood), or fold in the barn doors." : null,
      get: (st) => findLight(st)?.power ?? 0, set: onLight((x, v) => { x.power = v; x.on = true; }, "power-" + l.id) }));
    if (l.role !== "backdrop") {
      out.push(numberRow({ key: "az", label: "Around", hint: "0° is beside the camera. Negative is camera-left, positive is camera-right, ±180° is behind.",
        min: LIMITS.azimuthDeg[0], max: LIMITS.azimuthDeg[1], step: 1, unit: "°", get: (st) => findLight(st)?.azimuthDeg ?? 0, set: onLight((x, v) => { x.azimuthDeg = v; }, "az-" + l.id) }));
      out.push(numberRow({ key: "el", label: "Height", hint: "How far above eye level the light points down from.",
        min: LIMITS.elevationDeg[0], max: LIMITS.elevationDeg[1], step: 1, unit: "°", get: (st) => findLight(st)?.elevationDeg ?? 0, set: onLight((x, v) => { x.elevationDeg = v; }, "el-" + l.id) }));
      out.push(numberRow({ key: "dist", label: "Distance", hint: "Farther away = dimmer (falloff) and harder shadows.",
        min: LIMITS.distance[0], max: LIMITS.distance[1], step: 0.05, unit: "m", get: (st) => findLight(st)?.distance ?? 1, set: onLight((x, v) => { x.distance = v; }, "dist-" + l.id) }));
    } else {
      out.push(textRow("Position", "Hidden behind the subject, aimed at the backdrop."));
    }
    if (room) out.push(textRow("Size", `${Math.round(spec.size * 100)} cm (${modifier(l.modifier).name}). Bigger = softer.`));
    else out.push(numberRow({ key: "size", label: "Size", hint: "Small = hard light, crisp shadows. Big = soft light, gentle shadows.",
      min: LIMITS.size[0], max: LIMITS.size[1], step: 1, unit: "cm", scale: 100, get: (st) => { const x = findLight(st); return x ? lightSpec(x, st).size : 0.5; },
      set: onLight((x, v) => { x.sizeOverride = v; }, "size-" + l.id) }));
    if (f.beamDeg) out.push(numberRow({ key: "flood", label: "Spot ↔ flood", hint: "The focus dial on the back moves the bulb toward or away from the lens. Spot: a narrow, brighter beam. Flood: a wide, dimmer one.",
      min: 0, max: 1, step: 1, unit: "%", scale: 100, get: (st) => findLight(st)?.flood ?? 0.5, set: onLight((x, v) => { x.flood = v; }, "flood-" + l.id) }));
    // Colour
    if (f.kelvin[0] === f.kelvin[1]) out.push(textRow("Colour", `${f.kelvin[0]} K: warm halogen light, fixed.`));
    else {
      if (f.rgb) out.push(selectRow({ key: "cmode", label: "Colour mode", options: [["white", "White (warm to cool)"], ["rgb", "Colour (RGB)"]],
        get: () => findLight(history.state)?.color.mode, set: (v) => change((st) => { findLight(st).color.mode = v; }) }));
      if (!f.rgb || l.color.mode === "white") out.push(numberRow({ key: "kelvin", label: "Warm ↔ cool", hint: "Low numbers are warm (orange), high numbers are cool (blue). Daylight is about 5600 K.",
        min: f.kelvin[0], max: f.kelvin[1], step: 100, unit: "K", get: (st) => findLight(st)?.kelvin ?? 5600, set: onLight((x, v) => { x.kelvin = Math.round(v / 100) * 100; }, "k-" + l.id) }));
      else {
        out.push(numberRow({ key: "hue", label: "Hue", min: 0, max: 360, step: 1, unit: "°", get: (st) => findLight(st)?.color.hue ?? 0, set: onLight((x, v) => { x.color.hue = v; }, "hue-" + l.id) }));
        out.push(numberRow({ key: "sat", label: "Saturation", min: 0, max: 1, step: 1, unit: "%", scale: 100, get: (st) => findLight(st)?.color.sat ?? 1, set: onLight((x, v) => { x.color.sat = v; }, "sat-" + l.id) }));
      }
    }
    if (modifier(l.modifier).gels) out.push(selectRow({ key: "gel", label: "Gel", options: Object.entries(G().gels).map(([k, g]) => [k, g.name]),
      get: () => findLight(history.state)?.gel, set: (v) => change((st) => { findLight(st).gel = v; }) }));
    if (modifier(l.modifier).gobo) out.push(selectRow({ key: "gobo", label: "Gobo", hint: "A metal pattern that projects shapes with the light.",
      options: Object.entries(G().gobos).map(([k, g]) => [k, g.name]), get: () => findLight(history.state)?.gobo, set: (v) => change((st) => { findLight(st).gobo = v; }) }));
    if (f.barnDoors && l.role !== "backdrop") {
      out.push(textRow("Barn doors", "Fold a door in to cut light off one side of the beam."));
      for (const side of Object.keys(SIDES)) out.push(numberRow({ key: "bd-" + side, label: SIDES[side], min: 0, max: LIMITS.cut[1], step: 1, unit: "%", scale: 100,
        get: (st) => findLight(st)?.shutters[side] ?? 0, set: onLight((x, v) => { x.shutters[side] = v; }, "bd-" + side + l.id) }));
    }
    const flagFree = !room || l.flag || remaining(s, "reflectors", "flag-black-white") > 0;
    if (l.role !== "backdrop" && flagFree) {
      out.push(selectRow({ key: "flag", label: "Black flag", hint: "Blocks light from one side, for example to keep it off the backdrop or the lens.",
        options: [["none", "No flag"], ...Object.entries(SIDES).map(([k, v]) => [k, "On the " + v.toLowerCase()])],
        get: () => findLight(history.state)?.flag?.side || "none",
        set: (v) => change((st) => { const x = findLight(st); x.flag = v === "none" ? null : { side: v, amount: x.flag?.amount ?? 0.5 }; }) }));
      if (l.flag) out.push(numberRow({ key: "flagamt", label: "Flag amount", min: 0, max: LIMITS.cut[1], step: 1, unit: "%", scale: 100,
        get: (st) => findLight(st)?.flag?.amount ?? 0, set: onLight((x, v) => { if (x.flag) x.flag.amount = v; }, "flag-" + l.id) }));
    }
    out.push({ row: h("div", { class: "row actions" },
      h("button", { type: "button", onclick: () => remove(l.id) }, "Remove this light")), update() {} });
    out.push({ row: h("p", { class: "hint source" }, (f.estimate ? "Some numbers for this light are estimates. " : "") + f.source), update() {} });
    return out;
  }
  function reflectorRows(s, r) {
    const out = [];
    const options = [];
    for (const [id, it] of Object.entries(G().reflectors)) for (const [side, sd] of Object.entries(it.sides)) if (sd.reflect > 0) options.push([`${id}:${side}`, `${sd.name.replace(" (bounce)", "")} (${it.name})`]);
    out.push(selectRow({ key: "rside", label: "Surface", options, hint: "White bounces soft, neutral light. Silver is brighter. Gold warms the shadows.",
      get: () => { const x = findRefl(history.state); return x ? `${x.item}:${x.side}` : ""; },
      set: (v) => change((st) => { const x = findRefl(st), [item, side] = v.split(":"); x.item = item; x.side = side; }) }));
    out.push(numberRow({ key: "raz", label: "Around", min: LIMITS.azimuthDeg[0], max: LIMITS.azimuthDeg[1], step: 1, unit: "°",
      get: (st) => findRefl(st)?.azimuthDeg ?? 0, set: onRefl((x, v) => { x.azimuthDeg = v; }, "raz-" + r.id) }));
    out.push(numberRow({ key: "rel", label: "Height", min: LIMITS.elevationDeg[0], max: LIMITS.elevationDeg[1], step: 1, unit: "°",
      get: (st) => findRefl(st)?.elevationDeg ?? 0, set: onRefl((x, v) => { x.elevationDeg = v; }, "rel-" + r.id) }));
    out.push(numberRow({ key: "rdist", label: "Distance", hint: "Closer = brighter bounce.", min: LIMITS.distance[0], max: LIMITS.distance[1], step: 0.05, unit: "m",
      get: (st) => findRefl(st)?.distance ?? 1, set: onRefl((x, v) => { x.distance = v; }, "rdist-" + r.id) }));
    out.push({ row: h("div", { class: "row actions" }, h("button", { type: "button", onclick: () => remove(r.id) }, "Remove this reflector")), update() {} });
    return out;
  }
  function remove(id) {
    const s = history.state;
    const list = [...s.lights, ...s.reflectors], i = list.findIndex((x) => x.id === id);
    change((st) => { st.lights = st.lights.filter((x) => x.id !== id); st.reflectors = st.reflectors.filter((x) => x.id !== id); });
    const next = list.filter((x) => x.id !== id)[Math.max(0, i - 1)];
    selected = next?.id || null; onSelect(selected);
    announce("Removed. Undo brings it back.");
  }

  function buildInspector(s) {
    const l = findLight(s), r = findRefl(s);
    // Rebuild only when what's offered changes (not on every slider move), so focus stays put.
    const gearInUse = s.lights.map((x) => x.fixture + "/" + x.modifier + "/" + !!x.flag).join(",") + s.reflectors.map((x) => x.item).join(",");
    const sig = l ? ["L", l.id, l.fixture, l.modifier, l.role, l.color.mode, !!l.flag, s.mode, gearInUse].join("|")
      : r ? ["R", r.id].join("|") : "none|" + s.lights.length;
    if (sig === signature) return;
    const focusKey = els.inspector.contains(document.activeElement) ? document.activeElement.getAttribute("data-key") : null;
    signature = sig;
    els.inspector.innerHTML = "";
    if (l) {
      const role = ROLES[l.role];
      els.inspector.append(h("h2", { class: "inspector-title" }, h("span", { class: `badge ${l.role}`, "aria-hidden": "true" }, role.letter), " " + role.label),
        h("p", { class: "define" }, role.define));
      rows = lightRows(s, l);
    } else if (r) {
      els.inspector.append(h("h2", { class: "inspector-title" }, h("span", { class: "badge reflector", "aria-hidden": "true" }, "R"), " Reflector"),
        h("p", { class: "define" }, "A card that bounces light back onto the subject, usually to lift the shadow side."));
      rows = reflectorRows(s, r);
    } else {
      els.inspector.append(h("h2", {}, "No light selected"), h("p", { class: "define" }, s.lights.length ? "Pick a light on the map." : "The studio is dark. Add a light in the Studio panel, or pick a preset."));
      rows = [];
    }
    els.inspector.append(...rows.map((x) => x.row));
    restoreFocus(focusKey);
  }

  // ----- Subject, Backdrop, Camera -----
  const skinRow = selectRow({ key: "skin", label: "Skin tone", options: Object.entries(G().skins).map(([k, v]) => [k, v.name]),
    hint: "Lighting every skin tone well is a real professional skill. Darker skin needs more light, or more exposure, for the same brightness.",
    get: (s) => s.subject.skin, set: (v) => change((s) => { s.subject.skin = v; }) });
  const clothRow = selectRow({ key: "clothing", label: "Clothing", options: Object.entries(G().clothing).map(([k, v]) => [k, v.name]),
    get: (s) => s.subject.clothing, set: (v) => change((s) => { s.subject.clothing = v; }) });
  els.subject.append(skinRow.row, clothRow.row);

  const bdType = h("select", { id: "bdType", onchange: () => change((s) => { s.backdrop.type = bdType.value; }) });
  const bdRow = h("div", { class: "row select" }, h("label", { for: "bdType" }, "Backdrop"), bdType);
  const bdBright = numberRow({ key: "bdb", label: "Brightness", hint: "Any grey, from black cloth (3%) to white paper (90%).", min: LIMITS.brightness[0], max: LIMITS.brightness[1], step: 1, unit: "%", scale: 100,
    get: (s) => s.backdrop.brightness, set: grouped((s, v) => { s.backdrop.brightness = v; }, "bd-bright") });
  const bdDist = numberRow({ key: "bdd", label: "Distance behind", hint: "Farther back = darker backdrop, and the subject's shadow on it gets softer and fainter.",
    min: LIMITS.backdropDistance[0], max: LIMITS.backdropDistance[1], step: 0.05, unit: "m", get: (s) => s.backdrop.distance, set: grouped((s, v) => { s.backdrop.distance = v; }, "bd-dist") });
  els.backdrop.append(bdRow, bdBright.row, bdDist.row, h("p", { class: "hint" }, "To light the backdrop itself, add a light with the role Backdrop light."));

  const ae = checkRow({ key: "ae", label: "Auto exposure (works like a light meter at the face)", get: (s) => s.camera.autoExposure, set: (v) => change((s) => { s.camera.autoExposure = v; }) });
  const ev = numberRow({ key: "ev", label: "Exposure", hint: "Brighter or darker than the camera's own choice, in stops.", min: LIMITS.ev[0], max: LIMITS.ev[1], step: 0.1, unit: "EV",
    get: (s) => s.camera.evCompensation, set: grouped((s, v) => { s.camera.evCompensation = Math.round(v * 10) / 10; }, "ev") });
  const wb = selectRow({ key: "wb", label: "White balance", options: [["daylight", "Daylight (5600 K)"], ["tungsten", "Tungsten (3200 K)"], ["auto", "Auto (match the key light)"]],
    hint: "What the camera treats as white. Lights warmer than this look orange; cooler ones look blue.",
    get: (s) => s.camera.whiteBalance, set: (v) => change((s) => { s.camera.whiteBalance = v; }) });
  els.camera.append(ae.row, ev.row, wb.row);

  return {
    get selected() { return selected; },
    select(id) { selected = id; },
    update(s) {
      if (selected && !findLight(s) && !findRefl(s)) selected = null;
      if (!selected && s.lights.length) selected = s.lights[0].id;
      modeRow.update(s);
      const probs = inventoryProblems(s);
      problems.innerHTML = "";
      probs.forEach((p) => problems.append(h("li", {}, p)));
      problems.hidden = !probs.length;
      if (s.mode === "room") {
        const inv = inventory();
        invList.textContent = "The room has: " + Object.entries(inv.fixtures).filter(([, n]) => n > 0).map(([id, n]) => `${n} × ${fixture(id).short}`).join(", ") + ".";
      } else invList.textContent = "Open studio: any gear, any amount, and any light size. Numbers are still real.";
      fillAddMenus(s);
      buildInspector(s);
      rows.forEach((r) => r.update(s));
      skinRow.update(s); clothRow.update(s);
      // Backdrop choices: the room's backdrops in Room mode; those plus any grey in Open studio.
      const types = s.mode === "room" ? inventory().backdrops : [...Object.keys(G().backdrops), "custom"];
      const want = types.includes(s.backdrop.type) ? types : [...types, s.backdrop.type];
      if (bdType.dataset.sig !== want.join()) {
        bdType.innerHTML = "";
        for (const t of want) bdType.append(h("option", { value: t }, t === "custom" ? "Any grey" : G().backdrops[t].name));
        bdType.dataset.sig = want.join();
      }
      bdType.value = s.backdrop.type;
      bdBright.row.hidden = s.backdrop.type !== "custom";
      bdBright.update(s); bdDist.update(s);
      ae.update(s); ev.update(s); wb.update(s);
    },
  };
}

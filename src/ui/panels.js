// Inspector (the selected light), backdrop and camera panels. Every setting has a slider and
// a number box, so students can drag or type: the same goal, different means.
import { ROLES, LIMITS } from "../scene/schema.js";

let uid = 0;
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}

// One slider + number row. `scale` converts stored values to what's shown (e.g. 0.6 -> 60 cm).
function numberRow({ label, hint, min, max, step, unit, scale = 1, get, set, group }) {
  const id = "c" + ++uid;
  const range = h("input", { type: "range", id, min: min * scale, max: max * scale, step, "aria-describedby": hint ? id + "h" : null });
  const box = h("input", { type: "number", min: min * scale, max: max * scale, step, "aria-label": `${label} (${unit})`, class: "num" });
  const row = h("div", { class: "row" },
    h("label", { for: id }, label),
    range,
    h("span", { class: "numwrap" }, box, h("span", { class: "unit" }, unit)),
    hint ? h("p", { class: "hint", id: id + "h" }, hint) : null);
  const apply = (v, final) => {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return;
    set(Math.min(max, Math.max(min, n / scale)), group());
    if (final) set.end?.();
  };
  range.addEventListener("input", () => apply(range.value, false));
  range.addEventListener("change", () => set.end?.());
  box.addEventListener("change", () => apply(box.value, true));
  return {
    row,
    update(s) {
      const v = +(get(s) * scale).toFixed(2);
      range.value = v;
      if (document.activeElement !== box) box.value = v;
    },
    disable(d) { range.disabled = d; box.disabled = d; },
  };
}

function checkRow({ label, get, set }) {
  const id = "c" + ++uid;
  const box = h("input", { type: "checkbox", id, onchange: () => set(box.checked) });
  return { row: h("div", { class: "row check" }, box, h("label", { for: id }, label)), update(s) { box.checked = get(s); } };
}

export function createPanels({ inspectorEl, backdropEl, cameraEl }, history) {
  let selected = "key";
  const sel = (s) => s.lights.find((l) => l.id === selected);
  const setLight = (key) => {
    const fn = (v, group) => history.change((s) => { sel(s)[key] = v; if (key !== "on") sel(s).on = sel(s).on || key === "power"; }, group);
    fn.end = () => history.endGroup();
    return fn;
  };

  // ----- Inspector -----
  const title = h("h2", { class: "inspector-title" });
  const define = h("p", { class: "define" });
  const onRow = checkRow({ label: "On", get: (s) => sel(s).on, set: (v) => history.change((s) => { sel(s).on = v; }) });
  const rows = [
    numberRow({ label: "Power", min: 0, max: 1, step: 1, unit: "%", scale: 100, get: (s) => sel(s).power, set: setLight("power"), group: () => "power-" + selected }),
    numberRow({ label: "Around", hint: "0° is beside the camera. Negative is camera-left, positive is camera-right, ±180° is behind.",
      min: LIMITS.azimuthDeg[0], max: LIMITS.azimuthDeg[1], step: 1, unit: "°", get: (s) => sel(s).azimuthDeg, set: setLight("azimuthDeg"), group: () => "az-" + selected }),
    numberRow({ label: "Height", hint: "How far above eye level the light points down from.",
      min: LIMITS.elevationDeg[0], max: LIMITS.elevationDeg[1], step: 1, unit: "°", get: (s) => sel(s).elevationDeg, set: setLight("elevationDeg"), group: () => "el-" + selected }),
    numberRow({ label: "Distance", hint: "Farther away = dimmer (falloff) and harder shadows.",
      min: LIMITS.distance[0], max: LIMITS.distance[1], step: 0.05, unit: "m", get: (s) => sel(s).distance, set: setLight("distance"), group: () => "dist-" + selected }),
    numberRow({ label: "Size", hint: "Small = hard light, crisp shadows. Big = soft light, gentle shadows.",
      min: LIMITS.size[0], max: LIMITS.size[1], step: 1, unit: "cm", scale: 100, get: (s) => sel(s).size, set: setLight("size"), group: () => "size-" + selected }),
  ];
  inspectorEl.append(title, define, onRow.row, ...rows.map((r) => r.row));

  // ----- Backdrop -----
  const setBackdrop = (fn) => { const f = (v, group) => history.change((s) => fn(s, v), group); f.end = () => history.endGroup(); return f; };
  const bRows = [
    numberRow({ label: "Brightness", hint: "How light the backdrop's surface is: black cloth is near 3%, white paper near 90%.",
      min: LIMITS.brightness[0], max: LIMITS.brightness[1], step: 1, unit: "%", scale: 100, get: (s) => s.backdrop.brightness,
      set: setBackdrop((s, v) => { s.backdrop.brightness = v; }), group: () => "bd-bright" }),
    numberRow({ label: "Distance behind", hint: "Farther back = darker backdrop, and the subject's shadow on it gets softer and fainter.",
      min: LIMITS.backdropDistance[0], max: LIMITS.backdropDistance[1], step: 0.05, unit: "m", get: (s) => s.backdrop.distance,
      set: setBackdrop((s, v) => { s.backdrop.distance = v; }), group: () => "bd-dist" }),
  ];
  const bLightOn = checkRow({ label: "Backdrop light (hidden behind the subject, aimed at the backdrop)", get: (s) => s.backdrop.light.on,
    set: (v) => history.change((s) => { s.backdrop.light.on = v; }) });
  const bLightPower = numberRow({ label: "Backdrop light power", min: 0, max: 1, step: 1, unit: "%", scale: 100, get: (s) => s.backdrop.light.power,
    set: setBackdrop((s, v) => { s.backdrop.light.power = v; s.backdrop.light.on = true; }), group: () => "bd-light" });
  backdropEl.append(...bRows.map((r) => r.row), bLightOn.row, bLightPower.row);

  // ----- Camera -----
  const ae = checkRow({ label: "Auto exposure (reads the bright side of the face)", get: (s) => s.camera.autoExposure,
    set: (v) => history.change((s) => { s.camera.autoExposure = v; }) });
  const ev = numberRow({ label: "Exposure", hint: "Brighter or darker than the camera's own choice, in stops.",
    min: LIMITS.ev[0], max: LIMITS.ev[1], step: 0.1, unit: "EV", get: (s) => s.camera.evCompensation,
    set: setBackdrop((s, v) => { s.camera.evCompensation = Math.round(v * 10) / 10; }), group: () => "ev" });
  cameraEl.append(ae.row, ev.row);

  return {
    get selected() { return selected; },
    select(id) { selected = id; },
    update(s) {
      const l = sel(s), role = ROLES[l.role];
      title.innerHTML = "";
      title.append(h("span", { class: `badge ${l.role}`, "aria-hidden": "true" }, role.letter), " " + role.label);
      define.textContent = role.define;
      onRow.update(s);
      rows.forEach((r) => r.update(s));
      bRows.forEach((r) => r.update(s));
      bLightOn.update(s); bLightPower.update(s);
      ae.update(s); ev.update(s);
    },
  };
}

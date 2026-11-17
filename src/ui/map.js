// Top-down map: the subject in the middle, the camera at the bottom, the backdrop at the top.
// It's the main control: drag a light or reflector around the subject. It doubles as the
// lighting diagram students draw on exit tickets.
//
// Keyboard: Tab moves between lights. Arrow keys move the focused one (Shift for small
// steps). + and - change power. Space turns a light on or off. Delete removes it.
import { mapPoint, fromMapPoint, backdropLightPosition, lightSpec, lightAim, lightPosition } from "../scene/lightmath.js";
import { ROLES } from "../scene/schema.js";
import { fixture, reflectorItem, cameraView } from "../scene/gear.js";

const NS = "http://www.w3.org/2000/svg";
export const MAP_VIEW = { x: -2.7, y: -2.4, w: 5.4, h: 5.2 };
const VB = MAP_VIEW;
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
// Each role has its own shape, so colour is never the only clue.
export const SHAPE_PATHS = {
  key: "M0.2,0 A0.2,0.2 0 1,1 -0.2,0 A0.2,0.2 0 1,1 0.2,0 Z",
  fill: "M-0.18,-0.18 H0.18 V0.18 H-0.18 Z",
  back: "M0,-0.24 L0.22,0.16 L-0.22,0.16 Z",
  hair: "M0,0.24 L0.22,-0.16 L-0.22,-0.16 Z",
  accent: "M0.2,0 L0.1,0.17 L-0.1,0.17 L-0.2,0 L-0.1,-0.17 L0.1,-0.17 Z",
  backdrop: "M0,-0.17 L0.17,0 L0,0.17 L-0.17,0 Z",
};

export function describeLight(l, state) {
  const f = fixture(l.fixture);
  if (l.role === "backdrop") return `${ROLES.backdrop.label} (${f.short}), ${l.on ? "on" : "off"}, behind the subject aimed at the backdrop, power ${Math.round(l.power * 100)}%`;
  const side = Math.abs(l.azimuthDeg) < 8 ? "beside the camera"
    : Math.abs(l.azimuthDeg) > 172 ? "behind the subject"
    : `${Math.round(Math.abs(l.azimuthDeg))}° ${l.azimuthDeg < 0 ? "camera-left" : "camera-right"}`;
  return `${ROLES[l.role].label} (${f.short}), ${l.on ? "on" : "off"}, ${side}, ${l.distance.toFixed(1)} metres away, power ${Math.round(l.power * 100)}%`;
}
function describeReflector(r) {
  const item = reflectorItem(r.item);
  return `Reflector: ${item.sides[r.side].name}, ${Math.round(Math.abs(r.azimuthDeg))}° ${r.azimuthDeg < 0 ? "camera-left" : "camera-right"}, ${r.distance.toFixed(1)} metres away`;
}

export function createMap(container, { onMove, onPower, onToggle, onSelect, onEndGroup, onRemove }) {
  const svg = el("svg", { viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, class: "map", role: "group", "aria-label": "Top-down map of the studio" });
  container.appendChild(svg);
  const under = el("g", {}, svg);       // rings, beams
  const middle = el("g", {}, svg);      // backdrop, subject, camera
  const over = el("g", {}, svg);        // markers

  for (const r of [1, 2]) {
    el("circle", { r, class: "ring" }, under);
    el("text", { x: 0.06, y: -r - 0.05, class: "ring-label" }, under).textContent = `${r} m`;
  }
  const backdrop = el("line", { class: "backdrop" }, middle);
  const backdropLabel = el("text", { class: "label", "text-anchor": "middle" }, middle);
  backdropLabel.textContent = "Backdrop";
  el("ellipse", { rx: 0.2, ry: 0.085, class: "subject" }, middle);
  el("ellipse", { rx: 0.093, ry: 0.093, class: "subject head" }, middle);
  el("path", { d: "M0,0.093 L0.03,0.125 L-0.03,0.125 Z", class: "subject nose" }, middle);
  el("text", { x: 0, y: 0.38, class: "label", "text-anchor": "middle" }, middle).textContent = "Subject";
  const cam = el("g", { transform: "translate(0 2.2)", class: "camera" }, middle);
  const camDist = el("text", { x: 0.22, y: 0.1, class: "label" }, cam);
  el("rect", { x: -0.16, y: -0.06, width: 0.32, height: 0.2 }, cam);
  el("path", { d: "M-0.07,-0.06 L-0.1,-0.16 L0.1,-0.16 L0.07,-0.06 Z" }, cam);
  el("text", { x: 0, y: 0.42, class: "label", "text-anchor": "middle" }, cam).textContent = "Camera";

  let state = null, dragging = null;
  const markers = new Map();   // id -> { g, beam, ray, size, kind }

  const toSvg = (evt) => {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.max(VB.x + 0.2, Math.min(VB.x + VB.w - 0.2, p.x)), z: Math.max(VB.y + 0.2, Math.min(VB.y + VB.h - 0.2, p.y)) };
  };
  const find = (id) => state.lights.find((l) => l.id === id) || state.reflectors.find((r) => r.id === id);
  const movable = (o) => o && o.role !== "backdrop";
  const moveTo = (id, x, z, group) => { const o = find(id); if (movable(o)) onMove(id, fromMapPoint(o, x, z), group); };

  function makeMarker(id, kind, role) {
    const g = el("g", { class: `light ${role}`, tabindex: 0, role: "button", "data-id": id }, over);
    const beam = el("path", { class: "beam" }, under);
    const ray = el("line", { class: "ray" }, under);
    const size = el("line", { class: "size" }, g);
    if (kind === "reflector") el("rect", { class: "shape card", x: -0.3, y: -0.05, width: 0.6, height: 0.1 }, g);
    else el("path", { class: "shape", d: SHAPE_PATHS[role] }, g);
    const letter = el("text", { class: "letter", "text-anchor": "middle", "dominant-baseline": "central" }, g);
    const m = { g, beam, ray, size, letter, kind, role };
    g.addEventListener("pointerdown", (e) => {
      e.preventDefault(); g.focus(); onSelect(id);
      if (!movable(find(id))) return;
      dragging = id;
      try { g.setPointerCapture(e.pointerId); } catch (err) { /* some pens and test tools have no capturable pointer */ }
      svg.classList.add("dragging");
    });
    g.addEventListener("pointermove", (e) => { if (dragging === id) { const p = toSvg(e); moveTo(id, p.x, p.z, "drag-" + id); } });
    const end = () => { if (dragging) { dragging = null; svg.classList.remove("dragging"); onEndGroup(); } };
    g.addEventListener("pointerup", end);
    g.addEventListener("pointercancel", end);
    g.addEventListener("focus", () => onSelect(id));
    g.addEventListener("keydown", (e) => {
      onSelect(id);
      const o = find(id), step = e.shiftKey ? 0.02 : 0.1;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key] && movable(o)) {
        e.preventDefault();
        const p = mapPoint(o);
        moveTo(id, p.x + moves[e.key][0], p.z + moves[e.key][1], "key-move-" + id);
      } else if ((e.key === "+" || e.key === "=") && kind === "light") { e.preventDefault(); onPower(id, +0.05, "key-power-" + id); }
      else if ((e.key === "-" || e.key === "_") && kind === "light") { e.preventDefault(); onPower(id, -0.05, "key-power-" + id); }
      else if ((e.key === " " || e.key === "Enter") && kind === "light") { e.preventDefault(); onToggle(id); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onRemove(id); }
    });
    markers.set(id, m);
    return m;
  }

  function sync(s) {
    const want = new Map();
    s.lights.forEach((l) => want.set(l.id, ["light", l.role]));
    s.reflectors.forEach((r) => want.set(r.id, ["reflector", "reflector"]));
    for (const [id, m] of markers) {
      const w = want.get(id);
      if (!w || w[0] !== m.kind || w[1] !== m.role) { m.g.remove(); m.beam.remove(); m.ray.remove(); markers.delete(id); }
    }
    for (const [id, [kind, role]] of want) if (!markers.has(id)) makeMarker(id, kind, role);
    // Keep the tab order the same as the list order.
    for (const id of want.keys()) over.appendChild(markers.get(id).g);
  }

  // Two fill lights are F1 and F2; a single one is just F.
  function counts(s) {
    const seen = {}, out = {};
    for (const l of s.lights) {
      seen[l.role] = (seen[l.role] || 0) + 1;
      out[l.id] = s.lights.filter((x) => x.role === l.role).length > 1 ? String(seen[l.role]) : "";
    }
    return (l) => out[l.id];
  }

  function drawBeam(m, x, z, width, on, cls, tx = 0, tz = 0) {
    const ang = Math.atan2(tz - z, tx - x), px = -Math.sin(ang), pz = Math.cos(ang), h = width / 2;
    m.size.setAttribute("x1", (px * h).toFixed(3)); m.size.setAttribute("y1", (pz * h).toFixed(3));
    m.size.setAttribute("x2", (-px * h).toFixed(3)); m.size.setAttribute("y2", (-pz * h).toFixed(3));
    const ex = x + px * h, ez = z + pz * h, fx = x - px * h, fz = z - pz * h, sx = px * 0.12, sz = pz * 0.12;
    m.beam.setAttribute("d", `M${ex.toFixed(3)},${ez.toFixed(3)} L${(tx + sx).toFixed(3)},${(tz + sz).toFixed(3)} L${(tx - sx).toFixed(3)},${(tz - sz).toFixed(3)} L${fx.toFixed(3)},${fz.toFixed(3)} Z`);
    m.beam.setAttribute("class", `beam ${cls}${on ? "" : " off"}`);
    m.ray.setAttribute("x1", x); m.ray.setAttribute("y1", z); m.ray.setAttribute("x2", tx); m.ray.setAttribute("y2", tz);
    m.ray.setAttribute("class", `ray ${cls}${on ? "" : " off"}`);
  }

  function update(s, sel) {
    state = s;
    sync(s);
    // The camera stands wherever the lens needs it for head-and-shoulders framing. If that's
    // off the map, it sits at the edge with its distance written beside it.
    const cd = cameraView(s).distance, shown = Math.min(cd, VB.y + VB.h - 0.45);
    cam.setAttribute("transform", `translate(0 ${shown.toFixed(3)})`);
    camDist.textContent = cd > shown + 0.01 ? `${cd.toFixed(1)} m away` : `${cd.toFixed(1)} m`;
    const d = s.backdrop.distance;
    backdrop.setAttribute("x1", -2.4); backdrop.setAttribute("x2", 2.4);
    backdrop.setAttribute("y1", -d); backdrop.setAttribute("y2", -d);
    backdropLabel.setAttribute("x", 0); backdropLabel.setAttribute("y", -d - 0.12);
    const number = counts(s);
    let bgIndex = 0;
    for (const l of s.lights) {
      const m = markers.get(l.id);
      const isBg = l.role === "backdrop";
      const { x, z } = isBg ? (() => { const p = backdropLightPosition(s, bgIndex++); return { x: p[0], z: p[2] }; })() : mapPoint(l);
      m.g.setAttribute("transform", `translate(${x.toFixed(3)} ${z.toFixed(3)})`);
      m.g.classList.toggle("off", !l.on);
      m.g.classList.toggle("selected", l.id === sel);
      m.g.setAttribute("aria-label", describeLight(l, s));
      m.g.setAttribute("aria-pressed", l.id === sel ? "true" : "false");
      m.letter.textContent = ROLES[l.role].letter + number(l);
      m.letter.setAttribute("font-size", ROLES[l.role].letter.length > 1 || number(l) ? "0.14" : "0.2");
      m.letter.setAttribute("y", l.role === "back" ? 0.04 : l.role === "hair" ? -0.04 : 0);
      if (isBg) { m.size.setAttribute("x1", 0); m.size.setAttribute("x2", 0); m.beam.setAttribute("d", ""); m.ray.setAttribute("class", "ray hidden"); }
      else { const t = lightAim(l, s, lightPosition(l)); drawBeam(m, x, z, lightSpec(l, s).size, l.on, l.role, t[0], t[2]); }
    }
    for (const r of s.reflectors) {
      const m = markers.get(r.id), item = reflectorItem(r.item);
      const { x, z } = mapPoint(r);
      const angle = (Math.atan2(-z, -x) * 180) / Math.PI + 90;
      m.g.setAttribute("transform", `translate(${x.toFixed(3)} ${z.toFixed(3)}) rotate(${angle.toFixed(1)})`);
      m.g.setAttribute("class", `light reflector ${r.side}${r.id === sel ? " selected" : ""}`);
      m.g.setAttribute("aria-label", describeReflector(r));
      m.g.setAttribute("aria-pressed", r.id === sel ? "true" : "false");
      m.letter.textContent = "R";
      m.letter.setAttribute("font-size", "0.14"); m.letter.setAttribute("y", -0.16);
      m.size.setAttribute("x1", 0); m.size.setAttribute("x2", 0);
      m.beam.setAttribute("d", "");
      m.ray.setAttribute("x1", x); m.ray.setAttribute("y1", z); m.ray.setAttribute("x2", 0); m.ray.setAttribute("y2", 0);
      m.ray.setAttribute("class", "ray reflector");
      m.g.querySelector(".card").setAttribute("x", -item.width / 2);
      m.g.querySelector(".card").setAttribute("width", item.width);
    }
  }

  return { update, focus(id) { markers.get(id)?.g.focus(); }, svg };
}

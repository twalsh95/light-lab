// Top-down map: the subject in the middle, the camera at the bottom, the backdrop at the top.
// It's the main control: drag a light around the subject. It doubles as the lighting
// diagram students draw on exit tickets.
//
// Keyboard: Tab moves between lights. Arrow keys move the focused light on the map
// (Shift for small steps). + and - change its power. Space turns it on or off.
import { mapPoint, fromMapPoint, backdropLightPosition } from "../scene/lightmath.js";
import { ROLES } from "../scene/schema.js";

const NS = "http://www.w3.org/2000/svg";
const VB = { x: -2.7, y: -2.4, w: 5.4, h: 5.2 };
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
const SHAPES = {
  key: (g) => el("circle", { r: 0.2, class: "shape" }, g),
  fill: (g) => el("rect", { x: -0.18, y: -0.18, width: 0.36, height: 0.36, class: "shape" }, g),
  back: (g) => el("path", { d: "M0,-0.24 L0.22,0.16 L-0.22,0.16 Z", class: "shape" }, g),
};

function describeLight(l) {
  const side = Math.abs(l.azimuthDeg) < 8 ? "beside the camera"
    : Math.abs(l.azimuthDeg) > 172 ? "behind the subject"
    : `${Math.round(Math.abs(l.azimuthDeg))}° ${l.azimuthDeg < 0 ? "camera-left" : "camera-right"}`;
  return `${ROLES[l.role].label}, ${l.on ? "on" : "off"}, ${side}, ${l.distance.toFixed(1)} metres away, power ${Math.round(l.power * 100)}%`;
}

export function createMap(container, { onMove, onPower, onToggle, onSelect, onEndGroup }) {
  const svg = el("svg", { viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, class: "map", role: "group", "aria-label": "Top-down map of the studio" });
  container.appendChild(svg);

  // Distance rings, 1 m apart.
  for (const r of [1, 2]) {
    el("circle", { r, class: "ring" }, svg);
    el("text", { x: 0.06, y: -r - 0.05, class: "ring-label" }, svg).textContent = `${r} m`;
  }
  const backdrop = el("line", { class: "backdrop" }, svg);
  const backdropLabel = el("text", { class: "label", "text-anchor": "middle" }, svg);
  backdropLabel.textContent = "Backdrop";
  const bgLight = el("g", { class: "bglight" }, svg);
  el("path", { d: "M0,-0.13 L0.13,0 L0,0.13 L-0.13,0 Z", class: "shape" }, bgLight);

  // Subject seen from above: shoulders and head.
  el("ellipse", { rx: 0.2, ry: 0.085, class: "subject" }, svg);
  el("ellipse", { rx: 0.093, ry: 0.093, class: "subject head" }, svg);
  el("path", { d: "M0,0.093 L0.03,0.125 L-0.03,0.125 Z", class: "subject nose" }, svg);
  el("text", { x: 0, y: 0.38, class: "label", "text-anchor": "middle" }, svg).textContent = "Subject";
  // Camera.
  const cam = el("g", { transform: "translate(0 2.2)", class: "camera" }, svg);
  el("rect", { x: -0.16, y: -0.06, width: 0.32, height: 0.2 }, cam);
  el("path", { d: "M-0.07,-0.06 L-0.1,-0.16 L0.1,-0.16 L0.07,-0.06 Z" }, cam);
  el("text", { x: 0, y: 0.42, class: "label", "text-anchor": "middle" }, cam).textContent = "Camera";

  const markers = {};
  for (const role of ["key", "fill", "back"]) {
    const g = el("g", { class: `light ${role}`, tabindex: 0, role: "button", "data-id": role }, svg);
    const beam = el("path", { class: "beam" }, svg);
    const ray = el("line", { class: "ray" }, svg);
    svg.insertBefore(beam, svg.firstChild.nextSibling);
    svg.insertBefore(ray, g);
    const size = el("line", { class: "size" }, g);
    SHAPES[role](g);
    el("text", { class: "letter", "text-anchor": "middle", "dominant-baseline": "central", y: role === "back" ? 0.03 : 0 }, g).textContent = ROLES[role].letter;
    markers[role] = { g, beam, ray, size };
  }

  let state = null, selected = "key", dragging = null;

  const toSvg = (evt) => {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.max(VB.x + 0.2, Math.min(VB.x + VB.w - 0.2, p.x)), z: Math.max(VB.y + 0.2, Math.min(VB.y + VB.h - 0.2, p.y)) };
  };
  const lightById = (id) => state.lights.find((l) => l.id === id);
  const moveTo = (id, x, z, group) => {
    const l = lightById(id);
    onMove(id, fromMapPoint(l, x, z), group);
  };

  for (const [id, m] of Object.entries(markers)) {
    m.g.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      m.g.focus();
      onSelect(id);
      dragging = id;
      m.g.setPointerCapture(e.pointerId);
      svg.classList.add("dragging");
    });
    m.g.addEventListener("pointermove", (e) => {
      if (dragging !== id) return;
      const p = toSvg(e);
      moveTo(id, p.x, p.z, "drag-" + id);
    });
    const end = () => { if (dragging) { dragging = null; svg.classList.remove("dragging"); onEndGroup(); } };
    m.g.addEventListener("pointerup", end);
    m.g.addEventListener("pointercancel", end);
    m.g.addEventListener("focus", () => onSelect(id));
    m.g.addEventListener("keydown", (e) => {
      onSelect(id);
      const step = e.shiftKey ? 0.02 : 0.1;
      const l = lightById(id), p = mapPoint(l);
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault();
        moveTo(id, p.x + moves[e.key][0], p.z + moves[e.key][1], "key-move-" + id);
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault(); onPower(id, +0.05, "key-power-" + id);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault(); onPower(id, -0.05, "key-power-" + id);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault(); onToggle(id);
      }
    });
  }

  function update(s, sel) {
    state = s; selected = sel;
    const d = s.backdrop.distance;
    backdrop.setAttribute("x1", -2.4); backdrop.setAttribute("x2", 2.4);
    backdrop.setAttribute("y1", -d); backdrop.setAttribute("y2", -d);
    backdropLabel.setAttribute("x", 0); backdropLabel.setAttribute("y", -d - 0.12);
    const bl = backdropLightPosition(s);
    bgLight.setAttribute("transform", `translate(${bl[0]} ${bl[2]})`);
    bgLight.classList.toggle("off", !s.backdrop.light.on);

    for (const l of s.lights) {
      const m = markers[l.id];
      const { x, z } = mapPoint(l);
      m.g.setAttribute("transform", `translate(${x.toFixed(3)} ${z.toFixed(3)})`);
      m.g.classList.toggle("off", !l.on);
      m.g.classList.toggle("selected", l.id === sel);
      m.g.setAttribute("aria-label", describeLight(l));
      m.g.setAttribute("aria-pressed", l.id === sel ? "true" : "false");
      // Size bar, drawn across the beam at the light: its length is the light's width.
      const ang = Math.atan2(-z, -x), px = -Math.sin(ang), pz = Math.cos(ang), h = l.size / 2;
      m.size.setAttribute("x1", (px * h).toFixed(3)); m.size.setAttribute("y1", (pz * h).toFixed(3));
      m.size.setAttribute("x2", (-px * h).toFixed(3)); m.size.setAttribute("y2", (-pz * h).toFixed(3));
      // Beam: a wedge from the light's edges toward the subject.
      const ex = x + px * h, ez = z + pz * h, fx = x - px * h, fz = z - pz * h;
      const sx = px * 0.12, sz = pz * 0.12;
      m.beam.setAttribute("d", `M${ex.toFixed(3)},${ez.toFixed(3)} L${sx.toFixed(3)},${sz.toFixed(3)} L${(-sx).toFixed(3)},${(-sz).toFixed(3)} L${fx.toFixed(3)},${fz.toFixed(3)} Z`);
      m.beam.setAttribute("class", `beam ${l.role}${l.on ? "" : " off"}`);
      m.ray.setAttribute("x1", x); m.ray.setAttribute("y1", z); m.ray.setAttribute("x2", 0); m.ray.setAttribute("y2", 0);
      m.ray.setAttribute("class", `ray ${l.role}${l.on ? "" : " off"}`);
    }
  }

  return { update, focus(id) { markers[id]?.g.focus(); } };
}

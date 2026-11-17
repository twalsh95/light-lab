// Side view of the selected light: the subject from the side, the floor, and the light.
// Drag the light up or down (or use the arrow keys) to change its height; dragging in or
// out changes its distance, the same as on the map.
import { ROLES } from "../scene/schema.js";
import { SHAPE_PATHS } from "./map.js";
import { lightAim, lightPosition } from "../scene/lightmath.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
const VB = { x: -0.35, y: -1.6, w: 3.95, h: 1.95 };  // metres: across = distance, up = height
const rad = (d) => (d * Math.PI) / 180;

export function createSideView(container, { onChange, onEndGroup }) {
  const svg = el("svg", { viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, class: "side-svg", role: "group", "aria-label": "Side view: the selected light's height" });
  container.appendChild(svg);
  const caption = document.createElement("p");
  caption.className = "hint side-caption";
  container.appendChild(caption);
  // Floor, eye-level line, subject in profile.
  el("line", { x1: VB.x, x2: VB.x + VB.w, y1: 1.45, y2: 1.45, class: "floor" }, svg);
  el("line", { x1: VB.x, x2: VB.x + VB.w, y1: 0, y2: 0, class: "eye" }, svg);
  el("text", { x: VB.x + VB.w - 0.05, y: -0.05, class: "label", "text-anchor": "end" }, svg).textContent = "eye level";
  el("ellipse", { cx: 0, cy: 0, rx: 0.1, ry: 0.13, class: "subject head" }, svg);
  el("path", { d: "M0.1,0 L0.13,0.03 L0.1,0.05 Z", class: "subject" }, svg);
  el("path", { d: "M-0.03,0.12 L0.03,0.12 L0.05,0.22 L0.2,0.3 L0.2,1.45 L-0.2,1.45 L-0.2,0.3 L-0.05,0.22 Z", class: "subject" }, svg);
  const beam = el("line", { class: "ray" }, svg);
  const g = el("g", { class: "light", tabindex: 0, role: "slider", "aria-label": "Light height", "aria-valuemin": -30, "aria-valuemax": 75 }, svg);
  const shape = el("path", { class: "shape" }, g);
  const letter = el("text", { class: "letter", "text-anchor": "middle", "dominant-baseline": "central" }, g);
  const empty = el("text", { x: 1.7, y: -1, class: "label", "text-anchor": "middle" }, svg);
  empty.textContent = "Pick a light to see its height";

  let current = null, dragging = false;
  const toSvg = (e) => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const apply = (x, y, group) => {
    if (!current) return;
    const across = Math.max(0.3, Math.min(VB.x + VB.w - 0.1, x)), up = Math.max(VB.y + 0.1, Math.min(1.3, y));
    const elevationDeg = Math.round(Math.max(-30, Math.min(75, (Math.atan2(-up, across) * 180) / Math.PI)));
    const distance = Math.round(Math.max(0.4, Math.min(4, Math.hypot(across, up))) * 100) / 100;
    onChange(current.id, { elevationDeg, distance }, group);
  };
  g.addEventListener("pointerdown", (e) => {
    if (!current) return;
    e.preventDefault(); g.focus(); dragging = true;
    try { g.setPointerCapture(e.pointerId); } catch (err) { /* no capturable pointer */ }
  });
  g.addEventListener("pointermove", (e) => { if (dragging) { const p = toSvg(e); apply(p.x, p.y, "side-" + current.id); } });
  const end = () => { if (dragging) { dragging = false; onEndGroup(); } };
  g.addEventListener("pointerup", end);
  g.addEventListener("pointercancel", end);
  g.addEventListener("keydown", (e) => {
    if (!current) return;
    const step = e.shiftKey ? 1 : 5;
    const d = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    onChange(current.id, { elevationDeg: Math.max(-30, Math.min(75, current.elevationDeg + d)), distance: current.distance }, "side-key-" + current.id);
  });

  return {
    update(s, selected) {
      const l = s.lights.find((x) => x.id === selected && x.role !== "backdrop") || s.reflectors.find((x) => x.id === selected);
      current = l || null;
      g.style.display = l ? "" : "none"; beam.style.display = l ? "" : "none"; empty.style.display = l ? "none" : "";
      if (!l) { caption.textContent = ""; return; }
      const role = l.role || "reflector";
      const across = l.distance * Math.cos(rad(l.elevationDeg)), up = -l.distance * Math.sin(rad(l.elevationDeg));
      g.setAttribute("transform", `translate(${across.toFixed(3)} ${up.toFixed(3)})`);
      g.setAttribute("class", `light ${role}${l.on === false ? " off" : ""}`);
      shape.setAttribute("d", role === "reflector" ? "M-0.05,-0.3 H0.05 V0.3 H-0.05 Z" : SHAPE_PATHS[role]);
      letter.textContent = role === "reflector" ? "" : ROLES[role].letter;
      // Where it points, measured along the same line as the light (so 'behind' is negative).
      let tAcross = 0, tUp = 0;
      if (role !== "reflector") {
        const t = lightAim(l, s, lightPosition(l)), az = (l.azimuthDeg * Math.PI) / 180;
        tAcross = t[0] * Math.sin(az) + t[2] * Math.cos(az); tUp = -t[1];
      }
      beam.setAttribute("x1", across); beam.setAttribute("y1", up); beam.setAttribute("x2", tAcross); beam.setAttribute("y2", tUp);
      beam.setAttribute("class", `ray ${role}`);
      g.setAttribute("aria-valuenow", Math.round(l.elevationDeg));
      g.setAttribute("aria-valuetext", `${Math.round(l.elevationDeg)} degrees ${l.elevationDeg >= 0 ? "above" : "below"} eye level`);
      caption.textContent = `Side view: ${Math.round(l.elevationDeg)}° ${l.elevationDeg >= 0 ? "above" : "below"} eye level. Drag the light up or down.`;
    },
  };
}

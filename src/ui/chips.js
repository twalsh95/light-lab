// A row of chips, one per light or reflector: click to pick it, or flip its on/off switch,
// without hunting for it on the map.
import { ROLES } from "../scene/schema.js";
import { fixture } from "../scene/gear.js";
import { h } from "./panels.js";

export function createChips(el, { onSelect, onToggle }) {
  let sig = "";
  const items = new Map();

  function build(s) {
    el.innerHTML = "";
    items.clear();
    const seen = {};
    for (const l of s.lights) {
      seen[l.role] = (seen[l.role] || 0) + 1;
      const many = s.lights.filter((x) => x.role === l.role).length > 1;
      const letter = ROLES[l.role].letter + (many ? seen[l.role] : "");
      const pick = h("button", { type: "button", class: `chip ${l.role}`, onclick: () => onSelect(l.id) },
        h("span", { class: `badge ${l.role}`, "aria-hidden": "true" }, letter),
        h("span", { class: "chip-name" }, fixture(l.fixture).short));
      const sw = h("button", { type: "button", class: "chip-switch", role: "switch", onclick: () => onToggle(l.id) });
      el.append(h("span", { class: "chip-wrap" }, pick, sw));
      items.set(l.id, { pick, sw, label: `${ROLES[l.role].label}${many ? " " + seen[l.role] : ""} (${fixture(l.fixture).short})` });
    }
    for (const r of s.reflectors) {
      const pick = h("button", { type: "button", class: "chip reflector", onclick: () => onSelect(r.id) },
        h("span", { class: "badge reflector", "aria-hidden": "true" }, "R"), h("span", { class: "chip-name" }, r.side));
      el.append(h("span", { class: "chip-wrap" }, pick));
      items.set(r.id, { pick, label: `Reflector (${r.side})` });
    }
    if (!s.lights.length && !s.reflectors.length) el.append(h("span", { class: "hint" }, "No lights yet. Add one below the map."));
  }

  return {
    update(s, selected) {
      const next = [...s.lights.map((l) => l.id + l.role + l.fixture), ...s.reflectors.map((r) => r.id + r.side)].join("|");
      if (next !== sig) { sig = next; build(s); }
      for (const l of s.lights) {
        const it = items.get(l.id);
        it.pick.setAttribute("aria-pressed", l.id === selected ? "true" : "false");
        it.pick.setAttribute("aria-label", `${it.label}${l.on ? "" : ", off"}`);
        it.pick.classList.toggle("off", !l.on);
        it.sw.setAttribute("aria-checked", l.on ? "true" : "false");
        it.sw.setAttribute("aria-label", `${it.label} on`);
        it.sw.textContent = l.on ? "On" : "Off";
      }
      for (const r of s.reflectors) items.get(r.id).pick.setAttribute("aria-pressed", r.id === selected ? "true" : "false");
    },
  };
}
